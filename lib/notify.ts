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

const ENABLED_KEY = "vsf:reminder:enabled";
const HOUR_KEY = "vsf:reminder:hour";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getReminder(): Promise<{ enabled: boolean; hour: number }> {
  const [en, hr] = await Promise.all([
    AsyncStorage.getItem(ENABLED_KEY),
    AsyncStorage.getItem(HOUR_KEY),
  ]);
  const hour = hr ? Number(hr) : 20;
  return { enabled: en === "1", hour: Number.isFinite(hour) ? hour : 20 };
}

/** يفعّل التنبيه اليومي على ساعة محددة (24h)، يطلب الإذن إن لزم. */
export async function enableDailyReminder(hour: number): Promise<boolean> {
  const perm = await Notifications.getPermissionsAsync();
  let granted = perm.granted;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return false;

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "وقت وردك اليوم 📚",
      body: "خصّص دقائق لكتابك وحافظ على سلسلتك ✨",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  });

  await AsyncStorage.multiSet([
    [ENABLED_KEY, "1"],
    [HOUR_KEY, String(hour)],
  ]);
  return true;
}

export async function disableDailyReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem(ENABLED_KEY, "0");
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
