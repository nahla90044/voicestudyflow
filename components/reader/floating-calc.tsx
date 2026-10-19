// components/reader/floating-calc.tsx
// آلة حاسبة عائمة فوق القارئ: تُسحب من شريطها العلوي إلى أي مكان، ويُحفظ مكانها للمرة القادمة.
// الحساب عبر محرّك آمن (lib/calcCore) بلا تنفيذ نصوص، والناتج يظهر مباشرة أثناء الكتابة.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { evaluate, formatResult } from "../../lib/calcCore";
import { useI18n } from "../../lib/i18n";

const W = 268;
const H = 392;
const POS_KEY = "vsf:calc:pos:v1";
const KEYS = [
  ["C", "(", ")", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["%", "0", ".", "="],
];
const OPS = new Set(["÷", "×", "-", "+", "^"]);

export function FloatingCalc({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { width: sw, height: sh } = useWindowDimensions();
  const [expr, setExpr] = useState("");
  const [shown, setShown] = useState<string | null>(null); // ناتج «=» الأخير
  const pos = useRef(new Animated.ValueXY({ x: sw - W - 16, y: 120 })).current;
  const cur = useRef({ x: sw - W - 16, y: 120 });

  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), Math.max(8, sw - W - 8)),
    y: Math.min(Math.max(40, y), Math.max(40, sh - H - 20)),
  });

  // آخر مكان استخدمه الطالب
  useEffect(() => {
    AsyncStorage.getItem(POS_KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw) as { x: number; y: number };
        if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return;
        const c = clamp(p.x, p.y);
        cur.current = c;
        pos.setValue(c);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تدوير الشاشة: تبقى داخلها
  useEffect(() => {
    const c = clamp(cur.current.x, cur.current.y);
    cur.current = c;
    pos.setValue(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sw, sh]);

  const drag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => {
        const c = clamp(cur.current.x + g.dx, cur.current.y + g.dy);
        pos.setValue(c);
      },
      onPanResponderRelease: (_e, g) => {
        const c = clamp(cur.current.x + g.dx, cur.current.y + g.dy);
        cur.current = c;
        pos.setValue(c);
        AsyncStorage.setItem(POS_KEY, JSON.stringify(c)).catch(() => {});
      },
    })
  ).current;

  const live = useMemo(() => {
    if (!expr) return null;
    const v = evaluate(expr);
    return v === null ? null : formatResult(v);
  }, [expr]);

  function press(k: string) {
    if (k === "C") {
      setExpr("");
      setShown(null);
      return;
    }
    if (k === "⌫") {
      setShown(null);
      setExpr((e) => e.slice(0, -1));
      return;
    }
    if (k === "=") {
      if (live !== null) {
        setShown(live);
        setExpr(live);
      }
      return;
    }
    setShown(null);
    setExpr((e) => {
      // عملية بعد عملية → تستبدلها (لا «++»)، إلا السالب بعد عملية
      if (OPS.has(k) && e && OPS.has(e[e.length - 1]) && !(k === "-" && e[e.length - 1] !== "-")) return e.slice(0, -1) + k;
      return (e + k).slice(0, 60);
    });
  }

  return (
    <Animated.View style={[styles.box, { transform: pos.getTranslateTransform() }]}>
      {/* الشريط العلوي: السحب من هنا */}
      <View {...drag.panHandlers} style={styles.head}>
        <Ionicons name="move" size={16} color="#9AA3B8" />
        <Text style={styles.title}>{t("calc.title")}</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t("common.close")}>
          <Ionicons name="close" size={20} color="#C9CEDB" />
        </Pressable>
      </View>
      <View style={styles.screen}>
        <Text style={styles.expr} numberOfLines={2} adjustsFontSizeToFit>
          {expr || "0"}
        </Text>
        <Text style={styles.result} numberOfLines={1} adjustsFontSizeToFit>
          {shown ?? (live !== null && live !== expr ? `= ${live}` : " ")}
        </Text>
      </View>
      <View style={styles.grid}>
        {KEYS.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((k) => (
              <Pressable
                key={k}
                onPress={() => press(k)}
                style={({ pressed }) => [
                  styles.key,
                  OPS.has(k) && styles.keyOp,
                  k === "=" && styles.keyEq,
                  k === "C" && styles.keyClear,
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityLabel={k}
              >
                <Text style={[styles.keyTxt, k === "=" && styles.keyEqTxt]}>{k === "-" ? "−" : k}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={styles.row}>
          <Pressable onPress={() => press("^")} style={({ pressed }) => [styles.key, styles.keyWide, pressed && { opacity: 0.6 }]} accessibilityLabel={t("calc.power")}>
            <Text style={styles.keyTxt}>xʸ</Text>
          </Pressable>
          <Pressable onPress={() => press("⌫")} style={({ pressed }) => [styles.key, styles.keyWide, pressed && { opacity: 0.6 }]} accessibilityLabel={t("common.delete")}>
            <Ionicons name="backspace-outline" size={20} color="#F3F4F8" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    left: 0,
    top: 0,
    width: W,
    borderRadius: 22,
    backgroundColor: "#141B2D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
    zIndex: 80,
    overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.05)" },
  title: { flex: 1, color: "#F3F4F8", fontSize: 14, fontWeight: "800", textAlign: "center" },
  screen: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, minHeight: 74, justifyContent: "flex-end" },
  expr: { color: "#F3F4F8", fontSize: 24, fontWeight: "700", textAlign: "right", writingDirection: "ltr", fontVariant: ["tabular-nums"] },
  result: { color: "#7C9CFF", fontSize: 18, fontWeight: "800", textAlign: "right", writingDirection: "ltr", marginTop: 2, fontVariant: ["tabular-nums"] },
  grid: { padding: 10, gap: 7, direction: "ltr" },
  row: { flexDirection: "row", gap: 7 },
  key: { flex: 1, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  keyWide: { flex: 1 },
  keyOp: { backgroundColor: "rgba(124,156,255,0.22)" },
  keyEq: { backgroundColor: "#F6D38B" },
  keyClear: { backgroundColor: "rgba(255,122,122,0.18)" },
  keyTxt: { color: "#F3F4F8", fontSize: 19, fontWeight: "700" },
  keyEqTxt: { color: "#141B2D", fontWeight: "900" },
});
