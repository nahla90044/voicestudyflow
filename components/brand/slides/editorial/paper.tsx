// components/brand/slides/editorial/paper.tsx
// صفحات الورق العاجي في شكل المجلة: الفهرس المرقّم (list / steps)، والصفحتان المتقابلتان (compare)،
// وصفحة المعجم «لغةً / اصطلاحًا» (define)، والاقتباس بخط النسخ (quote)، وصفحة الحفظ (summary).
// كما في النموذج ١-مجلة-تحريرية.html: الرأس بالكوفي والشرح بخط هادئ، والنقطة الحالية مضيئة والسابقة تخفت،
// وخيوط ذهب الورق تُمدّ مع الراوي. الأحجام مقدّرة مسبقًا لتتسع ست نقاط طويلة وعمودين ممتلئين بلا قص.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";

import { kindOf, normText, toLocalDigits, type Item } from "../../../../lib/slideThemeCore";
import type { SlideCtx } from "../shared";
import { roleBadge, RoleChip } from "./ink";
import {
  C,
  cornerPad,
  DimAfter,
  fitScale,
  fitT,
  folio,
  ghostOf,
  Ghost,
  GOLD,
  GOLD_INK,
  Grow,
  originStart,
  PageTitle,
  PAPER_DIM,
  PAPER_INK,
  Pill,
  planAt,
  Rise,
  SideIn,
  Stamp,
  T,
  textW,
  Tick,
  TONES,
  type Box,
  type TP,
} from "./kit";

const tone = TONES.paper;
const kOf = (ctx: SlideCtx) => (ctx.compact ? 1.12 : 1);
const hasHead = (it: Item) => !!it.head && !!it.body;
/** نقطة قصيرة بلا «رأس: شرح» تُكتب رأسًا بالكوفي (كعناوين الفهرس في النموذج) */
const shortHead = (it: Item) => !hasHead(it) && it.text.length <= 42;

/** حبة العدد/النوع أعلى الصفحة (مثل «٥ · نقاط») */
function CountPill({ ctx, text }: { ctx: SlideCtx; text: string }) {
  return (
    <Stamp sv={ctx.sv} at={0} delay={600}>
      <Pill ctx={ctx} text={text} size={22} color={GOLD_INK} border="rgba(126,92,30,0.5)" />
    </Stamp>
  );
}

// ===== الفهرس المرقّم: list / steps =====

type ListPlan = {
  title: TP;
  cols: number;
  rows: number;
  cw: number;
  numW: number;
  num: number;
  pad: number;
  head: (TP | null)[];
  body: (TP | null)[];
  rowH: number[];
  gridTop: number;
};

