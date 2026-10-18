// app/saved/[id].tsx
// عنصر من «محفوظات الكتاب»: عرض تقديمي (شريحة شريحة) أو إجابة المساعد الذكي،
// مع ملف PDF للمشاركة/الحفظ وحذف العنصر.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SlideView } from "../../components/brand/slide-view";
import { SummaryView } from "../../components/brand/summary-view";
import { summaryHtml } from "../../lib/studySummary";
import { playSummary, stopSummary, summaryChunks } from "../../lib/summaryAudio";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { cardsHtml, getSave, removeSave, sharePdf, slidesHtml, textHtml, type StudySave } from "../../lib/studySaves";

export default function SavedItemScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const insets = useSafeAreaInsets();
  const { id, book_title } = useLocalSearchParams<{ id?: string; book_title?: string }>();
  const [item, setItem] = useState<StudySave | null | undefined>(undefined);
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopSummary(), []);
  function toggleListen() {
    const sm = item?.content.summary;
    if (!sm) return;
    if (playing) {
      stopSummary();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    // الصوت محفوظ على الجهاز منذ «حفظ» الملخّص → يبدأ فورًا بلا إنترنت
    playSummary(summaryChunks(sm), 0, { onDone: () => setPlaying(false) });
  }
  const bookTitle = typeof book_title === "string" ? book_title : "";

  useEffect(() => {
    if (typeof id !== "string") return;
    getSave(id).then(setItem).catch(() => setItem(null));
  }, [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/library"));
  const slides = item?.content.slides ?? [];
  const cur = slides[Math.min(slide, Math.max(0, slides.length - 1))];

  async function onPdf() {
    if (!item || busy) return;
    setBusy(true);
    try {
      const html =
        item.kind === "slides"
          ? slidesHtml({ bookTitle, title: item.title, slides, rtl: dir.isRTL })
          : item.content.cards?.length
          ? cardsHtml({ bookTitle, title: item.title, cards: item.content.cards, rtl: dir.isRTL })
          : item.content.summary
          ? summaryHtml({ bookTitle, title: item.title, summary: item.content.summary, rtl: dir.isRTL })
          : textHtml({ bookTitle, title: item.title, text: item.content.text ?? "", question: item.content.question, rtl: dir.isRTL });
      await sharePdf(html, item.title);
    } catch {
      Alert.alert(t("save.pdfFailedTitle"), t("save.pdfFailedBody"));
    } finally {
      setBusy(false);
    }
  }

  function onDelete() {
    if (!item) return;
    Alert.alert(t("saves.delete"), t("saves.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("saves.delete"),
        style: "destructive",
        onPress: async () => {
          await removeSave(item.id).catch(() => {});
          back();
        },
      },
    ]);
  }

  return (
    <SceneScreen>
      <SceneBanner
        title={item?.title ?? t("saves.title")}
        subtitle={item ? `${t(`saves.kind.${item.kind}`)}${bookTitle ? ` · ${bookTitle}` : ""}` : undefined}
        height={150}
        left={
          <Pressable onPress={back} hitSlop={8} accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
        right={
          item ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={onPdf} hitSlop={8} accessibilityLabel={t("save.pdf")}>
                <SceneIconButton>
                  {busy ? <ActivityIndicator size="small" color={pal.ink} /> : <Ionicons name="document-text-outline" size={19} color={pal.ink} />}
                </SceneIconButton>
              </Pressable>
              <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={t("saves.delete")}>
                <SceneIconButton>
                  <Ionicons name="trash-outline" size={19} color={pal.dark ? "#FF8A8A" : "#C62F3B"} />
                </SceneIconButton>
              </Pressable>
            </View>
          ) : null
        }
      />

      {item === undefined ? (
        <ActivityIndicator color={pal.accent} style={{ marginTop: 40 }} />
      ) : item === null ? (
        <Text style={[styles.empty, { color: pal.dim }]}>{t("save.failedBody")}</Text>
      ) : item.kind === "slides" ? (
        <View style={[styles.body, { paddingBottom: insets.bottom + 16 }]}>
          {cur ? (
            <View style={styles.stage}>
              <SlideView slide={cur} index={Math.min(slide, slides.length - 1)} total={slides.length} maxBulletsHeight={420} />
            </View>
          ) : null}
          <View style={[styles.nav, { flexDirection: dir.row }]}>
            <Pressable
              onPress={() => setSlide((s) => Math.max(0, s - 1))}
              disabled={slide === 0}
              style={[styles.navBtn, { backgroundColor: pal.soft, opacity: slide === 0 ? 0.4 : 1 }]}
            >
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </Pressable>
            <Pressable
              onPress={() => setSlide((s) => Math.min(slides.length - 1, s + 1))}
              disabled={slide >= slides.length - 1}
              style={[styles.navBtn, { backgroundColor: pal.accent, opacity: slide >= slides.length - 1 ? 0.4 : 1 }]}
            >
              <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={22} color={pal.onAccent} />
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {item.content.question ? (
            <SceneCard style={{ backgroundColor: pal.soft }}>
              <Text style={[styles.q, { color: pal.ink, textAlign: dir.textAlign }]}>{item.content.question}</Text>
            </SceneCard>
          ) : null}
          {item.content.summary ? (
            <>
              <Pressable
                onPress={toggleListen}
                style={({ pressed }) => [styles.listen, { backgroundColor: pal.accent, opacity: pressed ? 0.85 : 1, flexDirection: dir.row }]}
              >
                <Ionicons name={playing ? "pause" : "play"} size={20} color={pal.onAccent} />
                <Text style={[styles.listenTxt, { color: pal.onAccent }]}>{playing ? t("summary.stop") : t("summary.listen")}</Text>
              </Pressable>
              <SummaryView summary={item.content.summary} bookTitle={bookTitle} />
            </>
          ) : (
            <SceneCard>
              <Text selectable style={[styles.text, { color: pal.ink, textAlign: dir.textAlign }]}>
                {item.content.text}
              </Text>
            </SceneCard>
          )}
        </ScrollView>
      )}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 12, flexGrow: 1 },
  empty: { textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
  stage: { flex: 1, justifyContent: "center" },
  listen: { height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", gap: 8 },
  listenTxt: { fontSize: 16, fontWeight: "900" },
  nav: { justifyContent: "space-between", gap: 12 },
  navBtn: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  q: { fontSize: 15, fontWeight: "800", lineHeight: 24 },
  text: { fontSize: 16, lineHeight: 30 },
});
