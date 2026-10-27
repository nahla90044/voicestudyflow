// components/brand/table-summary-view.tsx
// «المختصر» و«المراجعة الأخيرة» بالشكل الجدولي في التطبيق (lib/tableSummary). ورقة بيضاء نظيفة دائمًا
// (كالمطبوع تمامًا، في كل الثيمات): على الشاشة العريضة جدول (الموضوع | العنوان الفرعي | المحتوى)، وعلى
// الجوال بطاقة لكل موضوع وصفوفه تحته. الكلمة المفتاحية بارزة، والأرقام المهمة بإيموجيها ولونها، والتعداد
// الطويل مجموعات في مربعات — لا شيء يركب على شيء (طلب نهلة).
import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { isLatinText, ROLE_COLORS, roleKind, tint, type LangBlock } from "../../lib/langLessonCore";
import { NUM_COLORS, NUM_EMOJI, TOPIC_COLORS, itemColumns, plainItem, segments, type TableRow, type TableSummary } from "../../lib/tableSummary";

const INK = "#1d2330";
const LINE = "#d5d9e1";
const AR = (n: number) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

/** سطر بمقاطعه: كلمة مفتاحية، رقم مهم، مرجع مادة */
function Rich({ text, style, color = INK }: { text: string; style?: object; color?: string }) {
  return (
    <Text style={[styles.txt, { color }, style]}>
      {segments(text).map((g, i) =>
        !g.k ? (
          <Text key={i}>{g.t}</Text>
        ) : g.k === "key" ? (
          <Text key={i} style={styles.key}>
            {" "}
            {g.t}{" "}
          </Text>
        ) : g.k === "ref" ? (
          <Text key={i} style={styles.ref}>
            {" "}
            {g.t}
          </Text>
        ) : (
          <Text key={i} style={[styles.num, { backgroundColor: NUM_COLORS[g.k].bg, color: NUM_COLORS[g.k].fg }]}>
            {" "}
            {NUM_EMOJI[g.k]} {g.t}{" "}
          </Text>
        )
      )}
    </Text>
  );
}

