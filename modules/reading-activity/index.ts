// جسر بطاقة القراءة الحيّة (الجزيرة العائمة + شاشة القفل). اختياري: في Expo Go أو
// أندرويد أو iOS أقدم من 16.2 لا يوجد الموديول → كل الدوال تتجاهل بأمان.
import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

export type ReadingCard = {
  bookId: string;
  title: string;
  detail: string;
  progress: number;
  rate: number;
  playing: boolean;
};
export type ReadingAction = "toggle" | "speed";

type Native = {
  isSupported(): boolean;
  show(s: ReadingCard): Promise<void>;
  end(): Promise<void>;
  addListener(name: "onAction", fn: (e: { action: string }) => void): EventSubscription;
};

const native = requireOptionalNativeModule<Native>("ReadingActivity");

export function isReadingCardSupported(): boolean {
  try {
    return !!native?.isSupported();
  } catch {
    return false;
  }
}

export function showReadingCard(s: ReadingCard): void {
  native?.show(s).catch(() => {});
}

export function endReadingCard(): void {
  native?.end().catch(() => {});
}

export function onReadingAction(fn: (a: ReadingAction) => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener("onAction", (e) => {
    if (e.action === "toggle" || e.action === "speed") fn(e.action);
  });
  return () => sub.remove();
}
