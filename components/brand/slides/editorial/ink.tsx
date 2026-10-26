// components/brand/slides/editorial/ink.tsx
// صفحات الحبر في شكل المجلة: الغلاف (cover)، والرقم البطل (stat / range / seal)، والمجموعات والبطاقات
// (groups / cards)، وشجرة الأنواع (tree)، وصفحة «أسئلة الوحدة» (qIntro) — كما في النموذج ١-مجلة-تحريرية.html.
// كل الأحجام مقدّرة مسبقًا لتتسع (الطول الزائد بالأعمدة والتخطيط المرن ثم التصغير)، والمحتوى من ctx.m وحده،
// والحركة من مفردات kit.tsx (useTrigger/useLoop في shared). الجهة من ctx.isRTL، ومربع الزاوية محفوظ.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { normText, THINK_SECONDS, toLatinDigits, toLocalDigits, type Item } from "../../../../lib/slideThemeCore";
import { SceneMark, useLoop, type SlideCtx } from "../shared";
import {
  C,
  cornerPad,
  belowCorner,
  Counter,
  counterW,
  DIM,
  Fade,
  fitScale,
  fitT,
  folio,
  fromEnd,
  fromStart,
  GOLD,
  GOLD_DEEP,
  Grow,
  IVORY,
  originStart,
  OutlineNum,
  PageTitle,
  PAPER_INK,
  Pill,
  planAt,
  Pop,
  Rise,
  SealRing,
  SideIn,
  Stamp,
  T,
  textW,
  TONES,
  useCue,
  type Box,
  type TP,
} from "./kit";

const tone = TONES.ink;
const kOf = (ctx: SlideCtx) => (ctx.compact ? 1.12 : 1);

/** «رأس: شرح» → الرأس بالكوفي والشرح تحته؛ وبلا رأس النص كله */
const hasHead = (it: Item) => !!it.head && !!it.body;

/** الرقم في أول النص («١٨ شرطًا» → 18 و«شرطًا»)؛ غير ذلك null */
function leadNumber(s?: string): { n: number | null; rest: string } {
  const raw = (s ?? "").trim();
  const lat = toLatinDigits(raw);
  const mm = lat.match(/^(\d{1,6})(?![\d.,/:])\s*(.*)$/);
  if (!mm) return { n: null, rest: raw };
  return { n: Number(mm[1]), rest: raw.slice(raw.length - mm[2].length).trim() };
}

/** كلمة تمهيدية بخيط ذهبي (الغلاف والختام) */
function Kicker({ ctx, text, size, delay = 150 }: { ctx: SlideCtx; text: string; size: number; delay?: number }) {
  return (
    <Rise sv={ctx.sv} at={0} delay={delay} style={{ flexDirection: ctx.row, alignItems: "center", gap: 14 }}>
      <Grow sv={ctx.sv} at={0} delay={delay + 50} origin={originStart(ctx.isRTL)} style={{ width: 46, height: 2, backgroundColor: GOLD }} />
      <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[{ flexShrink: 1, color: GOLD, fontSize: size, lineHeight: size * 1.45, textAlign: ctx.align }, ctx.ff("plex600")]}>
        {text}
      </Text>
    </Rise>
  );
}

// ===== سطور الحقائق (سطور الغلاف، ونقاط صفحات الأرقام) =====

type FactPlan = { cols: number; cw: number; tp: TP[]; num: number; rowH: number[]; h: number };

function factPlan(items: Item[], W: number, k: number, maxH: number): FactPlan | null {
  const n = items.length;
  if (!n) return null;
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 28;
  const cw = (W - gap * (cols - 1)) / cols;
  const build = (s: number) => {
    const size = Math.max(15, 26 * k * s);
    const num = Math.max(22, 40 * k * s);
    const tw = cw - num * 1.25 - 16 - 30;
    const tp = items.map((it) => planAt(it.text, tw, size, 1.35, 3, "plex500"));
    const rowH: number[] = [];
    for (let r = 0; r < rows; r++) {
      let rh = num * 1.3;
      for (let c = 0; c < cols; c++) {
        const p = tp[r * cols + c];
        if (p) rh = Math.max(rh, p.h);
      }
      rowH.push(rh + 22);
    }
    return { tp, num, rowH, h: rowH.reduce((a, b) => a + b, 0) + 4 };
  };
  const s = fitScale((x) => build(x).h, maxH, 0.55);
  return { cols, cw, ...build(s) };
}

