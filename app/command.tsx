// app/command.tsx
// «بحث وأوامر» — يُفتح من الزر الأوسط في الشريط. مكان واحد للوصول لأي كتاب أو أي شاشة
// بضغطة، بدل التنقّل بين التبويبات. زر الميكروفون أسفلها يفتح المساعد الصوتي.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BookCover } from "../components/brand/book-cover";
import { PressableScale } from "../components/brand/motion";
import { SceneCard, SceneScreen } from "../components/brand/scene-screen";

import { getUserId } from "../lib/auth";
import { getContinueBook, type ContinueBook } from "../lib/home";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { supabase } from "../lib/supabase";

type Book = { id: string; title: string; pdf_path: string };
type Action = { key: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap; go: () => void };

export default function CommandScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [cont, setCont] = useState<ContinueBook | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const [c, list] = await Promise.all([
        getContinueBook(),
        (async () => {
          try {
            const uid = await getUserId();
            const { data } = await supabase
              .from("books")
              .select("id,title,pdf_path")
              .eq("user_id", uid)
              .eq("is_archived", false)
              .order("created_at", { ascending: false });
            return (data ?? []) as Book[];
          } catch {
            return [];
          }
        })(),
      ]);
      if (!on) return;
      setCont(c);
      setBooks(list);
    })();
    return () => {
      on = false;
    };
  }, []);

  // الانتقال يغلق النافذة أولًا ثم يفتح الوجهة — حتى لا تتراكم الشاشات فوق بعض
  const go = (fn: () => void) => () => {
    router.back();
    setTimeout(fn, 10);
  };

  const actions: Action[] = useMemo(
    () => [
      { key: "add", labelKey: "cmd.addBook", icon: "add-circle", go: go(() => router.push("/add-book")) },
      { key: "plan", labelKey: "cmd.plan", icon: "calendar", go: go(() => router.push("/calendar")) },
      { key: "focus", labelKey: "cmd.focus", icon: "timer", go: go(() => router.push("/pomodoro")) },
      { key: "words", labelKey: "words.title", icon: "bookmarks", go: go(() => router.push("/words")) },
      { key: "review", labelKey: "cmd.review", icon: "albums", go: go(() => router.push("/flashcards")) },
      { key: "progress", labelKey: "cmd.progress", icon: "stats-chart", go: go(() => router.push("/activity")) },
      { key: "archive", labelKey: "cmd.archive", icon: "archive", go: go(() => router.push("/explore")) },
      { key: "settings", labelKey: "cmd.settings", icon: "settings", go: go(() => router.push("/more")) },
      { key: "help", labelKey: "cmd.help", icon: "help-circle", go: go(() => router.push("/help")) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const query = q.trim().toLowerCase();
  const foundBooks = query ? books.filter((b) => (b.title || "").toLowerCase().includes(query)) : books.slice(0, 4);
  const foundActions = query ? actions.filter((a) => t(a.labelKey).toLowerCase().includes(query)) : actions;

  const openBook = (b: { id: string }) => go(() => router.push({ pathname: "/book/[id]", params: { id: b.id } }))();

  type Row = { kind: "head"; key: string; label: string } | { kind: "book"; key: string; book: Book } | { kind: "action"; key: string; action: Action };
  const rows: Row[] = [];
  if (foundBooks.length) {
    rows.push({ kind: "head", key: "h-books", label: t("cmd.books") });
    foundBooks.forEach((b) => rows.push({ kind: "book", key: "b-" + b.id, book: b }));
  }
  if (foundActions.length) {
    rows.push({ kind: "head", key: "h-actions", label: t("cmd.actions") });
    foundActions.forEach((a) => rows.push({ kind: "action", key: "a-" + a.key, action: a }));
  }

  return (
    <SceneScreen>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={[styles.searchRow, { flexDirection: dir.row }]}>
          <View style={[styles.search, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: pal.dark ? "#000" : "#3C5028" }]}>
            <Ionicons name="sparkles" size={18} color={pal.accent} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t("cmd.placeholder")}
              placeholderTextColor={pal.dim}
              selectionColor={pal.accent}
              style={[styles.input, { color: pal.ink, textAlign: dir.textAlign }]}
              returnKeyType="search"
            />
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={[styles.cancel, { color: pal.accent }]}>{t("cmd.cancel")}</Text>
          </Pressable>
        </View>

        {cont && !query && (
          <PressableScale onPress={() => openBook(cont)} style={styles.contWrap}>
            <SceneCard padded={false} style={[styles.cont, { flexDirection: dir.row }]}>
              <BookCover title={cont.title} width={40} height={54} />
              <Text style={[styles.contTxt, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                {t("cmd.continue", { title: cont.title })}
              </Text>
              <View style={[styles.play, { backgroundColor: pal.accent }]}>
                <Ionicons name="play" size={16} color={pal.onAccent} />
              </View>
            </SceneCard>
          </PressableScale>
        )}

        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(r) => r.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: pal.dim }]}>{t("cmd.noResults")}</Text>}
          renderItem={({ item }) => {
            if (item.kind === "head")
              return <Text style={[styles.head, { color: pal.dim, textAlign: dir.textAlign }]}>{item.label}</Text>;
            if (item.kind === "book")
              return (
                <PressableScale
                  onPress={() => openBook(item.book)}
                  style={[styles.row, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }]}
                >
                  <BookCover title={item.book.title} width={34} height={46} />
                  <Text style={[styles.rowTxt, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                    {item.book.title}
                  </Text>
                  <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={16} color={pal.dim} />
                </PressableScale>
              );
            const a = item.action;
            return (
              <PressableScale
                onPress={a.go}
                style={[styles.row, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }]}
              >
                <View style={[styles.icon, { backgroundColor: pal.soft }]}>
                  <Ionicons name={a.icon} size={19} color={pal.accent} />
                </View>
                <Text style={[styles.rowTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{t(a.labelKey)}</Text>
                <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={16} color={pal.dim} />
              </PressableScale>
            );
          }}
        />

        {/* المساعد الصوتي: زر بلون المشهد مع هالة خفيفة أسفل الشاشة */}
        <View style={styles.voiceWrap}>
          <PressableScale onPress={go(() => router.push("/voice"))} style={[styles.voiceBtnWrap, { shadowColor: pal.accent }]}>
            <View style={[styles.voiceHalo, { backgroundColor: pal.soft, borderColor: pal.accent + "33" }]}>
              <View style={[styles.voiceBtn, { backgroundColor: pal.accent }]}>
                <Ionicons name="mic" size={30} color={pal.onAccent} accessibilityLabel={t("ask.voice")} />
              </View>
            </View>
          </PressableScale>
          <Text style={[styles.voiceHint, { color: pal.dim }]}>{t("cmd.voice")}</Text>
        </View>
      </SafeAreaView>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  searchRow: { alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: {
    flex: 1,
    alignItems: "center",
    gap: 10,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  input: { flex: 1, fontSize: 16 },
  cancel: { fontSize: 14, fontWeight: "700" },
  contWrap: { marginHorizontal: 16, marginTop: 6, marginBottom: 4 },
  cont: { alignItems: "center", gap: 12, padding: 12, borderRadius: 22 },
  contTxt: { flex: 1, fontSize: 15, fontWeight: "800" },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  head: { fontSize: 12, fontWeight: "800", marginTop: 18, marginBottom: 8, paddingHorizontal: 6 },
  row: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTxt: { flex: 1, fontSize: 15, fontWeight: "600" },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", marginTop: 40 },
  voiceWrap: { alignItems: "center", gap: 10, paddingTop: 8, paddingBottom: 26 },
  voiceBtnWrap: { borderRadius: 43, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  voiceHalo: { width: 86, height: 86, borderRadius: 43, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  voiceBtn: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  voiceHint: { fontSize: 12.5, fontWeight: "600" },
});
