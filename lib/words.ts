// lib/words.ts
// «كلماتي»: كلمات يحفظها الطالب بضغطة مطوّلة من الكتاب، ويجهّز الذكاء لكل منها المعنى
// في سياقه، والاستخدام، والمرادفات، والأضداد، وجملًا تستخدمها. تُحفظ على الجهاز.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { aiAssist } from "./ai";
import { addCards } from "./flashcards";
import { cleanWord, parseWordInfo, wordKey, type WordInfo } from "./wordsCore.ts";

export type { WordInfo };

export type SavedWord = {
  key: string;
  word: string;
  context: string; // الجملة التي وردت فيها
  bookId?: string;
  bookTitle?: string;
  page?: number;
  info?: WordInfo;
  addedAt: number;
};

const KEY = "vsf:mywords:v1";

export async function getWords(): Promise<SavedWord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as SavedWord[]) : [];
    return arr.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

async function save(list: SavedWord[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
}

export async function isSaved(word: string): Promise<boolean> {
  const k = wordKey(word);
  return (await getWords()).some((w) => w.key === k);
}

/** يضيف الكلمة (أو يعيدها إن كانت محفوظة) */
export async function addWord(w: Omit<SavedWord, "key" | "addedAt" | "word"> & { word: string }): Promise<SavedWord | null> {
  const word = cleanWord(w.word);
  if (!word) return null;
  const list = await getWords();
  const k = wordKey(word);
  const found = list.find((x) => x.key === k);
  if (found) return found;
  const item: SavedWord = { ...w, word, key: k, context: w.context.slice(0, 300), addedAt: Date.now() };
  await save([item, ...list]);
  return item;
}

export async function removeWord(key: string): Promise<void> {
  await save((await getWords()).filter((w) => w.key !== key));
}

async function setInfo(key: string, info: WordInfo): Promise<void> {
  const list = await getWords();
  const i = list.findIndex((w) => w.key === key);
  if (i < 0) return;
  list[i] = { ...list[i], info };
  await save(list);
}

const PROMPT = (word: string) =>
  `اشرح الكلمة «${word}» كما وردت في النص المرفق (سياقها). أعد JSON فقط بالشكل: ` +
  '{"meaning":"المعنى في هذا السياق بجملة قصيرة","pos":"نوع الكلمة","usage":"متى وكيف تُستخدم في جملة أو جملتين",' +
  '"synonyms":["مرادف","مرادف"],"antonyms":["ضد","ضد"],"examples":["جملة تستخدم الكلمة","جملة ثانية","جملة ثالثة"]}. ' +
  "المرادفات والأضداد والجمل بلغة الكلمة نفسها (إن كانت فرنسية فبالفرنسية مثلًا)، أما المعنى والاستخدام ونوع الكلمة فبلغة المستخدم. " +
  "إن لم يكن للكلمة ضد واضح فاترك antonyms فارغة. دون أي نص خارج JSON.";

/** معلومات الكلمة (من الحفظ أو الذكاء)، وتُحفظ معها */
export async function lookupWord(w: SavedWord, force = false): Promise<WordInfo | null> {
  if (w.info && !force) return w.info;
  const raw = await aiAssist("ask", w.context || w.word, PROMPT(w.word));
  const info = parseWordInfo(raw);
  if (info) await setInfo(w.key, info);
  return info;
}

/** يحوّل كلمات إلى بطاقات مراجعة (الوجه: الكلمة، الظهر: المعنى + مثال) */
export async function wordsToCards(list: SavedWord[]): Promise<number> {
  return addCards(
    list
      .filter((w) => w.info)
      .map((w) => ({
        front: w.word,
        back: [w.info!.meaning, w.info!.examples[0]].filter(Boolean).join("\n\n"),
        bookId: w.bookId,
        bookTitle: w.bookTitle,
      }))
  );
}
