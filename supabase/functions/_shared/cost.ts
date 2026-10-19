// supabase/functions/_shared/cost.ts
// تسجيل التكلفة الدقيقة لكل طلب في cost_log (للتسعير بأرقام حقيقية). لا يُبطئ الطلب ولا يُفشله أبدًا.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CostRow = {
  fn: "ai-assist" | "tts" | "card-image";
  action?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  audio_seconds?: number;
  chars?: number;
  images?: number;
  cached?: boolean;
  page_key?: string;
};

/** معرّف المستخدم من رمز الدخول (بلا طلب إضافي — للتسجيل فقط، لا للصلاحيات) */
export function userIdFrom(req: Request): string | null {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.sub === "string" && json.role === "authenticated" ? json.sub : null;
  } catch {
    return null;
  }
}

let admin: ReturnType<typeof createClient> | null = null;
export function logCost(req: Request, row: CostRow): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return Promise.resolve();
    admin ??= createClient(url, key, { auth: { persistSession: false } });
    const p = admin
      .from("cost_log")
      .insert({ ...row, user_id: userIdFrom(req) } as never)
      .then(({ error }) => {
        if (error) console.error("cost_log", error.message);
      });
    // لا ننتظره في مسار الرد: يكمل في الخلفية
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(p);
    return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}
