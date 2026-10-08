// components/brand/exam-date-sheet.tsx
// اختيار موعد الاختبار: اختصارات سريعة (أسبوع/أسبوعان/شهر) + تعديل باليوم.
// مبني بمكوّنات React Native فقط (بلا مكتبة تقويم أصلية) فيصل للمستخدمين
// بتحديث هوائي دون إعادة بناء التطبيق.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Palette, Radius } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { addDaysISO, daysUntil } from "../../lib/readinessCore";
import { todayISO } from "../../lib/readiness";
import { PressableScale } from "./motion";

type Props = {
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onSave: (iso: string | null) => void;
};

export function formatExamDate(iso: string, lang: string): string {
  try {
    const loc = lang === "ar" ? "ar-u-ca-gregory" : lang;
    return new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long" }).format(
      new Date(iso + "T12:00:00")
    );
  } catch {
    return iso;
  }
}

export function ExamDateSheet({ visible, value, onClose, onSave }: Props) {
  const { t, lang } = useI18n();
  const dir = useDir();
  const today = todayISO();
  const [iso, setIso] = useState(value ?? addDaysISO(today, 14));

  useEffect(() => {
    if (visible) setIso(value ?? addDaysISO(today, 14));
  }, [visible, value, today]);

  const days = daysUntil(iso, today);
  const shift = (n: number) => setIso((d) => {
    const next = addDaysISO(d, n);
    return next < today ? today : next;
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("exam.title")}</Text>
          <Text style={[styles.sub, { textAlign: dir.textAlign }]}>{t("exam.sub")}</Text>

          <View style={[styles.quick, { flexDirection: dir.row }]}>
            {([7, 14, 30] as const).map((n) => {
              const target = addDaysISO(today, n);
              const on = target === iso;
              return (
                <PressableScale key={n} onPress={() => setIso(target)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
                    {t(n === 7 ? "exam.week" : n === 14 ? "exam.twoWeeks" : "exam.month")}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {/* التاريخ المختار مع زرَّي يوم قبل/بعد */}
          <View style={[styles.picker, { flexDirection: dir.row }]}>
            <PressableScale onPress={() => shift(-1)} style={styles.step} disabled={iso <= today}>
              <Ionicons name="remove" size={22} color={iso <= today ? Palette.textDim : Palette.text} />
            </PressableScale>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={styles.date}>{formatExamDate(iso, lang)}</Text>
              <Text style={styles.days}>{days === 0 ? t("book.examToday") : t("exam.inDays", { n: days })}</Text>
            </View>
            <PressableScale onPress={() => shift(1)} style={styles.step}>
              <Ionicons name="add" size={22} color={Palette.text} />
            </PressableScale>
          </View>

          <PressableScale onPress={() => onSave(iso)} style={styles.save}>
            <Text style={styles.saveTxt}>{t("exam.save")}</Text>
          </PressableScale>
          {value ? (
            <Pressable onPress={() => onSave(null)} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 6 }}>
              <Text style={styles.remove}>{t("exam.remove")}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#10121B",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    paddingBottom: 38,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  title: { color: Palette.text, fontSize: 19, fontWeight: "800" },
  sub: { color: Palette.textDim, fontSize: 13, lineHeight: 20, marginTop: -6 },
  quick: { gap: 8 },
  chip: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: Palette.text },
  chipTxt: { color: Palette.textMuted, fontSize: 13, fontWeight: "700" },
  chipTxtOn: { color: Palette.bg },
  picker: {
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: Radius.xl,
    backgroundColor: "rgba(124,108,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.30)",
  },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  date: { color: Palette.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  days: { color: "#D9D3FF", fontSize: 13, fontWeight: "600", marginTop: 3 },
  save: { height: 54, borderRadius: 18, backgroundColor: Palette.text, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: Palette.bg, fontSize: 16, fontWeight: "800" },
  remove: { color: "#FF6B81", fontSize: 14, fontWeight: "700" },
});
