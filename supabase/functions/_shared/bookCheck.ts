// supabase/functions/_shared/bookCheck.ts
// هل اجتاز الكتاب فحص الرفع الإلزامي (book-check)؟ العيّنات مجتازة. دوال الكتاب ترفض غير المجتاز.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function pdfCleared(pdfPath: string): Promise<boolean> {
  if (pdfPath.startsWith("samples/")) return true;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data } = await admin.from("book_checks").select("status").eq("pdf_path", pdfPath).maybeSingle();
  return data?.status === "allow";
}
