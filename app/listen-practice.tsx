// app/listen-practice.tsx
// «تمارين الاستماع» لكتب اللغة (قرار نهلة ٢٧ أكتوبر — قراءة واستماع وتمارين بلا محادثة):
// جملة من الدرس تُسمع بصوت أصلي (مع خيار أبطأ)، وكلمة منها مخفية يختارها الطالب من أربعة خيارات.
// الجمل والخيارات من نص الدرس نفسه (lib/listenCore) — بلا طلبات ذكاء؛ الصوت من حصة الاستماع ويُحفظ على الجهاز.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { makeListenItems, type ListenItem } from "../lib/listenCore";
import { useScene } from "../lib/scene";
import { supabase } from "../lib/supabase";
import { getSyllabus } from "../lib/syllabus";
import { DEFAULT_VOICE_ID, speakText, stopSpeaking, VOICE_CATALOG } from "../lib/voice";

const COUNT = 10;

export default function ListenPracticeScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, book_title } = useLocalSearchParams<{ pdf_path?: string; book_title?: string }>();
  const bookPdf = typeof pdf_path === "string" ? pdf_path : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";

  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  useEffect(() => {
    AsyncStorage.getItem("vsf:video:voice").then((v) => v && VOICE_CATALOG.some((x) => x.voiceId === v) && setVoiceId(v)).catch(() => {});
    return () => void stopSpeaking();
  }, []);

  // نص الكتاب من صفحاته المحفوظة، ووحداته (لاختيار وحدة)
  const [pages, setPages] = useState<{ page: number; text: string }[] | null>(null);
  const [units, setUnits] = useState<{ title: string; from?: number; to?: number }[]>([]);
  const [unit, setUnit] = useState(-1); // -1 = كل الكتاب
  useEffect(() => {
    (async () => {
      const syl = await getSyllabus(bookPdf).catch(() => null);
      const rg = syl?.data.ranges ?? [];
      setUnits((syl?.data.units ?? []).map((u, i) => ({ title: u.title, from: rg[i]?.from, to: rg[i]?.to })));
      const { data } = await supabase.from("page_cache").select("page,text").eq("pdf_path", bookPdf).neq("source", "empty").order("page").limit(1000);
      setPages((data ?? []).map((r: any) => ({ page: Number(r.page), text: String(r.text ?? "") })));
    })().catch(() => setPages([]));
  }, [bookPdf]);

  const [round, setRound] = useState(0);
  const items = useMemo<ListenItem[]>(() => {
    if (!pages) return [];
    const u = unit >= 0 ? units[unit] : undefined;
    const sel = u?.from ? pages.filter((p) => p.page >= u.from! && p.page <= (u.to ?? u.from!)) : pages;
    return makeListenItems(sel.map((p) => p.text).join("\n"), COUNT);
    // round: «تمرين جديد» يخلط من جديد
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, unit, units, round]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [slow, setSlow] = useState(false);
  const item = items[idx];
  const done = items.length > 0 && idx >= items.length;

  const play = (text: string) => {
    void stopSpeaking().then(() => speakText(text, { voiceId, rate: slow ? 0.75 : 1 }).catch(() => {}));
  };
  // كل جملة جديدة تُسمع تلقائيًا
  useEffect(() => {
    if (item) play(item.sentence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.sentence]);

  const restart = (u = unit) => {
    void stopSpeaking();
    setUnit(u);
    setIdx(0);
    setPicked(null);
    setScore(0);
    setRound((r) => r + 1);
  };

  const choose = (i: number) => {
    if (picked !== null || !item) return;
    setPicked(i);
    if (i === item.answerIndex) setScore((s) => s + 1);
  };

  return (
    <SceneScreen>
      <SceneBanner
        title={t("listen.title")}
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
      {pages === null ? (
        <ActivityIndicator color={pal.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: pal.dim, textAlign: dir.textAlign }]}>{t("listen.intro")}</Text>

          {units.length ? (
            <View style={[styles.chips, { flexDirection: dir.row }]}>
              {[-1, ...units.map((_, i) => i)].map((u) => {
                const on = u === unit;
                return (
                  <Pressable key={u} onPress={() => restart(u)} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: on ? pal.accent : pal.soft }]}>
                    <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]} numberOfLines={1}>
                      {u < 0 ? t("listen.allBook") : t("qfile.unitN", { n: u + 1 })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!items.length ? (
            <SceneCard>
              <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>{t("listen.empty")}</Text>
            </SceneCard>
          ) : done ? (
            <SceneCard style={{ gap: 14, alignItems: "center" }}>
              <Text style={styles.big}>{score >= items.length * 0.8 ? "🎉" : score >= items.length / 2 ? "👏" : "💪"}</Text>
              <Text style={[styles.h, { color: pal.ink }]}>{t("listen.score", { n: score, total: items.length })}</Text>
              <Pressable onPress={() => restart()} style={[styles.btn, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
                <Ionicons name="refresh" size={18} color={pal.onAccent} />
                <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("listen.again")}</Text>
              </Pressable>
            </SceneCard>
          ) : item ? (
            <SceneCard style={{ gap: 16 }}>
              <Text style={[styles.count, { color: pal.dim, textAlign: dir.textAlign }]}>{t("listen.progress", { n: idx + 1, total: items.length })}</Text>
              <View style={[styles.row, { flexDirection: dir.row }]}>
                <Pressable onPress={() => play(item.sentence)} style={[styles.play, { backgroundColor: pal.accent }]} accessibilityLabel={t("reader.dict.listen")}>
                  <Ionicons name="volume-high" size={26} color={pal.onAccent} />
                </Pressable>
                <Pressable onPress={() => setSlow((v) => !v)} style={[styles.slow, { borderColor: slow ? pal.accent : pal.cardBorder, backgroundColor: slow ? pal.soft : "transparent" }]}>
                  <Text style={[styles.slowTxt, { color: slow ? pal.accent : pal.dim }]}>🐢 {t("listen.slow")}</Text>
                </Pressable>
              </View>
              <Text style={[styles.sentence, { color: pal.ink }]}>{picked === null ? item.masked : item.sentence}</Text>
              <View style={styles.opts}>
                {item.options.map((o, i) => {
                  const right = picked !== null && i === item.answerIndex;
                  const wrong = picked === i && i !== item.answerIndex;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => choose(i)}
                      style={[
                        styles.opt,
                        { borderColor: right ? "#15803D" : wrong ? "#DC2626" : pal.cardBorder, backgroundColor: right ? "#DCFCE7" : wrong ? "#FEE2E2" : pal.soft },
                      ]}
                    >
                      <Text style={[styles.optTxt, { color: right || wrong ? "#111827" : pal.ink }]}>{o}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {picked !== null ? (
                <View style={{ gap: 10 }}>
                  <Text style={[styles.body, { color: picked === item.answerIndex ? "#15803D" : "#DC2626", textAlign: dir.textAlign }]}>
                    {picked === item.answerIndex ? t("listen.right") : t("listen.wrong", { w: item.answer })}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setPicked(null);
                      setIdx((n) => n + 1);
                    }}
                    style={[styles.btn, { backgroundColor: pal.accent, flexDirection: dir.row }]}
                  >
                    <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{idx + 1 < items.length ? t("listen.next") : t("listen.finish")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </SceneCard>
          ) : null}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: 12 },
  intro: { fontSize: 14, lineHeight: 23, fontWeight: "600" },
  chips: { flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  chipTxt: { fontSize: 13.5, fontWeight: "800" },
  count: { fontSize: 13, fontWeight: "700" },
  row: { alignItems: "center", gap: 12 },
  play: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  slow: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  slowTxt: { fontSize: 14, fontWeight: "800" },
  sentence: { fontSize: 22, lineHeight: 34, fontWeight: "700", textAlign: "center", writingDirection: "ltr" },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  opt: { minWidth: "45%", borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center" },
  optTxt: { fontSize: 18, fontWeight: "800", writingDirection: "ltr" },
  body: { fontSize: 15, fontWeight: "700", lineHeight: 23 },
  h: { fontSize: 20, fontWeight: "900" },
  big: { fontSize: 44 },
  btn: { height: 50, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "stretch" },
  btnTxt: { fontSize: 15.5, fontWeight: "900" },
});
