// app/bilingual-reader.tsx
// «القراءة الثنائية» لكتب اللغة (قرار نهلة ٢٧ أكتوبر — قراءة واستماع بلا محادثة): كل جملة من الصفحة بلغتها،
// وتحتها ترجمتها بلغة الواجهة، وزر يُخفي الترجمات كلها أو يظهرها (للتدرّب على الفهم ثم التحقق).
// الضغط على الجملة يُسمعها بصوت أصلي. ترجمة كل صفحة طلب واحد وتُحفظ على الجهاز.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { aiAssist } from "../lib/ai";
import { parseAligned, splitSentences } from "../lib/bilingualCore";
import { getCurrentLang, useDir, useI18n } from "../lib/i18n";
import { extractPdfPageText } from "../lib/pdfText";
import { getLastPage } from "../lib/readerPrefs";
import { useScene } from "../lib/scene";
import { getUnitContent, setUnitContent } from "../lib/unitContent";
import { DEFAULT_VOICE_ID, speakText, stopSpeaking, VOICE_CATALOG } from "../lib/voice";

/** v: إصدار التقسيم — صفحة حُفظت بتقسيم أقدم تُعاد ترجمتها مرة */
type PageData = { src: string[]; tr: string[]; v?: number };
const SPLIT_V = 3;

