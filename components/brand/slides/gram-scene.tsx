// components/brand/slides/gram-scene.tsx
// «مربع الدرس» لكتب اللغة (قرار نهلة ٢٧ أكتوبر): القاعدة في مربع رسومي بصيغتها، والجملة محلّلة كلمة كلمة
// (كل كلمة في مربع ملوّن بدورها: فاعل/فعل/مفعول/اسم/صفة…، والفعل بأصله وزمنه تحته)، وجدول الاقتران بكل الضمائر،
// والخطأ الشائع. رسم واحد مشترك لكل الأشكال الخمسة بألوان كل شكل، فوق خلفيته وترويسته وترجمته.
// يظهر كل جزء مع كلام الراوي (Reveal على التقدّم المشترك).
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { isLatinText, roleKind, type GramSentence, type LangBlock, type RoleKind } from "../../../lib/langLessonCore";
import { Reveal, type SlideCtx } from "./shared";

type Pal = { panel: string; ink: string; dim: string; accent: string; line: string; soft: string };

/** ألوان كل شكل (الكلاسيكي فاتح، والبقية داكنة بلمسة الشكل) */
export const GRAM_PALETTES: Record<"editorial" | "visual" | "cinematic" | "classic", Pal> = {
  editorial: { panel: "rgba(246,239,226,0.97)", ink: "#1B1A2E", dim: "#6B6457", accent: "#B8892B", line: "rgba(27,26,46,0.14)", soft: "rgba(184,137,43,0.10)" },
  visual: { panel: "rgba(13,22,40,0.92)", ink: "#F1F5F9", dim: "#94A3B8", accent: "#2DD4BF", line: "rgba(241,245,249,0.14)", soft: "rgba(45,212,191,0.10)" },
  cinematic: { panel: "rgba(14,12,32,0.88)", ink: "#F5EFE0", dim: "#A8A2B8", accent: "#E8C468", line: "rgba(245,239,224,0.14)", soft: "rgba(232,196,104,0.10)" },
  classic: { panel: "#FFFFFF", ink: "#0F172A", dim: "#64748B", accent: "#2563EB", line: "rgba(15,23,42,0.10)", soft: "rgba(37,99,235,0.07)" },
};

/** لون ثابت لكل دور في كل الأشكال: الطالب يربط اللون بالدور */
export const ROLE_COLORS: Record<RoleKind, string> = {
  subject: "#3B82F6",
  verb: "#F43F5E",
  object: "#10B981",
  noun: "#8B5CF6",
  adj: "#F59E0B",
  adv: "#06B6D4",
  pronoun: "#6366F1",
  prep: "#94A3B8",
  other: "#9CA3AF",
};

