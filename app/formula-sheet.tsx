// app/formula-sheet.tsx
// «ورقة المعادلات» لكتب الشهادات المهنية (قرار نهلة ٢٧ أكتوبر): لكل وحدة معادلاتها بمعنى رموزها ومثال محلول
// خطوة بخطوة والخطأ الشائع، وطباعة الورقة PDF للمراجعة قبل الاختبار. تُولَّد مرة لكل وحدة (طلب واحد) وتُحفظ.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { aiAssist } from "../lib/ai";
import { formulasHtml, parseFormulas, type Formula } from "../lib/formulaSheetCore";
import { useDir, useI18n } from "../lib/i18n";
import { shareBranded } from "../lib/pdfBrand";
import { useScene } from "../lib/scene";
import { studyExtra } from "../lib/studyKind";
import { summaryToSpeech } from "../lib/studySummary";
import { getSyllabus } from "../lib/syllabus";
import { getUnitContent, setUnitContent } from "../lib/unitContent";
import { getCachedSummary, summaryRange } from "../lib/unitSummary";
import { unitTextParts } from "../lib/unitScope";

/** نص الوحدة: صفحاتها (المعادلات بصيغتها في الكتاب أدق من الملخّص)، وإلا ملخّصها */
async function unitText(pdfPath: string, unit: number): Promise<string> {
  const src = { kind: "unit" as const, unit };
  const range = await summaryRange(pdfPath, src).catch(() => null);
  let ctx = range ? (await unitTextParts(pdfPath, range.from, range.to).catch(() => [] as string[])).join("\n\n") : "";
  if (ctx.trim().length < 800) {
    const sum = await getCachedSummary(pdfPath, src).catch(() => null);
    if (sum) ctx = summaryToSpeech(sum);
  }
  return ctx.slice(0, 12000);
}