function FactLines({ ctx, items, plan, startAt }: { ctx: SlideCtx; items: Item[]; plan: FactPlan; startAt?: number }) {
  const rows: Item[][] = [];
  for (let i = 0; i < items.length; i += plan.cols) rows.push(items.slice(i, i + plan.cols));
  return (
    <View style={{ height: plan.h }}>
      <Grow sv={ctx.sv} at={startAt ?? 0} delay={startAt === undefined ? 1100 : 0} origin={originStart(ctx.isRTL)} style={{ height: 1.5 }}>
        <LinearGradient colors={[GOLD, "rgba(246,213,138,0.2)"]} start={{ x: ctx.isRTL ? 1 : 0, y: 0 }} end={{ x: ctx.isRTL ? 0 : 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Grow>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: ctx.row, gap: 28, height: plan.rowH[r] }}>
          {row.map((it, c) => {
            const i = r * plan.cols + c;
            const sep = c > 0 ? (ctx.isRTL ? { borderRightWidth: 1, paddingRight: 26 } : { borderLeftWidth: 1, paddingLeft: 26 }) : null;
            return (
              <Rise key={i} sv={ctx.sv} at={it.at} style={[{ width: plan.cw, paddingTop: 18, flexDirection: ctx.row, alignItems: "flex-start", gap: 16, borderColor: tone.rule }, sep]}>
                <Text allowFontScaling={false} numberOfLines={1} style={[{ color: GOLD, fontSize: plan.num, lineHeight: plan.num * 1.3 }, ctx.ff("amiri700")]}>
                  {folio(i + 1, ctx.lang)}
                </Text>
                <View style={{ flex: 1, paddingTop: plan.num * 0.12 }}>
                  <T ctx={ctx} tp={plan.tp[i]} color={IVORY} role="plex500">
                    {it.text}
                  </T>
                </View>
              </Rise>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ===== الغلاف =====

export function CoverPage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL } = ctx;
  const k = kOf(ctx);
  const sealSize = ctx.compact ? 150 : 200;
  const sealCol = sealSize + 44;
  const cp = cornerPad(ctx, B, B.top);
  const kicker = ctx.unitTitle && normText(ctx.unitTitle) !== normText(m.title) ? ctx.unitTitle : ctx.t("video.s.brand");
  const plan = useMemo(() => {
    const facts = factPlan(m.items, B.w, k, 200);
    const factsH = facts ? facts.h + 14 : 0;
    const mainW = B.w - sealCol - (isRTL ? 0 : cp);
    const kickH = 24 * k * 1.45 + 14;
    const mainH = B.h - factsH - 12;
    const sub = m.highlight ? fitT(m.highlight, mainW, 52 * k * 1.4 * 2, 52 * k, 24, 1.4, 2, "amiri400") : null;
    const title = fitT(m.title || " ", mainW, mainH - kickH - (sub ? sub.h + 18 : 0), 226 * k, 40, 1.14, 3, "kufi700");
    return { facts, mainW, title, sub };
  }, [m, B, k, sealCol, isRTL, cp]);
  const sealTop = isRTL ? belowCorner(ctx, B, 36) : 36;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ flex: 1, flexDirection: ctx.row }}>
        <View style={{ width: B.w - sealCol, paddingLeft: isRTL ? 0 : cp, justifyContent: "flex-start", gap: 14 }}>
          <Kicker ctx={ctx} text={kicker} size={24 * k} />
          <PageTitle ctx={ctx} tp={plan.title} text={m.title} color={IVORY} delay={300} />
          {plan.sub ? (
            <Rise sv={ctx.sv} at={0} delay={900} style={{ marginTop: 4 }}>
              <T ctx={ctx} tp={plan.sub} color={GOLD} role="amiri400">
                {m.highlight}
              </T>
            </Rise>
          ) : null}
        </View>
        <View style={{ width: sealCol, alignItems: "center", paddingTop: sealTop }}>
          <Stamp sv={ctx.sv} at={0} delay={600}>
            <SealRing size={sealSize} spin={!ctx.compact}>
              <SceneMark m={m} size={sealSize * 0.36} color={GOLD} />
            </SealRing>
          </Stamp>
        </View>
      </View>
      {plan.facts ? <FactLines ctx={ctx} items={m.items} plan={plan.facts} /> : null}
    </View>
  );
}

// ===== الرقم البطل: stat / range / seal =====

/** مسطرة الأيام: خط أساس وعلامة كل يوم، ونافذة from→to ذهبية تنمو، ومؤشر يمسحها */
function DayRuler({ ctx, W, H }: { ctx: SlideCtx; W: number; H: number }) {
  const r = ctx.m.range!;
  const { isRTL, lang } = ctx;
  const max = r.to <= 30 ? 30 : Math.min(60, Math.ceil(r.to / 10) * 10);
  const x0 = 34;
  const x1 = W - 34;
  const L = x1 - x0;
  const X = (d: number) => (isRTL ? x1 - (d / max) * L : x0 + (d / max) * L);
  const axisY = Math.round(H * 0.56);
  const every = max <= 30 ? 5 : 10;
  const near = (d: number) => Math.abs(d - r.from) < 2.5 || Math.abs(d - r.to) < 2.5;
  const labels: { d: number; hot: boolean }[] = [];
  for (let d = every; d <= max; d += every) if (!near(d) || d === r.from || d === r.to) labels.push({ d, hot: d === r.from || d === r.to });
  for (const d of [r.from, r.to]) if (!labels.some((l) => l.d === d)) labels.push({ d, hot: true });
  const a = X(r.from);
  const b = X(r.to);
  const bandL = Math.min(a, b);
  const bandW = Math.abs(b - a);
  // المؤشر يمسح النافذة ذهابًا وإيابًا بعد اكتمالها
  const scan = useLoop(3600, { enabled: ctx.playing });
  const cur = useCue(ctx.sv, 0.4, 400);
  const cs = useAnimatedStyle(() => ({ opacity: cur.value, transform: [{ translateX: (b - a) * scan.value }] }));
  const minT = `${ctx.t("video.s.min")} ${toLocalDigits(r.from, lang)}`;
  const maxT = `${ctx.t("video.s.max")} ${toLocalDigits(r.to, lang)}`;
  const two = bandW >= 330;
  const lblW = 300;
  const clampL = (x: number) => Math.max(0, Math.min(W - lblW, x - lblW / 2));
  const tickH = (d: number) => (d % every === 0 ? 20 : 10);
  return (
    <View style={{ width: W, height: H }}>
      <Fade sv={ctx.sv} at={0.16} style={StyleSheet.absoluteFill}>
        <Svg width={W} height={H}>
          {Array.from({ length: max + 1 }, (_, d) => (
            <Line key={d} x1={X(d)} x2={X(d)} y1={axisY - tickH(d)} y2={axisY} stroke={d % every === 0 ? "rgba(245,241,255,0.6)" : "rgba(245,241,255,0.32)"} strokeWidth={d % every === 0 ? 2 : 1.5} />
          ))}
        </Svg>
        {labels.map((l) => (
          <Text
            key={l.d}
            allowFontScaling={false}
            numberOfLines={1}
            style={[{ position: "absolute", top: axisY + 14, left: X(l.d) - 30, width: 60, textAlign: "center", color: l.hot ? GOLD : DIM, fontSize: 20, lineHeight: 28 }, ctx.ff(l.hot ? "plex700" : "plex500")]}
          >
            {toLocalDigits(l.d, lang)}
          </Text>
        ))}
      </Fade>
      <Grow sv={ctx.sv} at={0.12} origin={originStart(isRTL)} style={{ position: "absolute", left: x0, width: L, top: axisY - 1, height: 2, backgroundColor: "rgba(245,241,255,0.32)" }} />
      <Grow
        sv={ctx.sv}
        at={0.27}
        ms={1300}
        origin={originStart(isRTL)}
        style={{ position: "absolute", left: bandL, width: Math.max(18, bandW), top: axisY - 9, height: 18, borderRadius: 9, backgroundColor: GOLD }}
      />
      <Animated.View
        style={[
          { position: "absolute", left: a - 11, top: axisY - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFF6DC", borderWidth: 3, borderColor: C.inkTop },
          cs,
        ]}
      />
      <Fade sv={ctx.sv} at={0.32} style={StyleSheet.absoluteFill}>
        {two ? (
          <>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.rLbl, { left: clampL(a), width: lblW, top: axisY - 54, color: GOLD }, ctx.ff("kufi600")]}>
              {minT}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.rLbl, { left: clampL(b), width: lblW, top: axisY - 54, color: GOLD }, ctx.ff("kufi600")]}>
              {maxT}
            </Text>
          </>
        ) : (
          <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.rLbl, { left: Math.max(0, Math.min(W - 620, (a + b) / 2 - 310)), width: 620, top: axisY - 54, color: GOLD }, ctx.ff("kufi600")]}>
            {`${minT}  |  ${maxT}`}
          </Text>
        )}
      </Fade>
    </View>
  );
}

