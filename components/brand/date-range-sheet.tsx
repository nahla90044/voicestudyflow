// components/brand/date-range-sheet.tsx
// اختيار تاريخ أو مدة من تقويم شهري حقيقي (مثل تقويم الجوال): ضغطة على يوم البداية ثم يوم النهاية،
// والمدة تتلوّن بينهما. التنقل بين الأشهر بسهمين. للمدة (جدول الكتاب، تواريخ وحدة) أو ليوم واحد (مهمة).
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { addDays, daysBetween, isoOf } from "../../lib/scheduleCore";

type Props = {
  visible: boolean;
  title: string;
  hint?: string;
  start: string;
  end: string;
  /** يوم واحد فقط (end يُتجاهل ويُعاد مساويًا لـ start) */
  single?: boolean;
  onClose: () => void;
  onSave: (start: string, end: string) => void;
  /** زر حذف (مثل حذف الجدول) — يظهر إن وُجد */
  onDelete?: () => void;
  deleteLabel?: string;
};

const locale = (lang: string) => (lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : lang);

export function fmtDay(iso: string, lang: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "long" });
  } catch {
    return iso;
  }
}

export function DateRangeSheet({ visible, title, hint, start, end, single, onClose, onSave, onDelete, deleteLabel }: Props) {
  const { t, lang } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [a, setA] = useState(start);
  const [b, setB] = useState<string | null>(single ? start : end);
  const [month, setMonth] = useState(start.slice(0, 7));
  const today = isoOf(new Date());

  useEffect(() => {
    if (!visible) return;
    setA(start);
    setB(single ? start : end);
    setMonth(start.slice(0, 7));
  }, [visible, start, end, single]);

  // شبكة الشهر: تبدأ من الأحد، ٦ أسابيع
  const grid = useMemo(() => {
    const first = `${month}-01`;
    const startDow = new Date(`${first}T00:00:00`).getDay();
    return Array.from({ length: 42 }, (_, i) => addDays(first, i - startDow));
  }, [month]);
  const monthName = useMemo(() => {
    try {
      return new Date(`${month}-01T00:00:00`).toLocaleDateString(locale(lang), { month: "long", year: "numeric" });
    } catch {
      return month;
    }
  }, [month, lang]);
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 18 + i).toLocaleDateString(locale(lang), { weekday: "narrow" })),
    [lang]
  );
  const shiftMonth = (n: number) => {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(isoOf(d).slice(0, 7));
  };

  function pick(iso: string) {
    if (single) {
      setA(iso);
      setB(iso);
      return;
    }
    // الضغطة الأولى بداية، والثانية نهاية (وإن كانت قبل البداية تصير هي البداية)
    if (b !== null || iso < a) {
      setA(iso);
      setB(null);
    } else setB(iso);
  }

  const end_ = b ?? a;
  const ready = single || b !== null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]} onPress={() => {}}>
          <View style={[styles.grip, { backgroundColor: pal.track }]} />
          <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]}>{title}</Text>
          {hint ? <Text style={[styles.hint, { color: pal.dim, textAlign: dir.textAlign }]}>{hint}</Text> : null}

          {/* المدة المختارة */}
          <View style={[styles.sel, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
            <View style={styles.selCell}>
              <Text style={[styles.selLbl, { color: pal.dim }]}>{single ? t("dates.day") : t("dates.from")}</Text>
              <Text style={[styles.selVal, { color: pal.ink }]}>{fmtDay(a, lang)}</Text>
            </View>
            {!single ? (
              <>
                <Ionicons name={dir.isRTL ? "arrow-back" : "arrow-forward"} size={18} color={pal.accent} />
                <View style={styles.selCell}>
                  <Text style={[styles.selLbl, { color: pal.dim }]}>{t("dates.to")}</Text>
                  <Text style={[styles.selVal, { color: b ? pal.ink : pal.accent }]}>{b ? fmtDay(b, lang) : t("dates.pickEnd")}</Text>
                </View>
              </>
            ) : null}
          </View>

          {/* التقويم */}
          <View style={[styles.monthHead, { flexDirection: dir.row }]}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={[styles.nav, { backgroundColor: pal.soft }]}>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={18} color={pal.ink} />
            </Pressable>
            <Text style={[styles.monthName, { color: pal.ink }]}>{monthName}</Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={[styles.nav, { backgroundColor: pal.soft }]}>
              <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.ink} />
            </Pressable>
          </View>
          <View style={[styles.row7, { flexDirection: dir.row }]}>
            {weekdays.map((w, i) => (
              <Text key={i} style={[styles.wd, { color: pal.dim }]}>
                {w}
              </Text>
            ))}
          </View>
          <View style={[styles.grid, { flexDirection: dir.row }]}>
            {grid.map((iso) => {
              const inMonth = iso.slice(0, 7) === month;
              const isEdge = iso === a || (ready && iso === end_);
              const inRange = !single && ready && iso > a && iso < end_;
              return (
                <Pressable key={iso} onPress={() => pick(iso)} style={styles.cellWrap}>
                  <View style={[styles.cell, inRange && { backgroundColor: pal.accent + "33" }, isEdge && { backgroundColor: pal.accent }, iso === today && !isEdge && { borderWidth: 1.5, borderColor: pal.accent }]}>
                    <Text style={[styles.cellTxt, { color: isEdge ? pal.onAccent : inMonth ? pal.ink : pal.dim, opacity: inMonth ? 1 : 0.45 }]}>{Number(iso.slice(8))}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {!single && ready ? <Text style={[styles.hint, { color: pal.dim, textAlign: "center" }]}>{t("dates.days", { n: daysBetween(a, end_) + 1 })}</Text> : null}
          <Pressable
            disabled={!ready}
            onPress={() => onSave(a, end_)}
            style={({ pressed }) => [styles.save, { backgroundColor: pal.accent, opacity: !ready ? 0.4 : pressed ? 0.85 : 1, flexDirection: dir.row }]}
          >
            <Ionicons name="checkmark" size={18} color={pal.onAccent} />
            <Text style={[styles.saveTxt, { color: pal.onAccent }]}>{t("common.save")}</Text>
          </Pressable>
          {onDelete ? (
            <Pressable onPress={onDelete} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 4 }}>
              <Text style={styles.del}>{deleteLabel ?? t("common.delete")}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: 34, gap: 10, borderWidth: StyleSheet.hairlineWidth, maxWidth: 620, width: "100%", alignSelf: "center" },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3 },
  title: { fontSize: 19, fontWeight: "900" },
  hint: { fontSize: 13, lineHeight: 20 },
  sel: { borderRadius: 16, padding: 12, alignItems: "center", gap: 10 },
  selCell: { flex: 1, alignItems: "center", gap: 2 },
  selLbl: { fontSize: 12, fontWeight: "800" },
  selVal: { fontSize: 15.5, fontWeight: "900" },
  monthHead: { alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  monthName: { fontSize: 16, fontWeight: "900" },
  nav: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  row7: { justifyContent: "space-between" },
  wd: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontWeight: "800" },
  grid: { flexWrap: "wrap" },
  cellWrap: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 },
  cell: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cellTxt: { fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  save: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  saveTxt: { fontSize: 16, fontWeight: "900" },
  del: { color: "#D9485A", fontSize: 14.5, fontWeight: "800" },
});
