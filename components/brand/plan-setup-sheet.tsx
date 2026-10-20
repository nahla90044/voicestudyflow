// components/brand/plan-setup-sheet.tsx
// إنشاء/تعديل خطة مذاكرة الكتاب من وقت المذاكرة: موعد الاختبار، وأيام الدراسة، ودقائق اليوم، ويوم البدء.
// يظهر التقدير قبل الحفظ (وقت المقرر وموعد الانتهاء ويوما المراجعة)، وإن لم يكفِ الوقت يُقال صراحة كم يلزم.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { ALL_DAYS, buildPlan, isoOf, type BookSchedule, type UnitWindow } from "../../lib/scheduleCore";
import { fmtDay, MonthCalendar } from "./date-range-sheet";

const MINUTE_CHOICES = [30, 45, 60, 90, 120];

type Props = {
  visible: boolean;
  editing: boolean;
  pages: number[]; // صفحات كل وحدة
  done: boolean[]; // وحدات منجزة (لا يُعاد جدولتها)
  prev?: UnitWindow[];
  initial: { start: string; exam: string | null; days: number[]; minutes: number };
  onClose: () => void;
  onSave: (s: BookSchedule) => void;
  onDelete?: () => void;
};

export function PlanSetupSheet({ visible, editing, pages, done, prev, initial, onClose, onSave, onDelete }: Props) {
  const { t, lang } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const today = isoOf(new Date());
  const [exam, setExam] = useState<string | null>(initial.exam);
  const [days, setDays] = useState<number[]>(initial.days);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [custom, setCustom] = useState(!MINUTE_CHOICES.includes(initial.minutes));
  const [start, setStart] = useState(initial.start);
  const [picking, setPicking] = useState<"exam" | "start" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setExam(initial.exam);
    setDays(initial.days);
    setMinutes(initial.minutes);
    setCustom(!MINUTE_CHOICES.includes(initial.minutes));
    setStart(initial.start);
    setPicking(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const est = useMemo(() => buildPlan({ start, exam, days, minutes, pages, done, prev }), [start, exam, days, minutes, pages, done, prev]);
  const leftPages = pages.reduce((a, p, i) => (done[i] ? a : a + p), 0);
  const hours = Math.max(0.5, Math.round((est.totalMin / 60) * 2) / 2);
  const validExam = !exam || exam > start;
  const canSave = days.length > 0 && minutes >= 10 && validExam && est.totalMin > 0;

  // أسماء الأيام من الأحد (٢٠٢٦-١٠-١٨ أحد)
  const dayNames = useMemo(
    () => ALL_DAYS.map((d) => new Date(2026, 9, 18 + d).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : lang, { weekday: "short" })),
    [lang]
  );
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  function save() {
    if (!canSave) return;
    onSave({ start, end: est.end, units: est.units, exam, days, minutes });
  }

  const Label = ({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) => (
    <View style={[styles.label, { flexDirection: dir.row }]}>
      <Ionicons name={icon} size={16} color={pal.accent} />
      <Text style={[styles.labelTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{text}</Text>
    </View>
  );

  const DateRow = ({ which, value, empty }: { which: "exam" | "start"; value: string | null; empty: string }) => (
    <Pressable
      onPress={() => setPicking(picking === which ? null : which)}
      style={({ pressed }) => [styles.dateRow, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: picking === which ? pal.accent : "transparent", opacity: pressed ? 0.9 : 1 }]}
    >
      <Text style={[styles.dateVal, { color: value ? pal.ink : pal.dim }]}>{value ? fmtDay(value, lang) : empty}</Text>
      <Ionicons name={picking === which ? "chevron-up" : "chevron-down"} size={18} color={pal.dim} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]} onPress={() => {}}>
          <View style={[styles.grip, { backgroundColor: pal.track }]} />
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]}>{editing ? t("planx.editTitle") : t("planx.title")}</Text>

            {/* ١) موعد الاختبار */}
            <Label icon="flag" text={t("planx.exam")} />
            <DateRow which="exam" value={exam} empty={t("planx.noExam")} />
            {picking === "exam" ? (
              <View style={{ gap: 6 }}>
                <MonthCalendar
                  a={exam ?? start}
                  b={null}
                  single
                  minISO={start}
                  onPick={(iso) => {
                    setExam(iso);
                    setPicking(null);
                  }}
                />
                {exam ? (
                  <Pressable onPress={() => { setExam(null); setPicking(null); }} hitSlop={8} style={{ alignSelf: "center" }}>
                    <Text style={[styles.link, { color: pal.dim }]}>{t("planx.clearExam")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* ٢) أيام الدراسة */}
            <Label icon="calendar-outline" text={t("planx.days")} />
            <View style={[styles.days, { flexDirection: dir.row }]}>
              {ALL_DAYS.map((d) => {
                const on = days.includes(d);
                return (
                  <Pressable key={d} onPress={() => toggleDay(d)} style={[styles.day, { backgroundColor: on ? pal.accent : pal.soft, borderColor: on ? pal.accent : pal.cardBorder }]}>
                    <Text style={[styles.dayTxt, { color: on ? pal.onAccent : pal.ink }]} numberOfLines={1} adjustsFontSizeToFit>
                      {dayNames[d]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ٣) دقائق اليوم */}
            <Label icon="time-outline" text={t("planx.minutes")} />
            <View style={[styles.days, { flexDirection: dir.row, flexWrap: "wrap" }]}>
              {MINUTE_CHOICES.map((m) => {
                const on = !custom && minutes === m;
                return (
                  <Pressable key={m} onPress={() => { setCustom(false); setMinutes(m); }} style={[styles.min, { backgroundColor: on ? pal.accent : pal.soft, borderColor: on ? pal.accent : pal.cardBorder }]}>
                    <Text style={[styles.dayTxt, { color: on ? pal.onAccent : pal.ink }]}>{t("planx.min", { n: m })}</Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setCustom(true)} style={[styles.min, { backgroundColor: custom ? pal.accent : pal.soft, borderColor: custom ? pal.accent : pal.cardBorder }]}>
                <Text style={[styles.dayTxt, { color: custom ? pal.onAccent : pal.ink }]}>{t("planx.other")}</Text>
              </Pressable>
            </View>
            {custom ? (
              <TextInput
                value={minutes ? String(minutes) : ""}
                onChangeText={(v) => setMinutes(Math.min(600, Number(v.replace(/[^\d]/g, "")) || 0))}
                keyboardType="number-pad"
                placeholder={t("planx.customHint")}
                placeholderTextColor={pal.dim}
                style={[styles.input, { color: pal.ink, backgroundColor: pal.soft, textAlign: dir.textAlign }]}
              />
            ) : null}

            {/* ٤) يوم البدء */}
            <Label icon="play-outline" text={t("planx.start")} />
            <DateRow which="start" value={start} empty="" />
            {picking === "start" ? (
              <MonthCalendar
                a={start}
                b={null}
                single
                onPick={(iso) => {
                  setStart(iso);
                  setPicking(null);
                }}
              />
            ) : null}

            {/* التقدير قبل الحفظ */}
            <View style={[styles.est, { backgroundColor: pal.card, borderColor: est.fits && validExam ? pal.cardBorder : "#D9485A" }]}>
              <Text style={[styles.estMain, { color: pal.ink, textAlign: dir.textAlign }]}>
                {t(done.some(Boolean) ? "planx.needLeft" : "planx.need", { h: hours, p: leftPages })}
              </Text>
              {!validExam ? (
                <Text style={[styles.estLine, { color: "#D9485A", textAlign: dir.textAlign }]}>{t("planx.examBeforeStart")}</Text>
              ) : !days.length ? (
                <Text style={[styles.estLine, { color: "#D9485A", textAlign: dir.textAlign }]}>{t("planx.pickDays")}</Text>
              ) : est.fits ? (
                <Text style={[styles.estLine, { color: pal.ink, textAlign: dir.textAlign }]}>
                  {t(exam ? "planx.fits" : "planx.fitsNoExam", { m: minutes, d: days.length, date: est.finish ? fmtDay(est.finish, lang) : "" })}
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.estLine, { color: "#D9485A", textAlign: dir.textAlign }]}>
                    {est.needMinutes ? t("planx.short", { need: est.needMinutes }) : t("planx.noDays")}
                  </Text>
                  {est.needMinutes && est.needMinutes <= 600 ? (
                    <Pressable
                      onPress={() => { setCustom(!MINUTE_CHOICES.includes(est.needMinutes!)); setMinutes(est.needMinutes!); }}
                      style={[styles.fix, { flexDirection: dir.row, borderColor: pal.accent }]}
                    >
                      <Ionicons name="flash" size={15} color={pal.accent} />
                      <Text style={[styles.fixTxt, { color: pal.ink }]}>{t("planx.useNeed", { need: est.needMinutes })}</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              <Text style={[styles.estNote, { color: pal.dim, textAlign: dir.textAlign }]}>{t("planx.note")}</Text>
            </View>

            <Pressable
              disabled={!canSave}
              onPress={save}
              style={({ pressed }) => [styles.save, { backgroundColor: pal.accent, opacity: !canSave ? 0.4 : pressed ? 0.85 : 1, flexDirection: dir.row }]}
            >
              <Ionicons name="checkmark" size={18} color={pal.onAccent} />
              <Text style={[styles.saveTxt, { color: pal.onAccent }]}>{t("planx.save")}</Text>
            </Pressable>
            {onDelete ? (
              <Pressable onPress={onDelete} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 4 }}>
                <Text style={styles.del}>{t("plan.delete")}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: 30, gap: 10, borderWidth: StyleSheet.hairlineWidth, maxWidth: 620, width: "100%", alignSelf: "center", maxHeight: "92%" },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3 },
  title: { fontSize: 19, fontWeight: "900" },
  label: { alignItems: "center", gap: 6, marginTop: 4 },
  labelTxt: { fontSize: 14.5, fontWeight: "900", flex: 1 },
  dateRow: { height: 48, borderRadius: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "space-between", borderWidth: 1.5 },
  dateVal: { fontSize: 15.5, fontWeight: "800" },
  link: { fontSize: 13.5, fontWeight: "800", textDecorationLine: "underline" },
  days: { gap: 6 },
  day: { flex: 1, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, paddingHorizontal: 2 },
  min: { minWidth: 64, height: 40, paddingHorizontal: 12, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  dayTxt: { fontSize: 13.5, fontWeight: "800" },
  input: { height: 46, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, fontWeight: "800" },
  est: { borderRadius: 16, padding: 14, gap: 8, borderWidth: 1.5, marginTop: 4 },
  estMain: { fontSize: 15, fontWeight: "900", lineHeight: 23 },
  estLine: { fontSize: 14.5, fontWeight: "800", lineHeight: 22 },
  estNote: { fontSize: 12, lineHeight: 18 },
  fix: { alignSelf: "flex-start", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  fixTxt: { fontSize: 13.5, fontWeight: "800" },
  save: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  saveTxt: { fontSize: 16, fontWeight: "900" },
  del: { color: "#D9485A", fontSize: 14.5, fontWeight: "800" },
});
