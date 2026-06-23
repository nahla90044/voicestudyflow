import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "vsf_device_user_id";

// UUID v4 بسيط بدون مكتبات (يكفي كبداية)
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceUserId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;

  const id = uuidv4();
  await AsyncStorage.setItem(KEY, id);
  return id;
}
