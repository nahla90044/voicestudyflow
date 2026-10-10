// components/brand/coach-mark.tsx
// إرشاد على عناصر الشاشة: الشاشة تعتم بطبقة شفافة، وفتحة مضيئة حول العنصر (دائرة أو
// مستطيل مدوّر) مع حلقة تنبض، وبطاقة شرح فوقه/تحته بسهم يشير إليه.
// useCoachTour: جولة بخطوات لكل شاشة، تظهر مرة واحدة (مفتاح محفوظ)، ولا تتزاحم جولتان معًا.
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, Mask, Rect } from "react-native-svg";

import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";

export type CoachRect = { x: number; y: number; w: number; h: number; shape?: "circle" | "rect" };
export type CoachRow = { icon: keyof typeof Ionicons.glyphMap; text: string };

type Props = {
  target: CoachRect | null;
  title: string;
  body: string;
  rows?: CoachRow[];
  doneLabel: string;
  onDone: () => void;
  /** الضغط على العنصر المضيء نفسه */
  onTarget?: () => void;
  /** «٢ من ٥» في الجولات متعددة الخطوات */
  stepLabel?: string;
  /** تخطّي بقية الجولة */
  onSkip?: () => void;
  skipLabel?: string;
};

const PAD = 10; // هامش الفتحة حول العنصر

