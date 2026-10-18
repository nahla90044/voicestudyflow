// lib/cardImage.ts
// صورة توضيحية لكل بطاقة مراجعة (تسهيل الحفظ): تُطلب من السيرفر (card-image) مرة واحدة،
// ورابطها يُحفظ مع البطاقة فتظهر فورًا بعد ذلك. مهلة لكل طلب، وطلب واحد لكل بطاقة في الوقت نفسه.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { APP_VERSION, SUPABASE_FUNCTIONS_URL, SUPABASE_PUBLIC_KEY, supabase } from "./supabase";

const KEY = "vsf:cardimg:v1"; // { [cardKey]: url | "none" }
const TIMEOUT_MS = 60000;
let memo: Record<string, string> | null = null;
const inflight = new Map<string, Promise<string | null>>();
let planBlocked = false;
// متوسط زمن توليد الصورة المقيس (ثوانٍ) — يُعرض للمستخدم «عادةً نحو N ثانية»
const AVG_KEY = "vsf:cardimg:avg";
let avgSecs = 15;
AsyncStorage.getItem(AVG_KEY).then((v) => { const n = Number(v); if (n > 2 && n < 90) avgSecs = n; }).catch(() => {});
export const cardImageAvgSecs = () => Math.round(avgSecs); // الباقة لا تشمل الصور (أو انتهى السقف) → لا نكرر الطلب في الجلسة

const cardKey = (front: string, back: string) => `${front.trim()}\u0001${back.trim()}`;

async function load(): Promise<Record<string, string>> {
  if (memo) return memo;
  try {
    memo = JSON.parse((await AsyncStorage.getItem(KEY)) || "{}") || {};
  } catch {
    memo = {};
  }
  return memo!;
}
function persist() {
  if (memo) AsyncStorage.setItem(KEY, JSON.stringify(memo)).catch(() => {});
}

/** الرابط المحفوظ إن وُجد (بلا طلب). undefined = لم يُطلب بعد، null = لا صورة لهذه البطاقة */
export async function cachedCardImage(front: string, back: string): Promise<string | null | undefined> {
  const m = await load();
  const v = m[cardKey(front, back)];
  return v === undefined ? undefined : v === "none" ? null : v;
}

/** يجلب/يولّد صورة البطاقة. null = غير متاحة (الباقة، السقف، أو تعذّر) */
export function getCardImage(front: string, back: string): Promise<string | null> {
  const k = cardKey(front, back);
  if (inflight.has(k)) return inflight.get(k)!;
  const p = (async () => {
    const m = await load();
    if (m[k]) return m[k] === "none" ? null : m[k];
    if (planBlocked) return null;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? SUPABASE_PUBLIC_KEY;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/card-image`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLIC_KEY, "x-vsf-version": APP_VERSION },
        body: JSON.stringify({ front, back }),
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (j.url) {
        const secs = (Date.now() - t0) / 1000;
        if (secs > 3) {
          avgSecs = avgSecs * 0.6 + secs * 0.4; // الصور المشتركة الفورية لا تُحسب
          AsyncStorage.setItem(AVG_KEY, String(avgSecs)).catch(() => {});
        }
        m[k] = j.url;
        persist();
        return j.url;
      }
      if (j.error === "PLAN" || j.error === "CAP") planBlocked = true;
      return null; // خطأ مؤقت → لا نحفظ «none» فيُعاد لاحقًا
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** الباقة الحالية لا تشمل صور البطاقات (عُرف من ردّ السيرفر في هذه الجلسة) */
export function cardImagesBlocked(): boolean {
  return planBlocked;
}
