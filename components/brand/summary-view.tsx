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

const COLORS = ["#5B4BF5", "#0E8F7E", "#E07A1F", "#2563EB", "#B8338C", "#15803D"];

export function SummaryView({ summary, bookTitle }: { summary: StudySummary; bookTitle?: string }) {
  const dir = useDir();
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
