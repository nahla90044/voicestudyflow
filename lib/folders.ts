// lib/folders.ts
// مجلدات لتنظيم الكتب (محليًا): كل مجلد له اسم ولون، وكل كتاب يُسنَد لمجلد.
import AsyncStorage from "@react-native-async-storage/async-storage";

const LIST_KEY = "folders:list:v1";
const ASSIGN_KEY = "folders:assign:v1"; // { [bookId]: folderId }

export type Folder = { id: string; name: string; color: string; createdAt: string };

// ألوان جاهزة للمجلدات (تُوزَّع بالتناوب)
export const FOLDER_COLORS = [
  "#7c5cff", "#4f8cff", "#22d3ee", "#2ecc71", "#f5a623", "#ff6b9d", "#a855f7",
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function getFolders(): Promise<Folder[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    return raw ? (JSON.parse(raw) as Folder[]) : [];
  } catch {
    return [];
  }
}

async function saveFolders(list: Folder[]): Promise<void> {
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
}

export async function addFolder(name: string): Promise<Folder> {
  const list = await getFolders();
  const color = FOLDER_COLORS[list.length % FOLDER_COLORS.length];
  const folder: Folder = { id: newId(), name: name.trim() || "مجلد", color, createdAt: todayISO() };
  await saveFolders([...list, folder]);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const list = await getFolders();
  await saveFolders(list.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)));
}

/** يحذف المجلد ويُزيل إسناد كتبه (لا يحذف الكتب). */
export async function removeFolder(id: string): Promise<void> {
  const list = await getFolders();
  await saveFolders(list.filter((f) => f.id !== id));
  const assign = await getAssignments();
  let changed = false;
  for (const k of Object.keys(assign)) {
    if (assign[k] === id) {
      delete assign[k];
      changed = true;
    }
  }
  if (changed) await AsyncStorage.setItem(ASSIGN_KEY, JSON.stringify(assign));
}

export async function getAssignments(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(ASSIGN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** يُسنِد كتابًا لمجلد (أو يزيله من المجلد إن كان folderId = null). */
export async function setBookFolder(bookId: string, folderId: string | null): Promise<void> {
  const assign = await getAssignments();
  if (folderId) assign[bookId] = folderId;
  else delete assign[bookId];
  await AsyncStorage.setItem(ASSIGN_KEY, JSON.stringify(assign));
}
