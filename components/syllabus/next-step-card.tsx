// components/syllabus/next-step-card.tsx
// «الخطوة التالية» (قرار نهلة ٢٧ أكتوبر — «الطالب يضيع ما يدري وين…»): بطاقة واحدة أعلى المنهج بخطوة واضحة
// ووقتها وزر يفتحها. تُبنى مما يعرفه التطبيق محليًا (التقدّم، الملخّصات المحفوظة، الاختبارات، الأخطاء المستحقة،
// موعد الاختبار) — بلا أي طلب ذكاء. المنطق في lib/nextStepCore.
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Radius } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { nextStep, type NextStep } from "../../lib/nextStepCore";
import { hasActivePrep } from "../../lib/quickPrep";
import { getBookReadiness } from "../../lib/readiness";
import { useScene } from "../../lib/scene";
import { getStudyKind } from "../../lib/studyKind";
import type { UnitProgress } from "../../lib/studyTrack";
import { getCachedSummary } from "../../lib/unitSummary";

type Props = {
  bookId: string;
  pdfPath: string;
  bookTitle: string;
  units: { title: string }[];
  done: boolean[];
  prog: UnitProgress[];
  ranges: ({ from: number; to: number } | undefined)[];
};

export function NextStepCard({ bookId, pdfPath, bookTitle, units, done, prog, ranges }: Props) {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [step, setStep] = useState<NextStep | null>(null);
  const [cert, setCert] = useState(false);

  // يُحسب عند كل رجوع للشاشة (بعد ملخّص أو اختبار تتغير الخطوة)
  useFocusEffect(
    useCallback(() => {
      let on = true;
      (async () => {
        const [ready, prepOn, kind, sums] = await Promise.all([
          getBookReadiness(pdfPath).catch(() => null),
          bookId ? hasActivePrep(bookId).catch(() => false) : Promise.resolve(false),
          getStudyKind(pdfPath).catch(() => "general" as const),
          Promise.all(
            units.map((_, i) =>
              getCachedSummary(pdfPath, { kind: "unit", unit: i })
                .then(async (s) => !!s || !!(await getCachedSummary(pdfPath, { kind: "unit", unit: i, level: "brief" }).catch(() => null)))
                .catch(() => false)
            )
          ),
        ]);
        if (!on) return;
        setCert(kind === "cert");
        setStep(
          nextStep({
            units: units.map((_, i) => {
              const p = prog[i];
              const r = ranges[i];
              return {
                done: !!done[i],
                read: p && p.pages.total ? p.pages.done / p.pages.total : 0,
                summary: !!sums[i],
                accuracy: ready?.accuracy?.[i] ?? null,
                pages: r ? r.to - r.from + 1 : 10,
              };
            }),
            dueMistakes: ready?.dueMistakes ?? 0,
            daysLeft: ready?.daysLeft ?? null,
            prepActive: prepOn,
          })
        );
      })().catch(() => {});
      return () => {
        on = false;
      };
    }, [bookId, pdfPath, units, done, prog, ranges])
  );

  if (!step || step.kind === "none") return null;

  const unitName = (i: number) => units[i]?.title ?? t("qfile.unitN", { n: i + 1 });
  const params = (i: number) => ({ pdf_path: pdfPath, unit: String(i), title: unitName(i), book_title: bookTitle });
  let icon: keyof typeof Ionicons.glyphMap = "arrow-forward-circle";
  let text = "";
  let cta = t("next.start");
  let go = () => {};
  switch (step.kind) {
    case "summary":
      icon = "document-text";
      text = t("next.summary", { u: unitName(step.unit) });
      go = () => router.push({ pathname: "/unit-summary", params: params(step.unit) });
      break;
    case "quiz":
      icon = "school";
      text = t("next.quiz", { u: unitName(step.unit) });
      go = () => router.push({ pathname: "/unit-quiz", params: params(step.unit) });
      break;
    case "review":
      icon = "refresh-circle";
      text = t("next.review", { u: unitName(step.unit), pct: Math.round(step.accuracy * 100) });
      go = () => router.push({ pathname: "/unit-summary", params: params(step.unit) });
      break;
    case "mistakes":
      icon = "repeat";
      text = t("next.mistakes", { n: step.n });
      go = () => router.push({ pathname: "/unit-quiz", params: { pdf_path: pdfPath, mode: "mistakes", book_title: bookTitle } });
      break;
    case "prep":
      icon = "alarm";
      text = step.days === 0 ? t("next.prepToday") : t("next.prep", { n: step.days });
      cta = t("next.prepCta");
      go = () => router.push({ pathname: "/quick-prep", params: { book_id: bookId, pdf_path: pdfPath, book_title: bookTitle } });
      break;
    case "final":
      icon = "trophy";
      text = cert ? t("next.finalCert") : t("next.final");
      go = () =>
        cert
          ? router.push({ pathname: "/mock-exam", params: { pdf_path: pdfPath, book_id: bookId, book_title: bookTitle } })
          : router.push({ pathname: "/unit-quiz", params: { pdf_path: pdfPath, mode: "mix", units: units.map((_, i) => i).join(","), count: "20", book_title: bookTitle, title: bookTitle } });
      break;
  }

  return (
    <View style={[styles.card, { backgroundColor: pal.card, borderColor: pal.accent }]}>
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <Text style={[styles.label, { color: pal.accent }]}>{t("next.label")}</Text>
        <Text style={[styles.min, { color: pal.dim }]}>⏱ {t("next.minutes", { n: step.minutes })}</Text>
      </View>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        <View style={[styles.icon, { backgroundColor: pal.soft }]}>
          <Ionicons name={icon} size={24} color={pal.accent} />
        </View>
        <Text style={[styles.text, { color: pal.ink, textAlign: dir.textAlign }]}>{text}</Text>
      </View>
      <Pressable onPress={go} style={({ pressed }) => [styles.btn, { backgroundColor: pal.accent, flexDirection: dir.row, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{cta}</Text>
        <Ionicons name={dir.isRTL ? "arrow-back" : "arrow-forward"} size={18} color={pal.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 22, padding: 16, gap: 12 },
  head: { alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 13.5, fontWeight: "900" },
  min: { fontSize: 13, fontWeight: "700" },
  row: { alignItems: "center", gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, fontSize: 16, fontWeight: "800", lineHeight: 25 },
  btn: { height: 48, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  btnTxt: { fontSize: 15.5, fontWeight: "900" },
});
