// app/(tabs)/calendar.tsx
// «خطتي»: أسبوع واضح بأيامه، وما يُذاكَر في اليوم المختار (وحدات الكتب من جداولها + مهامي)،
// ومهام يضيفها المستخدم ويعدّلها ويحذفها (اختبار، واجب، عرض، بحث، أخرى)، وخطة كل كتاب:
// المخطط حتى اليوم مقابل الإنجاز. تواريخ الوحدات تُعدَّل من «المنهج الدراسي» لكل كتاب.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppDrawer } from "../../components/brand/app-drawer";
import { fmtDay } from "../../components/brand/date-range-sheet";
import { SceneBanner, SceneCard, SceneScreen } from "../../components/brand/scene-screen";
import { Radius, Spacing } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import { getCachedUnitRanges } from "../../lib/glossary";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { addDays, isoOf, phaseOf, planStatus, type BookSchedule, type UnitPhase } from "../../lib/scheduleCore";
import { getSchedule, unitsProgress } from "../../lib/studyTrack";
import { supabase } from "../../lib/supabase";
import type { Syllabus } from "../../lib/syllabus";

type Task = { id: string; title: string; date: string; time: string | null; type: string; status: string };
type BookPlan = {
  id: string;
  title: string;
  pdfPath: string;
  units: string[];
  plan: BookSchedule | null;
  actual: number[]; // إنجاز كل وحدة ٠..١
};
const TYPES = ["اختبار", "واجب", "برزنتيشن", "بحث", "أخرى"] as const;
const TYPE_KEY: Record<string, string> = { اختبار: "exam", واجب: "homework", برزنتيشن: "present", بحث: "research", أخرى: "other" };
const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { اختبار: "school", واجب: "document-text", برزنتيشن: "easel", بحث: "search", أخرى: "pricetag" };

/** بداية الأسبوع (الأحد) */
const weekStart = (iso: string) => addDays(iso, -new Date(`${iso}T00:00:00`).getDay());

