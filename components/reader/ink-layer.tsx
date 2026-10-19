// components/reader/ink-layer.tsx
// طبقة كتابة قلم الآيباد فوق صفحة الكتاب (والهامش حولها) أثناء القراءة الصوتية.
// القلم وحده يكتب؛ الإصبع يبقى للتمرير والتكبير وقلب الصفحات: لمسة الإصبع تُرفض فورًا
// فتأخذها الصفحة، ولمسة القلم تفعّل الرسم وتمنع التمرير (blocksExternalGesture).
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, PointerType } from "react-native-gesture-handler";

import { recordPerf } from "../../lib/perf";
import Svg, { Path } from "react-native-svg";

import type { InkTool, Stroke } from "../../lib/ink";

export const INK_COLORS = ["#1F2937", "#E11D48", "#2563EB"] as const;
const MARKER_COLOR = "#FACC15";
const PEN_W = 0.0045; // نسبةً لعرض الصفحة
const MARKER_W = 0.024;
const ERASE_R = 0.025;

type Props = {
  strokes: Stroke[];
  onChange: (s: Stroke[]) => void;
  /** وضع القلم مفعّل (وإلا الطبقة عرض فقط) */
  active: boolean;
  tool: InkTool;
  color: string;
  /** عرض الصفحة المعروضة بالبكسل، وإزاحتها داخل الطبقة (عرض الهامش) */
  imgW: number;
  offsetX: number;
  width: number;
  height: number;
  /** التمرير الذي يجب أن ينتظر القلم (حتى لا تتحرك الصفحة أثناء الكتابة) */
   
  scrollRef?: React.RefObject<any>;
};

function pathOf(p: number[], imgW: number, offsetX: number): string {
  if (p.length < 2) return "";
  const X = (i: number) => offsetX + p[i] * imgW;
  const Y = (i: number) => p[i + 1] * imgW;
  if (p.length === 2) return `M${X(0)} ${Y(0)} L${X(0) + 0.1} ${Y(0)}`; // نقطة
  let d = `M${X(0)} ${Y(0)}`;
  // منحنيات بين منتصفات النقاط: خط ناعم بلا زوايا
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (X(i) + X(i + 2)) / 2;
    const my = (Y(i) + Y(i + 2)) / 2;
    d += ` Q${X(i)} ${Y(i)} ${mx} ${my}`;
  }
  const n = p.length - 2;
  d += ` L${X(n)} ${Y(n)}`;
  return d;
}

