// lib/bookFolders.ts
// «ملفات» داخل محفوظات الكتاب: ينشئها المستخدم بالاسم الذي يريده، ويضع فيها ما يشاء —
// ملاحظة نصية، أو ملف من الجهاز (صورة، PDF، مستند…)، أو عنصرًا من محفوظات الكتاب (عرض، إجابة).
// الفهرس في AsyncStorage لكل كتاب، والملفات المضافة تُنسخ إلى مستندات التطبيق (دائمة، تعمل بلا إنترنت).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

export type FolderItem =
  | { id: string; kind: "text"; title: string; text: string; createdAt: number }
  | { id: string; kind: "file"; title: string; name: string; mime: string; createdAt: number }
  | { id: string; kind: "save"; title: string; saveId: string; saveKind: string; createdAt: number };

export type BookFolder = { id: string; name: string; items: FolderItem[]; createdAt: number };

export const FILES_ROOT = "book-files-v1";
const key = (bookId: string) => `vsf:folders:v1:${bookId}`;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function folderDir(bookId: string, folderId: string): Directory {
  const d = new Directory(Paths.document, FILES_ROOT, bookId, folderId);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

/** الملف المحفوظ لعنصر من نوع «ملف» (لفتحه أو مشاركته) */
export function itemFile(bookId: string, folderId: string, item: Extract<FolderItem, { kind: "file" }>): File {
  return new File(folderDir(bookId, folderId), item.name);
}

export async function loadFolders(bookId: string): Promise<BookFolder[]> {
  try {
    const raw = await AsyncStorage.getItem(key(bookId));
    const list = raw ? (JSON.parse(raw) as BookFolder[]) : [];
    return Array.isArray(list) ? list.filter((f) => f && typeof f.id === "string" && Array.isArray(f.items)) : [];
  } catch {
    return [];
  }
}

async function save(bookId: string, list: BookFolder[]): Promise<void> {
  await AsyncStorage.setItem(key(bookId), JSON.stringify(list));
}

async function update(bookId: string, folderId: string, fn: (f: BookFolder) => BookFolder): Promise<BookFolder | null> {
  const list = await loadFolders(bookId);
  let out: BookFolder | null = null;
  const next = list.map((f) => (f.id === folderId ? (out = fn(f)) : f));
  await save(bookId, next);
  return out;
}

export async function createFolder(bookId: string, name: string): Promise<BookFolder> {
  const f: BookFolder = { id: uid(), name: name.trim(), items: [], createdAt: Date.now() };
  await save(bookId, [f, ...(await loadFolders(bookId))]);
  return f;
}

export function renameFolder(bookId: string, folderId: string, name: string) {
  return update(bookId, folderId, (f) => ({ ...f, name: name.trim() || f.name }));
}

/** حذف الملف بكل ما فيه (والملفات المنسوخة على الجهاز) */
export async function deleteFolder(bookId: string, folderId: string): Promise<void> {
  await save(bookId, (await loadFolders(bookId)).filter((f) => f.id !== folderId));
  try {
    const d = new Directory(Paths.document, FILES_ROOT, bookId, folderId);
    if (d.exists) d.delete();
  } catch {}
}

export function addText(bookId: string, folderId: string, title: string, text: string) {
  const item: FolderItem = { id: uid(), kind: "text", title: title.trim(), text, createdAt: Date.now() };
  return update(bookId, folderId, (f) => ({ ...f, items: [item, ...f.items] }));
}

export function updateText(bookId: string, folderId: string, itemId: string, title: string, text: string) {
  return update(bookId, folderId, (f) => ({
    ...f,
    items: f.items.map((it) => (it.id === itemId && it.kind === "text" ? { ...it, title: title.trim(), text } : it)),
  }));
}

/** ينسخ ملفًا اختاره المستخدم إلى الملف (يبقى حتى لو حُذف الأصل) */
export async function addDeviceFile(bookId: string, folderId: string, src: { uri: string; name: string; mimeType?: string | null }) {
  const ext = (src.name.match(/\.[A-Za-z0-9]{1,6}$/)?.[0] ?? "").toLowerCase();
  const name = `${uid()}${ext}`;
  new File(src.uri).copy(new File(folderDir(bookId, folderId), name));
  const item: FolderItem = { id: uid(), kind: "file", title: src.name, name, mime: src.mimeType || "application/octet-stream", createdAt: Date.now() };
  return update(bookId, folderId, (f) => ({ ...f, items: [item, ...f.items] }));
}

export function addSaveRef(bookId: string, folderId: string, save: { id: string; title: string; kind: string }) {
  return update(bookId, folderId, (f) =>
    f.items.some((it) => it.kind === "save" && it.saveId === save.id)
      ? f
      : { ...f, items: [{ id: uid(), kind: "save", title: save.title, saveId: save.id, saveKind: save.kind, createdAt: Date.now() }, ...f.items] }
  );
}

/** حذف عناصر من الملف (والملفات المنسوخة منها) */
export async function removeItems(bookId: string, folderId: string, ids: string[]) {
  const gone = new Set(ids);
  return update(bookId, folderId, (f) => {
    for (const it of f.items)
      if (gone.has(it.id) && it.kind === "file")
        try {
          const file = itemFile(bookId, folderId, it);
          if (file.exists) file.delete();
        } catch {}
    return { ...f, items: f.items.filter((it) => !gone.has(it.id)) };
  });
}

/** عند حذف عنصر من المحفوظات: يُزال من كل الملفات التي أُضيف إليها */
export async function forgetSave(bookId: string, saveId: string): Promise<void> {
  const list = await loadFolders(bookId);
  await save(bookId, list.map((f) => ({ ...f, items: f.items.filter((it) => !(it.kind === "save" && it.saveId === saveId)) })));
}
