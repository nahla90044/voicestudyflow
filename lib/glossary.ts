// lib/glossary.ts
// قاموس الوحدة: نوع الكتاب + صفحات كل وحدة + عناصر القاموس المولَّدة من نص الوحدة.
// كل شيء يُحفظ على الجهاز بعد أول مرة (لا تكلفة ذكاء متكررة لنفس الوحدة).
import AsyncStorage from "@react-native-async-storage/async-storage";

import { aiAssist } from "./ai";
import {
  parseGlossary,
  parseKind,
  unitContext,
  unitRanges,
  type BookKind,
  type GlossaryItem,
  type PageText,
  type UnitRange,
} from "./glossaryCore.ts";
import { supabase } from "./supabase";
import { getUnitContent, removeUnitContent, setUnitContent } from "./unitContent";

export type { BookKind, GlossaryItem, UnitRange };

function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** نصوص صفحات الكتاب الجاهزة (المستخرجة عند القراءة أو تحميل الكتاب) */
export async function bookPages(pdfPath: string): Promise<PageText[]> {
  const out: PageText[] = [];
  for (let from = 0; from < 3000; from += 1000) {
    const { data } = await supabase
      .from("page_cache")
      .select("page,text,tashkeel")
      .eq("pdf_path", pdfPath)
      .neq("source", "empty")
      .order("page")
      .range(from, from + 999);
    const rows = (data ?? []).map((r: { page: number; text?: string; tashkeel?: string }) => ({
      page: Number(r.page),
      text: String(r.text || r.tashkeel || ""),
    }));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const KIND_Q =
  "صنّف هذا الكتاب إلى نوع واحد فقط من: textbook (كتاب منهجي أو جامعي أو مدرسي أو علمي)، " +
  "language (كتاب لتعليم لغة أجنبية أو مفرداتها)، novel (رواية أو قصص أو أدب)، general (غير ذلك). " +
  "أجب بالكلمة الإنجليزية وحدها دون أي شرح.";

const kindKey = (pdfPath: string) => `bookkind:v1:${hashKey(pdfPath)}`;

/** اختيار المستخدم لنوع الكتاب (يتقدّم على التصنيف الآلي) ويمسح قواميس الوحدات القديمة */
export async function setBookKind(pdfPath: string, kind: BookKind, unitCount: number): Promise<void> {
  await AsyncStorage.setItem(kindKey(pdfPath), kind).catch(() => {});
  for (let i = 0; i < unitCount; i++) await removeUnitContent(pdfPath, i, "glossary").catch(() => {});
}

/** نوع الكتاب (يُحسب مرة ويُحفظ) */
export async function getBookKind(pdfPath: string, pages?: PageText[]): Promise<BookKind> {
  const key = kindKey(pdfPath);
  const cached = await AsyncStorage.getItem(key).catch(() => null);
  if (cached) return cached as BookKind;
  const ps = (pages ?? (await bookPages(pdfPath))).filter((p) => p.text.trim().length > 40);
  if (!ps.length) return "general";
  // عينة من بداية الكتاب ووسطه
  const sample = [...ps.slice(0, 4), ...ps.slice(Math.floor(ps.length / 2), Math.floor(ps.length / 2) + 2)]
    .map((p) => p.text.slice(0, 900))
    .join("\n\n");
  const kind = parseKind(await aiAssist("ask", sample, KIND_Q));
  await AsyncStorage.setItem(key, kind).catch(() => {});
  return kind;
}

/** صفحات وحدات المنهج (تُعاد حسابها عند تغيّر عدد الصفحات الجاهزة) */
export async function getUnitRanges(pdfPath: string, titles: string[], pageCount: number, pages?: PageText[]): Promise<UnitRange[]> {
  // حدود من الفهرس الدقيق (عند إنشاء المنهج منه) لها الأولوية دائمًا
  try {
    const pinned = JSON.parse((await AsyncStorage.getItem(`unitranges:toc:${hashKey(pdfPath)}`)) || "null") as UnitRange[] | null;
    if (Array.isArray(pinned) && pinned.length === titles.length) return pinned;
  } catch {}
  const ps = pages ?? (await bookPages(pdfPath));
  const key = `unitranges:v1:${hashKey(pdfPath)}:${titles.length}:${ps.length}`;
  const cached = await AsyncStorage.getItem(key).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as UnitRange[];
    } catch {
      // نعيد الحساب
    }
  }
  const r = unitRanges(titles, ps, pageCount);
  await AsyncStorage.setItem(key, JSON.stringify(r)).catch(() => {});
  await AsyncStorage.setItem(`unitranges:last:${hashKey(pdfPath)}`, JSON.stringify(r)).catch(() => {});
  return r;
}

