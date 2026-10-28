// components/brand/summary-view.tsx
// عرض الملخّص الدراسي الشامل (lib/studySummary) في التطبيق: رأس متدرّج، أقسام مرقّمة بلون لكل قسم،
// تعريفات، تعدادات كاملة، جداول مقارنة (تمرير أفقي عند الحاجة)، أمثلة، شرح للصعب، تنبيهات، وأهم النقاط.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import type { StudySummary, SummaryBlock } from "../../lib/studySummary";
import { TableSummaryView } from "./table-summary-view";

const COLORS = ["#5B4BF5", "#0E8F7E", "#E07A1F", "#2563EB", "#B8338C", "#15803D"];

/** rtl: اتجاه لغة الملخّص نفسه (ملخّص إنجليزي/فرنسي في واجهة عربية يُقرأ من اليسار — ٢٨ أكتوبر) */
export function SummaryView({ summary, bookTitle, rtl }: { summary: StudySummary; bookTitle?: string; rtl?: boolean }) {
  // المختصر/المراجعة الأخيرة بالشكل الجدولي
  if (summary.table) return <TableSummaryView table={summary.table} badge={bookTitle} ltr={rtl === false} />;
  return <ClassicSummaryView summary={summary} bookTitle={bookTitle} rtl={rtl} />;
}

