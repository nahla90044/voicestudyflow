// lib/notify.ts
// تنبيه يومي محلي لتذكير المذاكرة.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "التنبيهات",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

const HOURS_KEY = "vsf:reminder:hours"; // مصفوفة ساعات يومية (JSON)

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** قائمة أوقات التذكير اليومية المحفوظة (ساعات ٠–٢٣ مرتّبة). */
export async function getReminders(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(HOURS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((h: unknown) => Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23)
      .sort((a: number, b: number) => a - b);
  } catch {
    return [];
  }
}

/** يجدول تنبيهًا يوميًا لكل ساعة في القائمة (يستبدل كل الجدولة السابقة). */
export async function setReminders(hours: number[]): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  await ensureAndroidChannel();
  const uniq = [...new Set(hours)].filter((h) => h >= 0 && h <= 23).sort((a, b) => a - b);
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const hour of uniq) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "وقت وردك اليوم 📚",
        body: "خصّص دقائق لكتابك وحافظ على سلسلتك ✨",
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
        channelId: "default",
      },
    });
  }
  await AsyncStorage.setItem(HOURS_KEY, JSON.stringify(uniq));
  return true;
}

/** يطلب الإذن (إن لزم) ثم يرسل إشعارًا تجريبيًا بصوت وبانر خلال ثانيتين. */
export async function sendTestNotification(): Promise<boolean> {
  const perm = await Notifications.getPermissionsAsync();
  let granted = perm.granted;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return false;

  await ensureAndroidChannel();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "VoiceStudyFlow ✨",
      body: "هذا إشعار تجريبي — كل شيء يعمل تمامًا! 📚",
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      channelId: "default",
    },
  });
  return true;
}
