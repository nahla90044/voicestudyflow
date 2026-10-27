// app/writing-check.tsx
// «تصحيح الكتابة» لكتب اللغة (قرار نهلة ٢٧ أكتوبر — بلا محادثة): يكتب الطالب فقرة بلغة الكتاب،
// فتعود مصحّحة مع كل خطأ (ما كُتب ← الصواب) وسبب القاعدة بلغة الواجهة، ونصيحة وتشجيع. طلب واحد لكل تصحيح.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { aiAssist } from "../lib/ai";
import { getCurrentLang, useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { parseWriteCheck, type WriteCheck } from "../lib/writeCheckCore";

const TYPE_ICON: Record<string, string> = { grammar: "🧩", conj: "🔁", spelling: "✏️", vocab: "📖", style: "✨" };

export default function WritingCheckScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, book_title } = useLocalSearchParams<{ pdf_path?: string; book_title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";
  const draftKey = `vsf:writecheck:draft:${pdfPath}`;

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<WriteCheck | null>(null);
  const [err, setErr] = useState("");

  // المسودة تبقى إن خرج الطالب قبل التصحيح
  useEffect(() => {
    AsyncStorage.getItem(draftKey).then((v) => v && setText(v)).catch(() => {});
  }, [draftKey]);
  useEffect(() => {
    const id = setTimeout(() => AsyncStorage.setItem(draftKey, text).catch(() => {}), 500);
    return () => clearTimeout(id);
  }, [text, draftKey]);

  async function check() {
    const s = text.trim();
    if (s.length < 8 || busy) return;
    setBusy(true);
    setErr("");
    setRes(null);
    try {
      const raw = await aiAssist("writecheck", s.slice(0, 4000), undefined, getCurrentLang(), undefined, 90000);
      const r = parseWriteCheck(raw);
      if (!r) throw new Error("EMPTY");
      setRes(r);
    } catch (e) {
      setErr((e as Error).message === "USER_QUOTA" ? "" : t("writecheck.err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SceneScreen>
      <SceneBanner
        title={t("writecheck.title")}
        subtitle={bookTitle || undefined}
        height={160}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: pal.dim, textAlign: dir.textAlign }]}>{t("writecheck.intro")}</Text>
          <SceneCard style={{ gap: 10 }}>
            <TextInput
              value={text}
              onChangeText={(v) => {
                setText(v);
                if (res) setRes(null);
              }}
              placeholder={t("writecheck.ph")}
              placeholderTextColor={pal.dim}
              multiline
              autoCorrect={false}
              spellCheck={false}
              style={[styles.input, { color: pal.ink, borderColor: pal.cardBorder, backgroundColor: pal.soft }]}
              maxLength={4000}
            />
            <Pressable
              onPress={check}
              disabled={busy || text.trim().length < 8}
              style={({ pressed }) => [styles.btn, { flexDirection: dir.row, backgroundColor: pal.accent, opacity: busy || text.trim().length < 8 ? 0.5 : pressed ? 0.85 : 1 }]}
            >
              {busy ? <ActivityIndicator color={pal.onAccent} /> : <Ionicons name="checkmark-done" size={20} color={pal.onAccent} />}
              <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{busy ? t("writecheck.checking") : t("writecheck.check")}</Text>
            </Pressable>
          </SceneCard>

          {err ? <Text style={[styles.body, { color: "#DC2626", textAlign: dir.textAlign }]}>{err}</Text> : null}

          {res ? (
            <>
              {res.good ? (
                <SceneCard>
                  <Text style={[styles.body, { color: "#15803D", textAlign: dir.textAlign }]}>👏 {res.good}</Text>
                </SceneCard>
              ) : null}
              <SceneCard style={{ gap: 8 }}>
                <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("writecheck.corrected")}</Text>
                <Text style={[styles.corrected, { color: pal.ink }]} selectable>
                  {res.corrected}
                </Text>
              </SceneCard>
              <SceneCard style={{ gap: 12 }}>
                <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>
                  {res.errors.length ? t("writecheck.errors", { n: res.errors.length }) : t("writecheck.noErrors")}
                </Text>
                {res.errors.map((e, i) => (
                  <View key={i} style={[styles.err, { borderColor: pal.cardBorder }]}>
                    <View style={[styles.errRow, { flexDirection: "row" }]}>
                      <Text style={styles.wrong}>{e.wrong}</Text>
                      <Text style={[styles.arrow, { color: pal.dim }]}>→</Text>
                      <Text style={styles.right}>{e.right}</Text>
                    </View>
                    <Text style={[styles.why, { color: pal.ink, textAlign: dir.textAlign }]}>
                      {TYPE_ICON[e.type] ?? "🧩"} {e.why}
                    </Text>
                  </View>
                ))}
                {res.tip ? <Text style={[styles.tip, { color: pal.accent, textAlign: dir.textAlign }]}>💡 {res.tip}</Text> : null}
              </SceneCard>
            </>
          ) : null}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: 12 },
  intro: { fontSize: 14, lineHeight: 23, fontWeight: "600" },
  input: { minHeight: 150, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 17, lineHeight: 26, textAlignVertical: "top", writingDirection: "ltr", textAlign: "left" },
  btn: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  btnTxt: { fontSize: 15.5, fontWeight: "900" },
  body: { fontSize: 15, fontWeight: "700", lineHeight: 23 },
  h: { fontSize: 16, fontWeight: "900" },
  corrected: { fontSize: 17, lineHeight: 27, fontWeight: "600", writingDirection: "ltr", textAlign: "left" },
  err: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 6 },
  errRow: { flexWrap: "wrap", alignItems: "center", gap: 8 },
  wrong: { fontSize: 16, fontWeight: "800", color: "#DC2626", textDecorationLine: "line-through", writingDirection: "ltr" },
  arrow: { fontSize: 16, fontWeight: "900" },
  right: { fontSize: 16, fontWeight: "900", color: "#15803D", writingDirection: "ltr" },
  why: { fontSize: 14.5, lineHeight: 22, fontWeight: "600" },
  tip: { fontSize: 14.5, lineHeight: 22, fontWeight: "800" },
});