/** حدود الوحدات من الفهرس الدقيق (تُعتمد بدل الحساب التقريبي) */
export async function setUnitRanges(pdfPath: string, r: UnitRange[]): Promise<void> {
  await AsyncStorage.setItem(`unitranges:last:${hashKey(pdfPath)}`, JSON.stringify(r)).catch(() => {});
  await AsyncStorage.setItem(`unitranges:toc:${hashKey(pdfPath)}`, JSON.stringify(r)).catch(() => {});
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`unitranges:v1:${hashKey(pdfPath)}:`));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {}
}

/** آخر صفحات وحدات محسوبة (عرض فوري في صفحة الكتاب، بلا جلب نصوص الكتاب) */
export async function getCachedUnitRanges(pdfPath: string): Promise<UnitRange[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`unitranges:last:${hashKey(pdfPath)}`);
    return raw ? (JSON.parse(raw) as UnitRange[]) : null;
  } catch {
    return null;
  }
}

const COMMON =
  "أعد JSON فقط: مصفوفة عناصر بالشكل " +
  '[{"t":"الكلمة أو المصطلح","m":"المعنى أو الشرح في جملة قصيرة","k":"النوع","ex":"مثال قصير من النص (اختياري)","p":رقم_الصفحة}] ' +
  "حيث رقم الصفحة من علامات [صN] في النص. اختر الأهم للمراجعة فقط، بحد أقصى ١٥ عنصرًا، " +
  "واجعل كل معنى أقل من ٢٠ كلمة، دون أي نص خارج JSON ودون تكرار.";

const PROMPTS: Record<BookKind, string> = {
  textbook:
    "استخرج من نص هذه الوحدة الدراسية: المصطلحات الأساسية (k=term) مع شرح مبسّط لكل منها، " +
    "والتعاريف الرسمية المذكورة صراحةً (k=def) مع صياغة مختصرة دقيقة لها. " + COMMON,
  language:
    "هذا نص من كتاب لتعليم لغة. استخرج أهم المفردات (k=word) والتعابير (k=idiom) كما وردت بلغة الكتاب الأصلية دون ترجمة لحقل t، " +
    "ومعناها في حقل m بلغة المستخدم، ومثالًا قصيرًا من النص بلغته الأصلية في ex. " + COMMON,
  novel:
    "هذا نص من رواية أو قصص. استخرج الشخصيات (k=char) مع تعريف موجز بدور كل منها، " +
    "والأماكن المهمة (k=place)، والكلمات الصعبة أو غير الشائعة (k=word) مع معناها. " + COMMON,
  general:
    "استخرج من النص أهم المصطلحات والمفاهيم (k=term) مع شرح مبسّط، وأي تعاريف مذكورة صراحةً (k=def). " + COMMON,
};

export type GlossaryResult = { items: GlossaryItem[]; kind: BookKind; range: UnitRange; missingPages: boolean };

/**
 * قاموس وحدة. يُولَّد مرة ويُحفظ. missingPages = صفحات الوحدة غير جاهزة بعد
 * (الكتاب لم يُحمَّل كاملًا) → يُقترح تحميله.
 */
export async function getGlossary(
  pdfPath: string,
  unitIdx: number,
  titles: string[],
  pageCount: number,
  force = false
): Promise<GlossaryResult> {
  const pages = await bookPages(pdfPath);
  const [kind, ranges] = await Promise.all([getBookKind(pdfPath, pages), getUnitRanges(pdfPath, titles, pageCount, pages)]);
  const range = ranges[unitIdx] ?? { from: 1, to: pageCount || 1, found: false };

  if (!force) {
    const cached = await getUnitContent<GlossaryItem[]>(pdfPath, unitIdx, "glossary");
    if (cached?.length) return { items: cached, kind, range, missingPages: false };
  }
  const ctx = unitContext(pages, range);
  if (!ctx.trim()) return { items: [], kind, range, missingPages: true };

  const raw = await aiAssist("ask", ctx, PROMPTS[kind]);
  const items = parseGlossary(raw).filter((i) => !i.p || (i.p >= range.from && i.p <= range.to));
  if (items.length) await setUnitContent(pdfPath, unitIdx, "glossary", items);
  return { items, kind, range, missingPages: false };
}