export function StatPage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL, lang } = ctx;
  const k = kOf(ctx);
  const tpl = m.template;
  const isSeal = tpl === "seal";
  const sealSize = isSeal ? (ctx.compact ? 180 : 230) : ctx.compact ? 140 : 190;
  const sealCol = sealSize + 40;
  const cp = cornerPad(ctx, B, B.top);
  const ruler = tpl === "range" && !!m.range?.ruler;
  const rulerH = ruler ? (ctx.compact ? 112 : 128) : 0;
  const plan = useMemo(() => {
    const mainW = B.w - sealCol - (isRTL ? 0 : cp);
    const facts = factPlan(m.items, B.w, k, ruler ? 120 : 170);
    const factsH = facts ? facts.h + 16 : 0;
    const title = fitT(m.title || " ", mainW, 54 * k * 1.25 * 2, 54 * k, 28, 1.25, 2, "kufi700");
    const heroH = Math.max(90, B.h - title.h - 22 - (ruler ? rulerH + 12 : 0) - factsH);
    // الرقم: المدى (مفرّغ – مُصمت + الوحدة) أو رقم يعدّ + وحدته، وإلا النص البارز
    const lead = tpl === "stat" ? leadNumber(m.highlight) : { n: null, rest: "" };
    let num = 0;
    let unit = "";
    let text: TP | null = null;
    if (tpl === "range" && m.range) {
      unit = m.range.unit;
      const f = toLocalDigits(m.range.from, lang);
      const t2 = toLocalDigits(m.range.to, lang);
      // العرض: الرقمان + الشرطة + الوحدة (ثلث الحجم) + الفواصل
      const perN = (f.length + t2.length) * 0.58 + (unit ? unit.length * 0.52 * 1.12 * 0.31 : 0);
      num = Math.max(56, Math.min(210 * k, heroH / 1.25, (mainW - 70 - 22 * 3) / Math.max(0.6, perN)));
    } else if (tpl === "stat" && lead.n !== null) {
      unit = lead.rest;
      const perN = String(lead.n).length * 0.58 + (unit ? unit.length * 0.52 * 1.12 * 0.31 : 0);
      num = Math.max(56, Math.min(210 * k, heroH / 1.25, (mainW - 22) / Math.max(0.6, perN)));
    } else if (isSeal) {
      text = m.highlight ? fitT(m.highlight, mainW, heroH, 46 * k, 22, 1.5, 5, "amiri400") : null;
    } else {
      text = fitT(m.highlight || m.title, mainW, heroH, 150 * k, 36, 1.3, 3, "amiri700");
    }
    // الوحدة سطر واحد بثلث الرقم (أو سطران إن طالت)
    const unitTp = unit ? fitT(unit, Math.max(160, mainW * 0.42), num * 0.62, Math.max(28, num * 0.31), 20, 1.3, 2, "kufi600") : null;
    return { mainW, facts, title, heroH, num, unit, unitTp, text, lead };
  }, [m, B, k, sealCol, isRTL, cp, ruler, rulerH, tpl, isSeal, lang]);
  const sealTop = isRTL ? belowCorner(ctx, B, isSeal ? 70 : 96) : isSeal ? 70 : 96;
  const year = m.seal?.year ?? "";
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ flex: 1, flexDirection: ctx.row }}>
        <View style={{ width: B.w - sealCol, paddingLeft: isRTL ? 0 : cp, gap: 22 }}>
          <PageTitle ctx={ctx} tp={plan.title} text={m.title} color={IVORY} />
          <View style={{ height: plan.heroH, justifyContent: "center" }}>
            {tpl === "range" && m.range ? (
              <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 22 }}>
                <Rise sv={ctx.sv} at={0} delay={500}>
                  <OutlineNum text={toLocalDigits(m.range.from, lang)} size={plan.num} color={GOLD} ff={ctx.ff} />
                </Rise>
                <Grow sv={ctx.sv} at={0} delay={900} origin={originStart(isRTL)} style={{ width: 70 * (plan.num / 210), minWidth: 30, height: Math.max(4, 7 * (plan.num / 210)), borderRadius: 4, backgroundColor: GOLD }} />
                <Rise sv={ctx.sv} at={0} delay={1000} style={Number.isInteger(m.range.to) ? { width: counterW(m.range.to, plan.num) } : null}>
                  {Number.isInteger(m.range.to) ? (
                    <Counter sv={ctx.sv} at={0} delay={1000} ms={1300} to={m.range.to} lang={lang} style={[styles.bigNum, { fontSize: plan.num, lineHeight: plan.num * 1.25 }, ctx.ff("amiri700")]} />
                  ) : (
                    <Text allowFontScaling={false} numberOfLines={1} style={[styles.bigNum, { fontSize: plan.num, lineHeight: plan.num * 1.25 }, ctx.ff("amiri700")]}>
                      {toLocalDigits(m.range.to, lang)}
                    </Text>
                  )}
                </Rise>
                {plan.unitTp ? (
                  <Rise sv={ctx.sv} at={0} delay={1500} style={{ flexShrink: 1, alignSelf: "flex-end", marginBottom: plan.num * 0.16 }}>
                    <T ctx={ctx} tp={plan.unitTp} color={IVORY} role="kufi600">
                      {plan.unit}
                    </T>
                  </Rise>
                ) : null}
              </View>
            ) : tpl === "stat" && plan.lead.n !== null ? (
              <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 22 }}>
                <Rise sv={ctx.sv} at={0} delay={500} style={{ width: counterW(plan.lead.n, plan.num) }}>
                  <Counter sv={ctx.sv} at={0} delay={500} ms={1200} to={plan.lead.n} lang={lang} style={[styles.bigNum, { fontSize: plan.num, lineHeight: plan.num * 1.25 }, ctx.ff("amiri700")]} />
                </Rise>
                {plan.unitTp ? (
                  <Rise sv={ctx.sv} at={0} delay={1100} style={{ flexShrink: 1, alignSelf: "flex-end", marginBottom: plan.num * 0.16 }}>
                    <T ctx={ctx} tp={plan.unitTp} color={IVORY} role="kufi600">
                      {plan.unit}
                    </T>
                  </Rise>
                ) : null}
              </View>
            ) : plan.text ? (
              <Rise sv={ctx.sv} at={0} delay={500}>
                <T ctx={ctx} tp={plan.text} color={GOLD} role={isSeal ? "amiri400" : "amiri700"}>
                  {isSeal ? m.highlight : m.highlight || m.title}
                </T>
              </Rise>
            ) : null}
          </View>
        </View>
        <View style={{ width: sealCol, alignItems: "center", paddingTop: sealTop }}>
          <Stamp sv={ctx.sv} at={0} delay={400}>
            <SealRing size={sealSize} spin={!ctx.compact}>
              {isSeal && year ? (
                <View style={{ alignItems: "center" }}>
                  <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[{ color: GOLD, fontSize: sealSize * 0.27, lineHeight: sealSize * 0.36 }, ctx.ff("amiri700")]}>
                    {toLocalDigits(year, lang)}
                  </Text>
                  <Text allowFontScaling={false} numberOfLines={1} style={[{ color: IVORY, fontSize: sealSize * 0.15, lineHeight: sealSize * 0.24 }, ctx.ff(lang === "ar" ? "amiri700" : "kufi600")]}>
                    {lang === "ar" ? "هـ" : "AH"}
                  </Text>
                </View>
              ) : (
                <SceneMark m={m} size={sealSize * 0.36} color={GOLD} />
              )}
            </SealRing>
          </Stamp>
        </View>
      </View>
      {ruler ? (
        <View style={{ height: rulerH, marginBottom: 12 }}>
          <DayRuler ctx={ctx} W={B.w} H={rulerH} />
        </View>
      ) : null}
      {plan.facts ? <FactLines ctx={ctx} items={m.items} plan={plan.facts} startAt={m.items[0]?.at} /> : null}
    </View>
  );
}