export function CoachMark({ target, title, body, rows = [], doneLabel, onDone, onTarget, stepLabel, onSkip, skipLabel }: Props) {
  const { pal } = useScene();
  const dir = useDir();
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!target) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [target, fade, pulse]);

  if (!target) return null;
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const isRect = target.shape === "rect";
  const r = isRect ? target.h / 2 + PAD : Math.max(target.w, target.h) / 2 + PAD;
  // الفتحة: دائرة، أو مستطيل مدوّر بحجم العنصر
  const hx = isRect ? target.x - PAD : cx - r;
  const hy = isRect ? target.y - PAD : cy - r;
  const hw = isRect ? target.w + PAD * 2 : r * 2;
  const hh = isRect ? target.h + PAD * 2 : r * 2;
  const hr = isRect ? Math.min(22, hh / 2) : r;
  // البطاقة فوق العنصر (أو تحته إن كان في أعلى الشاشة)
  const above = cy > height * 0.45;
  const cardW = Math.min(340, width - 32);
  const cardLeft = Math.min(Math.max(16, cx - cardW / 2), width - cardW - 16);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {/* طبقة معتمة شفافة بفتحة دائرية حول العنصر */}
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="hole">
              <Rect x={0} y={0} width={width} height={height} fill="#fff" />
              {isRect ? <Rect x={hx} y={hy} width={hw} height={hh} rx={hr} fill="#000" /> : <Circle cx={cx} cy={cy} r={r} fill="#000" />}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="rgba(6,10,20,0.72)" mask="url(#hole)" />
        </Svg>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityLabel={doneLabel} />

        {/* حلقة تنبض حول العنصر + الضغط عليه ينفّذ أمره */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              left: hx,
              top: hy,
              width: hw,
              height: hh,
              borderRadius: hr,
              borderColor: pal.accent,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, isRect ? 1.08 : 1.45] }) }],
            },
          ]}
        />
        <Pressable
          onPress={onTarget ?? onDone}
          style={{ position: "absolute", left: hx, top: hy, width: hw, height: hh, borderRadius: hr }}
          accessibilityLabel={title}
        />

        {/* بطاقة الشرح بسهم يشير للعنصر */}
        <View
          style={[
            styles.card,
            { width: cardW, left: cardLeft, backgroundColor: pal.card, borderColor: pal.cardBorder },
            above ? { bottom: height - hy + 18 } : { top: hy + hh + 18 },
          ]}
        >
          <View
            style={[
              styles.arrow,
              { left: Math.min(Math.max(18, cx - cardLeft - 9), cardW - 36), backgroundColor: pal.card },
              above ? { bottom: -7 } : { top: -7 },
            ]}
          />
          {stepLabel ? <Text style={[styles.step, { color: pal.accent, textAlign: dir.textAlign }]}>{stepLabel}</Text> : null}
          <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]}>{title}</Text>
          <Text style={[styles.body, { color: pal.dim, textAlign: dir.textAlign }]}>{body}</Text>
          {rows.map((row) => (
            <View key={row.text} style={[styles.row, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
              <Ionicons name={row.icon} size={17} color={pal.accent} />
              <Text style={[styles.rowTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{row.text}</Text>
            </View>
          ))}
          <View style={[styles.btnRow, { flexDirection: dir.row }]}>
            <Pressable onPress={onDone} style={[styles.btn, { backgroundColor: pal.accent }]}>
              <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{doneLabel}</Text>
            </Pressable>
            {onSkip && skipLabel ? (
              <Pressable onPress={onSkip} hitSlop={8} style={styles.skip}>
                <Text style={[styles.skipTxt, { color: pal.dim }]}>{skipLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", borderWidth: 2.5 },
  card: {
    position: "absolute",
    padding: 18,
    gap: 10,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  arrow: { position: "absolute", width: 18, height: 18, transform: [{ rotate: "45deg" }], borderRadius: 3 },
  title: { fontSize: 18, fontWeight: "900" },
  body: { fontSize: 14, lineHeight: 23, fontWeight: "500" },
  row: { alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14 },
  rowTxt: { flex: 1, fontSize: 13.5, fontWeight: "700" },
  step: { fontSize: 12, fontWeight: "800" },
  help: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1.2 },
  helpTxt: { fontSize: 15, fontWeight: "900", lineHeight: 18, marginTop: 1 },
  btnRow: { alignItems: "center", gap: 12, marginTop: 4 },
  btn: { flex: 1, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  skip: { paddingHorizontal: 6, paddingVertical: 10 },
  skipTxt: { fontSize: 14, fontWeight: "700" },
  btnTxt: { fontSize: 15.5, fontWeight: "800" },
});

/* ------------------------------ جولة بخطوات ------------------------------ */

export const COACH_PREFIX = "vsf_coach_";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export type CoachStep = { id: string; title: string; body: string; rows?: CoachRow[]; shape?: "circle" | "rect" };

// جولة واحدة فقط على الشاشة في كل وقت (الرئيسية وزر النجوم مثلًا)
let activeTour: string | null = null;

/** يمسح كل الجولات المحفوظة (لإعادة الجولة من الإعدادات) */
export async function resetCoachTours() {
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(COACH_PREFIX))).catch(() => {});
}

/**
 * جولة إرشاد لشاشة: bind(id) يُوضع على العنصر (ref)، و overlay يُعرض في الشاشة.
 * تبدأ بعد delay ما دام ready، وتتخطّى أي عنصر غير ظاهر، وتُحفظ عند الانتهاء أو التخطّي.
 */
export function useCoachTour(
  name: string,
  steps: CoachStep[],
  opts: { delay?: number; ready?: boolean; /** الشاشة نافذة منبثقة (modal sheet) نازلة عن أعلى الشاشة */ sheet?: boolean } = {}
) {
  const { t, lang } = useI18n();
  const key = COACH_PREFIX + name;
  const refs = useRef<Record<string, View | null>>({});
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const [idx, setIdx] = useState(-1);
  const [rect, setRect] = useState<CoachRect | null>(null);
  const { delay = 1400, ready = true, sheet = false } = opts;
  const { height: screenH } = useWindowDimensions();
  // في النافذة المنبثقة تُقاس المواضع من أعلاها لا من أعلى الشاشة → نضيف إزاحتها.
  // النافذة مثبّتة أسفل الشاشة، فإزاحتها = ارتفاع الشاشة − ارتفاعها.
  const sheetH = useRef(0);

  const bind = useCallback(
    (id: string) => ({
      ref: (v: View | null) => {
        refs.current[id] = v;
      },
      collapsable: false as const,
    }),
    []
  );

  // يقيس الخطوة i (أو التالية الظاهرة) ويعرضها
  const show = useCallback(
    (i: number) => {
      const list = stepsRef.current;
      if (i >= list.length) {
        setIdx(-1);
        setRect(null);
        if (activeTour === name) activeTour = null;
        void AsyncStorage.setItem(key, "1");
        return;
      }
      const v = refs.current[list[i].id];
      if (!v) return show(i + 1);
      v.measureInWindow((x, y, w, h) => {
        if (!w || !h) return show(i + 1);
        const dy = sheet && sheetH.current > 0 ? Math.max(0, screenH - sheetH.current) : 0;
        // عنصر خارج الشاشة (أسفل قائمة طويلة مثلًا) لا يُضاء → الخطوة التالية
        if (y + dy >= screenH || y + dy + h <= 0) return show(i + 1);
        setRect({ x, y: y + dy, w, h, shape: list[i].shape });
        setIdx(i);
      });
    },
    [key, name, sheet, screenH]
  );

  /** يوضع على جذر الشاشة المنبثقة لمعرفة ارتفاعها */
  const sheetRoot = useCallback(
    () => ({
      onLayout: (e: { nativeEvent: { layout: { height: number } } }) => {
        sheetH.current = e.nativeEvent.layout.height;
      },
    }),
    []
  );

  useEffect(() => {
    if (!ready) return;
    let on = true;
    let timer: ReturnType<typeof setTimeout>;
    const tryStart = async () => {
      if (!on) return;
      if ((await AsyncStorage.getItem(key).catch(() => "1")) === "1") return;
      if (activeTour && activeTour !== name) {
        timer = setTimeout(tryStart, 800); // ننتظر انتهاء الجولة الأخرى
        return;
      }
      if (!on) return;
      activeTour = name;
      show(0);
    };
    timer = setTimeout(tryStart, delay);
    return () => {
      on = false;
      clearTimeout(timer);
      if (activeTour === name) activeTour = null;
    };
  }, [ready, delay, key, name, show]);

  const step = idx >= 0 ? steps[idx] : null;
  const total = steps.length;
  const num = (n: number) => (lang === "ar" ? String(n).replace(/\d/g, (d) => AR_DIGITS[+d]) : String(n));
  const last = idx === total - 1;
  const overlay = step ? (
    <CoachMark
      target={rect}
      title={step.title}
      body={step.body}
      rows={step.rows}
      stepLabel={total > 1 ? t("coach.step", { n: num(idx + 1), total: num(total) }) : undefined}
      doneLabel={last ? t("coach.done") : t("coach.next")}
      onDone={() => show(idx + 1)}
      onSkip={last ? undefined : () => show(total)}
      skipLabel={t("coach.skip")}
    />
  ) : null;

  // زر «؟»: يعيد جولة الشاشة في أي وقت
  const replay = useCallback(() => {
    if (activeTour && activeTour !== name) return;
    activeTour = name;
    show(0);
  }, [name, show]);

  return { bind, overlay, replay, sheetRoot, active: !!step };
}

/** زر «؟» صغير وأنيق لأعلى الشاشة يعيد جولة الإرشاد */
export function CoachHelpButton({ onPress }: { onPress: () => void }) {
  const { pal } = useScene();
  const { t, lang } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t("coach.help")}
      style={({ pressed }) => [
        styles.help,
        {
          backgroundColor: pal.dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.85)",
          borderColor: pal.accent + "55",
          transform: [{ scale: pressed ? 0.92 : 1 }],
        },
      ]}
    >
      <Text style={[styles.helpTxt, { color: pal.accent }]}>{lang === "ar" ? "؟" : "?"}</Text>
    </Pressable>
  );
}
