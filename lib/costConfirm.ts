// lib/costConfirm.ts
// قبل توليد طويل (ملخّص/فيديو على أجزاء): يُعرض كم طلبًا سيستهلك وكم يبقى، فلا يفاجئ العدّاد أحدًا
// (قرار نهلة ٢٠ أكتوبر). طلب واحد أو أقل لا يُسأل عنه، وحساب المالكة بلا حد لا يُسأل.
import { Alert } from "react-native";

import { getPlan, getUsage, planLimits } from "./plan";

type T = (key: string, vars?: Record<string, string | number>) => string;

// سؤال واحد لكل توليد: iOS لا يعرض نافذتين معًا (الثانية تسقط بصمت فتنتظر شاشتها للأبد)،
// فإن فُتحت الشاشة نفسها مرتين يشتركان في جواب واحد.
const pending = new Map<string, Promise<boolean>>();

export function confirmCost(n: number, what: "summary" | "video" | "studyfile" | "qfile" | "quickprep", t: T, estimated = false, key = `${what}:${n}`): Promise<boolean> {
  const cur = pending.get(key);
  if (cur) return cur;
  const p = ask(n, what, t, estimated).finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

async function ask(n: number, what: "summary" | "video" | "studyfile" | "qfile" | "quickprep", t: T, estimated: boolean): Promise<boolean> {
  if (n <= 1) return true;
  const plan = await getPlan().catch(() => null);
  if (!plan || plan === "owner") return true;
  const [limits, usage] = await Promise.all([planLimits(plan), getUsage()]);
  const left = limits ? Math.max(0, limits.ai - usage.ai) : null;
  const body =
    t(estimated ? "cost.bodyAbout" : "cost.body", { what: t(`cost.what.${what}`), n }) +
    (left !== null ? ` ${t("cost.left", { left })}` : "") +
    (left !== null && left < n ? `\n\n${t("cost.notEnough")}` : "");
  return new Promise((resolve) =>
    Alert.alert(t("cost.title"), body, [
      { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
      { text: t("cost.go"), onPress: () => resolve(true) },
    ], { cancelable: false })
  );
}