// ===== المجموعات والبطاقات =====

type CardPlan = { cols: number; cw: number; rowH: number[]; num: number; head: TP[]; body: (TP | null)[]; h: number; pad: number };

function cardsPlan(items: Item[], W: number, H: number, k: number, prefer: number): CardPlan {
  const n = Math.max(1, items.length);
  const gap = 18;
  const make = (cols: number) => {
    const rows = Math.ceil(n / cols);
    const cw = (W - gap * (cols - 1)) / cols;
    const build = (s: number): CardPlan => {
      const pad = Math.max(14, 24 * s);
      const num = Math.max(26, 50 * k * s);
      const tw = cw - pad * 2;
      const head = items.map((it) => (hasHead(it) ? planAt(it.head, tw, Math.max(18, 31 * k * s), 1.3, 2, "kufi600") : planAt(it.text, tw, Math.max(16, 25 * k * s), 1.45, 5, "plex500")));
      const body = items.map((it) => (hasHead(it) ? planAt(it.body, tw, Math.max(15, 20 * k * s), 1.4, 3, "plex400") : null));
      const rowH: number[] = [];
      for (let r = 0; r < rows; r++) {
        let rh = 0;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (i >= items.length) continue;
          rh = Math.max(rh, pad * 2 + num * 1.25 + 8 + head[i].h + (body[i] ? body[i]!.h + 6 : 0));
        }
        rowH.push(rh);
      }
      return { cols, cw, rowH, num, head, body, pad, h: rowH.reduce((a, b) => a + b, 0) + gap * (rows - 1) };
    };
    const s = fitScale((x) => build(x).h, H, 0.4);
    return { p: build(s), s };
  };
  // الشبكة المتوازنة أولًا (٣ ← صف واحد، ٤ ← ٢×٢، ٥–٦ ← ٣×٢)، وإن ضاقت جُرّبت غيرها
  let best = make(Math.min(prefer, n));
  if (best.s < 0.62) {
    for (let cols = 1; cols <= Math.min(3, n); cols++) {
      const c = make(cols);
      if (c.s > best.s + 0.04) best = c;
    }
  }
  // البطاقات تملأ المساحة كالنموذج (بلا مبالغة)
  const p = best.p;
  const rows = p.rowH.length;
  const even = (H - gap * (rows - 1)) / rows;
  const rowH = p.rowH.map((h) => Math.max(h, Math.min(even, h * 1.45)));
  return { ...p, rowH, h: rowH.reduce((a, b) => a + b, 0) + gap * (rows - 1) };
}

