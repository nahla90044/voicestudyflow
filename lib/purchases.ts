// lib/purchases.ts
// الاشتراك مباشرة عبر Apple (StoreKit 2) بمكتبة expo-iap — نفس نمط «سويعات» و«صفا»، بلا وسيط.
//
// كل شراء/استعادة/فتح للتطبيق: نرسل المعاملة الموقّعة من Apple (JWS) لدالة السيرفر
// apple-verify فتتحقّق من توقيع Apple وتحدّث اشتراك المستخدم (entitlements). التطبيق
// نفسه لا يستطيع منح اشتراك. التجديد والإلغاء يصلان للسيرفر أيضًا من Apple مباشرة
// (apple-notifications). appAccountToken = هوية المستخدم، فيُربط الاشتراك بحسابه.
//
// الشراء يظهر فقط حين تكون المنتجات جاهزة في App Store Connect (EXPO_PUBLIC_IAP=1) —
// حتى لا يرى أحد زرًا لا يعمل (رفض آبل 2.1).
//
// المكتبة تُحمَّل عند الحاجة (require داخل الدوال): كودها أصلي، ولو حُمّلت في الأعلى
// انهار التطبيق في أي نسخة مبنية قبل إضافتها (تحديث هوائي لنسخة قديمة).
import { Platform } from "react-native";

import { supabase } from "./supabase";

export const PRODUCTS = {
  plus_month: "vsf_plus_month",
  plus_year: "vsf_plus_year",
  pro_month: "vsf_pro_month",
  pro_year: "vsf_pro_year",
  premium_month: "vsf_premium_month",
  premium_year: "vsf_premium_year",
} as const;
export type ProductKey = keyof typeof PRODUCTS;
const SKUS: string[] = Object.values(PRODUCTS);
// صفحات إضافية (شراء استهلاكي يُضاف لرصيد المستخدم على السيرفر)
export const PAGES_SKU = "vsf_pages_50";
const ALL_SKUS = [...SKUS, PAGES_SKU];

// روابط إلزامية في شاشة الاشتراك. الشروط: اتفاقية آبل القياسية.
export const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
// رابط سياسة الخصوصية المنشورة (نفس المسجّل في App Store Connect)
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? "https://voicestudyflow.app/privacy";
export const MANAGE_URL = "https://apps.apple.com/account/subscriptions";

const ENABLED = process.env.EXPO_PUBLIC_IAP === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */
function iap(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-iap");
  } catch {
    return null;
  }
}

export function purchasesAvailable(): boolean {
  return ENABLED && Platform.OS === "ios" && !!iap();
}

let userId = "";
let connecting: Promise<boolean> | null = null;
let pending: ((r: BuyResult) => void) | null = null;
const products = new Map<string, any>();

/** يرسل معاملات Apple الموقّعة للسيرفر ليتحقّق منها ويحدّث الاشتراك */
async function sendToServer(tokens: (string | null | undefined)[]): Promise<string | null> {
  const jws = tokens.filter((x): x is string => !!x);
  if (!jws.length) return null;
  try {
    const { data } = await supabase.functions.invoke("apple-verify", { body: { jws } });
    return (data as { plan?: string | null })?.plan ?? null;
  } catch {
    return null;
  }
}

/** اتصال واحد بالمتجر + مستمع المشتريات (يُنهي المعاملة بعد تحقّق السيرفر) */
function connect(): Promise<boolean> {
  if (connecting) return connecting;
  connecting = (async () => {
    const m = iap();
    if (!m || !purchasesAvailable()) return false;
    try {
      await m.initConnection();
      m.purchaseUpdatedListener(async (purchase: any) => {
        if (!ALL_SKUS.includes(purchase?.productId)) return;
        await sendToServer([purchase.purchaseToken]);
        try {
          // الصفحات الإضافية استهلاكية: تُنهى بعد إضافتها للرصيد على السيرفر
          await m.finishTransaction({ purchase, isConsumable: purchase.productId === PAGES_SKU });
        } catch {
          // منتهية مسبقًا
        }
        const { invalidatePlan } = await import("./plan");
        invalidatePlan();
        pending?.("ok");
        pending = null;
      });
      m.purchaseErrorListener((e: any) => {
        pending?.(String(e?.code) === "user-cancelled" ? "cancelled" : "failed");
        pending = null;
      });
      const list = await m.fetchProducts({ skus: SKUS, type: "subs" });
      for (const p of list ?? []) products.set(p.id, p);
      try {
        const packs = await m.fetchProducts({ skus: [PAGES_SKU], type: "in-app" });
        for (const p of packs ?? []) products.set(p.id, p);
      } catch {
        // الصفحات الإضافية غير متاحة بعد → زرها لا يظهر
      }
      return true;
    } catch {
      connecting = null; // نعيد المحاولة لاحقًا
      return false;
    }
  })();
  return connecting;
}

