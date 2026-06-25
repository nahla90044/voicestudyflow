// supabase/functions/ai-assist/index.ts
// مساعد ذكاء اصطناعي عبر Claude API (لخّص / اسأل / اختبار).
// المفتاح يبقى سريًا في السيرفر: ANTHROPIC_API_KEY (Supabase secret).
// الطلب:  { action: "summarize" | "ask" | "quiz", text: string, question?: string }
// الرد:   { result: string }
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM: Record<string, string> = {
  summarize:
    "أنت مساعد دراسي. لخّص النص التالي في نقاط واضحة وموجزة بالعربية الفصحى. ركّز على الأفكار الرئيسية فقط.",
  ask:
    "أنت مساعد دراسي. أجب عن سؤال المستخدم بالاعتماد على النص المرفق فقط. إذا لم تكن الإجابة موجودة في النص، قل بوضوح إنها غير مذكورة. أجب بالعربية وباختصار.",
  quiz:
    "أنت مساعد دراسي. أنشئ من النص التالي خمسة أسئلة قصيرة لاختبار الفهم، متبوعة بإجاباتها. رقّم الأسئلة، ثم اكتب الإجابات في قسم منفصل بعنوان «الإجابات». بالعربية.",
  flashcards:
    'أنت مساعد دراسي. أنشئ من النص التالي بطاقات مراجعة (سؤال/إجابة) موجزة بالعربية. أعد فقط مصفوفة JSON صالحة بالشكل [{"front":"السؤال","back":"الإجابة"}] دون أي نص إضافي أو علامات تنسيق. من 4 إلى 8 بطاقات.',
  cleanup:
    "أنت مصحّح نصوص فقط. النص التالي مستخرَج آليًا من كتاب (PDF أو OCR) وفيه أخطاء: كلمات ملتصقة، مسافات ناقصة أو زائدة، وأحيانًا حروف مقروءة خطأ بسبب المسح الضوئي. أعد كتابة النص نفسه بعد إصلاح المسافات والأخطاء الإملائية الواضحة الناتجة عن المسح فقط، مع الحفاظ على المعنى وترتيب الكلام كما هو. ممنوع تمامًا: الإضافة أو الحذف أو التلخيص أو الشرح أو التعليق أو تغيير الصياغة. أعد النص المصحّح فقط دون أي مقدمة.",
};

// نموذج وحدود لكل إجراء (التنظيف يستخدم نموذجًا سريعًا لأنه يُستدعى لكل صفحة)
const MODEL: Record<string, string> = { cleanup: "claude-haiku-4-5-20251001" };
const MAX_TOKENS: Record<string, number> = { cleanup: 4000 };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "summarize";
    const text: string = (body.text ?? "").toString().slice(0, 12000); // حد أمان
    const question: string = (body.question ?? "").toString();

    if (!SYSTEM[action]) return json({ error: "Unknown action" }, 400);
    if (!text.trim()) return json({ error: "Empty text" }, 400);

    const userContent =
      action === "ask"
        ? `النص:\n${text}\n\nالسؤال: ${question}`
        : `النص:\n${text}`;

    const client = new Anthropic({ apiKey });

    const model = MODEL[action] ?? "claude-opus-4-8";
    const params: Record<string, unknown> = {
      model,
      max_tokens: MAX_TOKENS[action] ?? 1500,
      system: SYSTEM[action],
      messages: [{ role: "user", content: userContent }],
    };
    // effort مدعوم في opus فقط
    if (model.startsWith("claude-opus")) params.output_config = { effort: "low" };

    const msg = await client.messages.create(params as Parameters<typeof client.messages.create>[0]);

    const result = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();

    return json({ result });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