export default function PlanScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const tone = pal.dark ? { good: "#7BD8A4", bad: "#FF8A96" } : { good: "#2F7D4A", bad: "#B83A48" };
  const today = isoOf(new Date());

  const [day, setDay] = useState(today);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [books, setBooks] = useState<BookPlan[]>([]);
  const [edit, setEdit] = useState<Task | null>(null); // نافذة إضافة/تعديل مهمة (id فارغ = جديدة)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = await getUserId();
      const [{ data: ev }, { data: bk }] = await Promise.all([
        supabase.from("student_events").select("id,title,event_date,event_time,event_type,status").eq("user_id", uid),
        supabase.from("books").select("id,title,pdf_path").eq("user_id", uid).not("is_archived", "is", true),
      ]);
      setTasks(
        (ev ?? []).map((r: any) => ({ id: r.id, title: r.title ?? "", date: String(r.event_date).slice(0, 10), time: r.event_time ?? null, type: r.event_type ?? "أخرى", status: r.status ?? "pending" }))
      );
      const list = (bk ?? []) as { id: string; title: string; pdf_path: string }[];
      const { data: syl } = list.length
        ? await supabase.from("book_syllabus").select("pdf_path,data,done").in("pdf_path", list.map((b) => b.pdf_path))
        : { data: [] as any[] };
      const plans: BookPlan[] = [];
      for (const b of list) {
        const row = (syl ?? []).find((s: any) => s.pdf_path === b.pdf_path);
        const units = ((row?.data as Syllabus | undefined)?.units ?? []).map((u) => u.title);
        if (!units.length) continue;
        const ranges = (await getCachedUnitRanges(b.pdf_path, units.length)) ?? [];
        const fit = ranges.length === units.length ? ranges : [];
        const weights = units.map((_, i) => (fit[i] ? fit[i].to - fit[i].from + 1 : 1));
        const [plan, prog] = await Promise.all([getSchedule(b.pdf_path, b.id, weights).catch(() => null), unitsProgress(b.pdf_path, b.id, fit, units.length).catch(() => [])]);
        const doneArr = (row?.done as boolean[] | null) ?? [];
        plans.push({ id: b.id, title: b.title, pdfPath: b.pdf_path, units, plan, actual: units.map((_, i) => (doneArr[i] ? 1 : prog[i]?.pct ?? 0)) });
      }
      setBooks(plans);
    } catch {
      // العرض يبقى بآخر بيانات
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i)), [day]);

  // وحدات تُذاكَر في يوم (من جداول الكتب)
  const unitsOn = useCallback(
    (iso: string) =>
      books.flatMap((b) =>
        (b.plan?.units ?? [])
          .map((w, i) => ({ b, i, w }))
          .filter((x) => iso >= x.w.start && iso <= x.w.end)
          .map((x) => ({ book: x.b, index: x.i, phase: phaseOf(x.w, x.b.actual[x.i] ?? 0, today) as UnitPhase }))
      ),
    [books, today]
  );
  const tasksOn = (iso: string) => tasks.filter((x) => x.date === iso && x.status !== "canceled").sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  const openSyllabus = (b: BookPlan) => router.push({ pathname: "/syllabus/[id]", params: { id: b.id, title: b.title, pdf_path: b.pdfPath } });

  async function toggleDone(x: Task) {
    const status = x.status === "done" ? "pending" : "done";
    setTasks((all) => all.map((y) => (y.id === x.id ? { ...y, status } : y)));
    await supabase.from("student_events").update({ status }).eq("id", x.id);
  }
  function confirmDelete(x: Task) {
    Alert.alert(t("myplan.deleteTitle"), t("myplan.deleteBody", { name: x.title }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          setTasks((all) => all.filter((y) => y.id !== x.id));
          await supabase.from("student_events").delete().eq("id", x.id);
        },
      },
    ]);
  }
  async function saveTask(x: Task) {
    const title = x.title.trim();
    if (!title) return;
    setEdit(null);
    const row = { title, event_date: x.date, event_time: x.time?.trim() || null, event_type: x.type };
    try {
      if (x.id) {
        await supabase.from("student_events").update(row).eq("id", x.id);
      } else {
        const uid = await getUserId();
        await supabase.from("student_events").insert({ ...row, user_id: uid, status: "pending" });
      }
    } catch {
      Alert.alert(t("myplan.title"), t("syllabus.err.edit"));
    }
    void load();
  }

  const dayUnits = unitsOn(day);
  const dayTasks = tasksOn(day);
  const phaseColor = (p: UnitPhase) => (p === "done" ? tone.good : p === "late" ? tone.bad : p === "now" ? pal.accent : pal.dim);

  return (
    <SceneScreen>
      <SceneBanner title={t("myplan.title")} subtitle={t("myplan.sub")} height={150} left={<AppDrawer tint={pal.dark ? "#FFFFFF" : pal.ink} light={!pal.dark} />} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* الأسبوع */}
        <SceneCard style={{ gap: 12 }}>
          <View style={[styles.weekHead, { flexDirection: dir.row }]}>
            <Pressable onPress={() => setDay(addDays(day, -7))} hitSlop={10} style={[styles.nav, { backgroundColor: pal.soft }]}>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={18} color={pal.ink} />
            </Pressable>
            <Text style={[styles.weekTitle, { color: pal.ink }]} numberOfLines={1}>
              {fmtDay(week[0], lang)} – {fmtDay(week[6], lang)}
            </Text>
            <Pressable onPress={() => setDay(addDays(day, 7))} hitSlop={10} style={[styles.nav, { backgroundColor: pal.soft }]}>
              <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.ink} />
            </Pressable>
          </View>
          <View style={[styles.weekRow, { flexDirection: dir.row }]}>
            {week.map((iso) => {
              const on = iso === day;
              const n = unitsOn(iso).length + tasksOn(iso).length;
              const d = new Date(`${iso}T00:00:00`);
              return (
                <Pressable key={iso} onPress={() => setDay(iso)} style={[styles.dayCell, { backgroundColor: on ? pal.accent : iso === today ? pal.soft : "transparent", borderColor: iso === today ? pal.accent : "transparent" }]}>
                  <Text style={[styles.dayName, { color: on ? pal.onAccent : pal.dim }]} numberOfLines={1}>
                    {d.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : lang, { weekday: "short" })}
                  </Text>
                  <Text style={[styles.dayNum, { color: on ? pal.onAccent : pal.ink }]}>{d.getDate()}</Text>
                  <View style={[styles.dot, { backgroundColor: n ? (on ? pal.onAccent : pal.accent) : "transparent" }]} />
                </Pressable>
              );
            })}
          </View>
          {day !== today ? (
            <Pressable onPress={() => setDay(today)} hitSlop={6} style={{ alignSelf: "center" }}>
              <Text style={[styles.link, { color: pal.accent }]}>{t("myplan.today")}</Text>
            </Pressable>
          ) : null}
        </SceneCard>

        {/* اليوم المختار */}
        <View style={[styles.secHead, { flexDirection: dir.row }]}>
          <Text style={[styles.secTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{day === today ? t("myplan.todayTitle") : fmtDay(day, lang)}</Text>
          <Pressable onPress={() => setEdit({ id: "", title: "", date: day, time: null, type: "واجب", status: "pending" })} style={[styles.addBtn, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
            <Ionicons name="add" size={17} color={pal.onAccent} />
            <Text style={[styles.addTxt, { color: pal.onAccent }]}>{t("myplan.add")}</Text>
          </Pressable>
        </View>

        {loading && !books.length && !tasks.length ? (
          <ActivityIndicator color={pal.accent} style={{ marginTop: 12 }} />
        ) : !dayUnits.length && !dayTasks.length ? (
          <SceneCard>
            <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign }]}>{t("myplan.emptyDay")}</Text>
          </SceneCard>
        ) : (
          <View style={{ gap: 8 }}>
            {dayUnits.map((u) => (
              <Pressable key={`${u.book.id}-${u.index}`} onPress={() => openSyllabus(u.book)}>
                <SceneCard style={[styles.item, { flexDirection: dir.row }]}>
                  <View style={[styles.icon, { backgroundColor: pal.soft }]}>
                    <Ionicons name="book" size={18} color={pal.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{u.book.units[u.index]}</Text>
                    <Text style={[styles.itemSub, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                      {u.book.title} · {t("myplan.progress", { n: Math.round((u.book.actual[u.index] ?? 0) * 100) })}
                    </Text>
                  </View>
                  <View style={[styles.phase, { borderColor: phaseColor(u.phase) }]}>
                    <Text style={[styles.phaseTxt, { color: phaseColor(u.phase) }]}>{t(`plan.phase.${u.phase}`)}</Text>
                  </View>
                </SceneCard>
              </Pressable>
            ))}
            {dayTasks.map((x) => (
              <Pressable key={x.id} onPress={() => setEdit(x)}>
                <SceneCard style={[styles.item, { flexDirection: dir.row }]}>
                  <Pressable onPress={() => void toggleDone(x)} hitSlop={8} style={[styles.check, { borderColor: x.status === "done" ? tone.good : pal.track, backgroundColor: x.status === "done" ? tone.good : "transparent" }]}>
                    {x.status === "done" ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: x.status === "done" ? pal.dim : pal.ink, textAlign: dir.textAlign, textDecorationLine: x.status === "done" ? "line-through" : "none" }]}>{x.title}</Text>
                    <Text style={[styles.itemSub, { color: pal.dim, textAlign: dir.textAlign }]}>
                      <Ionicons name={TYPE_ICON[x.type] ?? "pricetag"} size={12} color={pal.accent} /> {t(`myplan.type.${TYPE_KEY[x.type] ?? "other"}`)}
                      {x.time ? ` · ${x.time}` : ""}
                    </Text>
                  </View>
                  <Pressable onPress={() => confirmDelete(x)} hitSlop={8} style={[styles.trash, { borderColor: pal.cardBorder }]}>
                    <Ionicons name="trash-outline" size={16} color={tone.bad} />
                  </Pressable>
                </SceneCard>
              </Pressable>
            ))}
          </View>
        )}

        {/* خطط الكتب: المخطط حتى اليوم مقابل الإنجاز */}
        {books.length ? <Text style={[styles.secTitle, { color: pal.ink, textAlign: dir.textAlign, marginTop: 8 }]}>{t("myplan.books")}</Text> : null}
        {books.map((b) => {
          const st = b.plan ? planStatus(b.plan, b.actual, today) : null;
          const tint = st ? (st.diffUnits >= 0.5 ? tone.good : st.diffUnits <= -0.5 ? tone.bad : pal.accent) : pal.dim;
          return (
            <Pressable key={b.id} onPress={() => openSyllabus(b)}>
              <SceneCard style={{ gap: 8 }}>
                <View style={[{ flexDirection: dir.row, alignItems: "center", gap: 8 }]}>
                  <Text style={[styles.itemTitle, { color: pal.ink, textAlign: dir.textAlign, flex: 1 }]} numberOfLines={2}>
                    {b.title}
                  </Text>
                  <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.dim} />
                </View>
                {st && b.plan ? (
                  <>
                    {([
                      [t("plan.expected"), Math.round(st.expected * 100), pal.dim],
                      [t("plan.actual"), Math.round(st.actual * 100), tint],
                    ] as const).map(([label, v, c]) => (
                      <View key={label} style={[styles.barRow, { flexDirection: dir.row }]}>
                        <Text style={[styles.barLbl, { color: pal.dim, textAlign: dir.textAlign }]}>{label}</Text>
                        <View style={[styles.barTrack, { backgroundColor: pal.track }]}>
                          <View style={[styles.barFill, { width: `${Math.max(2, v)}%`, backgroundColor: c }, dir.isRTL ? { alignSelf: "flex-end" } : null]} />
                        </View>
                        <Text style={[styles.barVal, { color: pal.ink }]}>{v}%</Text>
                      </View>
                    ))}
                    <Text style={[styles.itemSub, { color: tint, textAlign: dir.textAlign, fontWeight: "900" }]}>
                      {st.diffUnits >= 0.5 ? t("plan.ahead", { n: st.diffUnits }) : st.diffUnits <= -0.5 ? t("plan.behind", { n: Math.abs(st.diffUnits) }) : t("plan.onTrack")}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.itemSub, { color: pal.accent, textAlign: dir.textAlign, fontWeight: "800" }]}>{t("myplan.noSchedule")}</Text>
                )}
              </SceneCard>
            </Pressable>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* إضافة/تعديل مهمة */}
      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView behavior="padding" style={styles.mask}>
          <Pressable style={{ flex: 1 }} onPress={() => setEdit(null)} />
          {edit ? (
            <View style={[styles.sheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]}>
              <Text style={[styles.secTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{edit.id ? t("myplan.editTask") : t("myplan.newTask")}</Text>
              <TextInput
                value={edit.title}
                onChangeText={(v) => setEdit({ ...edit, title: v })}
                placeholder={t("myplan.taskTitle")}
                placeholderTextColor={pal.dim}
                style={[styles.input, { color: pal.ink, borderColor: pal.cardBorder, textAlign: dir.textAlign }]}
              />
              <View style={[styles.types, { flexDirection: dir.row }]}>
                {TYPES.map((ty) => {
                  const on = edit.type === ty;
                  return (
                    <Pressable key={ty} onPress={() => setEdit({ ...edit, type: ty })} style={[styles.typeChip, { backgroundColor: on ? pal.accent : pal.soft, flexDirection: dir.row }]}>
                      <Ionicons name={TYPE_ICON[ty]} size={14} color={on ? pal.onAccent : pal.accent} />
                      <Text style={[styles.typeTxt, { color: on ? pal.onAccent : pal.ink }]}>{t(`myplan.type.${TYPE_KEY[ty]}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={[styles.dateRow, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
                <Pressable onPress={() => setEdit({ ...edit, date: addDays(edit.date, -1) })} style={[styles.nav, { backgroundColor: pal.card }]}>
                  <Text style={[styles.addTxt, { color: pal.ink }]}>−</Text>
                </Pressable>
                <Text style={[styles.weekTitle, { color: pal.ink }]}>{fmtDay(edit.date, lang)}</Text>
                <Pressable onPress={() => setEdit({ ...edit, date: addDays(edit.date, 1) })} style={[styles.nav, { backgroundColor: pal.card }]}>
                  <Text style={[styles.addTxt, { color: pal.ink }]}>+</Text>
                </Pressable>
              </View>
              <TextInput
                value={edit.time ?? ""}
                onChangeText={(v) => setEdit({ ...edit, time: v })}
                placeholder={t("myplan.timeHint")}
                placeholderTextColor={pal.dim}
                style={[styles.input, { color: pal.ink, borderColor: pal.cardBorder, textAlign: dir.textAlign }]}
              />
              <Pressable
                onPress={() => void saveTask(edit)}
                disabled={!edit.title.trim()}
                style={({ pressed }) => [styles.save, { backgroundColor: pal.accent, opacity: !edit.title.trim() ? 0.4 : pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.addTxt, { color: pal.onAccent, fontSize: 16 }]}>{t("common.save")}</Text>
              </Pressable>
              {edit.id ? (
                <Pressable
                  onPress={() => {
                    const x = edit;
                    setEdit(null);
                    confirmDelete(x);
                  }}
                  hitSlop={8}
                  style={{ alignSelf: "center", paddingVertical: 6 }}
                >
                  <Text style={{ color: tone.bad, fontWeight: "800", fontSize: 14.5 }}>{t("common.delete")}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 120, gap: 12 },
  weekHead: { alignItems: "center", justifyContent: "space-between", gap: 10 },
  weekTitle: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "900" },
  nav: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  weekRow: { justifyContent: "space-between", gap: 4 },
  dayCell: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 16, gap: 3, borderWidth: 1 },
  dayName: { fontSize: 11.5, fontWeight: "800" },
  dayNum: { fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  link: { fontSize: 14, fontWeight: "900" },
  secHead: { alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  secTitle: { fontSize: 16.5, fontWeight: "900", flexShrink: 1 },
  addBtn: { alignItems: "center", gap: 6, paddingHorizontal: 14, height: 38, borderRadius: Radius.pill },
  addTxt: { fontSize: 14, fontWeight: "900" },
  dim: { fontSize: 14, lineHeight: 22 },
  item: { alignItems: "center", gap: 12 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemTitle: { fontSize: 15, fontWeight: "800", lineHeight: 22 },
  itemSub: { fontSize: 12.5, marginTop: 2 },
  phase: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  phaseTxt: { fontSize: 11.5, fontWeight: "900" },
  check: { width: 28, height: 28, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  trash: { width: 34, height: 34, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  barRow: { alignItems: "center", gap: 8 },
  barLbl: { width: 128, fontSize: 12.5, fontWeight: "800" },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  barVal: { width: 44, fontSize: 12.5, fontWeight: "900", textAlign: "center" },
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: 38, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  types: { flexWrap: "wrap", gap: 8 },
  typeChip: { alignItems: "center", gap: 6, paddingHorizontal: 12, height: 36, borderRadius: Radius.pill },
  typeTxt: { fontSize: 13.5, fontWeight: "800" },
  dateRow: { alignItems: "center", gap: 8, borderRadius: 16, padding: 8 },
  save: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center" },
});