/** يُستدعى بعد الدخول: يربط المشتريات بهوية المستخدم ويزامن الاشتراك الفعّال مع السيرفر */
export async function initPurchases(appUserId: string): Promise<void> {
  if (!purchasesAvailable() || !appUserId) return;
  userId = appUserId;
  if (!(await connect())) return;
  try {
    const subs = await iap()!.getActiveSubscriptions(SKUS);
    await sendToServer((subs ?? []).map((s: any) => s.purchaseToken));
  } catch {
    // بلا شبكة/متجر → السيرفر يبقى على آخر حالة، وإشعارات Apple تكمل التحديث
  }
}

export type BuyResult = "ok" | "cancelled" | "unavailable" | "failed";

export async function buy(key: ProductKey): Promise<BuyResult> {
  if (!purchasesAvailable() || !(await connect())) return "unavailable";
  if (!products.has(PRODUCTS[key])) return "unavailable";
  return new Promise<BuyResult>((resolve) => {
    pending = resolve;
    iap()!
      .requestPurchase({
        request: { apple: { sku: PRODUCTS[key], ...(userId ? { appAccountToken: userId } : {}) } },
        type: "subs",
      })
      .catch((e: any) => {
        if (pending === resolve) {
          pending = null;
          resolve(String(e?.code) === "user-cancelled" ? "cancelled" : "failed");
        }
      });
  });
}

/** شراء ٥٠ صفحة إضافية (تُضاف لرصيد هذا الحساب بعد تحقّق السيرفر من توقيع Apple) */
export async function buyPages(): Promise<BuyResult> {
  if (!purchasesAvailable() || !(await connect())) return "unavailable";
  if (!products.has(PAGES_SKU)) return "unavailable";
  return new Promise<BuyResult>((resolve) => {
    pending = resolve;
    iap()!
      .requestPurchase({
        request: { apple: { sku: PAGES_SKU, ...(userId ? { appAccountToken: userId } : {}) } },
        type: "in-app",
      })
      .catch((e: any) => {
        if (pending === resolve) {
          pending = null;
          resolve(String(e?.code) === "user-cancelled" ? "cancelled" : "failed");
        }
      });
  });
}

/** سعر الصفحات الإضافية كما يعرضه المتجر */
export async function pagesPrice(): Promise<string | null> {
  if (!purchasesAvailable() || !(await connect())) return null;
  return products.get(PAGES_SKU)?.displayPrice ?? null;
}

/** استعادة المشتريات: الاشتراك مربوط بحساب Apple فيعود على أي جهاز */
export async function restore(): Promise<boolean> {
  if (!purchasesAvailable() || !(await connect())) return false;
  const m = iap()!;
  try {
    await m.restorePurchases();
  } catch {
    // نكمل بفحص مباشر
  }
  try {
    const all = await m.getAvailablePurchases();
    const plan = await sendToServer((all ?? []).filter((p: any) => SKUS.includes(p.productId)).map((p: any) => p.purchaseToken));
    const { invalidatePlan } = await import("./plan");
    invalidatePlan();
    return !!plan;
  } catch {
    return false;
  }
}

/** الخطة الفعّالة حسب المتجر (فورية بعد الشراء، قبل أي مزامنة مع السيرفر) */
export async function storeActivePlan(): Promise<"premium" | "pro" | "plus" | null> {
  if (!purchasesAvailable() || !(await connect())) return null;
  try {
    const subs: any[] = (await iap()!.getActiveSubscriptions(SKUS)) ?? [];
    const ids = subs.filter((s) => s.isActive !== false).map((s) => String(s.productId));
    if (ids.some((id) => id.startsWith("vsf_premium"))) return "premium";
    if (ids.some((id) => id.startsWith("vsf_pro"))) return "pro";
    if (ids.some((id) => id.startsWith("vsf_plus"))) return "plus";
    return null;
  } catch {
    return null;
  }
}

export type StorePrice = { text: string; amount: number; perMonth: string | null; trialDays: number };

const PERIOD_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

/** السعر كما يعرضه المتجر بعملة المستخدم — لا نكتب الأسعار في التطبيق */
export async function storePrice(key: ProductKey): Promise<StorePrice | null> {
  if (!purchasesAvailable() || !(await connect())) return null;
  const p = products.get(PRODUCTS[key]);
  if (!p) return null;
  const amount = Number(p.price ?? 0);
  let perMonth: string | null = null;
  if (key.endsWith("_year") && amount > 0) {
    try {
      perMonth = new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(amount / 12);
    } catch {
      perMonth = null;
    }
  }
  const trialDays =
    p.introductoryPricePaymentModeIOS === "free-trial"
      ? (PERIOD_DAYS[String(p.introductoryPriceSubscriptionPeriodIOS)] ?? 0) * Math.max(1, Number(p.introductoryPriceNumberOfPeriodsIOS) || 1)
      : 0;
  return { text: String(p.displayPrice ?? ""), amount, perMonth, trialDays };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
