// components/brand/plan-setup-sheet.tsx
// إنشاء/تعديل خطة مذاكرة الكتاب بثلاث خطوات قصيرة، سؤال واحد في كل شاشة (طلب نهلة: الشاشة الواحدة كانت مزدحمة):
// ١) متى الاختبار؟  ٢) كم دقيقة في اليوم وأي أيام؟ (يوم البدء اليوم تلقائيًا، وتغييره برابط صغير)
// ٣) النتيجة في جملة واحدة كبيرة + حفظ. وإن لم يكفِ الوقت يُقال صراحة مع زر يضبط الدقائق اللازمة.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { ALL_DAYS, buildPlan, isoOf, type BookSchedule, type UnitWindow } from "../../lib/scheduleCore";
import { fmtDay, MonthCalendar } from "./date-range-sheet";

const MINUTE_CHOICES = [30, 45, 60, 90, 120];
const DANGER = "#D9485A";

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
  const [step, setStep] = useState(0);
  const [exam, setExam] = useState<string | null>(initial.exam);
  const [days, setDays] = useState<number[]>(initial.days);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [custom, setCustom] = useState(!MINUTE_CHOICES.includes(initial.minutes));
  const [start, setStart] = useState(initial.start);
  const [pickStart, setPickStart] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setExam(initial.exam);
    setDays(initial.days);
    setMinutes(initial.minutes);
    setCustom(!MINUTE_CHOICES.includes(initial.minutes));
    setStart(initial.start);
    setPickStart(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const est = useMemo(() => buildPlan({ start, exam, days, minutes, pages, done, prev }), [start, exam, days, minutes, pages, done, prev]);
  const leftPages = pages.reduce((a, p, i) => (done[i] ? a : a + p), 0);
  const hours = Math.max(0.5, Math.round((est.totalMin / 60) * 2) / 2);
  const validExam = !exam || exam > start;
  const canNext = step === 0 ? validExam : days.length > 0 && minutes >= 10;
  const canSave = days.length > 0 && minutes >= 10 && validExam && est.totalMin > 0 && est.available !== 0;

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

  const Chip = ({ on, label, onPress, wide }: { on: boolean; label: string; onPress: () => void; wide?: boolean }) => (
    <Pressable onPress={onPress} style={[wide ? styles.min : styles.day, { backgroundColor: on ? pal.accent : pal.soft, borderColor: on ? pal.accent : pal.cardBorder }]}>
      <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]} onPress={() => {}}>
          {/* الرأس: الخطوة الحالية والإغلاق */}
          <View style={[styles.head, { flexDirection: dir.row }]}>
            <Text style={[styles.stepTxt, { color: pal.accent }]}>{t("planx.step", { n: step + 1 })}</Text>
            <View style={[styles.dots, { flexDirection: dir.row }]}>
              {[0, 1, 2].map((k) => (
                <View key={k} style={[styles.dot, { backgroundColor: k <= step ? pal.accent : pal.track }]} />
              ))}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t("common.close")}>
              <Ionicons name="close" size={24} color={pal.dim} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 6 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {step === 0 ? (
              <>
                <Text style={[styles.q, { color: pal.ink, textAlign: dir.textAlign }]}>{t("planx.q1")}</Text>
                <MonthCalendar a={exam ?? today} b={null} single minISO={start} onPick={(iso) => setExam(iso)} />
                <Text style={[styles.sub, { color: exam ? pal.ink : pal.dim, textAlign: "center" }]}>{exam ? fmtDay(exam, lang) : t("planx.noExam")}</Text>
                {exam ? (
                  <Pressable onPress={() => setExam(null)} hitSlop={8} style={{ alignSelf: "center" }}>
                    <Text style={[styles.link, { color: pal.dim }]}>{t("planx.clearExam")}</Text>
                  </Pressable>
                ) : null}
                {!validExam ? <Text style={[styles.warn, { textAlign: "center" }]}>{t("planx.examBeforeStart")}</Text> : null}
              </>
            ) : step === 1 ? (
              <>
                <Text style={[styles.q, { color: pal.ink, textAlign: dir.textAlign }]}>{t("planx.q2")}</Text>
                <View style={[styles.row, { flexDirection: dir.row, flexWrap: "wrap" }]}>
                  {MINUTE_CHOICES.map((m) => (
                    <Chip key={m} wide on={!custom && minutes === m} label={t("planx.min", { n: m })} onPress={() => { setCustom(false); setMinutes(m); }} />
                  ))}
                  <Chip wide on={custom} label={t("planx.other")} onPress={() => setCustom(true)} />
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
                <View style={[styles.row, { flexDirection: dir.row }]}>
                  {ALL_DAYS.map((d) => (
                    <Chip key={d} on={days.includes(d)} label={dayNames[d]} onPress={() => toggleDay(d)} />
                  ))}
                </View>
                {!days.length ? <Text style={[styles.warn, { textAlign: dir.textAlign }]}>{t("planx.pickDays")}</Text> : null}
                <Pressable onPress={() => setPickStart((v) => !v)} hitSlop={8} style={{ alignSelf: dir.isRTL ? "flex-end" : "flex-start" }}>
                  <Text style={[styles.link, { color: pal.dim }]}>{t("planx.changeStart", { date: fmtDay(start, lang) })}</Text>
                </Pressable>
                {pickStart ? (
                  <MonthCalendar
                    a={start}
                    b={null}
                    single
                    onPick={(iso) => {
                      setStart(iso);
                      setPickStart(false);
                    }}
                  />
                ) : null}
              </>
            ) : (
              <>
                {est.fits && est.finish ? (
                  <View style={[styles.result, { backgroundColor: pal.card, borderColor: pal.accent }]}>
                    <Ionicons name="checkmark-circle" size={34} color="#15803D" />
                    <Text style={[styles.big, { color: pal.ink }]}>
                      {t(exam ? "planx.resultFits" : "planx.resultNoExam", { date: fmtDay(est.finish, lang) })}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.result, { backgroundColor: pal.card, borderColor: DANGER }]}>
                    <Ionicons name="alert-circle" size={34} color={DANGER} />
                    <Text style={[styles.big, { color: pal.ink }]}>{est.needMinutes ? t("planx.short", { need: est.needMinutes }) : t("planx.noDays")}</Text>
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
                <Text style={[styles.sub, { color: pal.dim, textAlign: "center" }]}>
                  {t("planx.resultDetail", { h: hours, p: leftPages, m: minutes, d: days.length })}
                </Text>
              </>
            )}
          </ScrollView>

          {/* التنقل: رجوع / التالي، وفي الأخيرة حفظ الخطة */}
          <View style={[styles.nav, { flexDirection: dir.row }]}>
            {step > 0 ? (
              <Pressable onPress={() => setStep((s) => s - 1)} style={({ pressed }) => [styles.back, { borderColor: pal.cardBorder, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={[styles.backTxt, { color: pal.ink }]}>{t("planx.back")}</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={step < 2 ? !canNext : !canSave}
              onPress={() => (step < 2 ? setStep((s) => s + 1) : save())}
              style={({ pressed }) => [styles.next, { backgroundColor: pal.accent, opacity: (step < 2 ? !canNext : !canSave) ? 0.4 : pressed ? 0.85 : 1, flexDirection: dir.row }]}
            >
              {step === 2 ? <Ionicons name="checkmark" size={18} color={pal.onAccent} /> : null}
              <Text style={[styles.nextTxt, { color: pal.onAccent }]}>{step < 2 ? t("planx.next") : t("planx.save")}</Text>
            </Pressable>
          </View>
          {step === 2 && onDelete && editing ? (
            <Pressable onPress={onDelete} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 4 }}>
              <Text style={styles.del}>{t("plan.delete")}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: 30, gap: 14, borderWidth: StyleSheet.hairlineWidth, maxWidth: 620, width: "100%", alignSelf: "center", maxHeight: "92%" },
  head: { alignItems: "center", justifyContent: "space-between" },
  stepTxt: { fontSize: 13.5, fontWeight: "900", minWidth: 60 },
  dots: { gap: 6 },
  dot: { width: 22, height: 6, borderRadius: 3 },
  q: { fontSize: 22, fontWeight: "900", lineHeight: 32 },
  sub: { fontSize: 15, fontWeight: "800", lineHeight: 24 },
  link: { fontSize: 14, fontWeight: "800", textDecorationLine: "underline" },
  warn: { color: DANGER, fontSize: 14, fontWeight: "800" },
  row: { gap: 8 },
  day: { flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, paddingHorizontal: 2 },
  min: { minWidth: 70, height: 46, paddingHorizontal: 14, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  chipTxt: { fontSize: 15, fontWeight: "800" },
  input: { height: 48, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, fontWeight: "800" },
  result: { borderRadius: 20, padding: 20, gap: 12, borderWidth: 1.5, alignItems: "center" },
  big: { fontSize: 20, fontWeight: "900", lineHeight: 32, textAlign: "center" },
  fix: { alignItems: "center", gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  fixTxt: { fontSize: 14, fontWeight: "800" },
  nav: { gap: 10 },
  back: { height: 52, paddingHorizontal: 22, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  backTxt: { fontSize: 16, fontWeight: "900" },
  next: { flex: 1, height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  nextTxt: { fontSize: 16, fontWeight: "900" },
  del: { color: DANGER, fontSize: 14.5, fontWeight: "800" },
});
