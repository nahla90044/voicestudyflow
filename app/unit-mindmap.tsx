// app/unit-mindmap.tsx
// الخريطة الذهنية لوحدة كصفحة مستقلة (للاستعداد السريع، قرار نهلة ٢٥ أكتوبر) — نفس عرض مودال المنهج:
// الخريطة الشعاعية (الضغط يفتحها بملء الشاشة مع تكبير)، ثم القائمة المتفرعة، وزر طباعة.
// المصدر: المحفوظة المتفرعة، وإلا من المختصر الجدولي مجانًا، وإلا القديمة المسطّحة، وإلا طلب واحد من نص الوحدة.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MindTree } from "../components/brand/mind-tree";
import { BuzanMindMap, mindmapPrintHtml } from "../components/brand/mindmap";
import { SceneBanner, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { printBranded } from "../lib/pdfBrand";
import { useScene } from "../lib/scene";
import type { MindMap } from "../lib/syllabus";
import { getUnitContent, setUnitContent } from "../lib/unitContent";
import { isFlatMindmap, makeUnitMindmap, mindmapFromTable } from "../lib/unitMindmap";

export default function UnitMindmapScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { pdf_path, unit, title, book_title } = useLocalSearchParams<{ pdf_path?: string; unit?: string; title?: string; book_title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const u = Number(unit ?? 0) || 0;
  const unitTitle = typeof title === "string" ? title : "";
  const bookTitle = typeof book_title === "string" ? book_title : unitTitle;

  const [mm, setMm] = useState<MindMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [full, setFull] = useState(false);
  const [w, setW] = useState(0);
  const theme = { dark: !!pal.dark, bg: pal.card, ink: pal.ink, dim: pal.dim };

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const src = { kind: "unit" as const, unit: u };
        const cached = await getUnitContent<MindMap>(pdfPath, u, "mindmap");
        // المحفوظة المتفرعة تُعرض فورًا بلا طلب
        if (cached && !isFlatMindmap(cached)) {
          if (on) setMm(cached);
          return;
        }
        // من المختصر الجدولي المحفوظ (مجانًا) — وتحلّ محل القديمة المسطّحة
        const fromTable = await mindmapFromTable(pdfPath, src, unitTitle).catch(() => null);
        if (fromTable) {
          setUnitContent(pdfPath, u, "mindmap", fromTable);
          if (on) setMm(fromTable);
          return;
        }
        if (cached) {
          if (on) setMm(cached);
          return;
        }
        // طلب واحد من نص الوحدة كاملًا
        const map = await makeUnitMindmap(pdfPath, src, unitTitle);
        if (!map) {
          if (on) setErr(t("syllabus.err.mindmap"));
          return;
        }
        setUnitContent(pdfPath, u, "mindmap", map);
        if (on) setMm(map);
      } catch (e) {
        if (on) setErr((e as Error).message === "USER_QUOTA" ? t("pay.reason.ai") : t("syllabus.err.mindmap"));
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [pdfPath, u, unitTitle, t]);

  // الطباعة: صفحة أفقية بالخريطة الشعاعية نفسها، ثم «المخطط الكامل» بالنصوص كاملة
  async function onPrint() {
    if (!mm) return;
    const html = mindmapPrintHtml(mm, {
      heading: `${t("syllabus.mindmap.title")} — ${unitTitle || bookTitle}`,
      outlineTitle: t("syllabus.mindmap.outline"),
      dir: dir.isRTL ? "rtl" : "ltr",
    });
    try {
      await printBranded(html);
    } catch {}
  }

  return (
    <SceneScreen>
      <SceneBanner
        title={t("syllabus.mindmap.title")}
        subtitle={unitTitle || bookTitle || undefined}
        height={150}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
        right={
          mm ? (
            <Pressable onPress={onPrint} hitSlop={8} accessibilityRole="button">
              <SceneIconButton>
                <Ionicons name="print-outline" size={20} color={pal.accent} />
              </SceneIconButton>
            </Pressable>
          ) : undefined
        }
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={pal.accent} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("mindmap.loading")}</Text>
        </View>
      ) : err || !mm ? (
        <View style={styles.center}>
          <View style={[styles.errIcon, { backgroundColor: pal.soft }]}>
            <Ionicons name="alert-circle-outline" size={34} color={pal.accent} />
          </View>
          <Text style={[styles.dim, { color: pal.dim }]}>{err || t("syllabus.err.mindmap")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* خريطة شعاعية بألوان المشهد؛ الضغط يفتحها بملء الشاشة مع تكبير بالأصابع (لا تكبير متداخل هنا) */}
          <Pressable
            onPress={() => setFull(true)}
            onLayout={(e) => setW(e.nativeEvent.layout.width)}
            style={[styles.canvasWrap, styles.canvas, { borderColor: pal.cardBorder, backgroundColor: pal.card }]}
          >
            {w > 0 ? <BuzanMindMap map={mm} size={w - 16} theme={theme} /> : null}
            <View style={[styles.zoomChip, { backgroundColor: pal.accent }]}>
              <Ionicons name="expand" size={14} color={pal.onAccent} />
              <Text style={[styles.zoomTxt, { color: pal.onAccent }]}>{t("syllabus.mindmap.enlarge")}</Text>
            </View>
          </Pressable>
          <Text style={[styles.hint, { color: pal.dim }]}>{t("syllabus.mindmap.hintList")}</Text>

          {/* العقدة المركزية ثم الفروع بتفرّعاتها */}
          <View style={[styles.center2, { backgroundColor: pal.accent }]}>
            <Text style={[styles.centerTxt, { color: pal.onAccent }]}>{mm.center}</Text>
          </View>
          <View style={[styles.stem, { backgroundColor: pal.track }]} />
          <MindTree map={mm} />
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* الخريطة بملء الشاشة: تكبير وتحريك بالأصابع (ScrollView واحد غير متداخل) */}
      <Modal visible={full && !!mm} animationType="fade" onRequestClose={() => setFull(false)} supportedOrientations={["portrait", "landscape"]}>
        <View style={[styles.full, { backgroundColor: pal.bg }]}>
          {mm ? (
            <ScrollView
              maximumZoomScale={3}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <BuzanMindMap map={mm} size={Math.max(winW, winH) * 1.05} theme={theme} />
            </ScrollView>
          ) : null}
          <Pressable
            onPress={() => setFull(false)}
            hitSlop={8}
            accessibilityLabel={t("common.close")}
            style={[styles.fullClose, { top: insets.top + 8, [dir.isRTL ? "left" : "right"]: 16, backgroundColor: pal.soft }]}
          >
            <Ionicons name="close" size={24} color={pal.ink} />
          </Pressable>
        </View>
      </Modal>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 12 },
  dim: { fontSize: 14, textAlign: "center", lineHeight: 22, fontWeight: "600" },
  errIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl },
  canvasWrap: { borderRadius: Radius.lg, borderWidth: 1, overflow: "hidden" },
  canvas: { alignItems: "center", justifyContent: "center", padding: 8 },
  zoomChip: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  zoomTxt: { fontSize: 12, fontWeight: "800" },
  hint: { fontSize: 11.5, textAlign: "center", marginTop: 8, marginBottom: 12 },
  center2: { alignSelf: "center", paddingVertical: 14, paddingHorizontal: 22, borderRadius: Radius.lg, maxWidth: "90%" },
  centerTxt: { fontSize: 16, fontWeight: "900", textAlign: "center" },
  stem: { alignSelf: "center", width: 2, height: 18 },
  full: { flex: 1 },
  fullClose: { position: "absolute", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
