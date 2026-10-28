// components/brand/plan-sheet.tsx
// خطة الكتاب (طلب نهلة ٢٨ أكتوبر: «ابي اعدل على الخطة او احذفها»): تاريخ البدء والدقائق اليومية،
// والنهاية تُحسب تلقائيًا مما بقي من صفحات الكتاب (ما أُنجز في الخطة السابقة لا يُعاد). حفظ يبني الخطة من جديد،
// و«حذف الخطة» يزيلها ومسارها اليومي ويُبقي الكتاب ومنهجه وكل ما حُفظ. على نمط نافذة «موعد الاختبار».
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Palette, Radius } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import { useDir, useI18n } from "../../lib/i18n";
import { deleteBookPlan, planDays, planPagesDone, rebuildBookPlan, type BookPlan } from "../../lib/plans";
import { todayISO } from "../../lib/readiness";
import { addDaysISO } from "../../lib/readinessCore";
import { getMinutesPerPage } from "../../lib/settings";
import { formatExamDate } from "./exam-date-sheet";
import { PressableScale } from "./motion";

type Props = {
  visible: boolean;
  bookId: string;
  pages: number;
  plan: BookPlan | null;
  onClose: () => void;
  onChanged: () => void;
};

const MINUTES = [15, 30, 45, 60, 90, 120];

/** «يوم واحد، يومان، ٣ أيام، ١١ يومًا» (والإنجليزية day/days) */
function daysLabel(n: number, lang: string): string {
  if (lang !== "ar") return n === 1 ? "1 day" : `${n} days`;
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  return n <= 10 ? `${n} أيام` : `${n} يومًا`;
}

export function PlanSheet({ visible, bookId, pages, plan, onClose, onChanged }: Props) {
  const { t, lang } = useI18n();
  const dir = useDir();
  const today = todayISO();
  const [start, setStart] = useState(today);
  const [daily, setDaily] = useState(60);
  const [mpp, setMpp] = useState(2);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStart(plan?.start_date && plan.start_date > today ? plan.start_date : today);
    setDaily(plan?.daily_minutes || 60);
    getMinutesPerPage().then(setMpp).catch(() => {});
    if (plan) planPagesDone(plan.id).then(setDone).catch(() => setDone(0));
    else setDone(0);
  }, [visible, plan, today]);

  const left = Math.max(1, pages - done);
  const days = planDays(left, mpp, daily);
  const end = addDaysISO(start, days - 1);
  const shift = (n: number) => setStart((d) => (addDaysISO(d, n) < today ? today : addDaysISO(d, n)));
  const step = (n: number) => setDaily((m) => Math.min(480, Math.max(5, m + n)));

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const userId = await getUserId();
      if (!userId) throw new Error("AUTH");
      await rebuildBookPlan({ userId, bookId, startDateISO: start, pageCount: pages, minutesPerPage: mpp, dailyMinutes: daily });
      onChanged();
      onClose();
    } catch {
      Alert.alert(t("bookplan.title"), t("bookplan.saveFail"));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    Alert.alert(t("bookplan.deleteTitle"), t("bookplan.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () =>
          void deleteBookPlan(bookId)
            .then(() => {
              onChanged();
              onClose();
            })
            .catch(() => Alert.alert(t("bookplan.deleteTitle"), t("bookplan.saveFail"))),
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("bookplan.title")}</Text>
          <Text style={[styles.sub, { textAlign: dir.textAlign }]}>{t("bookplan.sub")}</Text>

          {/* تاريخ البدء */}
          <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("bookplan.start")}</Text>
          <View style={[styles.picker, { flexDirection: dir.row }]}>
            <PressableScale onPress={() => shift(-1)} style={styles.step} disabled={start <= today}>
              <Ionicons name="remove" size={22} color={start <= today ? Palette.textDim : Palette.text} />
            </PressableScale>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={styles.value}>{start === today ? t("bookplan.today") : formatExamDate(start, lang)}</Text>
            </View>
            <PressableScale onPress={() => shift(1)} style={styles.step}>
              <Ionicons name="add" size={22} color={Palette.text} />
            </PressableScale>
          </View>

          {/* الدقائق اليومية */}
          <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("bookplan.daily")}</Text>
          <View style={[styles.quick, { flexDirection: dir.row }]}>
            {MINUTES.map((m) => {
              const on = m === daily;
              return (
                <PressableScale key={m} onPress={() => setDaily(m)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{m}</Text>
                </PressableScale>
              );
            })}
          </View>
          <View style={[styles.picker, { flexDirection: dir.row }]}>
            <PressableScale onPress={() => step(-5)} style={styles.step} disabled={daily <= 5}>
              <Ionicons name="remove" size={22} color={daily <= 5 ? Palette.textDim : Palette.text} />
            </PressableScale>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={styles.value}>{t("bookplan.minutes", { n: daily })}</Text>
            </View>
            <PressableScale onPress={() => step(5)} style={styles.step}>
              <Ionicons name="add" size={22} color={Palette.text} />
            </PressableScale>
          </View>

          {/* النهاية المحسوبة */}
          <Text style={[styles.ends, { textAlign: dir.textAlign }]}>
            {t("bookplan.ends", { date: formatExamDate(end, lang), d: daysLabel(days, lang) })}
            {done > 0 ? ` ${t("bookplan.doneKept", { n: done })}` : ""}
          </Text>

          <PressableScale onPress={() => void save()} style={styles.save} disabled={busy}>
            {busy ? <ActivityIndicator color={Palette.bg} /> : <Text style={styles.saveTxt}>{t("bookplan.save")}</Text>}
          </PressableScale>
          {plan ? (
            <Pressable onPress={remove} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 6 }}>
              <Text style={styles.remove}>{t("bookplan.delete")}</Text>
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
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  title: { color: Palette.text, fontSize: 19, fontWeight: "800" },
  sub: { color: Palette.textDim, fontSize: 13, lineHeight: 20, marginTop: -4 },
  label: { color: Palette.textMuted, fontSize: 13.5, fontWeight: "800", marginTop: 2 },
  quick: { gap: 6 },
  chip: { flex: 1, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: Palette.text },
  chipTxt: { color: Palette.textMuted, fontSize: 13, fontWeight: "700" },
  chipTxtOn: { color: Palette.bg },
  picker: {
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: Radius.xl,
    backgroundColor: "rgba(124,108,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.30)",
  },
  step: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  value: { color: Palette.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
  ends: { color: "#D9D3FF", fontSize: 13.5, fontWeight: "700", lineHeight: 21 },
  save: { height: 54, borderRadius: 18, backgroundColor: Palette.text, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: Palette.bg, fontSize: 16, fontWeight: "800" },
  remove: { color: "#FF6B81", fontSize: 14, fontWeight: "700" },
});
