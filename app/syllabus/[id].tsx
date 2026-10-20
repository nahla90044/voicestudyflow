// app/syllabus/[id].tsx
// المنهج الدراسي (Syllabus) لكتاب: وحدات بعناوين ومواضيع ومخرجات،
// تشيك ليست لمتابعة التقدّم، ونسبة إنجاز، وطباعة/مشاركة المنهج.
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuzanMindMap, MM_COLORS, mindmapPrintHtml } from "../../components/brand/mindmap";
import { getUnitContent, setUnitContent } from "../../lib/unitContent";
import { stopSpeaking } from "../../lib/voice";
import { printBranded } from "../../lib/pdfBrand";
import { DateRangeSheet } from "../../components/brand/date-range-sheet";
import { PlanSetupSheet } from "../../components/brand/plan-setup-sheet";
import { healSyllabus } from "../../lib/syllabusHeal";
import { getCachedUnitRanges, getUnitRanges } from "../../lib/glossary";
import type { UnitRange } from "../../lib/glossaryCore";
import { getDailyGoal, setDailyGoal } from "../../lib/goals";
import { getExamDate, setExamDate } from "../../lib/readiness";
import { isoOf, phaseOf, planStatus, type BookSchedule, type UnitWindow } from "../../lib/scheduleCore";
import { getSchedule, saveSchedule, unitsProgress, type UnitProgress } from "../../lib/studyTrack";
import { supabase } from "../../lib/supabase";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { deleteSyllabus, regenerateUnits, removeUnits, resetUnitContent, type SyllabusState } from "../../lib/syllabusEdit";
import { PressableScale } from "../../components/brand/motion";
import { CoachHelpButton, useCoachTour } from "../../components/brand/coach-mark";
import {
  generateMindmap,
  generateSyllabus,
  getSyllabus,
  setUnitDone,
  type MindMap,
  type Syllabus,
  type SyllabusStage,
} from "../../lib/syllabus";


const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
function fmtISO(iso: string): string {
  const p = (iso || "").split("-");
  if (p.length < 3) return iso;
  return `${Number(p[2])} ${AR_MONTHS[Number(p[1]) - 1] ?? ""}`.trim();
}
function fmtWin(w: UnitWindow): string {
  return w.start === w.end ? fmtISO(w.start) : `${fmtISO(w.start)} – ${fmtISO(w.end)}`;
}

