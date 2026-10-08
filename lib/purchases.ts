// lib/purchases.ts
// الشراء عبر متجر Apple بواسطة RevenueCat (نفس نمط حاكي).
// هوية الشراء = هوية المستخدم في السيرفر، فيعرف ويب-هوك المتجر لمن يفتح الاشتراك.
//
// الدفع يعمل فقط حين يوجد مفتاح RevenueCat (EXPO_PUBLIC_REVENUECAT_IOS). قبل ذلك:
// لا شاشة اشتراك ولا قيود تعتمد عليها — حتى لا يرى أحد زرًا لا يعمل (رفض آبل 2.1/3.1).
//
// المكتبة تُحمَّل عند الحاجة (require داخل الدوال): كودها أصلي، ولو حُمّلت في الأعلى
// انهار التطبيق في أي نسخة مبنية قبل إضافتها (تحديث هوائي لنسخة قديمة).
import { Platform } from "react-native";

const KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS ?? "";

export const PRODUCTS = {
  plus_month: "vsf_plus_month",
  plus_year: "vsf_plus_year",
  pro_month: "vsf_pro_month",
  pro_year: "vsf_pro_year",
} as const;
export type ProductKey = keyof typeof PRODUCTS;

// روابط إلزامية في شاشة الاشتراك. الشروط: اتفاقية آبل القياسية.
export const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
// رابط سياسة الخصوصية المنشورة (نفس المسجّل في App Store Connect)
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? "";
export const MANAGE_URL = "https://apps.apple.com/account/subscriptions";

let ready = false;

export function purchasesAvailable(): boolean {
  return !!KEY_IOS && Platform.OS === "ios";
}

 
function sdk(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-purchases").default;
  } catch {
    return null;
  }
}

/** يُستدعى بعد الدخول: يربط المشتريات بهوية المستخدم */
export async function initPurchases(appUserId: string): Promise<void> {
  if (!purchasesAvailable() || !appUserId) return;
  const Purchases = sdk();
  if (!Purchases) return;
  try {
    if (!ready) {
      Purchases.configure({ apiKey: KEY_IOS, appUserID: appUserId });
      ready = true;
    } else {
      await Purchases.logIn(appUserId);
    }
  } catch {
    // لا نعطّل التطبيق إن فشل الربط
  }
}

 
async function packageFor(productId: string): Promise<any | null> {
  const Purchases = sdk();
  if (!Purchases || !ready) return null;
  try {
    const offerings = await Purchases.getOfferings();
     
    const all = Object.values(offerings.all as Record<string, any>).flatMap((o) => o.availablePackages);
     
    return all.find((p: any) => p.product.identifier === productId) ?? null;
  } catch {
    return null;
  }
}

export type BuyResult = "ok" | "cancelled" | "unavailable" | "failed";

export async function buy(key: ProductKey): Promise<BuyResult> {
  if (!purchasesAvailable()) return "unavailable";
  const Purchases = sdk();
  const pkg = await packageFor(PRODUCTS[key]);
  if (!Purchases || !pkg) return "unavailable";
  try {
    await Purchases.purchasePackage(pkg);
    return "ok";
  } catch (e) {
    return (e as { userCancelled?: boolean })?.userCancelled ? "cancelled" : "failed";
  }
}

/** استعادة المشتريات: الاشتراك مربوط بحساب Apple فيعود على أي جهاز */
export async function restore(): Promise<boolean> {
  const Purchases = sdk();
  if (!purchasesAvailable() || !Purchases || !ready) return false;
  try {
    const info = await Purchases.restorePurchases();
    return Object.keys(info.entitlements.active).length > 0;
  } catch {
    return false;
  }
}

/** الخطة الفعّالة حسب المتجر (فورية بعد الشراء، قبل وصول الويب-هوك للسيرفر) */
export async function storeActivePlan(): Promise<"pro" | "plus" | null> {
  const Purchases = sdk();
  if (!purchasesAvailable() || !Purchases || !ready) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const active = Object.keys(info.entitlements.active);
    if (active.includes("pro")) return "pro";
    if (active.includes("plus")) return "plus";
    return null;
  } catch {
    return null;
  }
}

export type StorePrice = { text: string; amount: number; perMonth: string | null; trialDays: number };

/** السعر كما يعرضه المتجر بعملة المستخدم — لا نكتب الأسعار في التطبيق */
export async function storePrice(key: ProductKey): Promise<StorePrice | null> {
  if (!purchasesAvailable()) return null;
  const pkg = await packageFor(PRODUCTS[key]);
  const p = pkg?.product;
  if (!p) return null;
  const intro = p.introPrice;
  const trialDays =
    intro && intro.price === 0
      ? intro.periodUnit === "WEEK"
        ? 7 * intro.periodNumberOfUnits
        : intro.periodUnit === "DAY"
          ? intro.periodNumberOfUnits
          : 0
      : 0;
  return { text: p.priceString, amount: p.price, perMonth: p.pricePerMonthString ?? null, trialDays };
}