export function ListPage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL, lang } = ctx;
  const k = kOf(ctx);
  const steps = m.template === "steps";
  const items = m.items;
  const n = items.length;
  const cp = cornerPad(ctx, B, B.top);
  const role = roleBadge(ctx);
  const roleH = role ? 44 + 12 : 0;
  // بلا نقطة فاصلة: «·» تشبه الصفر العربي «٠» بجانب الأرقام
  const pillText = n ? `${toLocalDigits(n, lang)} ${ctx.t(`video.s.kind.${kindOf(m)}`)}` : "";
  const pillW = pillText ? textW(pillText, 22, "plex600") + 44 : 0;
  const plan = useMemo<ListPlan>(() => {
    const title = fitT(m.title || " ", B.w - cp - pillW - 24, 56 * k * 1.25 * 2, 56 * k, 28, 1.25, 2, "kufi700");
    const gridTop = Math.max(title.h, 46) + roleH + 30;
    const gridH = B.h - gridTop;
    const cols = n <= 3 ? 1 : 2;
    const rows = Math.max(1, Math.ceil(n / cols));
    const colGap = 64;
    const cw = cols === 1 ? B.w : (B.w - colGap) / 2;
    const one = cols === 1;
    const build = (s: number) => {
      const num = Math.max(30, (one ? 64 : 58) * k * s);
      const numW = Math.max(54, (one ? 96 : 84) * Math.max(0.7, s));
      const tw = cw - numW - 14;
      const pad = 16 * s + 6;
      const headS = Math.max(18, (one ? 40 : 33) * k * s);
      const head = items.map((it) => (hasHead(it) ? planAt(it.head, tw, headS, 1.25, 2, "kufi600") : shortHead(it) ? planAt(it.text, tw, headS, 1.25, 2, "kufi600") : null));
      const body = items.map((it) =>
        hasHead(it) ? planAt(it.body, tw, Math.max(15, (one ? 28 : 24) * k * s), 1.5, 4, "plex400") : shortHead(it) ? null : planAt(it.text, tw, Math.max(16, (one ? 32 : 27) * k * s), 1.45, 5, "plex500")
      );
      const rowH: number[] = [];
      for (let r = 0; r < rows; r++) {
        let rh = num * 1.2 + pad + 10;
        for (let c = 0; c < cols; c++) {
          const i = c * rows + r;
          if (i >= n) continue;
          rh = Math.max(rh, pad + (head[i] ? head[i]!.h + 4 : 0) + (body[i] ? body[i]!.h : 0) + 12 * s + 6);
        }
        rowH.push(rh);
      }
      return { num, numW, pad, head, body, rowH, total: rowH.reduce((a, b) => a + b, 0) };
    };
    const s = fitScale((x) => build(x).total, gridH, 0.45);
    const b = build(s);
    // الصفوف تملأ الشبكة كالنموذج (٣ صفوف بارتفاع واحد) ما دام في المساحة متسع، بلا مبالغة في التباعد
    const even = gridH / Math.max(rows, 3);
    const rowH = b.rowH.map((h) => Math.max(h, Math.min(even, h * 1.7)));
    const grown = rowH.reduce((a, x) => a + x, 0) <= gridH ? rowH : b.rowH;
    return { title, cols, rows, cw, gridTop, ...b, rowH: grown };
  }, [m, B, k, cp, pillW, roleH, n, items]);
  const colIdx = Array.from({ length: plan.cols }, (_, c) => Array.from({ length: plan.rows }, (_, r) => c * plan.rows + r).filter((i) => i < n));
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ paddingLeft: cp, gap: 12 }}>
        {role ? <RoleChip ctx={ctx} label={role.label} icon={role.icon} /> : null}
        <View style={{ flexDirection: ctx.row, alignItems: "flex-start", gap: 24 }}>
          <View style={{ flex: 1 }}>
            <PageTitle ctx={ctx} tp={plan.title} text={m.title} color={PAPER_INK} />
          </View>
          {pillText ? (
            <View style={{ paddingTop: Math.max(0, plan.title.size * 0.22) }}>
              <CountPill ctx={ctx} text={pillText} />
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ position: "absolute", top: plan.gridTop, left: 0, right: 0, flexDirection: ctx.row, gap: 64 }}>
        {colIdx.map((col, c) => (
          <View key={c} style={{ width: plan.cw }}>
            {col.map((i, r) => {
              const it = items[i];
              const next = items[i + 1]?.at ?? null;
              const lastInCol = r === col.length - 1;
              return (
                <DimAfter key={i} sv={ctx.sv} at={next} on={ctx.playing} style={{ height: plan.rowH[r] }}>
                  <Rise sv={ctx.sv} at={it.at} style={{ flex: 1, paddingTop: plan.pad }}>
                    {/* الخيط فوق كل نقطة، ولمسته الذهبية من جهة البداية */}
                    <Grow sv={ctx.sv} at={it.at} origin={originStart(isRTL)} style={styles.lsRule}>
                      <View style={[styles.lsAccent, isRTL ? { right: 0 } : { left: 0 }]} />
                    </Grow>
                    <View style={{ flexDirection: ctx.row, gap: 14 }}>
                      <View style={{ width: plan.numW }}>
                        <Text allowFontScaling={false} numberOfLines={1} style={[{ color: GOLD_INK, fontSize: plan.num, lineHeight: plan.num * 1.2, textAlign: ctx.align }, ctx.ff("amiri700")]}>
                          {folio(i + 1, lang)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        {plan.head[i] ? (
                          <T ctx={ctx} tp={plan.head[i]!} color={PAPER_INK} role="kufi600">
                            {hasHead(it) ? it.head : it.text}
                          </T>
                        ) : null}
                        {plan.body[i] ? (
                          <T ctx={ctx} tp={plan.body[i]!} color={plan.head[i] ? PAPER_DIM : PAPER_INK} role={plan.head[i] ? "plex400" : "plex500"}>
                            {plan.head[i] ? it.body : it.text}
                          </T>
                        ) : null}
                      </View>
                    </View>
                  </Rise>
                  {/* الخطوات: خيط يصل الأرقام، يُمدّ حين تبدأ الخطوة التالية */}
                  {steps && !lastInCol && next !== null ? (
                    <Grow
                      sv={ctx.sv}
                      at={next}
                      axis="y"
                      origin="50% 0%"
                      style={{
                        position: "absolute",
                        top: plan.pad + plan.num * 1.2 + 4,
                        height: Math.max(8, plan.rowH[r] - plan.num * 1.2 - 8),
                        width: 2,
                        backgroundColor: "rgba(126,92,30,0.45)",
                        ...(isRTL ? { right: plan.num * 0.62 } : { left: plan.num * 0.62 }),
                      }}
                    />
                  ) : null}
                </DimAfter>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ===== الصفحتان المتقابلتان: compare =====

export function ComparePage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL, lang } = ctx;
  const k = kOf(ctx);
  const cols = useMemo(() => (m.columns ?? []).slice(0, 2), [m]);
  const cp = cornerPad(ctx, B, B.top);
  const gapC = ctx.compact ? 100 : 136;
  const plan = useMemo(() => {
    const title = fitT(m.title || " ", B.w - cp, 60 * k * 1.25 * 2, 60 * k, 28, 1.25, 2, "kufi700");
    const colTop = title.h + 34;
    const colH = B.h - colTop;
    const cw = (B.w - gapC) / 2;
    const build = (s: number) => {
      const headSize = Math.min(...cols.map((c) => fitT(c.title || " ", cw, 80 * k * 1.2 * 2, 80 * k * Math.max(0.6, s), 24, 1.2, 2, "kufi700").size));
      const heads = cols.map((c) => planAt(c.title || " ", cw, headSize, 1.2, 2, "kufi700"));
      const size = Math.max(15, 27 * k * s);
      const padV = 8 + 8 * s;
      const its = cols.map((c) => c.items.map((it) => planAt(it.text, cw, size, 1.55, 5, "plex400")));
      const colsH = cols.map((_, ci) => heads[ci].h + 16 + its[ci].reduce((a, p) => a + p.h + padV * 2, 0));
      return { heads, its, padV, total: Math.max(0, ...colsH) };
    };
    const s = fitScale((x) => build(x).total, colH, 0.4);
    return { title, colTop, colH, cw, ...build(s) };
  }, [m, B, k, cp, gapC, cols]);
  const firstAt = (ci: number) => cols[ci]?.items[0]?.at ?? (ci ? 0.45 : 0.05);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ paddingLeft: cp }}>
        <PageTitle ctx={ctx} tp={plan.title} text={m.title} color={PAPER_INK} />
      </View>
      {/* الفاصل ينفتح من الوسط، والوسيط يُختم */}
      <Grow sv={ctx.sv} at={0} delay={500} ms={900} axis="y" origin="50% 50%" style={{ position: "absolute", top: plan.colTop, height: plan.colH, left: B.w / 2 - 1, width: 2 }}>
        <LinearGradient colors={["rgba(126,92,30,0)", GOLD_INK, GOLD_INK, "rgba(126,92,30,0)"]} locations={[0, 0.16, 0.84, 1]} style={StyleSheet.absoluteFill} />
      </Grow>
      <Stamp sv={ctx.sv} at={0} delay={900} style={[styles.med, { top: plan.colTop + plan.colH / 2 - 46, left: B.w / 2 - 46 }]}>
        <View style={styles.medIn}>
          <Ionicons name="swap-horizontal-outline" size={34} color={GOLD_INK} />
        </View>
      </Stamp>
      {cols.map((c, ci) => {
        const side = ci === 0 ? (isRTL ? { right: 0 } : { left: 0 }) : isRTL ? { left: 0 } : { right: 0 };
        return (
          <SideIn key={ci} sv={ctx.sv} at={ci ? Math.max(0, firstAt(1) - 0.03) : 0} delay={ci ? 0 : 300} side={ci ? "end" : "start"} isRTL={isRTL} style={[{ position: "absolute", top: plan.colTop, width: plan.cw, height: plan.colH }, side]}>
            {ctx.compact ? null : (
              <View style={[{ position: "absolute", top: -96 }, isRTL ? { left: 0 } : { right: 0 }]} pointerEvents="none">
                <GhostDigit text={toLocalDigits(ci + 1, lang)} ff={ctx.ff} />
              </View>
            )}
            <T ctx={ctx} tp={plan.heads[ci]} color={PAPER_INK} role="kufi700" style={{ marginBottom: 16 }}>
              {c.title}
            </T>
            {c.items.map((it, j) => (
              <Rise key={j} sv={ctx.sv} at={it.at} style={{ borderTopWidth: 1, borderColor: tone.rule, paddingVertical: plan.padV }}>
                <T ctx={ctx} tp={plan.its[ci][j]} color={PAPER_INK} role="plex400">
                  {hasHead(it) ? (
                    <>
                      <Text style={[{ color: GOLD_INK }, ctx.ff("plex700")]}>{it.head}: </Text>
                      {it.body}
                    </>
                  ) : (
                    it.text
                  )}
                </T>
              </Rise>
            ))}
          </SideIn>
        );
      })}
    </View>
  );
}

/** رقم شبحي مفرّغ ضخم خلف كل جانب (Amiri ٣٣٠، حد ٢) */
function GhostDigit({ text, ff }: { text: string; ff: SlideCtx["ff"] }) {
  const f = ff("amiri700");
  return (
    <Svg width={260} height={380}>
      <SvgText x={130} y={300} fontSize={330} fontFamily={f.fontFamily} fontWeight={f.fontWeight as never} fill="none" stroke="rgba(126,92,30,0.22)" strokeWidth={2} textAnchor="middle">
        {text}
      </SvgText>
    </Svg>
  );
}

// ===== صفحة المعجم: define =====

/** النص مع إبراز الكلمة المفتاحية (أميري عريض بذهب الورق) إن وردت فيه */
function withKeyword(ctx: SlideCtx, text: string, kw?: string) {
  if (!kw || kw.length >= text.length) return text;
  const i = text.indexOf(kw);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <Text style={[{ color: GOLD_INK }, ctx.ff("amiri700")]}>{kw}</Text>
      {text.slice(i + kw.length)}
    </>
  );
}

/** مدخل معجمي: الوسم (ختم) | خيط عمودي يُمدّ | النص بخط النسخ */
function Entry({ ctx, label, labelTp, text, tp, labelW, at }: { ctx: SlideCtx; label: string; labelTp: TP; text: React.ReactNode; tp: TP; labelW: number; at: number }) {
  return (
    <View style={{ flexDirection: ctx.row, gap: 30, minHeight: Math.max(tp.h, labelTp.h) }}>
      <Stamp sv={ctx.sv} at={at} style={{ width: labelW, paddingTop: 4 }}>
        <T ctx={ctx} tp={labelTp} color={GOLD_INK} role="kufi600">
          {label}
        </T>
      </Stamp>
      <Grow sv={ctx.sv} at={at} delay={100} axis="y" origin="50% 0%" style={{ width: 2 }}>
        <LinearGradient colors={[GOLD_INK, "rgba(126,92,30,0.12)"]} style={StyleSheet.absoluteFill} />
      </Grow>
      <Rise sv={ctx.sv} at={at} delay={250} style={{ flex: 1 }}>
        <T ctx={ctx} tp={tp} color={PAPER_INK} role="amiri400">
          {text}
        </T>
      </Rise>
    </View>
  );
}

export function DefinePage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL, t } = ctx;
  const k = kOf(ctx);
  const d = useMemo(() => m.define ?? { term: m.title, istilah: m.highlight ?? "" }, [m]);
  const cp = cornerPad(ctx, B, B.top);
  const labelW = ctx.compact ? 170 : 200;
  const extra = m.items;
  const plan = useMemo(() => {
    const title = fitT(d.term || m.title || " ", B.w - cp, 68 * k * 1.25 * 2, 68 * k, 30, 1.25, 2, "kufi700");
    const avail = B.h - title.h - 34;
    const tw = B.w - labelW - 2 - 60;
    const build = (s: number) => {
      // الوسمان بحجم واحد يتسع فيه أطولهما سطرًا واحدًا
      const base = Math.max(24, 44 * k * Math.max(0.65, s));
      const label = Math.min(...[t("video.s.lugha"), t("video.s.istilah")].map((x) => fitT(x, labelW, base * 1.35, base, 16, 1.35, 1, "kufi600").size));
      const size = Math.max(20, 52 * k * s);
      const lab1 = planAt(t("video.s.lugha"), labelW, label, 1.35, 1, "kufi600");
      const lab2 = planAt(t("video.s.istilah"), labelW, label, 1.35, 1, "kufi600");
      const lug = d.lugha ? planAt(d.lugha, tw, size, 1.62, 6, "amiri400") : null;
      const ist = planAt(d.istilah || " ", tw, size, 1.62, 8, "amiri400");
      const xs = Math.max(15, 24 * k * s);
      const ex = extra.map((it) => planAt(it.text, B.w, xs, 1.45, 3, "plex500"));
      const h =
        (lug ? Math.max(lug.h, lab1.h) + 36 * s + 1 + 36 * s : 0) +
        Math.max(ist.h, lab2.h) +
        (ex.length ? 24 + ex.reduce((a, p) => a + p.h + 8, 0) : 0);
      return { lab1, lab2, lug, ist, ex, gap: 36 * s, h };
    };
    const s = fitScale((x) => build(x).h, avail, 0.36);
    return { title, ...build(s) };
  }, [m, B, k, cp, labelW, d, extra, t]);
  const lughaAt = 0.06;
  const istAt = d.lugha ? 0.36 : 0.06;
  const glyph = ghostOf(d.term || m.title);
  return (
    <View style={StyleSheet.absoluteFill}>
      {glyph && !ctx.compact ? <Ghost glyph={glyph} size={780} color="rgba(18,20,46,0.045)" style={[{ top: -310 }, isRTL ? { left: -60 } : { right: -60 }]} ff={ctx.ff} /> : null}
      <View style={{ paddingLeft: cp }}>
        <PageTitle ctx={ctx} tp={plan.title} text={d.term || m.title} color={PAPER_INK} delay={200} />
      </View>
      <View style={{ marginTop: 34 }}>
        {plan.lug ? (
          <>
            <Entry ctx={ctx} label={ctx.t("video.s.lugha")} labelTp={plan.lab1} text={d.lugha} tp={plan.lug} labelW={labelW} at={lughaAt} />
            <Grow sv={ctx.sv} at={istAt - 0.02} origin={originStart(isRTL)} style={{ height: 1, backgroundColor: tone.rule, marginVertical: plan.gap }} />
          </>
        ) : null}
        <Entry ctx={ctx} label={ctx.t("video.s.istilah")} labelTp={plan.lab2} text={withKeyword(ctx, d.istilah, m.keyword)} tp={plan.ist} labelW={labelW} at={istAt} />
        {extra.length ? (
          <View style={{ marginTop: 24, gap: 8 }}>
            {extra.map((it, i) => (
              <Rise key={i} sv={ctx.sv} at={Math.max(it.at, 0.6 + (i * 0.25) / extra.length)}>
                <T ctx={ctx} tp={plan.ex[i]} color={PAPER_DIM} role="plex500">
                  {it.text}
                </T>
              </Rise>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ===== الاقتباس بخط النسخ: quote =====

export function QuotePage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL } = ctx;
  const k = kOf(ctx);
  const cp = cornerPad(ctx, B, B.top);
  const quote = m.highlight ?? "";
  const plan = useMemo(() => {
    const title = fitT(m.title || " ", B.w - cp, 56 * k * 1.25 * 2, 56 * k, 28, 1.25, 2, "kufi700");
    const avail = B.h - title.h - 30 - 50;
    const tw = B.w - 34 - 96;
    const build = (s: number) => {
      const size = Math.max(22, 58 * k * s);
      const q = planAt(quote || " ", tw, size, 1.62, 8, "amiri400");
      const xs = Math.max(15, 25 * k * s);
      const ex = m.items.map((it) => planAt(it.text, B.w - 40, xs, 1.45, 3, "plex500"));
      return { q, ex, mark: Math.max(70, 130 * s), h: q.h + (ex.length ? 26 + ex.reduce((a, p) => a + p.h + 8, 0) : 0) };
    };
    const s = fitScale((x) => build(x).h, avail, 0.4);
    return { title, ...build(s) };
  }, [m, B, k, cp, quote]);
  return (
    <View style={StyleSheet.absoluteFill}>
      {ctx.compact ? null : <Ghost glyph="”" size={780} color="rgba(18,20,46,0.045)" style={[{ top: -60 }, isRTL ? { left: 10 } : { right: 10 }]} ff={ctx.ff} />}
      <View style={{ paddingLeft: cp }}>
        <PageTitle ctx={ctx} tp={plan.title} text={m.title} color={GOLD_INK} />
      </View>
      <View style={{ flex: 1, justifyContent: "center", paddingBottom: 20 }}>
        <View style={{ marginTop: 30, flexDirection: ctx.row, gap: 30 }}>
          <Grow sv={ctx.sv} at={0} delay={500} axis="y" origin="50% 0%" style={{ width: 3, backgroundColor: GOLD_INK, borderRadius: 2 }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: ctx.row, gap: 14 }}>
              <Stamp sv={ctx.sv} at={0} delay={700} style={{ width: 70 }}>
                <Text allowFontScaling={false} numberOfLines={1} style={[{ color: GOLD_INK, fontSize: plan.mark, lineHeight: plan.mark * 1.1, textAlign: "center", marginTop: -plan.mark * 0.18 }, ctx.ff("amiri700")]}>
                  {isRTL ? "”" : "“"}
                </Text>
              </Stamp>
              <Rise sv={ctx.sv} at={0.04} style={{ flex: 1 }}>
                <T ctx={ctx} tp={plan.q} color={PAPER_INK} role="amiri400">
                  {withKeyword(ctx, quote, m.keyword)}
                </T>
              </Rise>
            </View>
            {m.items.length ? (
              <View style={{ marginTop: 26, gap: 8 }}>
                {m.items.map((it, i) => (
                  <Rise key={i} sv={ctx.sv} at={Math.max(it.at, 0.45)}>
                    <T ctx={ctx} tp={plan.ex[i]} color={PAPER_DIM} role="plex500">
                      {`— ${it.text}`}
                    </T>
                  </Rise>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

// ===== صفحة الحفظ: summary =====

export function SummaryPage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL } = ctx;
  const k = kOf(ctx);
  const kick = ctx.t("video.s.summary");
  // العنوان «الخلاصة» نفسه مكرر مع الحبة: يصير عنوان الوحدة
  const bigTitle = normText(m.title) === normText(kick) || !m.title ? ctx.unitTitle || m.title || kick : m.title;
  const panelW = ctx.compact ? 360 : 340;
  const listW = B.w - panelW - 70;
  const cp = cornerPad(ctx, B, B.top);
  const plan = useMemo(() => {
    const titleW = panelW - (isRTL ? 0 : cp);
    const note = m.highlight ? fitT(m.highlight, titleW, 29 * k * 1.5 * 4, 29 * k, 18, 1.5, 4, "amiri400") : null;
    const title = fitT(bigTitle, titleW, B.h - 46 - 24 - (note ? note.h + 24 : 0) - 20, 94 * k, 34, 1.18, 4, "kufi700");
    const items = m.items;
    const tw = listW - 56 - 22;
    const build = (s: number) => {
      const hs = Math.max(17, 28 * k * s);
      const bs = Math.max(16, 28 * k * s);
      const head = items.map((it) => (hasHead(it) ? planAt(it.head, tw, hs, 1.3, 2, "kufi600") : null));
      const body = items.map((it) => planAt(hasHead(it) ? it.body : it.text, tw, bs, 1.45, 4, "plex500"));
      const rowH = items.map((_, i) => Math.max(56 + 16, (head[i] ? head[i]!.h + 2 : 0) + body[i].h + 24 * Math.max(0.6, s)));
      return { head, body, rowH, total: rowH.reduce((a, b) => a + b, 0) };
    };
    const s = fitScale((x) => build(x).total, B.h, 0.4);
    const b = build(s);
    // صفوف القائمة تتسع كالنموذج (٤ صفوف بارتفاع ١١٣) ما دام في الصفحة متسع
    const even = B.h / Math.max(4, items.length);
    const rowH = b.rowH.map((h) => Math.max(h, Math.min(even, h * 1.6)));
    return { title, note, ...b, rowH: rowH.reduce((x, y) => x + y, 0) <= B.h ? rowH : b.rowH };
  }, [m, B, k, panelW, listW, isRTL, cp, bigTitle]);
  // الكعب الذهبي على حافة البداية للصفحة كلها (أو للورقة الداخلية في «منوّع»)
  const spineInset = B.left - (ctx.bare ? 56 : 0);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Grow
        sv={ctx.sv}
        at={0}
        delay={50}
        axis="y"
        origin="50% 0%"
        style={[{ position: "absolute", top: -(B.top - (ctx.bare ? 98 : 0)), bottom: -(720 - B.bottom - (ctx.bare ? 106 : 0)), width: 16 }, isRTL ? { right: -spineInset } : { left: -spineInset }]}
      >
        <LinearGradient colors={[C.spineTop, GOLD_INK]} style={StyleSheet.absoluteFill} />
      </Grow>
      <View style={{ flex: 1, flexDirection: ctx.row, gap: 35 }}>
        <View style={{ width: panelW, paddingLeft: isRTL ? 0 : cp, gap: 24, paddingTop: 8 }}>
          <Stamp sv={ctx.sv} at={0} delay={300} style={{ alignSelf: isRTL ? "flex-end" : "flex-start" }}>
            <Pill ctx={ctx} text={kick} size={21} color={GOLD} bg={PAPER_INK} />
          </Stamp>
          <PageTitle ctx={ctx} tp={plan.title} text={bigTitle} color={PAPER_INK} delay={450} />
          {plan.note ? (
            <Rise sv={ctx.sv} at={0} delay={1100}>
              <T ctx={ctx} tp={plan.note} color={PAPER_DIM} role="amiri400">
                {m.highlight}
              </T>
            </Rise>
          ) : null}
        </View>
        <Grow sv={ctx.sv} at={0} delay={800} axis="y" origin="50% 0%" style={{ width: 1.5, marginVertical: 10 }}>
          <LinearGradient colors={["rgba(126,92,30,0)", GOLD_INK, GOLD_INK, "rgba(126,92,30,0)"]} locations={[0, 0.18, 0.82, 1]} style={StyleSheet.absoluteFill} />
        </Grow>
        <View style={{ width: listW, justifyContent: "center" }}>
          {m.items.map((it, i) => (
            <Rise key={i} sv={ctx.sv} at={it.at} style={{ height: plan.rowH[i], flexDirection: ctx.row, alignItems: "center", gap: 22, borderBottomWidth: i < m.items.length - 1 ? 1 : 0, borderColor: "rgba(18,20,46,0.13)" }}>
              <View style={styles.smCircle}>
                <Tick sv={ctx.sv} at={it.at} delay={300} size={56} color={PAPER_INK} width={3} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {plan.head[i] ? (
                  <T ctx={ctx} tp={plan.head[i]!} color={GOLD_INK} role="kufi600">
                    {it.head}
                  </T>
                ) : null}
                <T ctx={ctx} tp={plan.body[i]} color={PAPER_INK} role="plex500">
                  {plan.head[i] ? it.body : it.text}
                </T>
              </View>
            </Rise>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lsRule: { position: "absolute", top: 0, left: 0, right: 0, height: 1.5, backgroundColor: "rgba(18,20,46,0.16)" },
  lsAccent: { position: "absolute", top: -0.5, width: 64, height: 2.5, backgroundColor: GOLD_INK },
  med: { position: "absolute", width: 92, height: 92, borderRadius: 46, backgroundColor: "#F0EADB", alignItems: "center", justifyContent: "center" },
  medIn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#F1EBDD", borderWidth: 1.5, borderColor: GOLD_INK, alignItems: "center", justifyContent: "center" },
  smCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.6, borderColor: GOLD_INK },
});