function ClassicSummaryView({ summary, bookTitle, rtl }: { summary: StudySummary; bookTitle?: string; rtl?: boolean }) {
  const ui = useDir();
  const dir =
    rtl === undefined || rtl === ui.isRTL
      ? ui
      : {
          isRTL: rtl,
          textAlign: (rtl ? "right" : "left") as "right" | "left",
          row: (rtl ? "row-reverse" : "row") as "row-reverse" | "row",
          writingDirection: (rtl ? "rtl" : "ltr") as "rtl" | "ltr",
        };
  const { t } = useI18n();
  const { pal } = useScene();
  const ta = { textAlign: dir.textAlign } as const;
  const ink = pal.ink;
  const card = { backgroundColor: pal.card, borderColor: pal.cardBorder };

  const splitHead = (x: string) => {
    const k = x.search(/[:：]/);
    return k > 0 && k <= 50 ? { h: x.slice(0, k).trim(), b: x.slice(k + 1).trim() } : { h: "", b: x };
  };

  const callout = (icon: keyof typeof Ionicons.glyphMap, label: string, color: string, text: string, title?: string) => (
    <View style={[styles.callout, { backgroundColor: color + (pal.dark ? "22" : "12"), borderColor: color + "55" }]}>
      <View style={[styles.calloutTag, { backgroundColor: color, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]}>
        <Text style={styles.calloutTagTxt}>
          <Ionicons name={icon} size={13} color="#FFFFFF" /> {label}
        </Text>
      </View>
      <Text style={[styles.body, { color: ink }, ta]}>
        {title ? <Text style={{ fontWeight: "900" }}>{title}: </Text> : null}
        {text}
      </Text>
    </View>
  );

  const renderBlock = (b: SummaryBlock, c: string, key: number) => {
    switch (b.type) {
      case "text":
        return <Text key={key} style={[styles.body, { color: ink }, ta]}>{b.text}</Text>;
      case "definition":
        return (
          <View key={key} style={[styles.def, card, { [dir.isRTL ? "borderRightColor" : "borderLeftColor"]: c, [dir.isRTL ? "borderRightWidth" : "borderLeftWidth"]: 5 }]}>
            <Text style={[styles.body, { color: ink }, ta]}>
              <Text style={{ color: c, fontWeight: "900" }}>{b.term}: </Text>
              {b.text}
            </Text>
          </View>
        );
      case "list":
        return (
          <View key={key} style={{ gap: 7 }}>
            {b.title ? <Text style={[styles.listTitle, { color: c }, ta]}>{b.title}</Text> : null}
            {b.items.map((x, i) => {
              const { h, b: body } = splitHead(x);
              return (
                <View key={i} style={[styles.li, { flexDirection: dir.row }]}>
                  <View style={[styles.bul, { backgroundColor: b.ordered ? c : c + "26" }]}>
                    <Text style={[styles.bulTxt, { color: b.ordered ? "#fff" : c }]}>{b.ordered ? i + 1 : "•"}</Text>
                  </View>
                  <Text style={[styles.body, { color: ink, flex: 1 }, ta]}>
                    {h ? <Text style={{ fontWeight: "900" }}>{h}: </Text> : null}
                    {body}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      case "table": {
        const colW = b.headers.length <= 2 ? 150 : 130;
        return (
          <View key={key} style={{ gap: 7 }}>
            {b.title ? <Text style={[styles.listTitle, { color: c }, ta]}>{b.title}</Text> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} style={{ transform: dir.isRTL ? [{ scaleX: -1 }] : undefined }}>
              <View style={[styles.table, { borderColor: pal.cardBorder, transform: dir.isRTL ? [{ scaleX: -1 }] : undefined, minWidth: "100%" }]}>
                <View style={[styles.tr, { flexDirection: dir.row, backgroundColor: c }]}>
                  {b.headers.map((h, i) => (
                    <Text key={i} style={[styles.th, { width: colW, flexGrow: 1 }, ta]}>{h}</Text>
                  ))}
                </View>
                {b.rows.map((r, ri) => (
                  <View key={ri} style={[styles.tr, { flexDirection: dir.row, backgroundColor: ri % 2 ? c + (pal.dark ? "1A" : "0D") : "transparent", borderTopColor: pal.cardBorder }]}>
                    {r.map((x, ci) => (
                      <Text key={ci} style={[styles.td, { width: colW, flexGrow: 1, color: ci === 0 ? c : ink, fontWeight: ci === 0 ? "800" : "600" }, ta]}>{x}</Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        );
      }
      case "example":
        return <React.Fragment key={key}>{callout("bulb-outline", t("summary.example"), "#0E8F7E", b.text)}</React.Fragment>;
      case "explain":
        return <React.Fragment key={key}>{callout("search-outline", t("summary.explain"), "#2563EB", b.text, b.title)}</React.Fragment>;
      case "important":
        return <React.Fragment key={key}>{callout("alert-circle-outline", t("summary.important"), "#D97706", b.text)}</React.Fragment>;
      case "exercise":
        return (
          <View key={key} style={{ gap: 6 }}>
            <View style={[styles.exQ, { backgroundColor: pal.dark ? "#1E293B" : "#F1F5F9", borderColor: pal.dark ? "#334155" : "#CBD5E1" }]}>
              <Text style={[styles.exTag, ta]}>
                <Ionicons name="create-outline" size={13} color={pal.dark ? "#CBD5E1" : "#334155"} /> {t("summary.exercise")}
              </Text>
              <Text style={[styles.body, { color: ink, fontWeight: "800" }, ta]}>{b.q}</Text>
            </View>
            {/* الحل بلون مختلف دائمًا */}
            <View style={[styles.sol, { backgroundColor: pal.dark ? "#064E3B" : "#ECFDF5", borderColor: "#34D399" }]}>
              {b.steps.length ? (
                <>
                  <Text style={[styles.solHead, ta]}>{t("summary.steps")}</Text>
                  {b.steps.map((x, i) => (
                    <Text key={i} style={[styles.body, { color: pal.dark ? "#D1FAE5" : "#065F46" }, ta]}>
                      {i + 1}. {x}
                    </Text>
                  ))}
                </>
              ) : null}
              {b.answer ? (
                <>
                  <Text style={[styles.solHead, ta]}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" /> {t("summary.solution")}
                  </Text>
                  {/* الجواب بلون غامق واضح */}
                  <Text style={[styles.body, { color: pal.dark ? "#ECFDF5" : "#064E3B", fontWeight: "900" }, ta]}>{b.answer}</Text>
                </>
              ) : null}
              {b.why ? (
                <>
                  <Text style={[styles.solHead, ta]}>{t("summary.why")}</Text>
                  <Text style={[styles.body, { color: pal.dark ? "#D1FAE5" : "#065F46" }, ta]}>{b.why}</Text>
                </>
              ) : null}
              {b.quote ? (
                <Text style={[styles.body, { color: pal.dark ? "#A7F3D0" : "#374151", fontStyle: "italic", marginTop: 4 }, ta]}>«{b.quote}»</Text>
              ) : null}
            </View>
          </View>
        );
      case "case":
        return (
          <View key={key} style={{ gap: 6 }}>
            <View style={[styles.exQ, { backgroundColor: pal.dark ? "#2E1065" : "#F5F3FF", borderColor: pal.dark ? "#5B21B6" : "#DDD6FE" }]}>
              <Text style={[styles.exTag, { color: pal.dark ? "#DDD6FE" : "#6D28D9" }, ta]}>
                <Ionicons name="briefcase-outline" size={13} color={pal.dark ? "#DDD6FE" : "#6D28D9"} /> {t("summary.case")}
                {b.title ? ` — ${b.title}` : ""}
              </Text>
              <Text style={[styles.body, { color: ink }, ta]}>{b.text}</Text>
            </View>
            {b.analysis ? (
              <View style={[styles.sol, { backgroundColor: pal.dark ? "#451A03" : "#FFFBEB", borderColor: "#FCD34D" }]}>
                <Text style={[styles.solHead, { color: "#D97706" }, ta]}>{t("summary.analysis")}</Text>
                <Text style={[styles.body, { color: ink }, ta]}>{b.analysis}</Text>
              </View>
            ) : null}
            {b.qa.map((x, i) => (
              <View key={i} style={{ gap: 4 }}>
                <Text style={[styles.body, { color: ink, fontWeight: "800" }, ta]}>{x.q}</Text>
                <View style={[styles.sol, { backgroundColor: pal.dark ? "#064E3B" : "#ECFDF5", borderColor: "#34D399" }]}>
                  <Text style={[styles.body, { color: pal.dark ? "#D1FAE5" : "#065F46", fontWeight: "700" }, ta]}>{x.a}</Text>
                </View>
              </View>
            ))}
          </View>
        );
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <LinearGradient colors={["#4338CA", "#2A9DF4"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.hero}>
        <View style={[styles.orb, { [dir.isRTL ? "left" : "right"]: -50 }]} />
        {bookTitle ? <Text style={[styles.heroBook, ta]}>{bookTitle}</Text> : null}
        {summary.title ? <Text style={[styles.heroTitle, ta]}>{summary.title}</Text> : null}
        {summary.intro ? <Text style={[styles.heroIntro, ta]}>{summary.intro}</Text> : null}
      </LinearGradient>

      {summary.sections.map((sec, si) => {
        const c = COLORS[si % COLORS.length];
        return (
          <View key={si} style={[styles.section, card]}>
            {sec.heading ? (
              <>
                <View style={[styles.secHead, { flexDirection: dir.row }]}>
                  <View style={[styles.secNum, { backgroundColor: c }]}>
                    <Text style={styles.secNumTxt}>{si + 1}</Text>
                  </View>
                  <Text style={[styles.secTitle, { color: c }, ta]}>{sec.heading}</Text>
                </View>
                <View style={[styles.secRule, { backgroundColor: c + "40" }]} />
              </>
            ) : null}
            <View style={{ gap: 12 }}>{sec.blocks.map((b, bi) => renderBlock(b, c, bi))}</View>
          </View>
        );
      })}

      {summary.keypoints.length ? (
        <View style={[styles.key, { backgroundColor: pal.dark ? "#15803D22" : "#F0FDF4", borderColor: "#86EFAC" }]}>
          <Text style={[styles.keyTitle, ta]}><Ionicons name="checkmark-done-circle-outline" size={18} color="#15803D" /> {t("summary.keypoints")}</Text>
          {summary.keypoints.map((k, i) => (
            <View key={i} style={[styles.li, { flexDirection: dir.row }]}>
              <View style={[styles.bul, { backgroundColor: "#15803D" }]}>
                <Text style={[styles.bulTxt, { color: "#fff" }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.body, { color: ink, flex: 1 }, ta]}>{k}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  exQ: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  exTag: { fontSize: 12.5, fontWeight: "900", color: "#334155" },
  sol: { borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 4 },
  solHead: { fontSize: 13.5, fontWeight: "900", color: "#059669" },
  hero: { borderRadius: 22, padding: 20, overflow: "hidden", gap: 6 },
  orb: { position: "absolute", top: -60, width: 170, height: 170, borderRadius: 85, backgroundColor: "rgba(255,255,255,0.12)" },
  heroBook: { color: "rgba(255,255,255,0.8)", fontSize: 12.5, fontWeight: "800" },
  heroTitle: { color: "#fff", fontSize: 22, lineHeight: 34, fontWeight: "900" },
  heroIntro: { color: "rgba(255,255,255,0.92)", fontSize: 15, lineHeight: 26, fontWeight: "600" },
  section: { borderRadius: 20, borderWidth: 1, padding: 16 },
  secHead: { alignItems: "center", gap: 10 },
  secNum: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  secNumTxt: { color: "#fff", fontSize: 14, fontWeight: "900" },
  secTitle: { flex: 1, fontSize: 18, lineHeight: 28, fontWeight: "900" },
  secRule: { height: 3, borderRadius: 2, marginTop: 10, marginBottom: 12 },
  body: { fontSize: 15.5, lineHeight: 28, fontWeight: "500" },
  listTitle: { fontSize: 15.5, fontWeight: "900", lineHeight: 25 },
  li: { gap: 9, alignItems: "flex-start" },
  bul: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 2 },
  bulTxt: { fontSize: 12.5, fontWeight: "900" },
  def: { borderRadius: 14, borderWidth: 1, padding: 12 },
  table: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  tr: { borderTopWidth: StyleSheet.hairlineWidth },
  th: { color: "#fff", fontWeight: "900", fontSize: 13.5, paddingVertical: 9, paddingHorizontal: 10 },
  td: { fontSize: 13.5, lineHeight: 22, paddingVertical: 9, paddingHorizontal: 10 },
  callout: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 8 },
  calloutTag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  calloutTagTxt: { color: "#fff", fontSize: 12, fontWeight: "900" },
  key: { borderRadius: 20, borderWidth: 1.5, padding: 16, gap: 9 },
  keyTitle: { color: "#15803D", fontSize: 17, fontWeight: "900", marginBottom: 2 },
});
