// app/syllabus/[id].tsx
// المنهج الدراسي (Syllabus) لكتاب: وحدات بعناوين ومواضيع ومخرجات،
// تشيك ليست لمتابعة التقدّم، ونسبة إنجاز، وطباعة/مشاركة المنهج.
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassCard } from "../../components/brand/glass-card";
import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../../constants/design";
import {
  generateSyllabus,
  getSyllabus,
  setUnitDone,
  type Syllabus,
} from "../../lib/syllabus";

export default function SyllabusScreen() {
  const { title, pdf_path } = useLocalSearchParams<{
    id?: string;
    title?: string;
    pdf_path?: string;
  }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookTitle = typeof title === "string" ? title : "المنهج الدراسي";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syl, setSyl] = useState<Syllabus | null>(null);
  const [done, setDone] = useState<boolean[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await getSyllabus(pdfPath);
        if (r) {
          setSyl(r.data);
          setDone(r.done.length === r.data.units.length ? r.done : new Array(r.data.units.length).fill(false));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [pdfPath]);

  async function onGenerate() {
    setErr("");
    setBusy(true);
    try {
      const data = await generateSyllabus(pdfPath);
      setSyl(data);
      setDone(new Array(data.units.length).fill(false));
    } catch (e: any) {
      setErr(e?.message ?? "تعذّر إنشاء المنهج");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(i: number) {
    const next = [...done];
    next[i] = !next[i];
    setDone(next);
    try {
      await setUnitDone(pdfPath, next);
    } catch {}
  }

  const completed = done.filter(Boolean).length;
  const total = syl?.units.length ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  async function onPrint() {
    if (!syl) return;
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const units = syl.units
      .map(
        (u, i) => `
        <div class="unit">
          <h3>${i + 1}. ${esc(u.title)}</h3>
          ${u.topics.length ? `<ul>${u.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
          ${u.outcome ? `<p class="out">🎯 ${esc(u.outcome)}</p>` : ""}
        </div>`
      )
      .join("");
    const tips = syl.tips?.length
      ? `<div class="tips"><h2>نصائح دراسية</h2><ul>${syl.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`
      : "";
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
      * { font-family: -apple-system, 'SF Arabic', sans-serif; }
      body { padding: 28px; color: #14233a; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .sub { color: #6b7a90; margin: 0 0 18px; }
      .unit { border: 1px solid #dce3ee; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; page-break-inside: avoid; }
      h3 { font-size: 16px; margin: 0 0 6px; color: #5b3df5; }
      ul { margin: 6px 0; padding-inline-start: 20px; }
      li { margin: 3px 0; }
      .out { color: #0a7d52; font-size: 13px; margin: 6px 0 0; }
      .tips { margin-top: 18px; }
      .box { display:inline-block; width:14px; height:14px; border:1.5px solid #5b3df5; border-radius:4px; margin-inline-start:8px; vertical-align:middle; }
    </style></head><body>
      <h1>${esc(syl.title ?? bookTitle)}</h1>
      <p class="sub">منهج دراسي — ${total} وحدة · للطباعة والمتابعة ✅</p>
      ${units}
      ${tips}
    </body></html>`;
    try {
      await Print.printAsync({ html });
    } catch {}
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* رأس */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            المنهج الدراسي
          </Text>
          {syl ? (
            <Pressable onPress={onPrint} style={styles.iconBtn} hitSlop={8}>
              <Ionicons name="print" size={20} color={Palette.text} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.primary} />
          </View>
        ) : !syl ? (
          <View style={styles.center}>
            <Ionicons name="sparkles" size={40} color={Palette.neonViolet} />
            <Text style={styles.emptyTitle}>أنشئي منهجًا دراسيًا لهذا الكتاب</Text>
            <Text style={styles.emptySub}>
              نقرأ أوّل صفحات الكتاب ونحوّلها إلى وحدات بعناوين ومواضيع ومخرجات تعلّم،
              مع تشيك ليست لمتابعة تقدّمك.
            </Text>
            {!!err && <Text style={styles.err}>{err}</Text>}
            <GradientButton
              title="إنشاء المنهج بالذكاء ✨"
              icon="sparkles"
              onPress={onGenerate}
              loading={busy}
              style={{ marginTop: Spacing.lg, alignSelf: "stretch" }}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* عنوان + تقدّم */}
            <GlassCard contentStyle={styles.progCard} glow={Palette.neonViolet}>
              <Text style={styles.bookTitle} numberOfLines={3}>
                {syl.title ?? bookTitle}
              </Text>
              <View style={styles.progRow}>
                <Text style={styles.progPct}>{pct}%</Text>
                <Text style={styles.progLabel}>
                  {completed} / {total} وحدة مكتملة
                </Text>
              </View>
              <View style={styles.progTrack}>
                <View style={[styles.progFill, { width: `${pct}%` }]} />
              </View>
            </GlassCard>

            {/* الوحدات (تشيك ليست) */}
            {syl.units.map((u, i) => {
              const isDone = done[i];
              return (
                <Pressable key={i} onPress={() => toggle(i)} style={styles.unitWrap}>
                  <GlassCard contentStyle={styles.unitCard} glow={isDone ? Palette.neonCyan : undefined}>
                    <View style={styles.unitHead}>
                      <View style={[styles.check, isDone && styles.checkOn]}>
                        {isDone && <Ionicons name="checkmark" size={16} color="#0b1220" />}
                      </View>
                      <Text style={[styles.unitTitle, isDone && styles.unitTitleDone]}>
                        {i + 1}. {u.title}
                      </Text>
                    </View>
                    {u.topics.map((t, k) => (
                      <View key={k} style={styles.topicRow}>
                        <Text style={styles.topicDot}>•</Text>
                        <Text style={styles.topicTxt}>{t}</Text>
                      </View>
                    ))}
                    {!!u.outcome && (
                      <Text style={styles.outcome}>🎯 {u.outcome}</Text>
                    )}
                  </GlassCard>
                </Pressable>
              );
            })}

            {/* نصائح */}
            {!!syl.tips?.length && (
              <GlassCard contentStyle={styles.tipsCard} glow={Palette.neonCyan}>
                <Text style={styles.tipsTitle}>نصائح للدراسة 💡</Text>
                {syl.tips.map((t, i) => (
                  <View key={i} style={styles.topicRow}>
                    <Text style={styles.topicDot}>•</Text>
                    <Text style={styles.topicTxt}>{t}</Text>
                  </View>
                ))}
              </GlassCard>
            )}

            <GradientButton
              title="طباعة / مشاركة المنهج"
              icon="print"
              variant="ghost"
              onPress={onPrint}
              style={{ marginTop: Spacing.md }}
            />
            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { flex: 1, textAlign: "center", color: Palette.text, fontSize: 18, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.xl, gap: 8 },
  emptyTitle: { color: Palette.text, fontSize: 19, fontWeight: "900", textAlign: "center", marginTop: 10 },
  emptySub: { color: Palette.textMuted, fontSize: 14, lineHeight: 24, textAlign: "center" },
  err: { color: Palette.warn, fontSize: 13, textAlign: "center", marginTop: 8, fontWeight: "700" },

  scroll: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, gap: 12 },
  progCard: { padding: Spacing.lg },
  bookTitle: { color: Palette.text, fontSize: 17, fontWeight: "900", textAlign: "center", lineHeight: 28 },
  progRow: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "center", gap: 10, marginTop: 12 },
  progPct: { color: Palette.neonCyan, fontSize: 28, fontWeight: "900" },
  progLabel: { color: Palette.textMuted, fontSize: 13, fontWeight: "700" },
  progTrack: { height: 10, borderRadius: 5, backgroundColor: Palette.surface, marginTop: 10, overflow: "hidden" },
  progFill: { height: "100%", borderRadius: 5, backgroundColor: Palette.neonCyan },

  unitWrap: {},
  unitCard: { padding: Spacing.md },
  unitHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Palette.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: Palette.neonCyan, borderColor: Palette.neonCyan },
  unitTitle: { flex: 1, color: Palette.text, fontSize: 16, fontWeight: "800", lineHeight: 26 },
  unitTitleDone: { color: Palette.textDim, textDecorationLine: "line-through" },
  topicRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 6, marginTop: 6, paddingStart: 36 },
  topicDot: { color: Palette.neonViolet, fontSize: 15, lineHeight: 22 },
  topicTxt: { flex: 1, color: Palette.textMuted, fontSize: 14, lineHeight: 22 },
  outcome: { color: Palette.success ?? Palette.neonCyan, fontSize: 13, fontWeight: "700", marginTop: 8, paddingStart: 36, lineHeight: 21 },

  tipsCard: { padding: Spacing.md },
  tipsTitle: { color: Palette.text, fontSize: 16, fontWeight: "900", marginBottom: 4 },
});
