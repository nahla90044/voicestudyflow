// supabase/functions/page-image/index.ts
// يحوّل صفحة PDF إلى صورة PNG عالية الدقة (للعرض القابل للتكبير في القارئ).
// الطلب: { pdfPath, page }   الرد: { image: base64Png, page, totalPages }
import { canAccessPdf } from "../_shared/paths.ts";
import { pdfCleared } from "../_shared/bookCheck.ts";
import * as mupdf from "npm:mupdf@1.3.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const pdfPath = String(body.pdfPath ?? "");
    const page = Math.max(1, Number(body.page ?? 1));
    if (!pdfPath) return json({ error: "Missing pdfPath" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing Supabase env");

    // تفويض: المتصل يصل فقط لملفاته أو ملفات العيّنات (service_role يتجاوز RLS)
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Unauthorized" }, 401);
    if (!canAccessPdf(pdfPath, user.id)) return json({ error: "Forbidden" }, 403);
    // الكتاب لم يجتز فحص الرفع الإلزامي (أو رُفض) → لا معالجة
    if (!(await pdfCleared(pdfPath))) return json({ error: "NOT_CLEARED" }, 403);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // الطريقة الجديدة (format: "url"): JPEG خفيف يُولَّد مرة واحدة ويُحفظ في bucket «page-img»،
    // ويُعاد رابط موقّع يُنزّله التطبيق مباشرة. النسخ الأقدم (بلا format) تبقى على base64 PNG.
    const asUrl = body.format === "url";
    const cachePath = `${pdfPath}/p${page}-s3.jpg`;
    if (asUrl) {
      // مولّدة سابقًا؟ نبحث عنها في مجلدها، ثم نعيد رابطًا موقّعًا لها
      const slash = cachePath.lastIndexOf("/");
      const { data: found } = await sb.storage
        .from("page-img")
        .list(cachePath.slice(0, slash), { search: cachePath.slice(slash + 1), limit: 1 });
      if (found?.some((f) => f.name === cachePath.slice(slash + 1))) {
        const { data: signed } = await sb.storage.from("page-img").createSignedUrl(cachePath, 3600);
        if (signed?.signedUrl) return json({ url: signed.signedUrl, page });
      }
    }

    const { data: file, error: dErr } = await sb.storage.from("pdfs").download(pdfPath);
    if (dErr || !file) throw dErr ?? new Error("Failed to download PDF");

    const buf = new Uint8Array(await file.arrayBuffer());
    const doc = mupdf.Document.openDocument(buf, "application/pdf");
    const totalPages = doc.countPages();
    const p = Math.min(page, totalPages);
    const pg = doc.loadPage(p - 1);
    // دقة عالية (scale 3) لنص واضح عند التكبير
    const pix = pg.toPixmap(mupdf.Matrix.scale(3, 3), mupdf.ColorSpace.DeviceRGB, false);

    if (asUrl) {
      // JPEG بجودة عالية: النص واضح عند التكبير، والحجم أصغر بكثير من PNG
      const jpg = pix.asJPEG(88, false) as Uint8Array;
      const path = `${pdfPath}/p${p}-s3.jpg`;
      const { error: upErr } = await sb.storage.from("page-img").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
      if (!upErr) {
        const { data: signed } = await sb.storage.from("page-img").createSignedUrl(path, 3600);
        if (signed?.signedUrl) return json({ url: signed.signedUrl, page: p, totalPages });
      }
      // تعذّر الحفظ → نرسلها مباشرة (base64) كي لا تتعطل القراءة
      return json({ image: bytesToBase64(jpg), page: p, totalPages, mime: "image/jpeg" });
    }

    const png = pix.asPNG() as Uint8Array;
    return json({ image: bytesToBase64(png), page: p, totalPages });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