export default function BilingualReaderScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, book_id, book_title } = useLocalSearchParams<{ pdf_path?: string; book_id?: string; book_title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookId = typeof book_id === "string" ? book_id : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";

  const [page, setPage] = useState(0); // ٠ = لم تُحدَّد بعد
  const [total, setTotal] = useState(0);
  const [data, setData] = useState<PageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showTr, setShowTr] = useState(true);
  const [speaking, setSpeaking] = useState(-1);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);

  useEffect(() => {
    AsyncStorage.getItem("vsf:video:voice").then((v) => v && VOICE_CATALOG.some((x) => x.voiceId === v) && setVoiceId(v)).catch(() => {});
    AsyncStorage.getItem("vsf:bilingual:show").then((v) => v === "0" && setShowTr(false)).catch(() => {});
    (bookId ? getLastPage(bookId) : Promise.resolve(1)).then((p) => setPage(Math.max(1, Number(p) || 1))).catch(() => setPage(1));
    return () => void stopSpeaking();
  }, [bookId]);

  // رقم مفتاح التخزين: الصفحة (ولغة الواجهة ضمن المفتاح نفسه في unitContent)
  const load = useCallback(
    async (p: number) => {
      setErr("");
      setData(null);
      const cached = await getUnitContent<PageData>(pdfPath, p, "bilingual").catch(() => null);
      if (cached?.src?.length && cached.v === SPLIT_V) return setData(cached);
      setBusy(true);
      try {
        const res = await extractPdfPageText(pdfPath, p);
        if (res.totalPages) setTotal(res.totalPages);
        const src = splitSentences(res.text || "");
        if (!src.length) {
          setData({ src: [], tr: [] });
          return;
        }
        const raw = await aiAssist("bilingual", JSON.stringify(src), undefined, getCurrentLang(), undefined, 90000);
        const tr = parseAligned(raw, src.length);
        const d = { src, tr, v: SPLIT_V };
        if (tr.some(Boolean)) await setUnitContent(pdfPath, p, "bilingual", d);
        setData(d);
      } catch (e) {
        setErr((e as Error).message === "USER_QUOTA" ? "" : t("bilingual.err"));
      } finally {
        setBusy(false);
      }
    },
    [pdfPath, t]
  );

  useEffect(() => {
    if (page > 0) void load(page);
    void stopSpeaking();
    setSpeaking(-1);
  }, [page, load]);

  useEffect(() => {
    if (!total && pdfPath)
      extractPdfPageText(pdfPath, 1)
        .then((r) => r.totalPages && setTotal(r.totalPages))
        .catch(() => {});
  }, [pdfPath, total]);

  function toggleTr() {
    setShowTr((v) => {
      AsyncStorage.setItem("vsf:bilingual:show", v ? "0" : "1").catch(() => {});
      return !v;
    });
  }

  function say(i: number, s: string) {
    setSpeaking(i);
    void stopSpeaking().then(() => speakText(s, { voiceId, onDone: () => setSpeaking(-1), onError: () => setSpeaking(-1) }).catch(() => setSpeaking(-1)));
  }

  const go = (d: number) => setPage((p) => Math.min(Math.max(1, p + d), total || p + d));

  return (
    <SceneScreen>
      <SceneBanner
        title={t("bilingual.title")}
        subtitle={bookTitle || undefined}
        height={160}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
        right={
          <Pressable onPress={toggleTr} hitSlop={8} accessibilityLabel={showTr ? t("bilingual.hide") : t("bilingual.show")}>
            <SceneIconButton accent={showTr}>
              <Ionicons name={showTr ? "eye-outline" : "eye-off-outline"} size={20} color={showTr ? pal.onAccent : pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: pal.dim, textAlign: dir.textAlign }]}>{t("bilingual.intro")}</Text>

        <View style={[styles.nav, { flexDirection: dir.row }]}>
          <Pressable onPress={() => go(-1)} disabled={page <= 1} style={[styles.navBtn, { backgroundColor: pal.soft, opacity: page <= 1 ? 0.4 : 1 }]}>
            <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
          </Pressable>
          <Text style={[styles.pageTxt, { color: pal.ink }]}>{total ? t("bilingual.pageOf", { n: page, total }) : t("bilingual.page", { n: page })}</Text>
          <Pressable onPress={() => go(1)} disabled={!!total && page >= total} style={[styles.navBtn, { backgroundColor: pal.soft, opacity: total && page >= total ? 0.4 : 1 }]}>
            <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={20} color={pal.ink} />
          </Pressable>
          <Pressable onPress={toggleTr} style={[styles.trBtn, { borderColor: pal.accent, backgroundColor: showTr ? pal.accent : "transparent" }]}>
            <Text style={[styles.trBtnTxt, { color: showTr ? pal.onAccent : pal.accent }]}>{showTr ? t("bilingual.hide") : t("bilingual.show")}</Text>
          </Pressable>
        </View>

        {busy || (!data && !err) ? (
          <SceneCard style={{ alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={pal.accent} />
            <Text style={[styles.body, { color: pal.dim }]}>{t("bilingual.making")}</Text>
          </SceneCard>
        ) : err ? (
          <SceneCard>
            <Text style={[styles.body, { color: "#DC2626", textAlign: dir.textAlign }]}>{err}</Text>
          </SceneCard>
        ) : data && !data.src.length ? (
          <SceneCard>
            <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>{t("bilingual.empty")}</Text>
          </SceneCard>
        ) : data ? (
          <SceneCard padded={false} style={{ overflow: "hidden" }}>
            {data.src.map((s, i) => (
              <Pressable key={i} onPress={() => say(i, s)} style={[styles.row, { borderTopColor: pal.track, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, backgroundColor: speaking === i ? pal.soft : "transparent" }]}>
                <View style={[styles.srcRow, { flexDirection: "row" }]}>
                  <Text style={[styles.src, { color: pal.ink }]}>{s}</Text>
                  <Ionicons name={speaking === i ? "volume-high" : "volume-medium-outline"} size={16} color={speaking === i ? pal.accent : pal.dim} />
                </View>
                {showTr && data.tr[i] ? <Text style={[styles.tr, { color: pal.accent, textAlign: dir.textAlign }]}>{data.tr[i]}</Text> : null}
              </Pressable>
            ))}
          </SceneCard>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: 12 },
  intro: { fontSize: 14, lineHeight: 23, fontWeight: "600" },
  nav: { alignItems: "center", gap: 10 },
  navBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  pageTxt: { fontSize: 15, fontWeight: "800" },
  trBtn: { marginStart: "auto", borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  trBtnTxt: { fontSize: 13.5, fontWeight: "900" },
  body: { fontSize: 15, fontWeight: "700", lineHeight: 23 },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 6 },
  srcRow: { alignItems: "flex-start", gap: 8 },
  src: { flex: 1, fontSize: 18, lineHeight: 28, fontWeight: "700", writingDirection: "ltr", textAlign: "left" },
  tr: { fontSize: 15.5, lineHeight: 25, fontWeight: "600" },
});
