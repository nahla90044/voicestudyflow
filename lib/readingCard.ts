// lib/readingCard.ts
// بطاقة القراءة الحيّة في الجزيرة العائمة وشاشة القفل: اسم الكتاب، الصفحة، التقدّم،
// السرعة، وزرّا الإيقاف/الإكمال والتسريع. القارئ والمشغّل العام يستخدمانها بنفس الشكل.
import {
  endReadingCard,
  isReadingCardSupported,
  onReadingAction,
  showReadingCard,
  type ReadingAction,
} from "../modules/reading-activity";
import { getCurrentLang } from "./i18n";

export { isReadingCardSupported, onReadingAction, type ReadingAction };

/** سرعات زر البطاقة (نفس سرعات القارئ) */
export const CARD_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const nextSpeed = (r: number) => {
  const i = CARD_SPEEDS.indexOf(r as (typeof CARD_SPEEDS)[number]);
  return CARD_SPEEDS[(i + 1) % CARD_SPEEDS.length];
};

const AR = "٠١٢٣٤٥٦٧٨٩";
const arNum = (n: number) => String(n).replace(/\d/g, (d) => AR[+d]);

function detail(page: number, total: number): string {
  const lang = getCurrentLang();
  if (lang === "ar") return total > 0 ? `صفحة ${arNum(page)} من ${arNum(total)}` : `صفحة ${arNum(page)}`;
  if (lang === "fr") return total > 0 ? `Page ${page} sur ${total}` : `Page ${page}`;
  return total > 0 ? `Page ${page} of ${total}` : `Page ${page}`;
}

let last = "";

export function syncReadingCard(s: { bookId: string; title: string; page: number; totalPages: number; rate: number; playing: boolean }) {
  const card = {
    bookId: s.bookId,
    title: s.title.trim() || "VoiceStudyFlow",
    detail: detail(s.page, s.totalPages),
    progress: s.totalPages > 0 ? Math.min(1, s.page / s.totalPages) : 0,
    rate: s.rate,
    playing: s.playing,
  };
  const key = JSON.stringify(card);
  if (key === last) return; // لا نرسل تحديثات مكرّرة (لكل نشاط حيّ حدّ تحديثات)
  last = key;
  showReadingCard(card);
}

export function closeReadingCard() {
  last = "";
  endReadingCard();
}
