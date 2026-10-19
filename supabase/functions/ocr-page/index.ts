// supabase/functions/ocr-page/index.ts
// OCR لصفحة من كتاب PDF مصوّر:
//  1) ننزّل الـPDF (service role) من حاوية pdfs
//  2) نحوّل الصفحة المطلوبة إلى صورة PNG عبر MuPDF (WASM)
//  3) نرسل الصورة إلى Google Vision (DOCUMENT_TEXT_DETECTION, ar) ونرجّع النص
// إن لم يوجد مفتاح Vision: نرجّع معلومات التحويل فقط (للاختبار).
import { canAccessPdf } from "../_shared/paths.ts";
import { pdfCleared } from "../_shared/bookCheck.ts";
import { openCached } from "../_shared/pdfCache.ts";
import * as mupdf from "npm:mupdf@1.3.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUpdatedApp } from "../_shared/client.ts";

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

type WordBox = { t: string; x: number; y: number; w: number; h: number };

// نستخرج مربّع كل كلمة من نتيجة Vision (إحداثيات مطبّعة 0..1 بالنسبة لأبعاد الصفحة)
function extractWords(vJson: any): WordBox[] {
  const fta = vJson?.responses?.[0]?.fullTextAnnotation;
  const page0 = fta?.pages?.[0];
  const W = Number(page0?.width) || 0;
  const H = Number(page0?.height) || 0;
  if (!page0 || !W || !H) return [];
  const out: WordBox[] = [];
  for (const block of page0.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const word of para.words ?? []) {
        const t = (word.symbols ?? []).map((s: any) => s.text ?? "").join("");
        if (!t.trim()) continue;
        const vs = word.boundingBox?.vertices ?? [];
        if (vs.length < 2) continue;
        const xs = vs.map((v: any) => Number(v.x) || 0);
        const ys = vs.map((v: any) => Number(v.y) || 0);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        out.push({ t, x: minX / W, y: minY / H, w: (maxX - minX) / W, h: (maxY - minY) / H });
      }
    }
  }
  return out;
}

const OCR_DAILY_CAP = 700;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // نسخ التطبيق القديمة (قبل 2.0) تُرفض ويُطلب منها التحديث
  const outdated = requireUpdatedApp(req, corsHeaders);
  if (outdated) return outdated;

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
    // طلب المواضع فقط (للتظليل) ومحفوظة من قبل → فورًا وبلا تكلفة
    if (body.wordsOnly === true) {
      const { data: saved } = await sb.from("page_words").select("words").eq("pdf_path", pdfPath).eq("page", page).maybeSingle();
      if (Array.isArray(saved?.words) && saved.words.length >= 8) return json({ words: saved.words, page, cached: true });
    }
    // سقف يومي للقراءة الضوئية المدفوعة (يكفي كتابًا ممسوحًا كاملًا في اليوم ويمنع الاستغلال)
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: ocrToday } = await sb.from("cost_log").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("fn", "ocr").gte("created_at", since);
    if ((ocrToday ?? 0) >= OCR_DAILY_CAP) return json({ error: "RATE_LIMITED", rateLimited: true }, 200);
    await sb.from("cost_log").insert({ user_id: user.id, fn: "ocr", action: "vision", images: 1 });
    // تحويل الصفحة إلى صورة بدقة محددة (الملف مفتوح في الذاكرة لدقائق)
    const doc = await openCached(sb, pdfPath, "mupdf", (b) => mupdf.Document.openDocument(b, "application/pdf"));
    const totalPages = doc.countPages();
    const p = Math.min(page, totalPages);
    const pg = doc.loadPage(p - 1);
    const renderB64 = (scale: number): { b64: string; bytes: number } => {
      const pix = pg.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
      const png = pix.asPNG() as Uint8Array;
      return { b64: bytesToBase64(png), bytes: png.length };
    };

    const ocrSpaceKey = Deno.env.get("OCR_SPACE_API_KEY");
    const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
    if (!ocrSpaceKey && !visionKey) {
      const r0 = renderB64(2);
      return json({ rendered: true, pngBytes: r0.bytes, page: p, totalPages });
    }

    let text = "";
    let words: WordBox[] = [];

    // 1) Google Vision أولًا (احترافي، أدقّ للعربي، بلا حدود حجم تقريبًا)
    if (visionKey) {
      try {
        const b64 = renderB64(2).b64;
        // المفتاح في الترويسة لا في الرابط (الروابط تظهر في السجلات)
        const vRes = await fetch("https://vision.googleapis.com/v1/images:annotate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": visionKey },
          body: JSON.stringify({
            requests: [
              {
                image: { content: b64 },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                imageContext: { languageHints: ["ar", "en"] },
              },
            ],
          }),
        });
        const vJson = await vRes.json();
        if (vRes.ok) {
          text = String(vJson?.responses?.[0]?.fullTextAnnotation?.text ?? "");
          // مربّعات الكلمات الدقيقة (للعدسة/الهايلايت) — من نفس الطلب بلا تكلفة إضافية
          words = extractWords(vJson);
        }
      } catch {
        // نتابع للبديل المجاني
      }
    }

    // 2) بديل احتياطي: OCR.space المجاني (مع تخفيض الدقة لتجاوز حد الحجم)
    if (text.trim().length < 40 && ocrSpaceKey) {
      const callOcrSpace = async (b64: string, engine: string): Promise<string> => {
        const form = new URLSearchParams();
        form.set("base64Image", `data:image/png;base64,${b64}`);
        form.set("language", "ara");
        form.set("OCREngine", engine);
        form.set("isOverlayRequired", "false");
        form.set("scale", "true");
        const r = await fetch("https://api.ocr.space/parse/image", {
          method: "POST",
          headers: { apikey: ocrSpaceKey, "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        const j = await r.json();
        if (j?.IsErroredOnProcessing) return "";
        return String(j?.ParsedResults?.[0]?.ParsedText ?? "");
      };
      for (const scale of [1.5, 1.1, 0.85]) {
        const { b64, bytes } = renderB64(scale);
        if (bytes > 1_000_000 && scale > 0.85) continue;
        text = await callOcrSpace(b64, "1");
        if (text.trim().length >= 40) break;
        text = await callOcrSpace(b64, "2");
        if (text.trim().length >= 40) break;
      }
    }

    // المواضع تُحفظ مرة واحدة لهذه الصفحة (أي طلب لاحق للتظليل فوري ومجاني)
    if (words.length >= 8) {
      await sb.from("page_words").upsert({ pdf_path: pdfPath, page: p, words }).then(() => {}, () => {});
    }
    return json({ text, words, page: p, totalPages });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
