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
import { LinearGradient } from "expo-linear-gradient";

import { Gradients, Palette } from "../constants/design";
import { getUserId } from "../lib/auth";
import { getContinueBook, type ContinueBook } from "../lib/home";
import { useDir, useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";

type Book = { id: string; title: string; pdf_path: string };
type Action = { key: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap; color: string; go: () => void };

export default function CommandScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
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
      { key: "add", labelKey: "cmd.addBook", icon: "add-circle", color: Palette.primary, go: go(() => router.push("/add-book")) },
      { key: "plan", labelKey: "cmd.plan", icon: "calendar", color: Palette.neonCyan, go: go(() => router.push("/calendar")) },
      { key: "focus", labelKey: "cmd.focus", icon: "timer", color: Palette.success, go: go(() => router.push("/pomodoro")) },
      { key: "words", labelKey: "words.title", icon: "bookmarks", color: "#D9D3FF", go: go(() => router.push("/words")) },
      { key: "review", labelKey: "cmd.review", icon: "albums", color: Palette.neonPink, go: go(() => router.push("/flashcards")) },
      { key: "progress", labelKey: "cmd.progress", icon: "stats-chart", color: Palette.warn, go: go(() => router.push("/activity")) },
      { key: "archive", labelKey: "cmd.archive", icon: "archive", color: Palette.textDim, go: go(() => router.push("/explore")) },
      { key: "settings", labelKey: "cmd.settings", icon: "settings", color: Palette.textDim, go: go(() => router.push("/more")) },
      { key: "help", labelKey: "cmd.help", icon: "help-circle", color: Palette.textDim, go: go(() => router.push("/help")) },
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
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={[styles.searchRow, { flexDirection: dir.row }]}>
        <View style={[styles.search, { flexDirection: dir.row }]}>
          <Ionicons name="sparkles" size={18} color={Palette.neonViolet} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("cmd.placeholder")}
            placeholderTextColor={Palette.placeholder}
            style={[styles.input, { textAlign: dir.textAlign }]}
            returnKeyType="search"
          />
        </View>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.cancel}>{t("cmd.cancel")}</Text>
        </Pressable>
      </View>

      {cont && !query && (
        <PressableScale onPress={() => openBook(cont)} style={[styles.cont, { flexDirection: dir.row }]}>
          <BookCover title={cont.title} width={40} height={54} />
          <Text style={[styles.contTxt, { textAlign: dir.textAlign }]} numberOfLines={1}>
            {t("cmd.continue", { title: cont.title })}
          </Text>
          <Ionicons name="play-circle" size={30} color={Palette.text} />
        </PressableScale>
      )}

      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>{t("cmd.noResults")}</Text>}
        renderItem={({ item }) => {
          if (item.kind === "head") return <Text style={[styles.head, { textAlign: dir.textAlign }]}>{item.label}</Text>;
          if (item.kind === "book")
            return (
              <PressableScale onPress={() => openBook(item.book)} style={[styles.row, { flexDirection: dir.row }]}>
                <BookCover title={item.book.title} width={34} height={46} />
                <Text style={[styles.rowTxt, { textAlign: dir.textAlign }]} numberOfLines={1}>
                  {item.book.title}
                </Text>
              </PressableScale>
            );
          const a = item.action;
          return (
            <PressableScale onPress={a.go} style={[styles.row, { flexDirection: dir.row }]}>
              <View style={[styles.icon, { backgroundColor: a.color + "22" }]}>
                <Ionicons name={a.icon} size={19} color={a.color} />
              </View>
              <Text style={[styles.rowTxt, { textAlign: dir.textAlign }]}>{t(a.labelKey)}</Text>
            </PressableScale>
          );
        }}
      />

      {/* المساعد الصوتي: زر يتنفّس أسفل الشاشة */}
      <View style={styles.voiceWrap}>
        <PressableScale onPress={go(() => router.push("/voice"))} style={styles.voiceBtnWrap}>
          <LinearGradient colors={Gradients.neon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.voiceBtn}>
            <Ionicons name="mic" size={30} color="#fff" accessibilityLabel={t("ask.voice")} />
          </LinearGradient>
        </PressableScale>
        <Text style={styles.voiceHint}>{t("cmd.voice")}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Palette.bg },
  searchRow: { alignItems: "center", gap: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  search: {
    flex: 1,
    alignItems: "center",
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#161826",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.5)",
  },
  input: { flex: 1, color: Palette.text, fontSize: 16 },
  cancel: { color: Palette.neonViolet, fontSize: 14, fontWeight: "600" },
  cont: {
    alignItems: "center",
    gap: 12,
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 4,
    padding: 10,
    borderRadius: 18,
    backgroundColor: "rgba(124,108,255,0.10)",
  },
  contTxt: { flex: 1, color: Palette.text, fontSize: 15, fontWeight: "700" },
  head: { color: Palette.textDim, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 6, paddingHorizontal: 4 },
  row: { alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 14 },
  rowTxt: { flex: 1, color: Palette.text, fontSize: 15, fontWeight: "500" },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  empty: { color: Palette.textDim, textAlign: "center", marginTop: 40 },
  voiceWrap: { alignItems: "center", gap: 10, paddingTop: 8, paddingBottom: 26 },
  voiceBtnWrap: { borderRadius: 37, shadowColor: "#3FD0FF", shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  voiceBtn: { width: 74, height: 74, borderRadius: 37, alignItems: "center", justifyContent: "center", borderWidth: 6, borderColor: "rgba(124,108,255,0.25)" },
  voiceHint: { color: "#8E95AB", fontSize: 12.5 },
});