export default function SyllabusScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  // ألوان الحالة بدرجات تُقرأ على المشهد الفاتح والداكن (كما في صفحة الكتاب)
  const tone = pal.dark ? { good: "#7BD8A4", bad: "#FF8A96" } : { good: "#2F7D4A", bad: "#B83A48" };
  // أحمر الحذف المُصمت (نص أبيض واضح عليه في المشهدين)
  const DANGER = "#D9485A";
  const { id, title, pdf_path } = useLocalSearchParams<{
    id?: string;
    title?: string;
    pdf_path?: string;
  }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookId = typeof id === "string" ? id : "";
  const bookTitle = typeof title === "string" ? title : t("syllabus.title");

  const [loading, setLoading] = useState(true);
  const coach = useCoachTour("syllabus_v1", [
    { id: "read", title: t("coach.syl.read.title"), body: t("coach.syl.read.body"), shape: "rect" },
    { id: "file", title: t("coach.syl.file.title"), body: t("coach.syl.file.body"), shape: "rect" },
    { id: "unit", title: t("coach.syl.unit.title"), body: t("coach.syl.unit.body"), shape: "rect",
      rows: [
        { icon: "headset-outline", text: t("coach.syl.unit.summary") },
        { icon: "videocam-outline", text: t("coach.syl.unit.video") },
        { icon: "school-outline", text: t("coach.syl.unit.quiz") },
        { icon: "git-network-outline", text: t("coach.syl.unit.mindmap") },
      ] },
    { id: "manage", title: t("coach.syl.manage.title"), body: t("coach.syl.manage.body"), shape: "rect" },
  ], { delay: 1500, ready: !loading });
  const [busy, setBusy] = useState(false);
  const [genPct, setGenPct] = useState(0); // تقدّم توليد المنهج (٪)
  const [genMsg, setGenMsg] = useState(""); // رسالة المرحلة الحالية
  const [syl, setSyl] = useState<Syllabus | null>(null);
  const [done, setDone] = useState<boolean[]>([]);
  // صفحات الوحدات، وتقدّم كل وحدة، وجدول المذاكرة (تواريخ كل وحدة)
  const [ranges, setRanges] = useState<UnitRange[]>([]);
  const [prog, setProg] = useState<UnitProgress[]>([]);
  const [plan, setPlan] = useState<BookSchedule | null>(null);
  // تواريخ وحدة واحدة (تقويم)، وإنشاء/تعديل الخطة كاملة (وقت المذاكرة)
  const [rangeSheet, setRangeSheet] = useState<{ mode: "unit"; i: number } | null>(null);
  const [planSheet, setPlanSheet] = useState(false);
  const [goalMin, setGoalMin] = useState(60);
  const [examISO, setExamISO] = useState<string | null>(null);
  const today = isoOf(new Date());
  const [err, setErr] = useState("");
  // تعديل الوحدات: وضع التحديد، والوحدات المختارة، والوحدات الجاري إعادة إنشائها
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [working, setWorking] = useState<number[]>([]);
  const editing = working.length > 0;
  // كتب العيّنة مشتركة بين الجميع: منهجها للقراءة فقط (صلاحيات الجدول تمنع تعديله)
  const canEdit = !!pdfPath && !pdfPath.startsWith("samples/");

  // الخريطة الذهنية (الاختبار والملخّص صارا صفحتين مستقلتين: unit-quiz / unit-summary)
  const [mmUnit, setMmUnit] = useState<number | null>(null);
  const [mmLoading, setMmLoading] = useState(false);
  const [mm, setMm] = useState<MindMap | null>(null);
  const [mmFull, setMmFull] = useState(false);
  const [mmW, setMmW] = useState(0);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const mmTheme = { dark: !!pal.dark, bg: pal.card, ink: pal.ink, dim: pal.dim };

  // صفحات كل وحدة → تقدّمها وجدولها (الأيام تُوزَّع بحسب صفحات الوحدة)
  async function loadTrack(units: { title: string }[]) {
    if (!units.length) {
      setRanges([]);
      setProg([]);
      setPlan(null);
      return;
    }
    try {
      const titles = units.map((u) => u.title);
      const cached = await getCachedUnitRanges(pdfPath, titles.length);
      let rs = cached?.length === titles.length ? cached : null;
      if (!rs) {
        const { data } = await supabase.from("books").select("page_count").eq("id", bookId).maybeSingle();
        rs = await getUnitRanges(pdfPath, titles, Number(data?.page_count) || 0).catch(() => []);
      }
      setRanges(rs);
      const weights = titles.map((_, i) => (rs![i] ? rs![i].to - rs![i].from + 1 : 1));
      const [pg, pl, ex] = await Promise.all([unitsProgress(pdfPath, bookId, rs, titles.length), getSchedule(pdfPath, bookId, weights).catch(() => null), getExamDate(bookId)]);
      setProg(pg);
      setPlan(pl);
      setExamISO(pl?.exam ?? ex);
      getDailyGoal().then((g) => setGoalMin(g >= 30 ? g : 60)).catch(() => {});
    } catch {}
  }
  const weightsOf = () => (syl?.units ?? []).map((_, i) => (ranges[i] ? ranges[i].to - ranges[i].from + 1 : 1));

  // الرجوع من الملخص/الفيديو/الاختبار/البطاقات: تحديث التقدّم
  useFocusEffect(
    React.useCallback(() => {
      if (syl?.units.length) void loadTrack(syl.units);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syl])
  );

  // الخطة من وقت المذاكرة: موعد الاختبار يُحفظ للكتاب، ودقائق اليوم تصير هدف اليوم في الرئيسية
  async function savePlan(next: BookSchedule) {
    setPlanSheet(false);
    setPlan(next);
    setExamISO(next.exam ?? null);
    if (bookId) void setExamDate(bookId, next.exam ?? null);
    if (next.minutes) void setDailyGoal(next.minutes);
    await saveSchedule(pdfPath, next).catch(() => Alert.alert(t("plan.title"), t("syllabus.err.edit")));
  }
  async function saveUnitDates(i: number, start: string, end: string) {
    setRangeSheet(null);
    if (!plan) return;
    const units = plan.units.map((w, k) => (k === i ? { start, end } : w));
    const next: BookSchedule = { start: units.reduce((m, w) => (w.start < m ? w.start : m), plan.start), end: units.reduce((m, w) => (w.end > m ? w.end : m), plan.end), units };
    setPlan(next);
    await saveSchedule(pdfPath, next).catch(() => Alert.alert(t("plan.title"), t("syllabus.err.edit")));
  }
  function confirmDeletePlan() {
    setPlanSheet(false);
    Alert.alert(t("plan.deleteTitle"), t("plan.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          setPlan(null);
          void saveSchedule(pdfPath, null).catch(() => {});
        },
      },
    ]);
  }
  // إنجاز كل وحدة (المؤشَّرة منجزة = ١٠٠٪)
  const actual = (syl?.units ?? []).map((_, i) => (done[i] ? 1 : prog[i]?.pct ?? 0));

  // أوقف أي قراءة صوتية عند مغادرة الشاشة (يمنع بقاء الصوت/التعليق بعد الخروج)
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await getSyllabus(pdfPath);
        if (r) {
          setSyl(r.data);
          setDone(r.done.length === r.data.units.length ? r.done : new Array(r.data.units.length).fill(false));
          await loadTrack(r.data.units);
          // الإصلاح الذاتي بالخلفية: إن خالف المنهج تقسيم الكتاب المتحقَّق منه يُصحَّح ويُعرض المصحَّح
          void healSyllabus(pdfPath, r.data, r.done).then(async (h) => {
            if (!h) return;
            const fresh = await getSyllabus(pdfPath);
            if (!fresh) return;
            setSyl(fresh.data);
            setDone(fresh.done.length === fresh.data.units.length ? fresh.done : new Array(fresh.data.units.length).fill(false));
            await loadTrack(fresh.data.units);
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [pdfPath]);

  // تقدّم التوليد من مراحله الفعلية (الفهرس ← الفحص ← محتوى الوحدات ← الحفظ)، يتحرك ببطء داخل كل مرحلة
  const [stage, setStage] = useState<SyllabusStage | null>(null);
  useEffect(() => {
    if (!busy || !stage) {
      if (!busy) setGenPct(0);
      return;
    }
    const range: Record<SyllabusStage, [number, number, string]> = {
      structure: [3, 30, t("syllabus.gen.reading")],
      check: [30, 40, t("syllabus.gen.extracting")],
      content: [40, 92, t("syllabus.gen.lectures")],
      save: [92, 99, t("syllabus.gen.finishing")],
    };
    const [from, to, msg] = range[stage];
    setGenMsg(msg);
    setGenPct((p) => Math.max(p, from));
    const id = setInterval(() => setGenPct((p) => Math.min(to, p + Math.max(1, Math.round((to - p) * 0.06)))), 500);
    return () => clearInterval(id);
  }, [busy, stage, t]);

  // إعادة إنشاء المنهج كاملًا (بتأكيد: تُحسب طلبًا) — من الفهرس الدقيق
  function confirmRegenerate() {
    Alert.alert(t("syllabus.regenTitle"), t("syllabus.regenBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("syllabus.regenerate"), onPress: () => void onGenerate() },
    ]);
  }

  // ===== تعديل الوحدات (تحديد ثم إعادة إنشاء أو حذف) =====
  function startSelecting(first?: number) {
    setPicked(first === undefined ? [] : [first]);
    setSelecting(true);
  }
  function stopSelecting() {
    setSelecting(false);
    setPicked([]);
  }
  function togglePick(i: number) {
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  }
  async function applyState(s: SyllabusState | null) {
    setSyl(s?.data ?? null);
    setDone(s?.done ?? []);
    await loadTrack(s?.data.units ?? []);
  }

  function confirmRegenUnits() {
    const units = [...picked];
    if (!units.length) return;
    Alert.alert(t("syllabus.unitsRegenTitle"), t("syllabus.unitsRegenBody", { n: units.length }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("syllabus.select.regen", { n: units.length }), onPress: () => void runRegenUnits(units) },
    ]);
  }
  async function runRegenUnits(units: number[]) {
    stopSelecting();
    setWorking(units);
    const failed: number[] = [];
    try {
      await regenerateUnits(pdfPath, units, (i, s, error) => {
        setWorking((w) => w.filter((x) => x !== i));
        if (s) void applyState(s);
        else if (error !== "USER_QUOTA") failed.push(i);
      });
      if (failed.length) Alert.alert(t("syllabus.unitsRegenTitle"), t("syllabus.err.unitRegen", { list: failed.map((i) => i + 1).join("، ") }));
    } catch (e) {
      Alert.alert(t("syllabus.unitsRegenTitle"), (e as Error)?.message === "USER_QUOTA" ? t("pay.reason.ai") : t("syllabus.err.edit"));
    } finally {
      setWorking([]);
    }
  }

  function confirmDeleteUnits() {
    const units = [...picked];
    if (!units.length) return;
    Alert.alert(t("syllabus.unitsDeleteTitle"), t("syllabus.unitsDeleteBody", { n: units.length }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("syllabus.select.delete", { n: units.length }),
        style: "destructive",
        onPress: () =>
          void removeUnits(pdfPath, units)
            .then(async (s) => {
              stopSelecting();
              await applyState(s);
            })
            .catch(() => Alert.alert(t("syllabus.unitsDeleteTitle"), t("syllabus.err.edit"))),
      },
    ]);
  }

  function confirmDeleteSyllabus() {
    Alert.alert(t("syllabus.deleteTitle"), t("syllabus.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("syllabus.delete"),
        style: "destructive",
        onPress: () =>
          void deleteSyllabus(pdfPath)
            .then(async () => {
              stopSelecting();
              await applyState(null);
            })
            .catch(() => Alert.alert(t("syllabus.deleteTitle"), t("syllabus.err.edit"))),
      },
    ]);
  }

  async function onGenerate() {
    setErr("");
    setBusy(true);
    try {
      const before = (syl?.units ?? []).map((u) => u.title).join("|");
      // قراءة صفحات الكتاب كلها أولًا (مرة واحدة لكل كتاب): التقدّم بعدد الصفحات الفعلي
      const data = await generateSyllabus(pdfPath, setStage, (done, total) => {
        setGenMsg(t("syllabus.gen.readPages", { done, total }));
        setGenPct(Math.max(3, Math.round(3 + (27 * done) / Math.max(1, total))));
      });
      // تغيّرت الوحدات → محتوى الوحدات القديم (ملخصات، اختبارات، خرائط، فيديو) لم يعد يطابقها فيُحذف
      if (before && before !== data.units.map((u) => u.title).join("|")) await resetUnitContent(pdfPath);
      setSyl(data);
      setDone(new Array(data.units.length).fill(false));
      await loadTrack(data.units);
    } catch (e: any) {
      // رسالة الخطأ الخام (مثل USER_QUOTA) لا تُعرض للمستخدم
      setErr(e?.message === "USER_QUOTA" ? t("pay.reason.ai") : t("syllabus.err.generate"));
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  // الدخول للقارئ (الكتاب نفسه) من شاشة المنهج
  function startReading() {
    router.push({
      pathname: "/reader/[id]",
      params: { id: bookId, title: bookTitle, pdf_path: pdfPath },
    });
  }

  async function startMindmap(i: number) {
    if (!syl) return;
    const u = syl.units[i];
    setMmUnit(i);
    setMmLoading(true);
    setMm(null);
    try {
      // مخزَّن مسبقًا لهذه الوحدة؟ اعرضه فورًا بلا استهلاك ذكاء
      const cached = await getUnitContent<MindMap>(pdfPath, i, "mindmap");
      if (cached) {
        setMm(cached);
        return;
      }
      // محتوى الوحدة المختصر = توليد سريع (الوحدات أصلًا مستخرَجة من الكتاب)
      const ctx = `الفكرة المركزية: ${u.title}\nالفروع الرئيسية:\n${u.topics
        .map((t) => "- " + t)
        .join("\n")}`;
      const map = await generateMindmap(ctx);
      if (!map) {
        setMmUnit(null);
        setErr(t("syllabus.err.mindmap"));
      } else {
        setMm(map);
        setUnitContent(pdfPath, i, "mindmap", map);
      }
    } catch {
      setMmUnit(null);
      setErr(t("syllabus.err.mindmap"));
    } finally {
      setMmLoading(false);
    }
  }

  async function toggle(i: number) {
    const next = [...done];
    next[i] = !next[i];
    setDone(next);
    try {
      await setUnitDone(pdfPath, next);
    } catch {}
  }

  const completed = done.filter(Boolean).length;
  const total = syl?.units.length ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  async function onPrint() {
    if (!syl) return;
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const units = syl.units
      .map(
        (u, i) => `
        <div class="unit">
          <h3>${i + 1}. ${esc(u.title)}</h3>
          ${u.objectives?.length ? `<p class="about"><b>${esc(t("syllabus.objectives"))}:</b></p><ul>${u.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : u.about ? `<p class="about">${esc(u.about)}</p>` : ""}
          ${plan?.units[i] ? `<p class="when">${esc(t("syllabus.studyOn"))}: ${esc(fmtWin(plan.units[i]))}${ranges[i] ? ` · ${esc(t("glossary.pages", { from: ranges[i].from, to: ranges[i].to }))}` : ""}</p>` : ranges[i] ? `<p class="when">${esc(t("glossary.pages", { from: ranges[i].from, to: ranges[i].to }))}</p>` : ""}
          ${u.topics.length ? `<ul>${u.topics.map((topic) => `<li>${esc(topic)}</li>`).join("")}</ul>` : ""}
          ${u.outcome ? `<p class="out">${esc(u.outcome)}</p>` : ""}
        </div>`
      )
      .join("");
    const tips = syl.tips?.length
      ? `<div class="tips"><h2>${esc(t("syllabus.print.tipsHeading"))}</h2><ul>${syl.tips.map((tip) => `<li>${esc(tip)}</li>`).join("")}</ul></div>`
      : "";
    const html = `<!doctype html><html dir="${dir.writingDirection}" lang="ar"><head><meta charset="utf-8"><style>
      * { font-family: -apple-system, 'SF Arabic', sans-serif; }
      body { padding: 28px; color: #14233a; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .sub { color: #6b7a90; margin: 0 0 18px; }
      .unit { border: 1px solid #dce3ee; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; page-break-inside: avoid; }
      h3 { font-size: 16px; margin: 0 0 6px; color: #5b3df5; }
      ul { margin: 6px 0; padding-inline-start: 20px; }
      li { margin: 3px 0; }
      .out { color: #0a7d52; font-size: 13px; margin: 6px 0 0; }
      .about { color: #334155; font-size: 13.5px; line-height: 1.8; margin: 4px 0 6px; }
      .when { color: #0a6ed1; font-size: 12.5px; margin: 2px 0 6px; font-weight: 700; }
      .tips { margin-top: 18px; }
      .box { display:inline-block; width:14px; height:14px; border:1.5px solid #5b3df5; border-radius:4px; margin-inline-start:8px; vertical-align:middle; }
    </style></head><body>
      <h1>${esc(syl.title ?? bookTitle)}</h1>
      <p class="sub">${esc(t("syllabus.print.sub", { count: total }))}</p>
      ${units}
      ${tips}
    </body></html>`;
    try {
      await printBranded(html);
    } catch {}
  }

  // طباعة الخريطة الذهنية: صفحة أفقية بالخريطة الشعاعية نفسها (نفس التخطيط في التطبيق،
  // بلا تداخل)، ثم صفحة «المخطط الكامل» بالنصوص كاملة بلا اختصار.
  async function printMindmap() {
    if (!mm) return;
    const html = mindmapPrintHtml(mm, {
      heading: `${t("syllabus.mindmap.title")} — ${bookTitle}`,
      outlineTitle: t("syllabus.mindmap.outline"),
      dir: dir.isRTL ? "rtl" : "ltr",
    });
    try {
      await printBranded(html);
    } catch {}
  }

  const backBtn = (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <SceneIconButton>
        <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
      </SceneIconButton>
    </Pressable>
  );
  const printBtn = syl ? (
    <Pressable onPress={onPrint} hitSlop={8}>
      <SceneIconButton>
        <Ionicons name="print" size={20} color={pal.ink} />
      </SceneIconButton>
    </Pressable>
  ) : undefined;
  // زر ثانوي بألوان المشهد (بديل الأزرار النيون القديمة)
  const pillStyle = { backgroundColor: pal.soft, borderColor: pal.cardBorder };

  return (
    <SceneScreen>
      <SceneBanner
        title={t("syllabus.title")}
        height={130}
        left={backBtn}
        right={
          <View style={{ flexDirection: dir.row, gap: 8 }}>
            {printBtn}
            <CoachHelpButton onPress={coach.replay} />
          </View>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={pal.accent} />
        </View>
      ) : !syl || busy ? (
        // أول إنشاء وإعادة الإنشاء بنفس الشاشة ونفس المراحل
        <View style={styles.center}>
          <Ionicons name="sparkles" size={40} color={pal.accent} />
          <Text style={[styles.emptyTitle, { color: pal.ink }]}>{syl ? t("syllabus.regenTitle") : t("syllabus.empty.title")}</Text>
          <Text style={[styles.emptySub, { color: pal.dim }]}>
            {syl ? t("syllabus.regenSub") : t("syllabus.empty.sub")}
          </Text>
          {!!err && <Text style={[styles.err, { color: tone.bad }]}>{err}</Text>}
          {busy ? (
            // شريط تقدّم واضح: يطمئن المستخدم أن التطبيق يعمل ويوضّح ما تبقّى
            <View style={styles.genWrap}>
              <View style={[styles.genHead, { flexDirection: dir.row }]}>
                <Text style={[styles.genMsg, { color: pal.ink }]}>{genMsg}</Text>
                <Text style={[styles.genPct, { color: pal.accent }]}>{genPct}%</Text>
              </View>
              <View style={[styles.genTrack, { backgroundColor: pal.track }]}>
                <View style={[styles.genFill, { width: `${genPct}%`, backgroundColor: pal.accent }]} />
              </View>
              <Text style={[styles.genHint, { color: pal.dim }]}>{t("syllabus.gen.hint")}</Text>
            </View>
          ) : (
            <Pressable
              onPress={onGenerate}
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: pal.accent, flexDirection: dir.row, marginTop: Spacing.lg, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Ionicons name="sparkles" size={18} color={pal.onAccent} />
              <Text style={[styles.ctaTxt, { color: pal.onAccent }]}>{t("syllabus.empty.generate")}</Text>
            </Pressable>
          )}
          {!busy && (
          <Pressable
            onPress={startReading}
            style={[styles.readNowBtn, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.accent }]}
          >
            <Ionicons name="book" size={18} color={pal.accent} />
            <Text style={[styles.readNowTxt, { color: pal.ink }]}>{t("syllabus.readNowFull")}</Text>
          </Pressable>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* عنوان + تقدّم */}
          <SceneCard style={styles.progCard}>
            <Text style={[styles.bookTitle, { color: pal.ink }]} numberOfLines={3}>
              {syl.title ?? bookTitle}
            </Text>
            <View style={[styles.progRow, { flexDirection: dir.row }]}>
              <Text style={[styles.progPct, { color: pal.accent }]}>{pct}%</Text>
              <Text style={[styles.progLabel, { color: pal.dim }]}>
                {t("syllabus.progress.completed", { completed, total })}
              </Text>
            </View>
            <View style={[styles.progTrack, { backgroundColor: pal.track }]}>
              <View style={[styles.progFill, { width: `${pct}%`, backgroundColor: pal.accent }]} />
            </View>
          </SceneCard>

          {/* جدول المذاكرة: المخطط حتى اليوم مقابل إنجازك (أثر الاجتهاد واضح) */}
          {(() => {
            if (!plan)
              return canEdit ? (
                <Pressable onPress={() => setPlanSheet(true)} style={({ pressed }) => [styles.cta, { backgroundColor: pal.soft, borderWidth: 1, borderColor: pal.accent, flexDirection: dir.row, opacity: pressed ? 0.9 : 1 }]}>
                  <Ionicons name="calendar" size={18} color={pal.accent} />
                  <Text style={[styles.ctaTxt, { color: pal.ink }]}>{t("plan.setup")}</Text>
                </Pressable>
              ) : null;
            const st = planStatus(plan, actual, today);
            const exp = Math.round(st.expected * 100);
            const act = Math.round(st.actual * 100);
            const ahead = st.diffUnits >= 0.5;
            const behind = st.diffUnits <= -0.5;
            const tint = ahead ? tone.good : behind ? tone.bad : pal.accent;
            return (
              <SceneCard style={{ gap: 10 }}>
                <View style={[styles.planHead, { flexDirection: dir.row }]}>
                  <Ionicons name="calendar" size={18} color={pal.accent} />
                  <Text style={[styles.planTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("plan.title")}</Text>
                  {canEdit ? (
                    <Pressable onPress={() => setPlanSheet(true)} hitSlop={8} style={[styles.pencil, { borderColor: pal.cardBorder }]}>
                      <Ionicons name="create-outline" size={16} color={pal.ink} />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={[styles.planDim, { color: pal.dim, textAlign: dir.textAlign }]}>
                  {fmtWin({ start: plan.start, end: plan.end })}
                  {st.daysLeft >= 0 ? `  ·  ${t("plan.daysLeft", { n: st.daysLeft })}` : `  ·  ${t("plan.ended")}`}
                  {examISO ? `  ·  ${t("plan.exam", { date: fmtISO(examISO) })}` : ""}
                </Text>
                {([
                  [t("plan.expected"), exp, pal.dim],
                  [t("plan.actual"), act, tint],
                ] as const).map(([label, v, c]) => (
                  <View key={label} style={[styles.barRow, { flexDirection: dir.row }]}>
                    <Text style={[styles.barLbl, { color: pal.dim, textAlign: dir.textAlign }]}>{label}</Text>
                    <View style={[styles.barTrack, { backgroundColor: pal.track }]}>
                      <View style={[styles.barFill, { width: `${Math.max(2, v)}%`, backgroundColor: c }, dir.isRTL ? { alignSelf: "flex-end" } : null]} />
                    </View>
                    <Text style={[styles.barVal, { color: pal.ink }]}>{v}%</Text>
                  </View>
                ))}
                <Text style={[styles.planStatus, { color: tint, textAlign: dir.textAlign }]}>
                  {ahead ? t("plan.ahead", { n: Math.abs(st.diffUnits) }) : behind ? t("plan.behind", { n: Math.abs(st.diffUnits) }) : t("plan.onTrack")}
                </Text>
                {st.projectedEnd && st.actual < 1 ? (
                  <Text style={[styles.planDim, { color: pal.dim, textAlign: dir.textAlign }]}>
                    {t("plan.projected", { date: fmtISO(st.projectedEnd) })}
                    {st.projectedEnd > plan.end ? ` · ${t("plan.afterEnd")}` : ""}
                  </Text>
                ) : null}
              </SceneCard>
            );
          })()}

          {/* إدارة المنهج في الأعلى: إعادة الإنشاء (نفس طريق أول إنشاء) · تعديل الوحدات · الحذف */}
          {!selecting && canEdit && (
            <View {...coach.bind("manage")} style={[styles.manageRow, { flexDirection: dir.row }]}>
              {(
                [
                  ["refresh", t("syllabus.regenShort"), confirmRegenerate, pal.ink, pal.cardBorder],
                  ["checkbox-outline", t("syllabus.manage"), () => startSelecting(), pal.ink, pal.cardBorder],
                  ["trash-outline", t("common.delete"), confirmDeleteSyllabus, tone.bad, tone.bad],
                ] as const
              ).map(([icon, label, onPress, color, border]) => (
                <Pressable
                  key={label}
                  onPress={busy || editing ? undefined : onPress}
                  style={({ pressed }) => [
                    styles.manageBtn,
                    { flexDirection: dir.row, backgroundColor: pal.card, borderColor: border, opacity: busy || editing ? 0.5 : pressed ? 0.85 : 1 },
                  ]}
                >
                  <Ionicons name={icon} size={17} color={color} />
                  <Text style={[styles.manageTxt, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* زر الدخول للقراءة — بارز فوق الوحدات */}
          <Pressable
            {...coach.bind("read")}
            onPress={startReading}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: pal.accent, flexDirection: dir.row, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Ionicons name="book" size={18} color={pal.onAccent} />
            <Text style={[styles.ctaTxt, { color: pal.onAccent }]}>{t("syllabus.readNow")}</Text>
          </Pressable>

          {/* ملف المذاكرة: ملخّصات الوحدات كلها بالترتيب في PDF واحد */}
          <Pressable
            {...coach.bind("file")}
            onPress={() => router.push({ pathname: "/study-file", params: { pdf_path: pdfPath, book_title: bookTitle } })}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: pal.soft, borderWidth: 1, borderColor: pal.cardBorder, flexDirection: dir.row, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Ionicons name="documents-outline" size={18} color={pal.accent} />
            <Text style={[styles.ctaTxt, { color: pal.ink }]}>{t("studyFile.open")}</Text>
          </Pressable>

          {/* وضع التحديد: تلميح أعلى الوحدات */}
          {selecting && <Text style={[styles.selectHint, { color: pal.dim, textAlign: dir.textAlign }]}>{t("syllabus.select.hint")}</Text>}

          {/* الوحدات (تشيك ليست) — الضغط المطوّل يبدأ تحديد الوحدات للتعديل */}
          {syl.units.map((u, i) => {
            const isDone = done[i];
            const isPicked = selecting && picked.includes(i);
            const isWorking = working.includes(i);
            return (
              <Pressable
                key={i}
                {...(i === 0 ? coach.bind("unit") : null)}
                onPress={() => (selecting ? togglePick(i) : toggle(i))}
                onLongPress={editing || !canEdit ? undefined : () => (selecting ? togglePick(i) : startSelecting(i))}
                disabled={isWorking}
                style={styles.unitWrap}
              >
                <SceneCard style={[styles.unitCard, isDone && !selecting && { borderColor: pal.accent }, isPicked && { borderColor: DANGER, borderWidth: 2 }]}>
                  <View style={[styles.unitHead, { flexDirection: dir.row }]}>
                    {isWorking ? (
                      <ActivityIndicator color={pal.accent} style={styles.check} />
                    ) : selecting ? (
                      <View style={[styles.check, styles.pick, { borderColor: isPicked ? DANGER : pal.track }, isPicked && { backgroundColor: DANGER }]}>
                        {isPicked && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.check,
                          { borderColor: pal.track },
                          isDone && { backgroundColor: pal.accent, borderColor: pal.accent },
                        ]}
                      >
                        {isDone && <Ionicons name="checkmark" size={16} color={pal.onAccent} />}
                      </View>
                    )}
                    <Text
                      style={[
                        styles.unitTitle,
                        { color: pal.ink, textAlign: dir.textAlign },
                        isDone && [styles.unitTitleDone, { color: pal.dim }],
                      ]}
                    >
                      {i + 1}. {u.title}
                    </Text>
                  </View>
                  {/* نبذة الوحدة: ما الذي تتناوله */}
                  {/* أهداف الوحدة كما في الكتاب (وإلا نبذة عنها) */}
                  {u.objectives?.length ? (
                    <View style={styles.objWrap}>
                      <Text style={[styles.objHead, { color: pal.accent, textAlign: dir.textAlign }]}>{t("syllabus.objectives")}</Text>
                      {u.objectives.map((o, k) => (
                        <View key={k} style={[styles.topicRow, { flexDirection: dir.row, paddingStart: 0 }]}>
                          <Ionicons name="checkmark-circle-outline" size={15} color={pal.accent} style={{ marginTop: 3 }} />
                          <Text style={[styles.topicTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{o}</Text>
                        </View>
                      ))}
                    </View>
                  ) : u.about ? (
                    <Text style={[styles.about, { color: pal.ink, textAlign: dir.textAlign }]}>{u.about}</Text>
                  ) : null}
                  {isWorking && <Text style={[styles.workingTxt, { color: pal.accent, textAlign: dir.textAlign }]}>{t("syllabus.regenerating")}</Text>}
                  {/* الصفحات والتاريخ والحالة */}
                  {(() => {
                    const w = plan?.units[i];
                    const ph = phaseOf(w, done[i] ? 1 : prog[i]?.pct ?? 0, today);
                    const phColor = ph === "done" ? tone.good : ph === "late" ? tone.bad : ph === "now" ? pal.accent : pal.dim;
                    return (
                      <View style={[styles.schedRow, { flexDirection: dir.row }]}>
                        <Ionicons name="calendar-outline" size={13} color={pal.accent} />
                        <Text style={[styles.schedTxt, { color: pal.ink }]}>
                          {[ranges[i] ? t("glossary.pages", { from: ranges[i].from, to: ranges[i].to }) : null, w ? fmtWin(w) : null].filter(Boolean).join("  ·  ")}
                        </Text>
                        {w ? (
                          <View style={[styles.phase, { borderColor: phColor }]}>
                            <Text style={[styles.phaseTxt, { color: phColor }]}>{t(`plan.phase.${ph}`)}</Text>
                          </View>
                        ) : null}
                        {w && canEdit && !selecting ? (
                          <Pressable onPress={() => setRangeSheet({ mode: "unit", i })} hitSlop={8} style={[styles.pencil, { borderColor: pal.cardBorder }]}>
                            <Ionicons name="create-outline" size={14} color={pal.ink} />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })()}
                  {/* تقدّم الوحدة: سطر واحد، ولا يظهر إلا ما بُدئ فعلًا */}
                  {prog[i] && !selecting
                    ? (() => {
                        const pg = prog[i];
                        const parts = [
                          pg.pages.done ? t("uprog.pagesVal", { a: pg.pages.done, b: pg.pages.total }) : null,
                          pg.quiz.answered ? t("uprog.quizVal", { a: pg.quiz.correct, b: pg.quiz.answered }) : null,
                          pg.summary.heard ? (pg.summary.heard >= pg.summary.total ? t("uprog.sumDone") : t("uprog.sumVal", { a: pg.summary.heard, b: pg.summary.total })) : null,
                          pg.video.seen ? (pg.video.seen >= pg.video.total ? t("uprog.vidDone") : t("uprog.vidVal", { a: pg.video.seen, b: pg.video.total })) : null,
                          pg.cards.reviewed ? t("uprog.cardVal", { a: pg.cards.reviewed, b: pg.cards.total }) : null,
                        ].filter(Boolean) as string[];
                        const pct = Math.round((done[i] ? 1 : pg.pct) * 100);
                        if (!parts.length && !done[i]) return null;
                        return (
                          <View style={[styles.uline, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
                            <View style={[styles.uring, { borderColor: pct >= 90 ? tone.good : pal.accent }]}>
                              <Text style={[styles.uringTxt, { color: pct >= 90 ? tone.good : pal.accent }]}>{pct}%</Text>
                            </View>
                            <Text style={[styles.ulineTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{parts.join("  ·  ") || t("plan.phase.done")}</Text>
                          </View>
                        );
                      })()
                    : null}
                  {u.topics.map((topic, k) => (
                    <View key={k} style={[styles.topicRow, { flexDirection: dir.row }]}>
                      <Text style={[styles.topicDot, { color: pal.accent }]}>•</Text>
                      <Text style={[styles.topicTxt, { color: pal.dim, textAlign: dir.textAlign }]}>{topic}</Text>
                    </View>
                  ))}
                  {!!u.outcome && (
                    <Text style={[styles.outcome, { color: tone.good, textAlign: dir.textAlign }]}>
                      <Ionicons name="flag-outline" size={14} color={tone.good} /> {u.outcome}
                    </Text>
                  )}

                  {/* أدوات الوحدة: شبكة ٢×٢ متوازنة (النص والأيقونة في منتصف كل إطار، سطر واحد) — تُخفى أثناء التحديد */}
                  {!selecting && (() => {
                    const params = { pdf_path: pdfPath, unit: i, title: u.title, book_title: bookTitle };
                    const drawing = mmLoading && mmUnit === i;
                    const btn = (key: string, icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, busy = false) => (
                      <Pressable
                        key={key}
                        onPress={onPress}
                        disabled={key === "mm" && mmLoading}
                        style={({ pressed }) => [styles.unitBtn, pillStyle, { flexDirection: dir.row, opacity: pressed ? 0.8 : 1 }]}
                      >
                        {busy ? <ActivityIndicator size="small" color={pal.accent} /> : <Ionicons name={icon} size={17} color={pal.accent} />}
                        <Text style={[styles.unitBtnTxt, { color: pal.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                    return (
                      <View style={styles.unitGrid}>
                        <View style={[styles.unitGridRow, { flexDirection: dir.row }]}>
                          {btn("sum", "headset-outline", t("syllabus.action.summary"), () => router.push({ pathname: "/unit-summary", params }))}
                          {btn("vid", "videocam-outline", t("video.open"), () => router.push({ pathname: "/unit-video", params }))}
                        </View>
                        <View style={[styles.unitGridRow, { flexDirection: dir.row }]}>
                          {btn("quiz", "school-outline", t("syllabus.action.quiz"), () => router.push({ pathname: "/unit-quiz", params }))}
                          {btn("mm", "git-network-outline", drawing ? t("syllabus.action.drawing") : t("syllabus.action.mindmap"), () => startMindmap(i), drawing)}
                        </View>
                        <View style={[styles.unitGridRow, { flexDirection: dir.row }]}>
                          {btn("cards", "albums-outline", t("syllabus.action.cards"), () =>
                            router.push({ pathname: "/unit-cards", params: { book_id: bookId, pdf_path: pdfPath, unit: String(i), book_title: bookTitle } })
                          )}
                          {btn("gloss", "book-outline", t("syllabus.action.glossary"), () =>
                            router.push({ pathname: "/glossary", params: { pdf_path: pdfPath, book_id: bookId, book_title: bookTitle, unit: String(i), only_unit: "1" } })
                          )}
                        </View>
                      </View>
                    );
                  })()}
                </SceneCard>
              </Pressable>
            );
          })}

          {/* نصائح */}
          {!!syl.tips?.length && (
            <SceneCard style={styles.tipsCard}>
              <Text style={[styles.tipsTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("syllabus.tipsTitle")}</Text>
              {syl.tips.map((tip, i) => (
                <View key={i} style={[styles.topicRow, { flexDirection: dir.row }]}>
                  <Text style={[styles.topicDot, { color: pal.accent }]}>•</Text>
                  <Text style={[styles.topicTxt, { color: pal.dim, textAlign: dir.textAlign }]}>{tip}</Text>
                </View>
              ))}
            </SceneCard>
          )}

          {/* دور مستقل عن طابعة الهيدر: إعادة توليد المنهج كاملًا من الكتاب
              (يعيد بناء الوحدات بالفهرس الكامل بدل النسخة القديمة المختصرة). */}
          <View style={{ height: selecting ? 150 : 24 }} />
        </ScrollView>
      )}

      {/* شريط إجراءات التحديد: إعادة إنشاء أو حذف الوحدات المختارة */}
      {selecting && syl && (
        <View style={[styles.selectBar, { backgroundColor: pal.card, borderColor: pal.cardBorder, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.selectTop, { flexDirection: dir.row }]}>
            <Pressable onPress={() => setPicked(picked.length === syl.units.length ? [] : syl.units.map((_, i) => i))} hitSlop={8}>
              <Text style={[styles.selectLink, { color: pal.accent }]}>
                {picked.length === syl.units.length ? t("syllabus.select.none") : t("syllabus.select.all")}
              </Text>
            </Pressable>
            <Pressable onPress={stopSelecting} hitSlop={10} accessibilityLabel={t("common.cancel")}>
              <Ionicons name="close" size={24} color={pal.dim} />
            </Pressable>
          </View>
          <View style={[styles.selectActions, { flexDirection: dir.row }]}>
            <Pressable
              onPress={confirmRegenUnits}
              disabled={!picked.length}
              style={({ pressed }) => [styles.selectBtn, { backgroundColor: pal.accent, flexDirection: dir.row, opacity: !picked.length ? 0.4 : pressed ? 0.85 : 1 }]}
            >
              <Ionicons name="refresh" size={18} color={pal.onAccent} />
              <Text style={[styles.selectBtnTxt, { color: pal.onAccent }]}>{t("syllabus.select.regen", { n: picked.length })}</Text>
            </Pressable>
            <Pressable
              onPress={confirmDeleteUnits}
              disabled={!picked.length}
              style={({ pressed }) => [styles.selectBtn, { backgroundColor: DANGER, flexDirection: dir.row, opacity: !picked.length ? 0.4 : pressed ? 0.85 : 1 }]}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={[styles.selectBtnTxt, { color: "#fff" }]}>{t("syllabus.select.delete", { n: picked.length })}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {coach.overlay}

      {/* إعداد/تعديل جدول المذاكرة، أو تواريخ وحدة */}
      <DateRangeSheet
        visible={!!rangeSheet && !!plan}
        title={rangeSheet ? t("plan.unitDates", { n: rangeSheet.i + 1 }) : ""}
        hint={rangeSheet ? syl?.units[rangeSheet.i]?.title : undefined}
        start={rangeSheet && plan?.units[rangeSheet.i] ? plan.units[rangeSheet.i].start : today}
        end={rangeSheet && plan?.units[rangeSheet.i] ? plan.units[rangeSheet.i].end : today}
        onClose={() => setRangeSheet(null)}
        onSave={(a, b) => rangeSheet && void saveUnitDates(rangeSheet.i, a, b)}
      />

      {/* إنشاء/تعديل الخطة: الاختبار، وأيام الدراسة، ودقائق اليوم، ويوم البدء ← تقدير قبل الحفظ */}
      <PlanSetupSheet
        visible={planSheet}
        editing={!!plan}
        pages={weightsOf()}
        done={actual.map((a) => a >= 0.9)}
        prev={plan?.units}
        initial={{
          start: plan && plan.start > today ? plan.start : today,
          exam: plan?.exam ?? (examISO && examISO > today ? examISO : null),
          days: plan?.days ?? [0, 1, 2, 3, 4, 6],
          minutes: plan?.minutes ?? goalMin,
        }}
        onClose={() => setPlanSheet(false)}
        onSave={(s) => void savePlan(s)}
        onDelete={plan ? confirmDeletePlan : undefined}
      />

      {/* مودال الخريطة الذهنية */}
      <Modal
        visible={mmUnit !== null && !!mm}
        transparent
        animationType="slide"
        onRequestClose={() => setMmUnit(null)}
      >
        <View style={styles.quizMask}>
          <View style={[styles.quizSheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]}>
            <View style={[styles.quizHeader, { flexDirection: dir.row }]}>
              <Text style={[styles.quizHeaderTxt, { color: pal.ink }]}>{t("syllabus.mindmap.title")}</Text>
              <View style={{ flexDirection: dir.row, alignItems: "center", gap: 14 }}>
                <Pressable onPress={printMindmap} hitSlop={8}>
                  <Ionicons name="print-outline" size={21} color={pal.dim} />
                </Pressable>
                <Pressable onPress={() => setMmUnit(null)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={pal.dim} />
                </Pressable>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
              {/* خريطة شعاعية (توني بوزان) بألوان المشهد. لا تكبير متداخل هنا (كان يجمّد
                  الإيماءات)؛ الضغط يفتحها بملء الشاشة مع تكبير بالأصابع. */}
              {mm ? (
                <Pressable
                  onPress={() => setMmFull(true)}
                  onLayout={(e) => setMmW(e.nativeEvent.layout.width)}
                  style={[styles.mmCanvasWrap, styles.mmCanvas, { borderColor: pal.cardBorder, backgroundColor: pal.card }]}
                >
                  {mmW > 0 ? <BuzanMindMap map={mm} size={mmW - 16} theme={mmTheme} /> : null}
                  <View style={[styles.mmZoomChip, { backgroundColor: pal.accent }]}>
                    <Ionicons name="expand" size={14} color={pal.onAccent} />
                    <Text style={[styles.mmZoomTxt, { color: pal.onAccent }]}>{t("syllabus.mindmap.enlarge")}</Text>
                  </View>
                </Pressable>
              ) : null}
              <Text style={[styles.mmHint, { color: pal.dim }]}>{t("syllabus.mindmap.hintList")}</Text>

              {/* العقدة المركزية (قائمة) */}
              <View style={[styles.mmCenter, { backgroundColor: pal.accent }]}>
                <Text style={[styles.mmCenterTxt, { color: pal.onAccent }]}>{mm?.center}</Text>
              </View>
              <View style={[styles.mmStem, { backgroundColor: pal.track }]} />

              {/* الفروع */}
              {mm?.branches.map((b, bi) => {
                const c = MM_COLORS[bi % MM_COLORS.length];
                return (
                  <View key={bi} style={[styles.mmBranch2, { borderColor: c + "66", backgroundColor: pal.card }]}>
                    <View style={[styles.mmBranchHead, { backgroundColor: c + "22", flexDirection: dir.row }]}>
                      <View style={[styles.mmDot, { backgroundColor: c }]} />
                      <Text style={[styles.mmBranchLabel, { color: pal.ink, textAlign: dir.textAlign }]}>{b.label}</Text>
                    </View>
                    {b.points.map((p, pi) => (
                      <View key={pi} style={[styles.mmPointRow, { flexDirection: dir.row }]}>
                        <Text style={[styles.mmPointDash, { color: c }]}>—</Text>
                        <Text style={[styles.mmPointTxt, { color: pal.dim, textAlign: dir.textAlign }]}>{p}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* الخريطة بملء الشاشة: تكبير وتحريك بالأصابع (ScrollView واحد غير متداخل) */}
      <Modal visible={mmFull && !!mm} animationType="fade" onRequestClose={() => setMmFull(false)} supportedOrientations={["portrait", "landscape"]}>
        <View style={[styles.mmFull, { backgroundColor: pal.bg }]}>
          {mm ? (
            <ScrollView
              maximumZoomScale={3}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <BuzanMindMap map={mm} size={Math.max(winW, winH) * 1.05} theme={mmTheme} />
            </ScrollView>
          ) : null}
          <Pressable
            onPress={() => setMmFull(false)}
            hitSlop={8}
            accessibilityLabel={t("common.close")}
            style={[styles.mmFullClose, { top: insets.top + 8, [dir.isRTL ? "left" : "right"]: 16, backgroundColor: pal.soft }]}
          >
            <Ionicons name="close" size={24} color={pal.ink} />
          </Pressable>
        </View>
      </Modal>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.xl, gap: 8 },
  emptyTitle: { fontSize: 19, fontWeight: "900", textAlign: "center", marginTop: 10 },
  emptySub: { fontSize: 14, lineHeight: 24, textAlign: "center" },
  cta: { alignSelf: "stretch", height: 54, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 10 },
  ctaTxt: { fontSize: 15.5, fontWeight: "900" },
  ghostBtn: {
    alignSelf: "stretch",
    height: 50,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  readNowBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    marginTop: 12,
    marginBottom: 6,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  readNowTxt: { fontSize: 16, fontWeight: "900" },
  manageRow: { gap: 8 },
  planHead: { alignItems: "center", gap: 8 },
  planTitle: { flex: 1, fontSize: 16, fontWeight: "900" },
  planDim: { fontSize: 12.5, lineHeight: 19 },
  planStatus: { fontSize: 14.5, fontWeight: "900" },
  pencil: { width: 32, height: 32, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  barRow: { alignItems: "center", gap: 8 },
  barLbl: { width: 128, fontSize: 12.5, fontWeight: "800" },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  barVal: { width: 44, fontSize: 12.5, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  phase: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  phaseTxt: { fontSize: 11.5, fontWeight: "900" },
  uline: { marginTop: 10, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, alignItems: "center", gap: 10 },
  uring: { width: 44, height: 44, borderRadius: 22, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  uringTxt: { fontSize: 12, fontWeight: "900" },
  ulineTxt: { flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  objWrap: { marginTop: 8, paddingStart: 36, gap: 2 },
  objHead: { fontSize: 13, fontWeight: "900" },
  about: { fontSize: 14, lineHeight: 23, marginTop: 8, paddingStart: 36, opacity: 0.9 },
  manageBtn: { flex: 1, height: 46, borderRadius: Radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  manageTxt: { fontSize: 13.5, fontWeight: "900", flexShrink: 1 },
  selectHint: { fontSize: 13.5, lineHeight: 22, fontWeight: "700" },
  pick: { borderRadius: 8 },
  workingTxt: { fontSize: 12.5, fontWeight: "800", marginTop: 6, paddingStart: 36 },
  selectBar: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingHorizontal: Spacing.lg, gap: 10 },
  selectTop: { alignItems: "center", justifyContent: "space-between" },
  selectLink: { fontSize: 14.5, fontWeight: "900" },
  selectActions: { gap: 10 },
  selectBtn: { flex: 1, height: 50, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  selectBtnTxt: { fontSize: 15, fontWeight: "900" },
  err: { fontSize: 13, textAlign: "center", marginTop: 8, fontWeight: "700" },

  genWrap: { alignSelf: "stretch", marginTop: Spacing.lg, gap: 8 },
  genHead: { alignItems: "center", justifyContent: "space-between" },
  genMsg: { fontSize: 14, fontWeight: "800" },
  genPct: { fontSize: 15, fontWeight: "900" },
  genTrack: { height: 10, borderRadius: 5, overflow: "hidden" },
  genFill: { height: "100%", borderRadius: 5 },
  genHint: { fontSize: 12, textAlign: "center", lineHeight: 19, marginTop: 4 },

  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 12 },
  progCard: { padding: Spacing.lg },
  bookTitle: { fontSize: 17, fontWeight: "900", textAlign: "center", lineHeight: 28 },
  progRow: { alignItems: "baseline", justifyContent: "center", gap: 10, marginTop: 12 },
  progPct: { fontSize: 28, fontWeight: "900" },
  progLabel: { fontSize: 13, fontWeight: "700" },
  progTrack: { height: 10, borderRadius: 5, marginTop: 10, overflow: "hidden" },
  progFill: { height: "100%", borderRadius: 5 },

  unitWrap: {},
  unitCard: { padding: Spacing.md },
  unitHead: { alignItems: "center", gap: 10 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  unitTitle: { flex: 1, fontSize: 16, fontWeight: "800", lineHeight: 26 },
  unitTitleDone: { textDecorationLine: "line-through" },
  schedRow: {
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingStart: 36,
  },
  schedTxt: { fontSize: 12.5, fontWeight: "800" },
  noPlanHint: {
    fontSize: 12.5,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  topicRow: { alignItems: "flex-start", gap: 6, marginTop: 6, paddingStart: 36 },
  topicDot: { fontSize: 15, lineHeight: 22 },
  topicTxt: { flex: 1, fontSize: 14, lineHeight: 22 },
  outcome: { fontSize: 13, fontWeight: "700", marginTop: 8, paddingStart: 36, lineHeight: 21 },

  tipsCard: { padding: Spacing.md },
  tipsTitle: { fontSize: 16, fontWeight: "900", marginBottom: 4 },

  quizBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  quizBtnTxt: { fontSize: 13, fontWeight: "800" },
  unitActions: { gap: 8, marginTop: 12 },
  unitGrid: { gap: 8, marginTop: 14 },
  unitGridRow: { gap: 8 },
  unitBtn: { flex: 1, height: 48, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12 },
  unitBtnTxt: { fontSize: 14, fontWeight: "800", flexShrink: 1 },
  sumBtn: { marginTop: 0, flex: 1 },
  mmBtn: { marginTop: 8 },
  mmCanvasWrap: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  mmZoomChip: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  mmZoomTxt: { fontSize: 12, fontWeight: "800" },
  mmFull: { flex: 1 },
  mmFullClose: { position: "absolute", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  mmCanvas: { alignItems: "center", justifyContent: "center", padding: 8 },
  mmHint: { fontSize: 11.5, textAlign: "center", marginTop: 8, marginBottom: 12 },
  mmCenter: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: Radius.lg,
    maxWidth: "90%",
  },
  mmCenterTxt: { fontSize: 16, fontWeight: "900", textAlign: "center" },
  mmStem: { alignSelf: "center", width: 2, height: 18 },
  mmBranch2: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    marginBottom: 10,
    overflow: "hidden",
  },
  mmBranchHead: { alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14 },
  mmDot: { width: 10, height: 10, borderRadius: 5 },
  mmBranchLabel: { flex: 1, fontSize: 15, fontWeight: "900" },
  mmPointRow: { alignItems: "flex-start", gap: 8, paddingHorizontal: 16, paddingVertical: 5 },
  mmPointDash: { fontSize: 14, fontWeight: "900", lineHeight: 22 },
  mmPointTxt: { flex: 1, fontSize: 14, lineHeight: 22 },

  quizMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  quizSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    maxHeight: "82%",
  },
  quizHeader: { alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  quizHeaderTxt: { fontSize: 15, fontWeight: "900" },
});