function InkLayerImpl({ strokes, onChange, active, tool, color, imgW, offsetX, width, height, scrollRef }: Props) {
  const live = useRef<number[] | null>(null);
  const [liveD, setLiveD] = useState("");
  const frame = useRef<number | null>(null);
  const current = useRef(strokes);
  current.current = strokes;
  // أحدث القيم تُقرأ من مرجع داخل الحركة: الحركة نفسها تُصنع مرة واحدة فقط.
  // (كانت تُعاد صناعتها مع كل تحديث للشاشة — والقارئ يحدّثها مرات كثيرة في الثانية أثناء القراءة
  // الصوتية — فيُعاد ضبطها وسط الخط فيضيع ولا يكتب القلم حتى يُطفأ ويُشغَّل من جديد.)
  const cfg = useRef({ active, tool, color, imgW, offsetX, onChange });
  cfg.current = { active, tool, color, imgW, offsetX, onChange };

  const norm = (x: number, y: number) => {
    const c = cfg.current;
    return [Math.round(((x - c.offsetX) / c.imgW) * 10000) / 10000, Math.round((y / c.imgW) * 10000) / 10000];
  };

  function eraseAt(x: number, y: number) {
    const [nx, ny] = norm(x, y);
    const keep = current.current.filter((s) => {
      for (let i = 0; i < s.p.length; i += 2) {
        if (Math.hypot(s.p[i] - nx, s.p[i + 1] - ny) < ERASE_R + s.w / 2) return false;
      }
      return true;
    });
    if (keep.length !== current.current.length) cfg.current.onChange(keep);
  }

  function redrawLive() {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setLiveD(live.current ? pathOf(live.current, cfg.current.imgW, cfg.current.offsetX) : "");
    });
  }

  const pan = useMemo(() => {
    let g = Gesture.Pan()
      .runOnJS(true)
      .manualActivation(true)
      .minDistance(0)
      .onTouchesDown((e, manager) => {
        // القلم فقط وفي وضع الكتابة؛ أي لمسة أخرى تُرفض فورًا فتصل للصفحة كالعادة
        const c = cfg.current;
        const ok = c.active && c.imgW > 0 && e.pointerType === PointerType.STYLUS;
        // تشخيص القلم (نوع اللمسة وهل قُبلت) — size = نوع المؤشر
        if (c.active) recordPerf("ink.down", 0, ok, Number(e.pointerType));
        if (ok) manager.activate();
        else manager.fail();
      })
      .onStart((e) => {
        if (cfg.current.tool === "eraser") return eraseAt(e.x, e.y);
        live.current = norm(e.x, e.y);
        redrawLive();
      })
      .onUpdate((e) => {
        if (cfg.current.tool === "eraser") return eraseAt(e.x, e.y);
        if (!live.current) return;
        const [nx, ny] = norm(e.x, e.y);
        const n = live.current.length;
        // نتجاهل الحركة الضئيلة جدًا (تقلّل حجم الحفظ دون أن يتغيّر الشكل)
        if (Math.hypot(nx - live.current[n - 2], ny - live.current[n - 1]) < 0.0012) return;
        live.current.push(nx, ny);
        redrawLive();
      })
      .onFinalize(() => {
        const p = live.current;
        live.current = null;
        setLiveD("");
        const c = cfg.current;
        if (!p || c.tool === "eraser") return;
        const s: Stroke = c.tool === "marker" ? { c: MARKER_COLOR, w: MARKER_W, m: true, p } : { c: c.color, w: PEN_W, p };
        c.onChange([...current.current, s]);
      });
    // الربط بتمرير الصفحة فقط والقلم مفعّل: الربط والقلم مطفأ (عرض الكتابة أثناء تقليب الصفحات)
    // كان يبحث عن عرض الصفحة لحظة إزالته فيُسقط التطبيق («Unable to find node on an unmounted component»)
    if (scrollRef && active) g = g.blocksExternalGesture(scrollRef);
    return g.enabled(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, active]);

  const liveStyle = tool === "marker" ? { c: MARKER_COLOR, w: MARKER_W, m: true } : { c: color, w: PEN_W, m: false };

  return (
    <GestureDetector gesture={pan}>
      {/* القلم مطفأ: عرض فقط ولا تلتقط أي لمسة (نقرة الكلمة وغيرها تصل للصفحة) */}
      <View style={[StyleSheet.absoluteFill, { width, height }]} collapsable={false} pointerEvents={active ? "auto" : "none"}>
        <Svg width={width} height={height} pointerEvents="none">
          {strokes.map((s, i) => (
            <Path
              key={i}
              d={pathOf(s.p, imgW, offsetX)}
              stroke={s.c}
              strokeWidth={s.w * imgW}
              strokeOpacity={s.m ? 0.38 : 1}
              strokeLinecap={s.m ? "butt" : "round"}
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {liveD ? (
            <Path
              d={liveD}
              stroke={liveStyle.c}
              strokeWidth={liveStyle.w * imgW}
              strokeOpacity={liveStyle.m ? 0.38 : 1}
              strokeLinecap={liveStyle.m ? "butt" : "round"}
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </Svg>
      </View>
    </GestureDetector>
  );
}

/** لا يُعاد رسمها مع كل تحديث للقارئ (تظليل الكلمات أثناء القراءة) — فقط حين يتغيّر ما يخصها */
export const InkLayer = React.memo(InkLayerImpl, (a, b) =>
  a.strokes === b.strokes && a.active === b.active && a.tool === b.tool && a.color === b.color &&
  a.imgW === b.imgW && a.offsetX === b.offsetX && a.width === b.width && a.height === b.height && a.scrollRef === b.scrollRef && a.onChange === b.onChange
);

/** شريط أدوات القلم: الألوان، قلم التظليل، الممحاة، التراجع، مسح الصفحة، إنهاء */
export function InkToolbar({
  tool,
  color,
  onTool,
  onColor,
  onUndo,
  onClear,
  onDone,
  labels,
}: {
  tool: InkTool;
  color: string;
  onTool: (t: InkTool) => void;
  onColor: (c: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onDone: () => void;
  labels: { marker: string; eraser: string; undo: string; clear: string; clearConfirm: string; cancel: string; done: string };
}) {
  return (
    <View style={styles.bar}>
      {INK_COLORS.map((c) => (
        <Pressable
          key={c}
          onPress={() => {
            onColor(c);
            onTool("pen");
          }}
          hitSlop={4}
          style={[styles.dotWrap, tool === "pen" && color === c && styles.on]}
        >
          <View style={[styles.dot, { backgroundColor: c }]} />
        </Pressable>
      ))}
      <View style={styles.sep} />
      <Pressable accessibilityLabel={labels.marker} onPress={() => onTool("marker")} style={[styles.btn, tool === "marker" && styles.on]}>
        <Ionicons name="color-wand-outline" size={20} color={MARKER_COLOR} />
      </Pressable>
      <Pressable accessibilityLabel={labels.eraser} onPress={() => onTool("eraser")} style={[styles.btn, tool === "eraser" && styles.on]}>
        <Ionicons name="bandage-outline" size={20} color="#F3F4F8" />
      </Pressable>
      <Pressable accessibilityLabel={labels.undo} onPress={onUndo} style={styles.btn}>
        <Ionicons name="arrow-undo-outline" size={20} color="#F3F4F8" />
      </Pressable>
      <Pressable
        accessibilityLabel={labels.clear}
        onPress={() =>
          Alert.alert(labels.clear, labels.clearConfirm, [
            { text: labels.cancel, style: "cancel" },
            { text: labels.clear, style: "destructive", onPress: onClear },
          ])
        }
        style={styles.btn}
      >
        <Ionicons name="trash-outline" size={20} color="#FF6B81" />
      </Pressable>
      <View style={styles.sep} />
      <Pressable accessibilityLabel={labels.done} onPress={onDone} style={[styles.btn, styles.doneBtn]}>
        <Ionicons name="checkmark" size={22} color="#07080D" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: "rgba(16,18,27,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  dotWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
  on: { borderColor: "#5ED9FF", backgroundColor: "rgba(94,217,255,0.12)" },
  btn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  doneBtn: { backgroundColor: "#6CF3C5" },
  sep: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.15)" },
});
