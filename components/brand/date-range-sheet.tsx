// components/brand/date-range-sheet.tsx
// نافذة اختيار مدة (من تاريخ إلى تاريخ): لجدول الكتاب كله أو لوحدة واحدة.
// كل تاريخ بزرّي يوم قبل/بعد وأسبوع قبل/بعد، و«حفظ» و«حذف» اختياري. بألوان المشهد.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { addDays, daysBetween } from "../../lib/scheduleCore";

type Props = {
  visible: boolean;
  title: string;
  hint?: string;
  start: string;
  end: string;
  onClose: () => void;
  onSave: (start: string, end: string) => void;
  /** زر حذف (مثل حذف الجدول) — يظهر إن وُجد */
  onDelete?: () => void;
  deleteLabel?: string;
};

export function fmtDay(iso: string, lang: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : lang, { weekday: "short", day: "numeric", month: "long" });
  } catch {
    return iso;
  }
}

export function DateRangeSheet({ visible, title, hint, start, end, onClose, onSave, onDelete, deleteLabel }: Props) {
  const { t, lang } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [a, setA] = useState(start);
  const [b, setB] = useState(end);
  useEffect(() => {
    if (visible) {
      setA(start);
      setB(end);
    }
  }, [visible, start, end]);

  const row = (label: string, value: string, set: (v: string) => void, min?: string) => (
    <View style={[styles.row, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
      <Text style={[styles.rowLbl, { color: pal.dim, textAlign: dir.textAlign }]}>{label}</Text>
      <View style={[styles.stepRow, { flexDirection: dir.row }]}>
        {([-7, -1] as const).map((n) => (
          <Pressable key={n} onPress={() => set(min && addDays(value, n) < min ? min : addDays(value, n))} style={[styles.step, { backgroundColor: pal.card }]} hitSlop={4}>
            <Text style={[styles.stepTxt, { color: pal.ink }]}>{n === -7 ? t("dates.weekBack") : "−"}</Text>
          </Pressable>
        ))}
        <Text style={[styles.date, { color: pal.ink }]} numberOfLines={1} adjustsFontSizeToFit>
          {fmtDay(value, lang)}
        </Text>
        {([1, 7] as const).map((n) => (
          <Pressable key={n} onPress={() => set(addDays(value, n))} style={[styles.step, { backgroundColor: pal.card }]} hitSlop={4}>
            <Text style={[styles.stepTxt, { color: pal.ink }]}>{n === 7 ? t("dates.weekFwd") : "+"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const bad = b < a;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]} onPress={() => {}}>
          <View style={[styles.grip, { backgroundColor: pal.track }]} />
          <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]}>{title}</Text>
          {hint ? <Text style={[styles.hint, { color: pal.dim, textAlign: dir.textAlign }]}>{hint}</Text> : null}
          {row(t("dates.from"), a, (v) => {
            setA(v);
            if (b < v) setB(v);
          })}
          {row(t("dates.to"), b, setB, a)}
          <Text style={[styles.hint, { color: bad ? "#D9485A" : pal.dim, textAlign: "center" }]}>
            {bad ? t("dates.bad") : t("dates.days", { n: daysBetween(a, b) + 1 })}
          </Text>
          <Pressable
            disabled={bad}
            onPress={() => onSave(a, b)}
            style={({ pressed }) => [styles.save, { backgroundColor: pal.accent, opacity: bad ? 0.4 : pressed ? 0.85 : 1, flexDirection: dir.row }]}
          >
            <Ionicons name="checkmark" size={18} color={pal.onAccent} />
            <Text style={[styles.saveTxt, { color: pal.onAccent }]}>{t("common.save")}</Text>
          </Pressable>
          {onDelete ? (
            <Pressable onPress={onDelete} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 6 }}>
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
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: 38, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3 },
  title: { fontSize: 19, fontWeight: "900" },
  hint: { fontSize: 13, lineHeight: 20 },
  row: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  rowLbl: { fontSize: 12.5, fontWeight: "800" },
  stepRow: { alignItems: "center", gap: 6 },
  step: { minWidth: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  stepTxt: { fontSize: 15, fontWeight: "900" },
  date: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "900" },
  save: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  saveTxt: { fontSize: 16, fontWeight: "900" },
  del: { color: "#D9485A", fontSize: 14.5, fontWeight: "800" },
});