export default function FormulaSheetScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, book_title } = useLocalSearchParams<{ pdf_path?: string; book_title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";

  const [titles, setTitles] = useState<string[] | null>(null);
  const [unit, setUnit] = useState(0);
  const [items, setItems] = useState<Formula[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    getSyllabus(pdfPath)
      .then((r) => setTitles((r?.data.units ?? []).map((u) => u.title)))
      .catch(() => setTitles([]));
  }, [pdfPath]);

  const load = useCallback(
    async (u: number, make: boolean) => {
      setErr("");
      const cached = await getUnitContent<Formula[]>(pdfPath, u, "formulas").catch(() => null);
      if (cached) return setItems(cached);
      if (!make) return setItems(null);
      setBusy(true);
      try {
        const ctx = await unitText(pdfPath, u);
        if (!ctx.trim()) throw new Error("EMPTY");
        const raw = await aiAssist("formulas", ctx, undefined, undefined, undefined, 120000, undefined, undefined, undefined, await studyExtra(pdfPath));
        const f = parseFormulas(raw);
        await setUnitContent(pdfPath, u, "formulas", f);
        setItems(f);
      } catch (e) {
        setErr((e as Error).message === "USER_QUOTA" ? "" : t("formula.err"));
      } finally {
        setBusy(false);
      }
    },
    [pdfPath, t]
  );

  useEffect(() => {
    if (titles?.length) void load(unit, false);
  }, [titles, unit, load]);

  async function print() {
    if (!titles || printing) return;
    setPrinting(true);
    try {
      const units = await Promise.all(titles.map(async (title, i) => ({ title, items: (await getUnitContent<Formula[]>(pdfPath, i, "formulas").catch(() => null)) ?? [] })));
      await shareBranded(formulasHtml(units, { title: `${t("formula.title")} — ${bookTitle}`, symbols: t("formula.symbols"), example: t("formula.example"), tip: t("formula.tip") }), t("formula.title"));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <SceneScreen>
      <SceneBanner
        title={t("formula.title")}
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
          <Pressable onPress={print} hitSlop={8} accessibilityLabel={t("formula.print")}>
            <SceneIconButton>{printing ? <ActivityIndicator color={pal.ink} /> : <Ionicons name="print-outline" size={20} color={pal.ink} />}</SceneIconButton>
          </Pressable>
        }
      />
      {titles === null ? (
        <ActivityIndicator color={pal.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: pal.dim, textAlign: dir.textAlign }]}>{t("formula.intro")}</Text>
          {titles.length > 1 ? (
            <View style={[styles.chips, { flexDirection: dir.row }]}>
              {titles.map((_, i) => (
                <Pressable key={i} onPress={() => setUnit(i)} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: unit === i ? pal.accent : pal.soft }]}>
                  <Text style={[styles.chipTxt, { color: unit === i ? pal.onAccent : pal.ink }]}>{t("qfile.unitN", { n: i + 1 })}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {titles[unit] ? <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{titles[unit]}</Text> : null}

          {busy ? (
            <SceneCard style={{ alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={pal.accent} />
              <Text style={[styles.body, { color: pal.dim }]}>{t("formula.making")}</Text>
            </SceneCard>
          ) : items === null ? (
            <Pressable onPress={() => void load(unit, true)} style={({ pressed }) => [styles.btn, { flexDirection: dir.row, backgroundColor: pal.accent, opacity: pressed ? 0.85 : 1 }]}>
              <Ionicons name="calculator-outline" size={20} color={pal.onAccent} />
              <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("formula.make")}</Text>
            </Pressable>
          ) : !items.length ? (
            <SceneCard>
              <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>{t("formula.none")}</Text>
            </SceneCard>
          ) : (
            items.map((f, i) => (
              <SceneCard key={i} style={{ gap: 10 }}>
                <Text style={[styles.name, { color: pal.ink, textAlign: dir.textAlign }]}>
                  {i + 1}. {f.name}
                </Text>
                <View style={[styles.formula, { backgroundColor: pal.soft, borderColor: pal.accent }]}>
                  <Text style={[styles.formulaTxt, { color: pal.accent }]} selectable>
                    {f.formula}
                  </Text>
                </View>
                {f.symbols.map(([a, b], k) => (
                  <View key={k} style={[styles.symRow, { flexDirection: dir.row }]}>
                    <Text style={[styles.symA, { color: pal.ink }]}>{a}</Text>
                    <Text style={[styles.symB, { color: pal.dim, textAlign: dir.textAlign }]}>{b}</Text>
                  </View>
                ))}
                {f.example || f.steps.length ? (
                  <View style={{ gap: 4 }}>
                    {f.example ? (
                      <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>
                        💡 {t("formula.example")}: {f.example}
                      </Text>
                    ) : null}
                    {f.steps.map((s, k) => (
                      <Text key={k} style={[styles.step, { color: pal.ink, textAlign: dir.textAlign }]}>
                        {s}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {f.tip ? (
                  <View style={styles.tip}>
                    <Text style={[styles.tipTxt, { textAlign: dir.textAlign }]}>⚠️ {f.tip}</Text>
                  </View>
                ) : null}
              </SceneCard>
            ))
          )}
          {err ? <Text style={[styles.body, { color: "#DC2626", textAlign: dir.textAlign }]}>{err}</Text> : null}
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
  h: { fontSize: 16, fontWeight: "900", lineHeight: 24 },
  name: { fontSize: 16, fontWeight: "900", lineHeight: 24 },
  formula: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  formulaTxt: { fontSize: 18, fontWeight: "900", textAlign: "center", writingDirection: "ltr" },
  symRow: { gap: 10, alignItems: "baseline" },
  symA: { fontSize: 14, fontWeight: "800", writingDirection: "ltr" },
  symB: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 21 },
  body: { fontSize: 14.5, fontWeight: "600", lineHeight: 23 },
  step: { fontSize: 14.5, fontWeight: "700", lineHeight: 23, paddingHorizontal: 8 },
  tip: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "#F43F5E", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  tipTxt: { color: "#9A2A12", fontSize: 13.5, fontWeight: "800", lineHeight: 21 },
  btn: { height: 54, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  btnTxt: { fontSize: 16, fontWeight: "900" },
});