function Item({ n, text, edge }: { n: number; text: string; edge: string }) {
  return (
    <View style={styles.item}>
      <View style={[styles.n, { backgroundColor: edge }]}>
        <Text style={styles.nTxt}>{AR(n)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Rich text={plainItem(text)} />
      </View>
    </View>
  );
}

function RowBody({ r, edge, wide }: { r: TableRow; edge: string; wide: boolean }) {
  const cols = wide && r.items ? itemColumns(r.items) : 1;
  let k = r.items?.length ?? 0;
  return (
    <View style={{ gap: 4 }}>
      {(r.lines ?? []).map((l, i) => (
        <View key={i} style={[i > 0 && styles.dash]}>
          <Rich text={l} color={l.startsWith("⚠️") ? "#9a2a12" : INK} style={l.startsWith("⚠️") ? { fontWeight: "700" } : undefined} />
        </View>
      ))}
      {r.items?.length ? (
        <View style={styles.wrap}>
          {r.items.map((x, i) => (
            <View key={i} style={{ width: `${100 / cols - (cols > 1 ? 2 : 0)}%` }}>
              <Item n={i + 1} text={x} edge={edge} />
            </View>
          ))}
        </View>
      ) : null}
      {r.groups?.length ? (
        <View style={styles.wrap}>
          {r.groups.map((g, gi) => (
            <View key={gi} style={[styles.grp, { width: wide ? (r.groups!.length >= 3 ? "31.5%" : "48%") : "100%" }]}>
              <Text style={[styles.gt, { color: edge, borderColor: edge }]}>
                {g.title.replace(/\s*\([0-9٠-٩]+\)\s*$/, "")} <Text style={styles.gc}>({AR(g.items.length)})</Text>
              </Text>
              {g.items.map((x, i) => (
                <Item key={i} n={++k} text={x} edge={edge} />
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {(r.ex ?? []).map((e, i) => (
        <Rich key={i} text={`💡 ${e}`} color="#2E6B3F" style={styles.small} />
      ))}
      {r.key ? (
        <View style={styles.keyBox}>
          <Rich text={`🗝️ ${r.key}`} style={styles.small} />
        </View>
      ) : null}
      {r.gram ? <GramPaper g={r.gram} /> : null}
      {r.compare ? (
        <View style={styles.cmp}>
          {[r.compare.headers, ...r.compare.rows].map((cr, ri) => (
            <View key={ri} style={[styles.cmpRow, ri === 0 && { backgroundColor: "#eef1f6" }]}>
              {cr.map((c, ci) => (
                <View key={ci} style={[styles.cmpCell, ci > 0 && styles.cmpSep]}>
                  <Rich text={c} style={[styles.small, ri === 0 && { fontWeight: "800" }]} />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** «مربع الدرس» على الورقة (كتب اللغة): القاعدة وصيغتها، والجملة كلمة كلمة بدورها، وجدول الاقتران، والخطأ الشائع */
function GramPaper({ g }: { g: LangBlock }) {
  return (
    <View style={styles.gram}>
      {g.rule ? <Text style={[styles.txt, { color: INK, fontWeight: "700" }]}>📐 {g.rule}</Text> : null}
      {g.formula ? (
        <View style={styles.gForm}>
          <Text style={styles.gFormTxt}>{g.formula}</Text>
        </View>
      ) : null}
      {(g.parse ?? []).map((sn, si) => (
        <View key={si} style={{ gap: 4 }}>
          <View style={[styles.gSent, { flexDirection: isLatinText(sn.words.map((w) => w.w).join(" ")) ? "row" : "row-reverse" }]}>
            {sn.words.map((w, i) => {
              const c = ROLE_COLORS[roleKind(w.role)];
              return (
                <View key={i} style={styles.gCol}>
                  <View style={[styles.gBox, { borderColor: c, backgroundColor: tint(c) }]}>
                    <Text style={styles.gWord}>{w.w}</Text>
                  </View>
                  {w.role ? <Text style={[styles.gRole, { color: c }]}>{w.role}</Text> : null}
                  {w.base || w.tense ? <Text style={styles.gBase}>{[w.base, w.tense].filter(Boolean).join(" · ")}</Text> : null}
                </View>
              );
            })}
          </View>
          {sn.tr ? <Text style={styles.gTr}>«{sn.tr}»</Text> : null}
        </View>
      ))}
      {g.conj ? (
        <View style={styles.gConj}>
          <View style={[styles.gConjHead, { backgroundColor: tint(ROLE_COLORS.verb) }]}>
            <Text style={styles.gConjVerb}>{g.conj.verb}</Text>
            {g.conj.tense ? <Text style={[styles.gConjTense, { color: ROLE_COLORS.verb }]}>{g.conj.tense}</Text> : null}
          </View>
          {g.conj.rows.map(([p, f], i) => (
            <View key={i} style={styles.gConjRow}>
              <Text style={[styles.gConjP, { color: ROLE_COLORS.pronoun }]}>{p}</Text>
              <Text style={styles.gConjF}>{f}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {g.mistake ? (
        <View style={styles.gMis}>
          <Text style={[styles.txt, { color: "#9a2a12", fontWeight: "700" }]}>⚠️ {g.mistake}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function TableSummaryView({ table, badge }: { table: TableSummary; badge?: string }) {
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  return (
    <View style={styles.paper}>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{badge}</Text>
        </View>
      ) : null}
      {table.title ? <Text style={styles.h1}>{table.title}</Text> : null}
      <View style={[styles.grid, !wide && { borderWidth: 0, gap: 12 }]}>
        {table.topics.map((tp, ti) => {
          const c = TOPIC_COLORS[ti % TOPIC_COLORS.length];
          const head = (
            <View style={[styles.topic, { backgroundColor: c.bg }, wide ? { width: "15%", borderRightWidth: 5, borderRightColor: c.edge } : { borderTopWidth: 4, borderTopColor: c.edge, borderTopLeftRadius: 10, borderTopRightRadius: 10 }]}>
              <Text style={[styles.tname, { color: c.edge }]}>{tp.topic}</Text>
              {tp.hook ? (
                <View style={styles.hook}>
                  <Rich text={`🔗 ${tp.hook}`} style={styles.small} color="#39404d" />
                </View>
              ) : null}
            </View>
          );
          return (
            <View key={ti} style={[wide ? styles.topicRowWide : styles.topicCard]}>
              {head}
              <View style={{ flex: 1 }}>
                {tp.rows.map((r, ri) => (
                  <View key={ri} style={[wide ? styles.rowWide : styles.rowNarrow, ri > 0 && { borderTopWidth: 1, borderTopColor: LINE }]}>
                    <View style={[wide ? styles.subWide : styles.subNarrow, { backgroundColor: c.bg }]}>
                      <Text style={[styles.sub, { color: wide ? INK : c.edge }]}>{r.label}</Text>
                    </View>
                    <View style={[styles.body, wide && { flex: 1 }]}>
                      <RowBody r={r} edge={c.edge} wide={wide} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
      {table.links.length ? (
        <View style={styles.links}>
          <Text style={styles.lh}>🔗 روابط الوحدة — اربط ولا تحفظ منفصلًا</Text>
          {table.links.map((l, i) => (
            <Rich key={i} text={`• ${l}`} style={styles.small} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 12, gap: 10 },
  badge: { alignSelf: "flex-end", backgroundColor: INK, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { color: "#fff", fontSize: 11.5, fontWeight: "800" },
  h1: { fontSize: 17, fontWeight: "900", color: INK, textAlign: "center", borderWidth: 2, borderColor: INK, borderRadius: 10, padding: 8 },
  grid: { borderWidth: 1, borderColor: LINE, borderRadius: 10, overflow: "hidden" },
  topicRowWide: { flexDirection: "row-reverse", borderTopWidth: 1, borderTopColor: LINE },
  topicCard: { borderWidth: 1, borderColor: LINE, borderRadius: 12, overflow: "hidden" },
  topic: { padding: 10, alignItems: "center", justifyContent: "center", gap: 6 },
  tname: { fontSize: 15, fontWeight: "900", textAlign: "center" },
  hook: { backgroundColor: "#FFFFFF", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  rowWide: { flexDirection: "row-reverse" },
  rowNarrow: {},
  subWide: { width: "17%", padding: 8, justifyContent: "center", borderLeftWidth: 1, borderLeftColor: LINE },
  subNarrow: { paddingHorizontal: 10, paddingVertical: 6 },
  sub: { fontSize: 13.5, fontWeight: "800", textAlign: "center" },
  body: { padding: 9, borderLeftWidth: 1, borderLeftColor: LINE },
  txt: { fontSize: 14, lineHeight: 25, textAlign: "right", writingDirection: "rtl" },
  small: { fontSize: 13, lineHeight: 22 },
  key: { color: "#0f3d78", backgroundColor: "#EAF2FF", fontWeight: "800" },
  ref: { fontSize: 11, color: "#8a93a3" },
  num: { fontWeight: "800" },
  dash: { borderTopWidth: 1, borderTopColor: "#e3e6ec", borderStyle: "dashed", paddingTop: 3 },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, columnGap: 8 },
  item: { flexDirection: "row-reverse", gap: 6, alignItems: "flex-start" },
  n: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 3, paddingHorizontal: 3 },
  nTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  grp: { borderWidth: 1, borderColor: "#dfe3ea", borderRadius: 10, padding: 8, backgroundColor: "#fbfcfe", gap: 3 },
  gt: { fontSize: 13.5, fontWeight: "900", borderBottomWidth: 2, paddingBottom: 3, marginBottom: 3, textAlign: "right" },
  gc: { color: "#8a93a3", fontWeight: "600" },
  keyBox: { alignSelf: "flex-end", backgroundColor: "#FFF7D6", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  cmp: { borderWidth: 1, borderColor: LINE, borderRadius: 8, overflow: "hidden" },
  cmpRow: { flexDirection: "row-reverse", borderTopWidth: 1, borderTopColor: LINE },
  cmpCell: { flex: 1, padding: 6 },
  cmpSep: { borderRightWidth: 1, borderRightColor: LINE },
  links: { borderWidth: 2, borderColor: "#7A4FC0", borderStyle: "dashed", borderRadius: 12, padding: 10, backgroundColor: "#FAF7FF", gap: 2 },
  lh: { fontWeight: "900", color: "#5b36a0", textAlign: "right", fontSize: 14 },
  gram: { borderWidth: 2, borderColor: "#c9d2e3", borderRadius: 12, padding: 10, gap: 8, backgroundColor: "#fbfcfe", marginTop: 4 },
  gForm: { alignSelf: "center", borderWidth: 1.5, borderColor: "#B8892B", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 3 },
  gFormTxt: { color: "#8a6418", fontWeight: "800", fontSize: 14, writingDirection: "ltr" },
  gSent: { flexWrap: "wrap", justifyContent: "center", gap: 8 },
  gCol: { alignItems: "center", gap: 2, maxWidth: 160 },
  gBox: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  gWord: { color: INK, fontSize: 15, fontWeight: "700", writingDirection: "ltr" },
  gRole: { fontSize: 11, fontWeight: "800", textAlign: "center" },
  gBase: { color: "#5b6475", fontSize: 10, textAlign: "center" },
  gTr: { color: "#5b6475", fontSize: 12, textAlign: "center" },
  gConj: { alignSelf: "center", minWidth: 220, borderWidth: 1, borderColor: LINE, borderRadius: 8, overflow: "hidden" },
  gConjHead: { flexDirection: "row", justifyContent: "center", alignItems: "baseline", gap: 8, paddingVertical: 4 },
  gConjVerb: { color: INK, fontWeight: "800", fontSize: 15 },
  gConjTense: { fontWeight: "700", fontSize: 12 },
  gConjRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: LINE, paddingVertical: 3, paddingHorizontal: 12, gap: 12 },
  gConjP: { width: 70, fontSize: 13, writingDirection: "ltr" },
  gConjF: { flex: 1, color: INK, fontWeight: "700", fontSize: 14, writingDirection: "ltr" },
  gMis: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "#F43F5E", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});

