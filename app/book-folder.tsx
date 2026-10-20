// app/book-folder.tsx
// ملف من «ملفاتي» في محفوظات الكتاب: يضع فيه المستخدم ما يشاء — ملاحظة نصية (تُكتب وتُعدَّل)،
// أو ملف من الجهاز (صورة، PDF، مستند)، أو عنصرًا من محفوظات الكتاب. ولكل عنصر حذف، وللملف إعادة تسمية وحذف.
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { PressableScale } from "../components/brand/motion";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import {
  addDeviceFile,
  addSaveRef,
  addText,
  deleteFolder,
  itemFile,
  loadFolders,
  removeItems,
  renameFolder,
  updateText,
  type BookFolder,
  type FolderItem,
} from "../lib/bookFolders";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { listSaves } from "../lib/studySaves";

type Draft = { id: string | null; title: string; text: string };

export default function BookFolderScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const bad = pal.dark ? "#FF8A96" : "#B83A48";
  const params = useLocalSearchParams<{ book_id?: string; folder_id?: string; book_title?: string }>();
  const bookId = typeof params.book_id === "string" ? params.book_id : "";
  const folderId = typeof params.folder_id === "string" ? params.folder_id : "";

  const [folder, setFolder] = useState<BookFolder | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null); // محرّر الملاحظة النصية
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const list = await loadFolders(bookId);
    setFolder(list.find((f) => f.id === folderId) ?? null);
  }, [bookId, folderId]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const kindIcon = (it: FolderItem): keyof typeof Ionicons.glyphMap =>
    it.kind === "text" ? "document-text-outline" : it.kind === "save" ? "bookmark-outline" : it.mime.startsWith("image/") ? "image-outline" : it.mime === "application/pdf" ? "document-outline" : "attach-outline";

  // ===== الإضافة =====
  function addMenu() {
    Alert.alert(t("folders.add"), undefined, [
      { text: t("folders.addText"), onPress: () => setDraft({ id: null, title: "", text: "" }) },
      { text: t("folders.addFile"), onPress: () => void pickFile() },
      { text: t("folders.addSave"), onPress: () => void pickSave() },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    setBusy(true);
    try {
      for (const a of res.assets) await addDeviceFile(bookId, folderId, { uri: a.uri, name: a.name, mimeType: a.mimeType });
    } catch {
      Alert.alert(t("folders.addFile"), t("folders.openFailed"));
    } finally {
      setBusy(false);
      void reload();
    }
  }

  async function pickSave() {
    const saves = await listSaves(bookId).catch(() => []);
    if (!saves.length) return Alert.alert(t("folders.pickSave"), t("folders.noSaves"));
    Alert.alert(t("folders.pickSave"), undefined, [
      ...saves.slice(0, 12).map((sv) => ({
        text: sv.title,
        onPress: () => void addSaveRef(bookId, folderId, { id: sv.id, title: sv.title, kind: sv.kind }).then(reload),
      })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }

  async function saveDraft() {
    if (!draft) return;
    const title = draft.title.trim() || draft.text.trim().split("\n")[0].slice(0, 40) || t("folders.kind.text");
    if (draft.id) await updateText(bookId, folderId, draft.id, title, draft.text);
    else if (draft.text.trim() || draft.title.trim()) await addText(bookId, folderId, title, draft.text);
    setDraft(null);
    void reload();
  }

  // ===== الفتح والحذف =====
  async function openItem(it: FolderItem) {
    if (it.kind === "text") return setDraft({ id: it.id, title: it.title, text: it.text });
    if (it.kind === "save") return router.push({ pathname: "/saved/[id]", params: { id: it.saveId, book_title: params.book_title ?? "" } });
    try {
      const f = itemFile(bookId, folderId, it);
      if (!f.exists) throw new Error("missing");
      await Sharing.shareAsync(f.uri, { mimeType: it.mime, dialogTitle: it.title });
    } catch {
      Alert.alert(it.title, t("folders.openFailed"));
    }
  }

  function confirmRemove(it: FolderItem) {
    Alert.alert(t("folders.itemDeleteTitle"), t("folders.itemDeleteBody", { name: it.title }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => void removeItems(bookId, folderId, [it.id]).then(reload) },
    ]);
  }

  function rename() {
    if (!folder) return;
    Alert.prompt?.(
      t("folders.rename"),
      undefined,
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.save"), onPress: (txt?: string) => void ((txt || "").trim() && renameFolder(bookId, folderId, txt!).then(reload)) },
      ],
      "plain-text",
      folder.name
    );
  }

  function confirmDeleteFolder() {
    if (!folder) return;
    Alert.alert(t("folders.delete"), t("folders.deleteBody", { name: folder.name }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => void deleteFolder(bookId, folderId).then(() => router.back()) },
    ]);
  }

  const back = (
    <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
      <SceneIconButton>
        <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
      </SceneIconButton>
    </Pressable>
  );

  return (
    <SceneScreen>
      <SceneBanner
        title={folder?.name ?? ""}
        subtitle={params.book_title || undefined}
        height={150}
        left={back}
        right={
          folder ? (
            <View style={{ flexDirection: dir.row, gap: 8 }}>
              <Pressable onPress={rename} hitSlop={6} accessibilityLabel={t("folders.rename")}>
                <SceneIconButton>
                  <Ionicons name="pencil" size={18} color={pal.ink} />
                </SceneIconButton>
              </Pressable>
              <Pressable onPress={confirmDeleteFolder} hitSlop={6} accessibilityLabel={t("folders.delete")}>
                <SceneIconButton>
                  <Ionicons name="trash-outline" size={19} color={bad} />
                </SceneIconButton>
              </Pressable>
            </View>
          ) : undefined
        }
      />

      {folder === undefined ? (
        <ActivityIndicator color={pal.accent} style={{ marginTop: 40 }} />
      ) : folder === null ? (
        <Text style={[styles.empty, { color: pal.dim }]}>{t("folders.openFailed")}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <PressableScale onPress={addMenu} style={[styles.addBtn, { flexDirection: dir.row, backgroundColor: pal.accent }]}>
            {busy ? <ActivityIndicator color={pal.onAccent} /> : <Ionicons name="add" size={20} color={pal.onAccent} />}
            <Text style={[styles.addTxt, { color: pal.onAccent }]}>{t("folders.add")}</Text>
          </PressableScale>

          {folder.items.length === 0 ? (
            <SceneCard style={{ padding: Spacing.lg }}>
              <Text style={[styles.emptyCard, { color: pal.dim, textAlign: dir.textAlign }]}>{t("folders.empty")}</Text>
            </SceneCard>
          ) : (
            folder.items.map((it) => (
              <PressableScale key={it.id} onPress={() => void openItem(it)}>
                <SceneCard style={[styles.row, { flexDirection: dir.row }]}>
                  {it.kind === "file" && it.mime.startsWith("image/") ? (
                    <Image source={{ uri: itemFile(bookId, folderId, it).uri }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.icon, { backgroundColor: pal.soft }]}>
                      <Ionicons name={kindIcon(it)} size={19} color={pal.accent} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
                      {it.title}
                    </Text>
                    <Text style={[styles.sub, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                      {it.kind === "text" && it.text.trim() ? it.text.trim().replace(/\s+/g, " ") : t(`folders.kind.${it.kind}`)}
                    </Text>
                  </View>
                  <PressableScale onPress={() => confirmRemove(it)} style={[styles.trash, { borderColor: pal.cardBorder }]}>
                    <Ionicons name="trash-outline" size={17} color={bad} accessibilityLabel={t("common.delete")} />
                  </PressableScale>
                </SceneCard>
              </PressableScale>
            ))
          )}
        </ScrollView>
      )}

      {/* محرّر الملاحظة النصية */}
      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={() => setDraft(null)}>
        <KeyboardAvoidingView behavior="padding" style={styles.mask}>
          <View style={[styles.sheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]}>
            <View style={[styles.sheetHead, { flexDirection: dir.row }]}>
              <Pressable onPress={() => setDraft(null)} hitSlop={10}>
                <Text style={[styles.sheetBtn, { color: pal.dim }]}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable onPress={() => void saveDraft()} hitSlop={10}>
                <Text style={[styles.sheetBtn, { color: pal.accent }]}>{t("common.save")}</Text>
              </Pressable>
            </View>
            <TextInput
              value={draft?.title ?? ""}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, title: v } : d))}
              placeholder={t("folders.textTitle")}
              placeholderTextColor={pal.dim}
              style={[styles.titleInput, { color: pal.ink, borderColor: pal.cardBorder, textAlign: dir.textAlign }]}
            />
            <TextInput
              value={draft?.text ?? ""}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, text: v } : d))}
              placeholder={t("folders.textBody")}
              placeholderTextColor={pal.dim}
              multiline
              textAlignVertical="top"
              style={[styles.bodyInput, { color: pal.ink, borderColor: pal.cardBorder, textAlign: dir.textAlign }]}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 60, gap: 10 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14 },
  emptyCard: { fontSize: 14, lineHeight: 22 },
  addBtn: { height: 50, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 },
  addTxt: { fontSize: 15.5, fontWeight: "900" },
  row: { alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  title: { fontSize: 14.5, fontWeight: "800" },
  sub: { fontSize: 12.5, marginTop: 2 },
  trash: { width: 36, height: 36, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { height: "82%", borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.lg, gap: 12 },
  sheetHead: { justifyContent: "space-between", alignItems: "center" },
  sheetBtn: { fontSize: 16, fontWeight: "900" },
  titleInput: { fontSize: 17, fontWeight: "800", borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  bodyInput: { flex: 1, fontSize: 16, lineHeight: 26, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14 },
});
