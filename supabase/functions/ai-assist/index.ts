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
  slides:
    'أنت مصمّم عروض تقديمية تعليمية. من نص الصفحة التالي، أنشئ شرائح عرض مرتّبة تلخّص أهم ما فيها بأمانة. كل شريحة: عنوان قصير واضح + من نقطتين إلى أربع نقاط مختصرة مأخوذة من النص + إيموجي واحد مناسب للموضوع. أعد فقط JSON صالحًا بالشكل: [{"emoji":"📌","title":"العنوان","bullets":["نقطة","نقطة"]}]. من شريحة إلى ثلاث شرائح حسب كثافة المحتوى، بالعربية، دون أي نص خارج JSON.',
  tashkeel:
    "أنت خبير في التشكيل العربي (الحركات الإعرابية والبنيوية). شكّل النص التالي تشكيلًا كاملًا ودقيقًا لمساعدة قارئ آلي على نطقه نطقًا صحيحًا. التزم بقواعد النحو والصرف، وانتبه بدقة لأسماء الأعلام والمصطلحات الدينية والقانونية والآيات والأحاديث إن وُجدت. ممنوع تمامًا تغيير الكلمات أو ترتيبها أو إضافة أو حذف أي شيء — أعد النص نفسه مشكولًا فقط، دون أي مقدمة أو تعليق، وابدأ مباشرةً بأول كلمة.",
  mindmap:
    'أنت خبير خرائط ذهنية. نظّم المحتوى المرفق في خريطة ذهنية: اجعل «الفكرة المركزية» مركزًا، وكل فرع رئيسي فرعًا (label)، وأضف تحت كل فرع نقطتين إلى ثلاث نقاط موجزة جدًا توضّحه (points). إن كانت الفروع غير واضحة فاستنبطها من المحتوى دون تحريف. أعد فقط JSON صالحًا بالشكل: {"center":"الفكرة المركزية","branches":[{"label":"الفرع","points":["نقطة موجزة","نقطة"]}]}. من ٣ إلى ٧ فروع، بالعربية، دون أي نص خارج JSON.',
  translate:
    "أنت مترجم محترف. ترجم النص التالي إلى العربية الفصحى ترجمةً دقيقةً وسلسةً تحافظ على المعنى. أعد الترجمة فقط، دون أي مقدمة أو شرح أو النص الأصلي.",
  unitquiz:
    'أنت معلّم. أنشئ من المحتوى التالي أربعة أسئلة اختيار من متعدد لاختبار فهم الطالب. أعد فقط JSON صالحًا بالشكل: [{"q":"نص السؤال","options":["خيار أ","خيار ب","خيار ج","خيار د"],"answer":0}] حيث answer هو رقم الخيار الصحيح (يبدأ من 0). أربعة خيارات لكل سؤال، خيار صحيح واحد فقط، بالعربية الفصحى، دون أي نص أو علامات خارج JSON.',
  syllabus:
    'أنت مصمّم مناهج دراسية. بناءً على النص المرفق من كتاب، أنشئ منهجًا دراسيًا (syllabus) منظّمًا بالعربية يساعد الطالب على دراسة الكتاب ومتابعته. أعد فقط JSON صالحًا بالشكل: {"title":"موضوع الكتاب باختصار","units":[{"title":"عنوان الوحدة/الفصل","topics":["نقطة مهمة","نقطة"],"outcome":"ما سيتعلمه الطالب من هذه الوحدة"}],"tips":["نصيحة دراسية"]}. اجعل عدد الوحدات مناسبًا للمحتوى (٤ إلى ١٠)، وكل وحدة فيها ٢-٤ نقاط. لا تكتب أي شيء خارج JSON.',
  define:
    "أنت قاموس عربي مبسّط. سيُعطيك المستخدم كلمة وجملةً وردت فيها. اشرح معنى الكلمة بإيجاز شديد (جملة واحدة قصيرة) بالعربية حسب سياقها. إن كانت اسم شخص أو مكان فعرّف به بكلمات قليلة. لا تكتب مقدمات ولا تكرر السؤال، أعطِ المعنى مباشرة.",
  cleanup:
    "أنت مصحّح نصوص فقط. النص التالي مستخرَج آليًا من كتاب (PDF أو OCR) وفيه أخطاء: كلمات ملتصقة، مسافات ناقصة أو زائدة، وأحيانًا حروف مقروءة خطأ بسبب المسح الضوئي. أعد كتابة النص نفسه بعد إصلاح المسافات والأخطاء الإملائية الواضحة الناتجة عن المسح فقط، مع الحفاظ على المعنى وترتيب الكلام كما هو. ممنوع تمامًا: الإضافة أو الحذف أو التلخيص أو الشرح أو التعليق أو تغيير الصياغة. مهم جدًا: ابدأ ردّك مباشرةً بأول كلمة من النص، ولا تكتب أي عنوان أو تمهيد إطلاقًا (مثل «النص المصحّح» أو «إليك»).",
};

// نموذج وحدود لكل إجراء (التنظيف والقاموس سريعان لأنهما يُستدعيان كثيرًا)
const MODEL: Record<string, string> = {
  cleanup: "claude-haiku-4-5-20251001",
  define: "claude-haiku-4-5-20251001",
  slides: "claude-haiku-4-5-20251001", // العرض التقديمي: تلخيص بسيط → نموذج سريع
};
const MAX_TOKENS: Record<string, number> = { cleanup: 4000, define: 200, syllabus: 3000, unitquiz: 1500, mindmap: 4000, tashkeel: 4000, slides: 1500 };

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
        : action === "define"
        ? `الكلمة: ${question}\nالجملة الواردة فيها: ${text}`
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