function CardGrid({ ctx, items, plan }: { ctx: SlideCtx; items: Item[]; plan: CardPlan }) {
  const rows: number[][] = [];
  for (let i = 0; i < items.length; i += plan.cols) rows.push(Array.from({ length: Math.min(plan.cols, items.length - i) }, (_, j) => i + j));
  return (
    <View style={{ gap: 18 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: ctx.row, gap: 18, height: plan.rowH[r] }}>
          {row.map((i) => {
            const it = items[i];
            return (
              <Pop key={i} sv={ctx.sv} at={it.at} style={[styles.card, { width: plan.cw, padding: plan.pad }]}>
                <View style={[styles.cardTab, fromStart(ctx.isRTL, plan.pad)]} />
                <Text allowFontScaling={false} numberOfLines={1} style={[{ color: GOLD, fontSize: plan.num, lineHeight: plan.num * 1.25, textAlign: ctx.align }, ctx.ff("amiri700")]}>
                  {toLocalDigits(i + 1, ctx.lang)}
                </Text>
                <View style={{ gap: 6 }}>
                  <T ctx={ctx} tp={plan.head[i]} color={IVORY} role={hasHead(it) ? "kufi600" : "plex500"}>
                    {hasHead(it) ? it.head : it.text}
                  </T>
                  {plan.body[i] ? (
                    <T ctx={ctx} tp={plan.body[i]!} color={DIM} role="plex400">
                      {it.body}
                    </T>
                  ) : null}
                </View>
              </Pop>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** نقاط بعدد الرقم تمتلئ واحدةً تلو الأخرى (كل ٦٥ مللي ثانية) — إشارة واحدة لكل النقاط */
function CountDots({ ctx, n, delay }: { ctx: SlideCtx; n: number; delay: number }) {
  const ms = 350 + n * 65;
  const v = useCue(ctx.sv, 0, ms, delay, true);
  return (
    <View style={{ flexDirection: ctx.row, gap: 9, flexWrap: "wrap" }}>
      {Array.from({ length: n }, (_, i) => (
        <Dot key={i} v={v} a={(i * 65) / ms} b={(i * 65 + 350) / ms} />
      ))}
    </View>
  );
}

function Dot({ v, a, b }: { v: ReturnType<typeof useCue>; a: number; b: number }) {
  const st = useAnimatedStyle(() => {
    const t = interpolate(v.value, [a, b], [0, 1], Extrapolation.CLAMP);
    return { opacity: 0.3 + 0.7 * t, transform: [{ scale: 0.55 + 0.45 * t }] };
  });
  return <Animated.View style={[{ width: 14, height: 14, borderRadius: 7, backgroundColor: GOLD }, st]} />;
}

/** groups: عدد كلي ضخم يعدّ + نقاط تمتلئ + بطاقات المجموعات؛ cards: البطاقات بعرض الصفحة */
export function CardsPage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, lang } = ctx;
  const k = kOf(ctx);
  const cp = cornerPad(ctx, B, B.top);
  const groups = m.template === "groups" && !!m.count;
  const role = roleBadge(ctx);
  const roleH = role ? 44 + 12 : 0;
  const plan = useMemo(() => {
    const title = fitT(m.title || " ", B.w - cp, 56 * k * 1.25 * 2, 56 * k, 28, 1.25, 2, "kufi700");
    const bodyH = B.h - title.h - 26 - roleH;
    const n = m.items.length;
    if (!groups) return { title, bodyH, np: 0, num: 0, unit: null as TP | null, cards: cardsPlan(m.items, B.w, bodyH, k, n <= 3 ? n : n === 4 ? 2 : 3) };
    const count = m.count ?? 0;
    const unitText = leadNumber(m.highlight).rest;
    // لوحة الرقم: أعرض ما يمكن ما دامت البطاقات تتسع، وإلا تضيق لصالحها
    let res = null as null | { np: number; num: number; unit: TP | null; cards: CardPlan };
    for (const np of [440, 380, 320, 260]) {
      const num = Math.max(90, Math.min(268 * k, bodyH * 0.55, (np - 10) / Math.max(1, String(count).length * 0.58)));
      const unit = unitText ? fitT(unitText, np, num * 0.5, Math.min(60 * k, num * 0.3), 22, 1.3, 2, "kufi600") : null;
      const cards = cardsPlan(m.items, B.w - np - 40, bodyH, k, n === 3 ? 1 : 2);
      res = { np, num, unit, cards };
      if (cards.h <= bodyH && cards.head.every((h) => h.size >= 18)) break;
    }
    return { title, bodyH, ...res! };
  }, [m, B, k, cp, groups, roleH]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ paddingLeft: cp, gap: 12 }}>
        {role ? <RoleChip ctx={ctx} label={role.label} icon={role.icon} /> : null}
        <PageTitle ctx={ctx} tp={plan.title} text={m.title} color={IVORY} />
      </View>
      <View style={{ marginTop: 26, height: plan.bodyH, flexDirection: ctx.row, gap: 40 }}>
        {groups ? (
          <View style={{ width: plan.np, gap: 14 }}>
            <View style={{ flexDirection: ctx.row, alignItems: "flex-end", gap: 18, flexWrap: "wrap" }}>
              <Rise sv={ctx.sv} at={0} delay={400} style={{ width: counterW(m.count!, plan.num) }}>
                <Counter sv={ctx.sv} at={0} delay={400} ms={1300} to={m.count!} lang={lang} style={[styles.bigNum, { fontSize: plan.num, lineHeight: plan.num * 1.25 }, ctx.ff("amiri700")]} />
              </Rise>
              {plan.unit ? (
                <Rise sv={ctx.sv} at={0} delay={1100} style={{ flexShrink: 1, marginBottom: plan.num * 0.18 }}>
                  <T ctx={ctx} tp={plan.unit} color={IVORY} role="kufi600">
                    {leadNumber(m.highlight).rest}
                  </T>
                </Rise>
              ) : null}
            </View>
            <CountDots ctx={ctx} n={Math.min(12, m.count!)} delay={750} />
          </View>
        ) : null}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <CardGrid ctx={ctx} items={m.items} plan={plan.cards} />
        </View>
      </View>
    </View>
  );
}

// ===== شجرة الأنواع =====

type TreeNodePlan = { tp: TP; cardH: number; leaves: TP[]; lrows: number[]; stackH: number; band: number };

/** الجذر = موضوع التقسيم («أنواع التنفيذ» → «التنفيذ») */
function rootText(title: string): string {
  const r = title.replace(/^\s*(أنواع|انواع|أقسام|اقسام|تقسيمات|تقسيم|types of|kinds of)\s+/i, "").trim();
  return r || title;
}

/** وصلة منحنية بين عمودين (Svg صغير) تُرسم من جهة المصدر بـ scaleX */
function Link({ ctx, x, w, y0, y1, at, delay = 0 }: { ctx: SlideCtx; x: number; w: number; y0: number; y1: number; at: number; delay?: number }) {
  const top = Math.min(y0, y1) - 7;
  const h = Math.abs(y1 - y0) + 14;
  const xs = ctx.isRTL ? w : 0;
  const xt = ctx.isRTL ? 0 : w;
  const ys = y0 - top;
  const yt = y1 - top;
  const xm = w / 2;
  return (
    <Grow sv={ctx.sv} at={at} delay={delay} ms={800} origin={ctx.isRTL ? "100% 50%" : "0% 50%"} style={{ position: "absolute", left: x, top, width: w, height: h }}>
      <Svg width={w} height={h}>
        <Path d={`M ${xs} ${ys} C ${xm} ${ys}, ${xm} ${yt}, ${xt} ${yt}`} stroke={GOLD} strokeOpacity={0.78} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Circle cx={xt + (ctx.isRTL ? 4 : -4)} cy={yt} r={4.5} fill={GOLD} />
      </Svg>
    </Grow>
  );
}

/** عقدة نوع: تتوهج ما دام الراوي يشرحها (حلقة واحدة مشتركة للصفحة) */
function NodeCard({ ctx, nd, tp, w, h, at, next, loop }: { ctx: SlideCtx; nd: { title: string }; tp: TP; w: number; h: number; at: number; next: number; loop: ReturnType<typeof useLoop> }) {
  const sv = ctx.sv;
  const on = ctx.playing;
  const g = useAnimatedStyle(() => {
    const cur = on && sv.value >= at && sv.value < next ? 1 : 0;
    return { opacity: cur * (0.4 + 0.6 * loop.value) };
  });
  return (
    <SideIn sv={sv} at={at} isRTL={ctx.isRTL} style={[styles.node, { width: w, height: h }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.nodeGlow, g]} />
      <T ctx={ctx} tp={tp} color={IVORY} role="kufi600" align="center">
        {nd.title}
      </T>
    </SideIn>
  );
}

export function TreePage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL, lang } = ctx;
  const k = kOf(ctx);
  const cp = cornerPad(ctx, B, B.top);
  const nodes = useMemo(() => (m.tree?.nodes ?? []).slice(0, 4), [m]);
  const loop = useLoop(1300, { enabled: ctx.playing });
  const plan = useMemo(() => {
    const title = fitT(m.title || " ", B.w - cp, 60 * k * 1.25 * 2, 60 * k, 28, 1.25, 2, "kufi700");
    const subH = 22 * k * 1.4;
    const AT = title.h + 10 + subH + 24;
    const AH = Math.max(120, B.h - AT);
    const hasLeaves = nodes.some((n) => n.leaves.length);
    const rootW = ctx.compact ? 190 : 200;
    const gapL = 64;
    const nodeW = hasLeaves ? (ctx.compact ? 230 : 250) : Math.min(460, B.w - rootW - gapL);
    const leavesW = hasLeaves ? B.w - rootW - nodeW - gapL * 2 : 0;
    const build = (s: number, leafCols: number) => {
      const ns = Math.max(18, 34 * k * s);
      const ls = Math.max(15, 23 * k * s);
      const pad = 12 * s + 8;
      // الورقة بعرض النص لا بعرض العمود كله (حتى ٤٢٠)، والطويل يأخذ العمود
      const longest = Math.max(0, ...nodes.flatMap((n) => n.leaves.map((l) => l.length)));
      const lw = leafCols === 2 ? (leavesW - 10) / 2 : Math.min(leavesW, Math.max(300, Math.min(420, longest * 0.5 * ls + 60)));
      const ps: TreeNodePlan[] = nodes.map((nd) => {
        const tp = planAt(nd.title, nodeW - 28, ns, 1.25, 3, "kufi600");
        const cardH = Math.max(60, tp.h + pad * 2);
        const leaves = nd.leaves.map((l) => planAt(l, lw - 32, ls, 1.4, 4, "plex500"));
        const lrows: number[] = [];
        for (let r = 0; r < Math.ceil(leaves.length / leafCols); r++) {
          let rh = 0;
          for (let c = 0; c < leafCols; c++) {
            const p = leaves[r * leafCols + c];
            if (p) rh = Math.max(rh, p.h + 12 + 6 * s);
          }
          lrows.push(rh);
        }
        const stackH = lrows.reduce((a, b) => a + b, 0) + 7 * Math.max(0, lrows.length - 1);
        return { tp, cardH, leaves, lrows, stackH, band: Math.max(cardH, stackH) };
      });
      const total = ps.reduce((a, p) => a + p.band, 0) + 16 * Math.max(0, ps.length - 1);
      return { ps, total, lw, leafCols };
    };
    let pick = null as null | ReturnType<typeof build>;
    for (const leafCols of leavesW >= 460 ? [1, 2] : [1]) {
      const s = fitScale((x) => build(x, leafCols).total, AH, 0.4);
      const p = build(s, leafCols);
      if (!pick || (p.total <= AH && (pick.total > AH || s >= 0.55))) pick = p;
      if (p.total <= AH && s >= 0.55) break;
    }
    const root = fitT(rootText(m.tree?.root || m.title), rootW - 28, 42 * k * 1.2 * 2, 42 * k, 20, 1.2, 2, "kufi700");
    const rootH = Math.max(84, root.h + 28);
    return { title, AT, AH, rootW, gapL, nodeW, leavesW, root, rootH, ...pick! };
  }, [m, B, k, cp, nodes, ctx.compact]);
  const { AH, rootW, gapL, nodeW, ps, total, lw, leafCols } = plan;
  // مواضع بإحداثي «من البداية» ثم إلى يسار فعلي
  const L = (s: number, w: number) => (isRTL ? B.w - s - w : s);
  const y0 = Math.max(0, (AH - total) / 2);
  let y = y0;
  const geo = ps.map((p) => {
    const top = y;
    y += p.band + 16;
    const nodeTop = top + (p.band - p.cardH) / 2;
    const stackTop = top + (p.band - p.stackH) / 2;
    const leafTops: number[] = [];
    let ly = stackTop;
    for (const rh of p.lrows) {
      leafTops.push(ly);
      ly += rh + 7;
    }
    return { nodeTop, cy: nodeTop + p.cardH / 2, leafTops };
  });
  const rootTop = Math.max(0, Math.min(AH - plan.rootH, y0 + (total - plan.rootH) / 2));
  const rootCY = rootTop + plan.rootH / 2;
  const ats = nodes.map((_, i) => m.items[i]?.at ?? 0.05 + i * 0.2);
  const leafStart = rootW + gapL + nodeW + gapL;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ paddingLeft: cp, gap: 10 }}>
        <PageTitle ctx={ctx} tp={plan.title} text={m.title} color={IVORY} />
        <Fade sv={ctx.sv} at={0} delay={600}>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ color: DIM, fontSize: 22 * kOf(ctx), lineHeight: 22 * kOf(ctx) * 1.4, textAlign: ctx.align }, ctx.ff("plex500")]}>
            {`${toLocalDigits(nodes.length, lang)} ${ctx.t("video.s.kind.types")}`}
          </Text>
        </Fade>
      </View>
      <View style={{ position: "absolute", top: plan.AT, left: 0, right: 0, height: AH }}>
        {/* الوصلات أولًا (تحت العقد) */}
        {geo.map((g, i) => (
          <Link key={`r${i}`} ctx={ctx} x={L(rootW, gapL)} w={gapL} y0={rootCY} y1={g.cy} at={Math.max(0, ats[i] - 0.03)} />
        ))}
        {ps.map((p, i) =>
          p.lrows.map((rh, r) => {
            const next = ats[i + 1] ?? 0.95;
            const step = Math.min(0.05, Math.max(0.01, (next - ats[i]) / (p.leaves.length + 1)));
            return <Link key={`l${i}-${r}`} ctx={ctx} x={L(rootW + gapL + nodeW, gapL)} w={gapL} y0={geo[i].cy} y1={geo[i].leafTops[r] + rh / 2} at={ats[i] + step * (r * leafCols + 1) - 0.02} />;
          })
        )}
        <Stamp sv={ctx.sv} at={0} delay={400} style={[styles.root, { left: L(0, rootW), top: rootTop, width: rootW, height: plan.rootH }]}>
          <LinearGradient colors={[C.goldPale, GOLD, GOLD_DEEP]} locations={[0, 0.45, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
          <T ctx={ctx} tp={plan.root} color={PAPER_INK} role="kufi700" align="center">
            {rootText(m.tree?.root || m.title)}
          </T>
        </Stamp>
        {ps.map((p, i) => (
          <View key={`n${i}`} style={{ position: "absolute", left: L(rootW + gapL, nodeW), top: geo[i].nodeTop }}>
            <NodeCard ctx={ctx} nd={nodes[i]} tp={p.tp} w={nodeW} h={p.cardH} at={ats[i]} next={ats[i + 1] ?? 2} loop={loop} />
          </View>
        ))}
        {ps.map((p, i) => {
          const next = ats[i + 1] ?? 0.95;
          const step = Math.min(0.05, Math.max(0.01, (next - ats[i]) / (p.leaves.length + 1)));
          return p.leaves.map((tp, j) => {
            const r = Math.floor(j / leafCols);
            const c = j % leafCols;
            const s0 = leafStart + c * (lw + 10);
            const leaf = (
              <SideIn
                key={`f${i}-${j}`}
                sv={ctx.sv}
                at={ats[i] + step * (j + 1)}
                side="end"
                isRTL={isRTL}
                style={[styles.leaf, { position: "absolute", left: L(s0, lw), top: geo[i].leafTops[r], width: lw, height: p.lrows[r] }]}
              >
                <T ctx={ctx} tp={tp} color={IVORY} role="plex500">
                  {nodes[i].leaves[j]}
                </T>
              </SideIn>
            );
            if (c === 0) return leaf;
            // الورقة الثانية في الصف موصولة بالأولى بخيط قصير
            return (
              <React.Fragment key={`f${i}-${j}`}>
                <View style={{ position: "absolute", left: L(s0 - 10, 10), top: geo[i].leafTops[r] + p.lrows[r] / 2 - 1, width: 10, height: 2, backgroundColor: "rgba(246,213,138,0.6)" }} />
                {leaf}
              </React.Fragment>
            );
          });
        })}
      </View>
    </View>
  );
}