function Sentence({ s, pal, ff, align }: { s: GramSentence; pal: Pal; ff: SlideCtx["ff"]; align: "right" | "left" }) {
  const latin = isLatinText(s.words.map((w) => w.w).join(" "));
  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.words, { flexDirection: latin ? "row" : "row-reverse" }]}>
        {s.words.map((w, i) => {
          const c = ROLE_COLORS[roleKind(w.role)];
          return (
            <View key={i} style={styles.wordCol}>
              <View style={[styles.wordBox, { borderColor: c, backgroundColor: c + "22" }]}>
                <Text style={[ff("plex600"), styles.word, { color: pal.ink }]}>{w.w}</Text>
              </View>
              {w.role ? <Text style={[ff("plex700"), styles.role, { color: c }]}>{w.role}</Text> : null}
              {w.base || w.tense ? (
                <Text style={[ff("plex500"), styles.base, { color: pal.dim }]} numberOfLines={2}>
                  {[w.base, w.tense].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {s.tr ? <Text style={[ff("plex500"), styles.tr, { color: pal.dim, textAlign: align }]}>«{s.tr}»</Text> : null}
    </View>
  );
}

function RuleBox({ g, pal, ff, align, sv, flex }: { g: LangBlock; pal: Pal; ff: SlideCtx["ff"]; align: "right" | "left"; sv: SlideCtx["sv"]; flex?: number }) {
  if (!g.rule && !g.formula) return null;
  return (
    <Reveal sv={sv} at={0.04} style={[styles.ruleBox, { borderColor: pal.accent, backgroundColor: pal.soft, flex }]}>
      {g.rule ? (
        <Text style={[ff("plex600"), styles.rule, { color: pal.ink, textAlign: align }]} numberOfLines={3}>
          📐 {g.rule}
        </Text>
      ) : null}
      {g.formula ? (
        <View style={[styles.formula, { borderColor: pal.accent }]}>
          <Text style={[ff("plex700"), styles.formulaTxt, { color: pal.accent }]} numberOfLines={2}>
            {g.formula}
          </Text>
        </View>
      ) : null}
    </Reveal>
  );
}

function ConjBox({ g, pal, ff, sv, flex }: { g: LangBlock; pal: Pal; ff: SlideCtx["ff"]; sv: SlideCtx["sv"]; flex?: number }) {
  const c = g.conj!;
  const verbC = ROLE_COLORS.verb;
  return (
    <View style={[styles.conj, { borderColor: pal.line, flex }]}>
      <Reveal sv={sv} at={0.1} style={[styles.conjHead, { backgroundColor: verbC + "26" }]}>
        <Text style={[ff("plex700"), styles.conjVerb, { color: pal.ink }]}>{c.verb}</Text>
        {c.tense ? <Text style={[ff("plex600"), styles.conjTense, { color: verbC }]}>{c.tense}</Text> : null}
      </Reveal>
      {c.rows.map(([p, f], i) => (
        <Reveal key={i} sv={sv} at={0.18 + i * (0.5 / c.rows.length)} rise={10} style={[styles.conjRow, { borderTopColor: pal.line }]}>
          <Text style={[ff("plex500"), styles.conjP, { color: ROLE_COLORS.pronoun }]}>{p}</Text>
          <Text style={[ff("plex700"), styles.conjF, { color: pal.ink }]}>{f}</Text>
        </Reveal>
      ))}
    </View>
  );
}

export function GramScene({ ctx, palette }: { ctx: SlideCtx; palette: keyof typeof GRAM_PALETTES }) {
  const pal = GRAM_PALETTES[palette];
  const g = ctx.scene.gram!;
  const { ff, align, sv, row } = ctx;
  const title = ctx.scene.title;
  const conjOnly = !!g.conj && !g.parse?.length;
  return (
    <View style={[StyleSheet.absoluteFill, { paddingTop: ctx.safe.top + 26, paddingBottom: ctx.safe.bottom - 6, paddingHorizontal: ctx.safe.side }]}>
      <View style={[styles.panel, { backgroundColor: pal.panel, borderColor: pal.line }]}>
        {title ? (
          <Reveal sv={sv} at={0} style={{ flexDirection: row, alignItems: "center", gap: 12 }}>
            <Text style={styles.emoji}>{ctx.scene.emoji || "📘"}</Text>
            <Text style={[ff("kufi700"), styles.title, { color: pal.ink, textAlign: align, flex: 1 }]} numberOfLines={1}>
              {title}
            </Text>
          </Reveal>
        ) : null}

        {conjOnly ? (
          <View style={{ flex: 1, flexDirection: row, gap: 22 }}>
            {g.rule || g.formula || g.mistake ? (
              <View style={{ flex: 1, gap: 14 }}>
                <RuleBox g={g} pal={pal} ff={ff} align={align} sv={sv} />
                {g.mistake ? (
                  <Reveal sv={sv} at={0.78} style={[styles.mistake, { borderColor: ROLE_COLORS.verb }]}>
                    <Text style={[ff("plex600"), styles.mistakeTxt, { color: pal.ink, textAlign: align }]} numberOfLines={3}>
                      ⚠️ {g.mistake}
                    </Text>
                  </Reveal>
                ) : null}
              </View>
            ) : null}
            <ConjBox g={g} pal={pal} ff={ff} sv={sv} flex={1.15} />
          </View>
        ) : (
          <View style={{ flex: 1, gap: 16 }}>
            <RuleBox g={g} pal={pal} ff={ff} align={align} sv={sv} />
            {(g.parse ?? []).map((s, i) => (
              <Reveal key={i} sv={sv} at={0.22 + i * 0.24}>
                <Sentence s={s} pal={pal} ff={ff} align={align} />
              </Reveal>
            ))}
            {g.mistake ? (
              <Reveal sv={sv} at={0.78} style={[styles.mistake, { borderColor: ROLE_COLORS.verb, marginTop: "auto" }]}>
                <Text style={[ff("plex600"), styles.mistakeTxt, { color: pal.ink, textAlign: align }]} numberOfLines={2}>
                  ⚠️ {g.mistake}
                </Text>
              </Reveal>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, borderRadius: 28, borderWidth: 1, padding: 26, gap: 16 },
  emoji: { fontSize: 34 },
  title: { fontSize: 36, lineHeight: 52 },
  ruleBox: { borderWidth: 2, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 18, gap: 10 },
  rule: { fontSize: 25, lineHeight: 38 },
  formula: { alignSelf: "center", borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 20 },
  formulaTxt: { fontSize: 24, lineHeight: 34, textAlign: "center", writingDirection: "ltr" },
  words: { flexWrap: "wrap", justifyContent: "center", gap: 12 },
  wordCol: { alignItems: "center", gap: 5, maxWidth: 280 },
  wordBox: { borderWidth: 2, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 16 },
  word: { fontSize: 30, lineHeight: 40, writingDirection: "ltr" },
  role: { fontSize: 17, lineHeight: 24, textAlign: "center" },
  base: { fontSize: 15, lineHeight: 21, textAlign: "center" },
  tr: { fontSize: 19, lineHeight: 28 },
  conj: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  conjHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 14, paddingVertical: 10 },
  conjVerb: { fontSize: 28, lineHeight: 38 },
  conjTense: { fontSize: 19, lineHeight: 28 },
  conjRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingVertical: 6, paddingHorizontal: 22, gap: 16 },
  conjP: { fontSize: 22, lineHeight: 30, width: 130, writingDirection: "ltr" },
  conjF: { fontSize: 25, lineHeight: 34, flex: 1, writingDirection: "ltr" },
  mistake: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16 },
  mistakeTxt: { fontSize: 20, lineHeight: 30 },
});
