// lib/mockExam.ts
// «الاختبار التجريبي» لكتب الشهادات (قرار نهلة ٢٧ أكتوبر): يجمع أسئلة الوحدات المحفوظة، ويولّد للوحدات الناقصة
// فقط ما ينقصها (طلب واحد لكل وحدة ناقصة، بأسلوب الشهادة: تطبيقي وحسابي بحل مفصّل)، ثم يُفتح الاختبار بوقته.
import { getSyllabus, generateUnitQuiz, type QuizQ } from "./syllabus";
import { allocate, missingPerUnit, unitWeights } from "./mockExamCore";
import { studyExtra } from "./studyKind";
import { summaryToSpeech } from "./studySummary";
import { getUnitContent, setUnitContent } from "./unitContent";
import { getCachedSummary, summaryRange } from "./unitSummary";
import { unitTextParts } from "./unitScope";

export type MockUnit = { title: string; weight: number; have: number };

const valid = (qs: QuizQ[] | null) => (qs && qs.some((q) => q.type) ? qs : []);

/** وحدات الكتاب بأوزانها وعدد الأسئلة المحفوظة لكل منها */
export async function mockUnits(pdfPath: string): Promise<MockUnit[]> {
  const syl = await getSyllabus(pdfPath).catch(() => null);
  const units = syl?.data.units ?? [];
  const w = unitWeights(syl?.data.ranges ?? [], units.length);
  const have = await Promise.all(units.map((_, i) => getUnitContent<QuizQ[]>(pdfPath, i, "quiz").then((q) => valid(q).length).catch(() => 0)));
  return units.map((u, i) => ({ title: u.title, weight: w[i], have: have[i] }));
}

/** الوحدات التي ينقصها أسئلة لهذا العدد (كل وحدة ناقصة = طلب واحد) */
export function mockNeeds(units: MockUnit[], count: number): number[] {
  const alloc = allocate(count, units.map((u) => u.weight));
  return missingPerUnit(alloc, units.map((u) => u.have));
}

/** نص الوحدة للتوليد: الملخّص الشامل إن وُجد، وإلا نص صفحاتها (كاختبار الوحدة) */
async function unitText(pdfPath: string, unit: number): Promise<string> {
  const src = { kind: "unit" as const, unit };
  let ctx = "";
  const sum = (await getCachedSummary(pdfPath, src).catch(() => null)) ?? (await getCachedSummary(pdfPath, { ...src, level: "expand" }).catch(() => null));
  if (sum) ctx = summaryToSpeech(sum);
  if (ctx.trim().length < 1500) {
    const range = await summaryRange(pdfPath, src).catch(() => null);
    if (range) ctx = (await unitTextParts(pdfPath, range.from, range.to).catch(() => [] as string[])).join("\n\n");
  }
  return ctx.slice(0, 29000);
}

/** يولّد للوحدات الناقصة ما ينقصها ويضيفه لأسئلتها المحفوظة (بلا تكرار). يعيد عدد الوحدات التي تعذّرت */
export async function fillMock(pdfPath: string, need: number[], onProgress: (done: number, total: number) => void): Promise<number> {
  const todo = need.map((n, u) => ({ u, n })).filter((x) => x.n > 0);
  const study = await studyExtra(pdfPath);
  let done = 0;
  let failed = 0;
  onProgress(0, todo.length);
  // وحدتان معًا: أسرع دون إغراق الخادم
  for (let i = 0; i < todo.length; i += 2) {
    await Promise.all(
      todo.slice(i, i + 2).map(async ({ u, n }) => {
        try {
          const ctx = await unitText(pdfPath, u);
          if (!ctx.trim()) throw new Error("EMPTY");
          const qs = await generateUnitQuiz(ctx, Math.max(10, n + 3), study);
          if (!qs.length) throw new Error("EMPTY");
          const old = valid(await getUnitContent<QuizQ[]>(pdfPath, u, "quiz").catch(() => null));
          const seen = new Set(old.map((q) => q.q));
          await setUnitContent(pdfPath, u, "quiz", [...old, ...qs.filter((q) => !seen.has(q.q))]);
        } catch {
          failed++;
        }
        done++;
        onProgress(done, todo.length);
      })
    );
  }
  return failed;
}
