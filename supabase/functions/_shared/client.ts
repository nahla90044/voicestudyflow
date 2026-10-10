// supabase/functions/_shared/client.ts
// إجبار التحديث من السيرفر: نسخ التطبيق قبل 2.0 لا ترسل x-vsf-version، فتُرفض في الخدمات
// المكلفة (الصوت، الذكاء، الموسيقى، التعرّف الضوئي) ويُطلب منها التحديث.
// الحد الأدنى قابل للتغيير بالسر MIN_APP_VERSION (افتراضي 2.0.0) بلا إعادة نشر.

function cmp(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** يُرجع رد «تحديث مطلوب» إن كانت نسخة التطبيق أقدم من المسموح، وإلا null */
export function requireUpdatedApp(req: Request, cors: Record<string, string>): Response | null {
  const min = Deno.env.get("MIN_APP_VERSION") || "2.0.0";
  const v = req.headers.get("x-vsf-version") ?? "0";
  if (cmp(v, min) >= 0) return null;
  return new Response(JSON.stringify({ error: "UPDATE_REQUIRED", updateRequired: true, minVersion: min }), {
    status: 426,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
