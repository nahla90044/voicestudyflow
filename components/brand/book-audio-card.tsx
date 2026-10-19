// components/brand/book-audio-card.tsx
// «الصوت المحفوظ» في صفحة الكتاب: المكان الواضح لحفظ صوت الكتاب كله ومتابعته —
// التقدّم (١٢٠ من ٣٨٠ صفحة)، والحالة، وزر بدء/إيقاف/إكمال. يعمل مع lib/bookAudio
// (مستقل عن القارئ، ويكمل من حيث وقف).
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { getBookAudio, pauseBookAudio, startBookAudio, watchBookAudio, type BookAudio } from "../../lib/bookAudio";
import { useDir, useI18n } from "../../lib/i18n";
import { getPlan, getUsage, planLimits, requestPaywall } from "../../lib/plan";
import { useScene } from "../../lib/scene";
import { DEFAULT_VOICE_ID, VOICE_CATALOG } from "../../lib/voice";
import { SceneCard } from "./scene-screen";

/** صوت الكتاب الافتراضي من لغة عنوانه (نفس اختيار القارئ أول مرة) */
function voiceForTitle(title: string): string {
  const ar = (title.match(/[؀-ۿ]/g) || []).length;
  const la = (title.match(/[A-Za-z]/g) || []).length;
  const lang = la > ar * 3 ? "en" : "ar";
  return VOICE_CATALOG.find((v) => (v.lang ?? "ar") === lang)?.voiceId ?? DEFAULT_VOICE_ID;
}

export function BookAudioCard({ pdfPath, bookTitle, total }: { pdfPath: string; bookTitle: string; total: number }) {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [s, setS] = useState<BookAudio | null>(null);
  useEffect(() => watchBookAudio(pdfPath, setS), [pdfPath]);

  const all = Math.max(total, s?.total ?? 0);
  const saved = s?.saved.length ?? 0;
  const frac = all ? Math.min(1, saved / all) : 0;
  const running = s?.status === "running";

  async function start() {
    if (!all) return;
    const cur = await getBookAudio(pdfPath);
    const left = Math.max(0, all - (cur?.saved.length ?? 0));
    const plan = await getPlan();
    let note = "";
    if (plan !== "owner") {
      const u = await getUsage();
      const lim = await planLimits(plan);
      const pagesLeft = Math.max(0, (lim?.pages ?? 0) - u.pages);
      // لا صفحات متبقية: زر الحفظ لن يحفظ شيئًا، فنعرض الترقية بدله
      if (pagesLeft === 0) {
        Alert.alert(t("reader.audioSave.title"), t("bookAudio.noPages"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("sub.upgrade"), onPress: () => void requestPaywall("voice", true) },
        ]);
        return;
      }
      note = "\n\n" + t("bookAudio.quotaNote", { left: pagesLeft });
    }
    Alert.alert(t("reader.audioSave.title"), t("bookAudio.confirm", { left, total: all, saved: cur?.saved.length ?? 0 }) + note, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: cur?.saved.length ? t("bookAudio.resume") : t("reader.audioSave.yes"),
        onPress: () => void startBookAudio({ pdfPath, bookTitle, voiceId: cur?.voiceId ?? voiceForTitle(bookTitle), precise: cur?.precise ?? false, total: all }),
      },
    ]);
  }

  const status =
    s?.status === "running"
      ? t("bookAudio.status.running")
      : s?.status === "done"
        ? t("bookAudio.status.done")
        : s?.status === "quota"
          ? t("bookAudio.status.quota")
          : s?.status === "paused"
            ? t("bookAudio.status.paused")
            : t("bookAudio.status.none");

  return (
    <SceneCard style={{ gap: 10 }}>
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <View style={[styles.icon, { backgroundColor: pal.soft }]}>
          {running ? <ActivityIndicator size="small" color={pal.accent} /> : <Ionicons name={s?.status === "done" ? "checkmark-circle" : "headset-outline"} size={19} color={s?.status === "done" ? "#15803D" : pal.accent} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]}>{t("bookAudio.title")}</Text>
          <Text style={[styles.sub, { color: pal.dim, textAlign: dir.textAlign }]}>{status}</Text>
        </View>
      </View>
      {all ? (
        <>
          <View style={[styles.track, { backgroundColor: pal.track }]}>
            <View style={[styles.fill, { width: `${Math.max(frac * 100, saved ? 2 : 0)}%`, backgroundColor: s?.status === "done" ? "#15803D" : pal.accent, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]} />
          </View>
          <Text style={[styles.count, { color: pal.ink, textAlign: dir.textAlign }]}>{t("bookAudio.progress", { done: saved, total: all })}</Text>
        </>
      ) : null}
      {s?.status !== "done" ? (
        <Pressable
          onPress={() => (running ? pauseBookAudio(pdfPath) : void start())}
          style={({ pressed }) => [styles.btn, { flexDirection: dir.row, backgroundColor: running ? pal.soft : pal.accent, borderColor: pal.cardBorder, opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name={running ? "pause" : "download-outline"} size={18} color={running ? pal.ink : pal.onAccent} />
          <Text style={[styles.btnTxt, { color: running ? pal.ink : pal.onAccent }]}>
            {running ? t("bookAudio.pause") : saved ? t("bookAudio.resume") : t("reader.audioSave.yes")}
          </Text>
        </Pressable>
      ) : null}
      {running ? <Text style={[styles.hint, { color: pal.dim, textAlign: dir.textAlign }]}>{t("bookAudio.hint")}</Text> : null}
    </SceneCard>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15.5, fontWeight: "900" },
  sub: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  track: { height: 9, borderRadius: 5, overflow: "hidden" },
  fill: { height: 9, borderRadius: 5 },
  count: { fontSize: 14, fontWeight: "900" },
  btn: { height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth },
  btnTxt: { fontSize: 15, fontWeight: "900" },
  hint: { fontSize: 12.5, fontWeight: "600", lineHeight: 20 },
});