// ===== «أسئلة الوحدة»: الصفحة الأخيرة =====

/** مواضع نجوم الكوكبة (حتمية): خط متعرج من أعلى البداية إلى أسفل النهاية */
function starPoints(n: number, w: number, h: number, isRTL: boolean) {
  const pts: { x: number; y: number }[] = [];
  let seed = 977 + n * 131;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const xs = 40 + t * (w - 80) + (rnd() - 0.5) * 30;
    const zig = (i % 2 ? 1 : -1) * (24 + rnd() * 34);
    const yy = 40 + t * (h - 90) + zig;
    pts.push({ x: isRTL ? w - xs : xs, y: Math.max(20, Math.min(h - 24, yy)) });
  }
  return pts;
}

function StarLine({ ctx, a, b, delay }: { ctx: SlideCtx; a: { x: number; y: number }; b: { x: number; y: number }; delay: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const v = useCue(ctx.sv, 0, 450, delay);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${ang}rad` }, { scaleX: v.value }] }));
  return <Animated.View style={[{ position: "absolute", left: a.x, top: a.y - 0.8, width: len, height: 1.6, backgroundColor: "rgba(246,213,138,0.55)", transformOrigin: "0% 50%" }, st]} />;
}

function Star({ ctx, p, delay, last }: { ctx: SlideCtx; p: { x: number; y: number }; delay: number; last: boolean }) {
  const breathe = useLoop(1200, { enabled: last && ctx.playing });
  const halo = useAnimatedStyle(() => ({ opacity: last ? 0.9 - 0.55 * breathe.value : 1, transform: [{ scale: last ? 1 + 0.6 * breathe.value : 1 }] }));
  const r = last ? 20 : 16;
  const c = last ? 9 : 6.5;
  return (
    <Pop sv={ctx.sv} at={0} delay={delay} from={0.4} style={{ position: "absolute", left: p.x - r, top: p.y - r, width: r * 2, height: r * 2, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: r * 2, height: r * 2, borderRadius: r, backgroundColor: "rgba(246,213,138,0.16)" }, halo]} />
      <View style={{ width: c * 2, height: c * 2, borderRadius: c, backgroundColor: GOLD }} />
    </Pop>
  );
}

/** زر ذهبي بلمعة كل ٣٫٦ ثانية (للعرض فقط: الإطار لا يستقبل اللمس) */
function GoldPill({ ctx, text, size }: { ctx: SlideCtx; text: string; size: number }) {
  const sheen = useLoop(3600, { reverse: false, easing: Easing.linear, enabled: ctx.playing });
  const h = size * 2.45;
  const w = Math.min(560, textW(text, size, "kufi700") + size * 4.2);
  const sign = ctx.isRTL ? -1 : 1;
  const st = useAnimatedStyle(() => {
    const t = interpolate(sheen.value, [0, 0.4, 1], [0, 1, 1], Extrapolation.CLAMP);
    return { transform: [{ translateX: sign * (t * (w + 240) - 160) }, { skewX: "-18deg" }] };
  });
  return (
    <View style={[styles.goldBtn, { height: h, width: w, flexDirection: ctx.row, gap: size * 0.5, paddingHorizontal: size * 1.1 }]}>
      <LinearGradient colors={[C.goldPale, GOLD, GOLD_DEEP]} locations={[0, 0.5, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: 120 }, ctx.isRTL ? { right: 0 } : { left: 0 }, st]}>
        <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Ionicons name="hourglass-outline" size={size * 1.1} color={PAPER_INK} />
      <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[{ flexShrink: 1, color: PAPER_INK, fontSize: size, lineHeight: size * 1.4 }, ctx.ff("kufi700")]}>
        {text}
      </Text>
    </View>
  );
}

export function QIntroPage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL, lang } = ctx;
  const k = kOf(ctx);
  const constW = ctx.compact ? 330 : 440;
  const mainW = B.w - constW - 40;
  const cp = cornerPad(ctx, B, B.top);
  const kicker = ctx.unitTitle || ctx.t("video.s.brand");
  const pill = ctx.t("video.s.thinkSecs", { n: toLocalDigits(THINK_SECONDS, lang) });
  const plan = useMemo(() => {
    const w = mainW - (isRTL ? 0 : cp);
    const title = fitT(m.title || " ", w, 60 * k * 1.25 * 2, 60 * k, 28, 1.25, 2, "kufi700");
    const sub = m.highlight ? fitT(m.highlight, w, 31 * k * 1.4 * 2, 31 * k, 18, 1.4, 2, "amiri400") : null;
    const pillH = 27 * k * 2.45;
    const avail = B.h - (22 * k * 1.45 + 14) - title.h - (sub ? sub.h + 10 : 0) - pillH - 26 * 3;
    const items = m.items;
    const need = (s: number) => items.reduce((a, it) => a + Math.max(52 * s, planAt(it.text, w - 56, Math.max(16, 26 * k * s), 1.35, 3, "plex500").h + 18), 0);
    const s = fitScale(need, avail, 0.5);
    const size = Math.max(16, 26 * k * s);
    const tps = items.map((it) => planAt(it.text, w - 56, size, 1.35, 3, "plex500"));
    const rowH = tps.map((tp) => Math.max(52 * s, tp.h + 18));
    return { w, title, sub, tps, rowH };
  }, [m, B, k, mainW, isRTL, cp]);
  const n = Math.max(3, Math.min(12, ctx.index || 3));
  const cTop = isRTL ? belowCorner(ctx, B, 24) : 24;
  const cH = Math.max(200, Math.min(430, B.h - cTop - 20));
  const pts = useMemo(() => starPoints(n, constW, cH, isRTL), [n, constW, cH, isRTL]);
  return (
    <View style={StyleSheet.absoluteFill}>
      {ctx.compact ? null : (
        <View style={{ position: "absolute", top: cTop, width: constW, height: cH, ...fromEnd(isRTL, 0) }}>
          {pts.slice(1).map((p, i) => (
            <StarLine key={`l${i}`} ctx={ctx} a={pts[i]} b={p} delay={550 + i * 250} />
          ))}
          {pts.map((p, i) => (
            <Star key={`s${i}`} ctx={ctx} p={p} delay={400 + i * 250} last={i === pts.length - 1} />
          ))}
        </View>
      )}
      <View style={[{ width: ctx.compact ? B.w : mainW, gap: 14, paddingLeft: isRTL ? 0 : cp }, ctx.compact ? { paddingLeft: cp } : fromStart(isRTL, 0), { position: "absolute", top: 0, bottom: 0 }]}>
        <Kicker ctx={ctx} text={kicker} size={22 * k} delay={200} />
        <PageTitle ctx={ctx} tp={plan.title} text={m.title} color={IVORY} delay={350} />
        {plan.sub ? (
          <Rise sv={ctx.sv} at={0} delay={900}>
            <T ctx={ctx} tp={plan.sub} color={GOLD} role="amiri400">
              {m.highlight}
            </T>
          </Rise>
        ) : null}
        <View style={{ marginTop: 12 }}>
          {m.items.map((it, i) => (
            <SideIn key={i} sv={ctx.sv} at={it.at} isRTL={isRTL} style={{ height: plan.rowH[i], flexDirection: ctx.row, alignItems: "center", gap: 16, borderBottomWidth: 1, borderColor: "rgba(245,241,255,0.10)" }}>
              <View style={styles.qNum}>
                <Text allowFontScaling={false} numberOfLines={1} style={[{ color: GOLD, fontSize: 22, lineHeight: 30 }, ctx.ff("amiri700")]}>
                  {toLocalDigits(i + 1, lang)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <T ctx={ctx} tp={plan.tps[i]} color={IVORY} role="plex500">
                  {it.text}
                </T>
              </View>
            </SideIn>
          ))}
        </View>
        <Rise sv={ctx.sv} at={0} delay={2000} style={{ marginTop: 18, alignItems: isRTL ? "flex-end" : "flex-start" }}>
          <GoldPill ctx={ctx} text={pill} size={27 * k} />
        </Rise>
      </View>
    </View>
  );
}

// ===== شارة الدور (سؤال ختامي / تمرين) على صفحات غير السؤال =====

export function roleBadge(ctx: SlideCtx): { label: string; icon: keyof typeof Ionicons.glyphMap } | null {
  if (ctx.m.role === "finalEx") return { label: ctx.t("video.s.exercise"), icon: "document-text-outline" };
  if (ctx.m.role === "finalQ") return { label: ctx.t("video.s.finalQ"), icon: "school-outline" };
  return null;
}

export function RoleChip({ ctx, label, icon, dark }: { ctx: SlideCtx; label: string; icon: keyof typeof Ionicons.glyphMap; dark?: boolean }) {
  return (
    <Stamp sv={ctx.sv} at={0} delay={200} style={{ alignSelf: ctx.isRTL ? "flex-end" : "flex-start" }}>
      <Pill ctx={ctx} text={label} size={21} color={GOLD} bg={dark === false ? undefined : PAPER_INK} border={dark === false ? GOLD : undefined} icon={<Ionicons name={icon} size={22} color={GOLD} />} />
    </Stamp>
  );
}

const styles = StyleSheet.create({
  rLbl: { position: "absolute", textAlign: "center", fontSize: 22, lineHeight: 30 },
  bigNum: { color: GOLD, textAlign: "center", textShadowColor: "rgba(246,213,138,0.24)", textShadowRadius: 30, textShadowOffset: { width: 0, height: 12 } },
  card: { borderRadius: 20, backgroundColor: C.cardInk, borderWidth: 1, borderColor: "rgba(246,213,138,0.18)", justifyContent: "space-between", overflow: "hidden" },
  cardTab: { position: "absolute", top: 0, width: 44, height: 3, backgroundColor: GOLD, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  node: { borderRadius: 18, backgroundColor: "#151838", borderWidth: 1, borderColor: "rgba(245,241,255,0.12)", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  nodeGlow: { borderRadius: 18, borderWidth: 2, borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  root: { position: "absolute", borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  leaf: { borderRadius: 18, backgroundColor: "rgba(21,24,56,0.6)", borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(246,213,138,0.5)", paddingHorizontal: 16, justifyContent: "center" },
  goldBtn: { borderRadius: 999, overflow: "hidden", alignItems: "center", justifyContent: "center", shadowColor: GOLD, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 12 } },
  qNum: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(246,213,138,0.6)", alignItems: "center", justifyContent: "center" },
});

