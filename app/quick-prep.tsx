// app/quick-prep.tsx
// «الاستعداد السريع ⏰» (قرار نهلة ٢٥ أكتوبر): يُدخل الطالب كم بقي على الاختبار والوحدات الداخلة فيه، فتُبنى خطة
// بالدقائق تمر على كل الوحدات (حسب حجمها وإتقانها)، ثم تُنفَّذ خطوة خطوة بمؤقت: كل خطوة تفتح شاشتها الموجودة وترجع
// للخطة، والتأخر يعيد توزيع الوقت الباقي تلقائيًا، وفي النهاية تقرير بالأقوى والأضعف وأين التركيز.
// الجلسة محفوظة (lib/quickPrep): تستمر بعد إغلاق التطبيق، والملخصات الناقصة تُجهَّز في الخلفية.
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import {
  clearPrep,
  continuePrep,
  endPrep,
  finishStep,
  getPrep,
  loadPrepInputs,
  openStep,
  readsPages,
  runPrepare,
  startPrep,
  stepLabel,
  syncPrep,
  updatePrep,
  watchPrep,
  type PrepNotice,
  type PrepSession,
} from "../lib/quickPrep";
import { buildPlan, currentStep, isTimeUp, minTotal, minutesLeft, planProgress, prepReport, stepClock, type PrepStep, type PrepUnit, type StepKind } from "../lib/quickPrepCore";
import { getAnswered } from "../lib/readiness";
import { WEAK_BELOW, type QuestionState } from "../lib/readinessCore";
import { useScene } from "../lib/scene";
import { summaryJobKey, watchSummaryJob } from "../lib/summaryJobs";
import { getCachedSummary } from "../lib/unitSummary";
import { getStudyInfo } from "../lib/studyKind";

type Phase = "loading" | "nosyl" | "error" | "setup" | "run" | "report";
type SumState = { kind: "ready" | "busy" | "wait" | "failed"; d?: number; t?: number } | null;

const HOURS = [1, 2, 3, 4, 5, 6, 8];
const MINS = [0, 15, 30, 45];
const SUM_KINDS: StepKind[] = ["final", "brief", "listen"];
const ICON: Record<StepKind | "read", keyof typeof Ionicons.glyphMap> = {
  final: "flash",
  brief: "grid",
  quiz5: "school",
  quiz: "school",
  cards: "albums",
  mindmap: "git-network",
  listen: "headset",
  mistakes: "refresh-circle",
  exam: "ribbon",
  read: "book",
};
const NOTICE_MS = 30 * 60_000; // التنبيه يبقى ظاهرًا نصف ساعة أو حتى يُغلق

export default function QuickPrepScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  // ألوان الحالة (ممتاز/متوسط/ضعيف) بدرجات تُقرأ على المشهد الفاتح والداكن (كما في صفحة الكتاب)
  const tone = pal.dark ? { good: "#7BD8A4", mid: "#F2B36B", bad: "#FF8A96" } : { good: "#2F7D4A", mid: "#B86B12", bad: "#B83A48" };
  const { book_id, pdf_path, book_title, page_count } = useLocalSearchParams<{ book_id?: string; pdf_path?: string; book_title?: string; page_count?: string }>();
  const bookId = typeof book_id === "string" ? book_id : "";
  const paramPdf = typeof pdf_path === "string" ? pdf_path : "";
  const paramTitle = typeof book_title === "string" ? book_title : "";
  const pageCount = Number(page_count) > 0 ? Number(page_count) : undefined;

  const [phase, setPhase] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;
  const [sess, setSess] = useState<PrepSession | null>(null);
  const [inputs, setInputs] = useState<{ units: PrepUnit[]; unitCount: number; answered: number[] } | null>(null);
  const [now, setNow] = useState(Date.now());
  const pdfPath = sess?.pdfPath || paramPdf;
  // نوع الكتاب في الذاكرة: خطوة «الاختبار الشامل» لكتب الشهادات تفتح اختبارًا تجريبيًا بوقت
  useEffect(() => {
    if (pdfPath) void getStudyInfo(pdfPath).catch(() => {});
  }, [pdfPath]);
  const bookTitle = sess?.bookTitle || paramTitle;

  // الإعداد
  const [hours, setHours] = useState(2);
  const [mins, setMins] = useState(0);
  const [sel, setSel] = useState<number[] | null>(null); // null = كل الوحدات
  const [pickOpen, setPickOpen] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [starting, setStarting] = useState(false);
  // التنفيذ
  const [busy, setBusy] = useState(""); // إجراء جارٍ (يمنع الضغط المزدوج)
  const [showAll, setShowAll] = useState(false);
  const [sumState, setSumState] = useState<SumState>(null);
  // التقرير
  const [states, setStates] = useState<QuestionState[] | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/book/[id]", params: { id: bookId } }));

  /** الجلسة المحفوظة أولًا (تنفيذ أو تقرير)، وإلا وحدات الكتاب للإعداد */
  const load = useCallback(async () => {
    setPhase("loading");
    let s = await getPrep(bookId).catch(() => null);
    // حلّ موعدها والتطبيق مغلق: المزامنة أولًا (تكشف خطوة أُكملت وتُنهي الخطة عند موعدها) فيُعرض التقرير مباشرة
    if (s && !s.endedAt && !s.overtime && Date.now() >= s.deadlineAt) {
      await syncPrep(bookId, t);
      s = (await getPrep(bookId).catch(() => null)) ?? s;
    }
    if (s) {
      setSess(s);
      setNow(Date.now());
      setPhase(s.endedAt ? "report" : "run");
      if (!s.endedAt) {
        void runPrepare(bookId);
        void syncPrep(bookId, t);
      }
      return;
    }
    setSess(null);
    if (!bookId) return setPhase("error");
    const r = await loadPrepInputs({ pdfPath: paramPdf, bookId, pageCount });
    if (r.kind === "ok") {
      setInputs({ units: r.units, unitCount: r.unitCount, answered: r.answered });
      setPhase("setup");
    } else setPhase(r.kind);
  }, [bookId, paramPdf, pageCount, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // تحديث حي: كل تعديل على الجلسة (من هنا أو من المشغّل في الخلفية) يظهر فورًا
  useEffect(
    () =>
      watchPrep(bookId, (s) => {
        setNow(Date.now());
        if (s) {
          setSess(s);
          setPhase(s.endedAt ? "report" : "run");
        } else if (phaseRef.current === "run" || phaseRef.current === "report") {
          // حُذفت الجلسة (خطة جديدة) → الإعداد من جديد بإتقان محدّث
          setSel(null);
          void load();
        }
      }),
    [bookId, load]
  );

  // الرجوع من خطوة (أو من إنشاء المنهج): كشف إكمال الخطوة وإعادة التوزيع، أو إعادة التحميل
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      if (phaseRef.current === "nosyl") void load();
      else if (phaseRef.current === "run") {
        void syncPrep(bookId, t);
        void runPrepare(bookId);
      }
      // العرض يتحدث كل ٣٠ ثانية، وإعادة التوزيع كل دقيقة، ما دامت الشاشة ظاهرة
      const a = setInterval(() => setNow(Date.now()), 30_000);
      const b = setInterval(() => {
        if (phaseRef.current !== "run") return;
        void syncPrep(bookId, t);
        void runPrepare(bookId); // إعادة تجهيز ما تعذّر أو انتظر الحصة (لا يعمل إن كان يعمل أصلًا)
      }, 60_000);
      return () => {
        clearInterval(a);
        clearInterval(b);
      };
    }, [bookId, load, t])
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") return;
      setNow(Date.now());
      if (phaseRef.current === "run") {
        void syncPrep(bookId, t);
        void runPrepare(bookId);
      }
    });
    return () => sub.remove();
  }, [bookId, t]);

  const fmtDur = (m: number) => {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h && r ? t("qprep.hm", { h, m: r }) : h ? t("qprep.h", { h }) : t("qprep.m", { m: r });
  };
  const unitTitle = (units: PrepUnit[], u: number | null) => (u === null ? "" : units.find((x) => x.unit === u)?.title ?? "");
  // «رقم · عنوان» (النقطة بعد الرقم تنقلب في السطر العربي فتظهر «.١»)
  const unitHead = (units: PrepUnit[], u: number) => `${u + 1} · ${unitTitle(units, u)}`;

  // ===== الإعداد: الوقت والوحدات ومعاينة حية للخطة =====
  const allUnits = inputs?.units ?? [];
  const selUnits = useMemo(() => (sel ? allUnits.filter((u) => sel.includes(u.unit)) : allUnits), [allUnits, sel]);
  const totalMin = hours * 60 + mins;
  const preview = useMemo(() => (selUnits.length && totalMin > 0 ? buildPlan({ totalMin, units: selUnits }) : null), [selUnits, totalMin]);
  const tooShort = selUnits.length > 0 && totalMin < minTotal(selUnits.length);
  const perUnit = preview && selUnits.length ? Math.round(preview.steps.filter((s) => s.unit !== null && s.status !== "dropped").reduce((a, s) => a + s.min, 0) / selUnits.length) : 0;

  function toggleUnit(u: number) {
    const base = sel ?? allUnits.map((x) => x.unit);
    const next = base.includes(u) ? base.filter((x) => x !== u) : [...base, u].sort((a, b) => a - b);
    setSel(next.length === allUnits.length ? null : next);
  }

  async function onStart() {
    if (starting || !inputs || !preview || tooShort || !selUnits.length) return;
    setStarting(true);
    try {
      const s = await startPrep({ bookId, pdfPath: paramPdf, bookTitle: paramTitle, totalMin, units: selUnits, unitCount: inputs.unitCount, t });
      if (s) {
        setSess(s);
        setNow(Date.now());
        setPhase("run");
      }
    } catch {
      Alert.alert(t("qprep.title"), t("qprep.loadErr"));
    } finally {
      setStarting(false);
    }
  }

  // ===== التنفيذ =====
  const steps = sess?.plan.steps ?? [];
  const cur = sess && phase === "run" ? currentStep(steps) : null;
  const prog = planProgress(steps);
  const leftAll = sess ? minutesLeft(sess.deadlineAt, now) : 0;
  const upNext = cur ? steps.filter((s) => s.status === "todo" && s.id !== cur.id).slice(0, 2) : [];
  const curUnit = cur?.unit ?? null;
  const curLevel = cur && curUnit !== null && SUM_KINDS.includes(cur.kind) ? (cur.kind === "listen" ? sess?.plan.levels[curUnit] ?? "brief" : cur.kind) : null;
  const pendingKey = sess?.prepare.pending.join(",") ?? "";
  const failedKey = sess?.prepare.failed.join(",") ?? "";

  // حالة ملخص وحدة الخطوة الحالية: جاهز، يُجهَّز (د/ك)، في الانتظار، تعذّر
  useEffect(() => {
    if (!pdfPath || curUnit === null || !curLevel) {
      setSumState(null);
      return;
    }
    let on = true;
    let ready = false;
    const src = { kind: "unit" as const, unit: curUnit, level: curLevel as "final" | "brief" };
    const failed = failedKey.split(",").includes(String(curUnit));
    const waiting = pendingKey.split(",").includes(String(curUnit));
    setSumState(failed ? { kind: "failed" } : waiting ? { kind: "wait" } : null);
    getCachedSummary(pdfPath, src)
      .then((x) => {
        if (on && x) {
          ready = true;
          setSumState({ kind: "ready" });
        }
      })
      .catch(() => {});
    const un = watchSummaryJob(
      summaryJobKey(pdfPath, src),
      (j) => {
        if (!on || ready) return;
        if (j.status === "running") setSumState({ kind: "busy", d: j.done, t: j.total });
        else if (j.status === "done") setSumState({ kind: "ready" });
        else if (j.status === "failed") setSumState({ kind: "failed" });
        else setSumState(null); // نفاد الحصة: يظهر شريطه
      },
      false
    );
    return () => {
      on = false;
      un();
    };
  }, [pdfPath, curUnit, curLevel, pendingKey, failedKey]);

  async function act(kind: "open" | "done" | "skip", step: PrepStep) {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "open") await openStep(bookId, step.id, t);
      else await finishStep(bookId, step.id, kind === "done" ? "done" : "skipped", t);
    } catch {
    } finally {
      setBusy("");
    }
  }

  function onEnd() {
    Alert.alert(t("qprep.end"), t("qprep.endAsk"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("qprep.end"), style: "destructive", onPress: () => void endPrep(bookId) },
    ]);
  }

  const noticeText = (n: PrepNotice) =>
    n.kind === "replanned" ? t("qprep.replanned", { a: n.a ?? 0, b: n.b ?? 0 }) : n.kind === "restored" ? t("qprep.restored", { n: n.a ?? 0 }) : t(`qprep.${n.kind}`);

  // ===== التقرير =====
  // خطة بلا خطوة باقية تُعرض تقريرًا حتى لو لم يُسجَّل إنهاؤها بعد (لا مؤشر تحميل بلا أزرار)
  const showReport = phase === "report" || (phase === "run" && !!sess && !cur);
  useEffect(() => {
    if (!showReport || !pdfPath) return;
    let on = true;
    getAnswered(pdfPath)
      .then((x) => on && setStates(x))
      .catch(() => on && setStates([]));
    return () => {
      on = false;
    };
  }, [showReport, pdfPath, sess?.endedAt]);
  const report = useMemo(() => {
    if (!sess || !states) return null;
    const r = prepReport({ units: sess.units, steps: sess.plan.steps, states, levels: sess.plan.levels, since: sess.createdAt, now, deadlineAt: sess.deadlineAt, unitCount: sess.unitCount });
    // الوقت المستغرق حتى إنهاء الخطة (لا حتى فتح التقرير)
    return { ...r, spentMin: Math.max(0, Math.round(((sess.endedAt ?? now) - sess.createdAt) / 60_000)) };
  }, [sess, states, now]);
  // انتهى الوقت وبقيت خطوات: بحسب وقت الإنهاء لا وقت فتح التقرير (خطة أُنهيت يدويًا قبل الموعد لا يُعرض فيها «انتهى الوقت»
  // ولا «متابعة»)، ولا بعد متابعة الباقي (إنهاؤها حينها يدوي)
  const timeUp = !!sess && isTimeUp({ ...sess, steps }, now);

  function openFocus(f: { unit: number; kind: "mistakes" | "final" | "brief" }) {
    if (!sess) return;
    if (f.kind === "mistakes")
      router.push({ pathname: "/unit-quiz", params: { pdf_path: sess.pdfPath, title: sess.bookTitle, book_title: sess.bookTitle, mode: "mistakes", units: String(f.unit), count: "10" } });
    else router.push({ pathname: "/unit-summary", params: { pdf_path: sess.pdfPath, unit: String(f.unit), title: unitTitle(sess.units, f.unit), book_title: sess.bookTitle, level: f.kind } });
  }

  // ===== أجزاء العرض =====
  const bar = (frac: number, color: string) => (
    <View style={[styles.track, { backgroundColor: pal.track }]}>
      <View style={[styles.fill, { width: `${Math.max(3, Math.min(100, Math.round(frac * 100)))}%`, backgroundColor: color }, dir.isRTL ? { alignSelf: "flex-end" } : null]} />
    </View>
  );
  const chip = (key: string | number, label: string, on: boolean, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: on ? pal.accent : pal.soft }]}>
      <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]}>{label}</Text>
    </Pressable>
  );
  const btn = (label: string, onPress: () => void, primary: boolean, icon?: keyof typeof Ionicons.glyphMap, loading = false, disabled = false) => (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        primary ? styles.btn : styles.btn2,
        { flexDirection: dir.row },
        primary ? { backgroundColor: pal.accent } : { backgroundColor: pal.soft, borderColor: pal.cardBorder },
        { opacity: disabled ? 0.5 : pressed || loading ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={primary ? pal.onAccent : pal.accent} /> : icon ? <Ionicons name={icon} size={19} color={primary ? pal.onAccent : pal.accent} /> : null}
      <Text style={[primary ? styles.btnTxt : styles.btn2Txt, { color: primary ? pal.onAccent : pal.ink }]}>{label}</Text>
    </Pressable>
  );

  /** قائمة الخطوات حسب الوحدة (للمعاينة وللخطة كاملة) */
  function stepList(list: PrepStep[], units: PrepUnit[], withStatus: boolean, curId?: string) {
    const groups: { u: number | null; items: PrepStep[] }[] = [];
    for (const s of list) {
      const g = groups[groups.length - 1];
      if (g && g.u === s.unit) g.items.push(s);
      else groups.push({ u: s.unit, items: [s] });
    }
    return groups.map((g, gi) => (
      <View key={gi} style={{ gap: 4 }}>
        <Text style={[styles.groupHead, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
          {g.u === null ? t("qprep.endSteps") : unitHead(units, g.u)}
        </Text>
        {g.items.map((s) => {
          const dropped = s.status === "dropped";
          const isCur = s.id === curId;
          return (
            <View key={s.id} style={[styles.stepRow, { flexDirection: dir.row }, isCur && { backgroundColor: pal.soft }]}>
              <Ionicons
                name={withStatus && s.status === "done" ? "checkmark-circle" : ICON[s.kind]}
                size={16}
                color={withStatus && s.status === "done" ? tone.good : dropped ? pal.dim : pal.accent}
              />
              <Text
                style={[styles.stepTxt, { color: dropped || (withStatus && s.status === "skipped") ? pal.dim : pal.ink, textAlign: dir.textAlign }, dropped && styles.strike]}
                numberOfLines={1}
              >
                {stepLabel(s, t)}
              </Text>
              {withStatus && (s.status === "skipped" || dropped) ? (
                <Text style={[styles.stepTag, { color: pal.dim }]}>{t(`qprep.st.${s.status}`)}</Text>
              ) : (
                <Text style={[styles.stepMin, { color: pal.dim }]}>{t("qprep.m", { m: s.min })}</Text>
              )}
            </View>
          );
        })}
      </View>
    ));
  }

  // ===== الشاشة =====
  const body = () => {
    if (phase === "loading")
      return (
        <View style={styles.center}>
          <ActivityIndicator color={pal.accent} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("qprep.loading")}</Text>
        </View>
      );
    if (phase === "nosyl")
      return (
        <View style={styles.center}>
          <Ionicons name="list-outline" size={40} color={pal.accent} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("qprep.nosyl")}</Text>
          {btn(t("qprep.makeSyl"), () => router.push({ pathname: "/syllabus/[id]", params: { id: bookId, title: bookTitle, pdf_path: pdfPath } }), true, "sparkles")}
        </View>
      );
    if (phase === "error")
      return (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={tone.mid} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("qprep.loadErr")}</Text>
          {btn(t("common.retry"), () => void load(), true, "refresh")}
        </View>
      );

    if (phase === "setup")
      return (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* الوقت الباقي على الاختبار */}
          <SceneCard style={{ gap: 12 }}>
            <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("qprep.ask.time")}</Text>
            <Text style={[styles.label, { color: pal.dim, textAlign: dir.textAlign }]}>{t("qprep.hours")}</Text>
            <View style={[styles.stepper, { flexDirection: dir.row }]}>
              <Pressable onPress={() => setHours((h) => Math.max(0, h - 1))} hitSlop={8} style={[styles.round, { backgroundColor: pal.soft }]}>
                <Ionicons name="remove" size={20} color={pal.accent} />
              </Pressable>
              <Text style={[styles.bigNum, { color: pal.ink }]}>{fmtDur(totalMin)}</Text>
              <Pressable
                onPress={() => {
                  setHours((h) => Math.min(24, h + 1));
                  if (hours + 1 >= 24) setMins(0);
                }}
                hitSlop={8}
                style={[styles.round, { backgroundColor: pal.soft }]}
              >
                <Ionicons name="add" size={20} color={pal.accent} />
              </Pressable>
            </View>
            <View style={[styles.chips, { flexDirection: dir.row }]}>{HOURS.map((h) => chip(h, t("qprep.h", { h }), hours === h, () => setHours(h)))}</View>
            <Text style={[styles.label, { color: pal.dim, textAlign: dir.textAlign }]}>{t("qprep.minutes")}</Text>
            <View style={[styles.chips, { flexDirection: dir.row }]}>
              {MINS.map((m) => chip(m, t("qprep.m", { m }), mins === m, () => setMins(hours >= 24 ? 0 : m)))}
            </View>
          </SceneCard>

          {/* الوحدات الداخلة في الاختبار (الافتراضي: كلها) */}
          <SceneCard style={{ gap: 10 }}>
            <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("qprep.ask.units")}</Text>
            <Pressable onPress={() => setSel(null)} style={[styles.row, { flexDirection: dir.row }]}>
              <Ionicons name={sel === null ? "checkbox" : "square-outline"} size={22} color={pal.accent} />
              <Text style={[styles.rowTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{t("qprep.allUnits", { n: allUnits.length })}</Text>
            </Pressable>
            <Pressable onPress={() => setPickOpen((x) => !x)} hitSlop={6}>
              <Text style={[styles.link, { color: pal.accent, textAlign: dir.textAlign }]}>
                {t("qprep.pickUnits")}
                {sel ? ` (${sel.length})` : ""}
              </Text>
            </Pressable>
            {pickOpen ? (
              <View style={{ gap: 2 }}>
                {allUnits.map((u) => {
                  const on = sel === null || sel.includes(u.unit);
                  const tested = (inputs?.answered[u.unit] ?? 0) > 0;
                  const dot = u.mastery >= WEAK_BELOW ? tone.good : u.mastery >= 0.5 ? tone.mid : tone.bad;
                  return (
                    <Pressable key={u.unit} onPress={() => toggleUnit(u.unit)} style={[styles.unitRow, { flexDirection: dir.row }]}>
                      <Ionicons name={on ? "checkbox" : "square-outline"} size={21} color={on ? pal.accent : pal.dim} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.unitName, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
                          {unitHead(allUnits, u.unit)}
                        </Text>
                        <View style={[styles.subRow, { flexDirection: dir.row }]}>
                          {u.pages ? <Text style={[styles.sub, { color: pal.dim }]}>{t("qprep.unitPages", { n: u.pages })}</Text> : null}
                          {tested ? <View style={[styles.dot, { backgroundColor: dot }]} /> : <Text style={[styles.sub, { color: pal.dim }]}>{t("qprep.untested")}</Text>}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => setSel(null)} hitSlop={6} style={{ marginTop: 6 }}>
                  <Text style={[styles.link, { color: pal.accent, textAlign: dir.textAlign }]}>{t("qprep.selectAll")}</Text>
                </Pressable>
              </View>
            ) : null}
          </SceneCard>

          {/* معاينة حية للخطة */}
          {preview ? (
            <SceneCard style={{ gap: 8 }}>
              <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>{t(`qprep.tier.${preview.tier}`)}</Text>
              {preview.adjusted ? <Text style={[styles.note, { color: pal.dim, textAlign: dir.textAlign }]}>{t(`qprep.adjusted.${preview.adjusted}`)}</Text> : null}
              <Text style={[styles.note, { color: pal.dim, textAlign: dir.textAlign }]}>
                {t("qprep.preview", { u: selUnits.length, m: perUnit })} {t("qprep.reserve", { m: preview.reserveMin })}
              </Text>
              {preview.tight ? <Text style={[styles.note, { color: tone.mid, textAlign: dir.textAlign }]}>{t("qprep.tight")}</Text> : null}
              <Pressable onPress={() => setShowPlan((x) => !x)} hitSlop={6}>
                <Text style={[styles.link, { color: pal.accent, textAlign: dir.textAlign }]}>{showPlan ? t("qprep.hidePlan") : t("qprep.showPlan")}</Text>
              </Pressable>
              {showPlan ? <View style={{ gap: 10, marginTop: 4 }}>{stepList(preview.steps, selUnits, true)}</View> : null}
            </SceneCard>
          ) : null}

          {!selUnits.length ? (
            <Text style={[styles.warn, { color: tone.mid, textAlign: dir.textAlign }]}>{t("qprep.needUnit")}</Text>
          ) : tooShort ? (
            <Text style={[styles.warn, { color: tone.mid, textAlign: dir.textAlign }]}>{t("qprep.tooShort", { m: minTotal(selUnits.length) })}</Text>
          ) : null}
          {btn(starting ? t("qprep.calc") : t("qprep.start"), () => void onStart(), true, "alarm", starting, !preview || tooShort || !selUnits.length)}
          <View style={{ height: 24 }} />
        </ScrollView>
      );

    if (phase === "run" && sess && cur) {
      const clock = cur.status === "doing" ? stepClock(cur, now) : null;
      const read = readsPages(sess, cur) && sumState?.kind !== "ready";
      const pu = sess.units.find((x) => x.unit === cur.unit);
      const label = read && pu ? t("qprep.step.read", { from: pu.from ?? "", to: pu.to ?? "" }) : stepLabel(cur, t);
      const notice = sess.notice && now - sess.notice.at < NOTICE_MS ? sess.notice : null;
      return (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* المتبقي والتقدم */}
          <SceneCard style={{ gap: 8 }}>
            <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("qprep.totalLeft", { t: fmtDur(leftAll) })}</Text>
            <Text style={[styles.note, { color: pal.dim, textAlign: dir.textAlign }]}>
              {t("qprep.progress", { u: prog.unitsDone, n: prog.unitsTotal, s: prog.doneSteps, total: prog.totalSteps })}
            </Text>
            {bar(prog.totalSteps ? prog.doneSteps / prog.totalSteps : 0, pal.accent)}
          </SceneCard>

          {notice ? (
            <View style={[styles.banner, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
              <Ionicons name="sync" size={18} color={pal.accent} />
              <Text style={[styles.bannerTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{noticeText(notice)}</Text>
              <Pressable onPress={() => void updatePrep(bookId, (x) => (x ? { ...x, notice: undefined } : x))} hitSlop={10} accessibilityLabel={t("common.close")}>
                <Ionicons name="close" size={18} color={pal.dim} />
              </Pressable>
            </View>
          ) : null}
          {sess.prepare.quota ? (
            <View style={[styles.banner, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
              <Ionicons name="information-circle" size={18} color={tone.mid} />
              <Text style={[styles.bannerTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{t("qprep.quota")}</Text>
            </View>
          ) : null}

          {/* الخطوة الحالية: مؤقتها وأزرارها */}
          <SceneCard style={{ gap: 12 }}>
            <Text style={[styles.label, { color: pal.dim, textAlign: dir.textAlign }]}>{t("qprep.now")}</Text>
            <View style={[styles.curRow, { flexDirection: dir.row }]}>
              <View style={[styles.curIcon, { backgroundColor: pal.soft }]}>
                <Ionicons name={read ? ICON.read : ICON[cur.kind]} size={24} color={pal.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.curName, { color: pal.ink, textAlign: dir.textAlign }]}>{label}</Text>
                <Text style={[styles.sub, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={2}>
                  {cur.unit === null ? t("qprep.allUnits", { n: sess.units.length }) : unitHead(sess.units, cur.unit)}
                </Text>
              </View>
              <Text style={[styles.timer, { color: clock && clock.over > 0 ? tone.mid : pal.accent }]}>
                {clock ? (clock.over > 0 ? t("qprep.over", { m: clock.over }) : t("qprep.stepLeft", { m: clock.left })) : t("qprep.m", { m: cur.min })}
              </Text>
            </View>
            {sumState ? (
              <Text style={[styles.sub, { color: sumState.kind === "ready" ? tone.good : sumState.kind === "failed" ? tone.mid : pal.dim, textAlign: dir.textAlign }]}>
                {t(`qprep.prep.${sumState.kind}`, { d: sumState.d ?? 0, t: sumState.t ?? 0 })}
              </Text>
            ) : null}
            {cur.status === "doing" ? (
              <>
                {btn(t("qprep.done"), () => void act("done", cur), true, undefined, busy === "done")}
                <View style={[styles.pair, { flexDirection: dir.row }]}>
                  <View style={{ flex: 1 }}>{btn(t("qprep.reopen"), () => void act("open", cur), false, "open-outline", busy === "open")}</View>
                  <View style={{ flex: 1 }}>{btn(t("qprep.skip"), () => void act("skip", cur), false, "play-skip-forward-outline", busy === "skip")}</View>
                </View>
              </>
            ) : (
              <>
                {btn(t("qprep.open"), () => void act("open", cur), true, "play", busy === "open")}
                {btn(t("qprep.skip"), () => void act("skip", cur), false, "play-skip-forward-outline", busy === "skip")}
              </>
            )}
          </SceneCard>

          {/* بعدها */}
          {upNext.length ? (
            <SceneCard style={{ gap: 6 }}>
              <Text style={[styles.label, { color: pal.dim, textAlign: dir.textAlign }]}>{t("qprep.upNext")}</Text>
              {upNext.map((s) => (
                <View key={s.id} style={[styles.stepRow, { flexDirection: dir.row }]}>
                  <Ionicons name={ICON[s.kind]} size={16} color={pal.accent} />
                  <Text style={[styles.stepTxt, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                    {stepLabel(s, t)}
                    {s.unit !== null ? ` — ${unitTitle(sess.units, s.unit)}` : ""}
                  </Text>
                  <Text style={[styles.stepMin, { color: pal.dim }]}>{t("qprep.m", { m: s.min })}</Text>
                </View>
              ))}
            </SceneCard>
          ) : null}

          {/* الخطة كاملة (مطوية) */}
          <SceneCard style={{ gap: 8 }}>
            <Pressable onPress={() => setShowAll((x) => !x)} style={[styles.row, { flexDirection: dir.row }]} hitSlop={6}>
              <Text style={[styles.h, { color: pal.ink, flex: 1, textAlign: dir.textAlign }]}>{t("qprep.allSteps")}</Text>
              <Ionicons name={showAll ? "chevron-up" : "chevron-down"} size={18} color={pal.dim} />
            </Pressable>
            {showAll ? <View style={{ gap: 10 }}>{stepList(steps, sess.units, true, cur.id)}</View> : null}
          </SceneCard>

          <Pressable onPress={onEnd} hitSlop={6} style={{ alignSelf: "center", paddingVertical: 8 }}>
            <Text style={[styles.link, { color: tone.bad }]}>{t("qprep.end")}</Text>
          </Pressable>
          <View style={{ height: 24 }} />
        </ScrollView>
      );
    }

    // التقرير (أو خطة انتهت خطواتها)
    if (!sess || !report)
      return (
        <View style={styles.center}>
          <ActivityIndicator color={pal.accent} />
        </View>
      );
    const rowOf = (u: number) => report.perUnit.find((p) => p.unit === u);
    const unitLine = (u: number, color: string) => {
      const p = rowOf(u);
      return (
        <View key={u} style={{ gap: 4 }}>
          <Text style={[styles.unitName, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
            {unitHead(sess.units, u)}
          </Text>
          {bar(p?.score ?? 0, color)}
          <Text style={[styles.sub, { color: pal.dim, textAlign: dir.textAlign }]}>
            {p?.untested ? t("qprep.untested") : p && p.answered > 0 ? t("qprep.report.score", { a: p.correct, b: p.answered }) : `${Math.round((p?.score ?? 0) * 100)}%`}
          </Text>
        </View>
      );
    };
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SceneCard style={{ gap: 8 }}>
          <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{timeUp ? t("qprep.timeUp") : t("qprep.report.title")}</Text>
          <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>
            {t("qprep.report.covered", { n: report.covered, m: report.total, min: report.spentMin })}
          </Text>
          {report.missed.length ? (
            <Text style={[styles.note, { color: pal.dim, textAlign: dir.textAlign }]}>
              {t("qprep.report.missed", { list: report.missed.map((u) => unitHead(sess.units, u)).join(t("qprep.listSep")) })}
            </Text>
          ) : null}
          {timeUp ? btn(t("qprep.continue"), () => void continuePrep(bookId), true, "play") : null}
        </SceneCard>

        {report.strong.length ? (
          <SceneCard style={{ gap: 10 }}>
            <Text style={[styles.h, { color: tone.good, textAlign: dir.textAlign }]}>{t("qprep.report.strong")}</Text>
            {report.strong.map((u) => unitLine(u, tone.good))}
          </SceneCard>
        ) : null}
        {report.weak.length ? (
          <SceneCard style={{ gap: 10 }}>
            <Text style={[styles.h, { color: tone.bad, textAlign: dir.textAlign }]}>{t("qprep.report.weak")}</Text>
            {report.weak.map((u) => unitLine(u, tone.bad))}
          </SceneCard>
        ) : null}

        {/* لو بقيت دقائق: أين التركيز */}
        <SceneCard style={{ gap: 10 }}>
          <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("qprep.report.focus")}</Text>
          {report.focus.length ? (
            report.focus.map((f) => (
              <View key={f.unit}>
                {btn(
                  t("qprep.report.focusItem", { step: t(`qprep.step.${f.kind}`), unit: unitTitle(sess.units, f.unit), m: f.min }),
                  () => openFocus(f),
                  false,
                  f.kind === "mistakes" ? ICON.mistakes : ICON[f.kind]
                )}
              </View>
            ))
          ) : (
            <Text style={[styles.note, { color: pal.dim, textAlign: dir.textAlign }]}>{t("qprep.report.noFocus")}</Text>
          )}
        </SceneCard>

        {btn(t("qprep.newPlan"), () => void clearPrep(bookId), false, "refresh")}
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  };

  return (
    <SceneScreen>
      <SceneBanner
        title={t("qprep.title")}
        subtitle={bookTitle || undefined}
        height={160}
        left={
          <Pressable onPress={goBack} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />
      {body()}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 14 },
  dim: { fontSize: 14, textAlign: "center", lineHeight: 22, fontWeight: "600" },
  h: { fontSize: 16, fontWeight: "900" },
  label: { fontSize: 12.5, fontWeight: "800" },
  body: { fontSize: 14.5, lineHeight: 23, fontWeight: "700" },
  note: { fontSize: 13, lineHeight: 21, fontWeight: "600" },
  warn: { fontSize: 13.5, lineHeight: 21, fontWeight: "800" },
  link: { fontSize: 14, fontWeight: "800" },
  sub: { fontSize: 12.5, fontWeight: "600", lineHeight: 19 },
  chips: { flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  chipTxt: { fontSize: 13.5, fontWeight: "800" },
  stepper: { alignItems: "center", justifyContent: "center", gap: 18 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  bigNum: { fontSize: 24, fontWeight: "900", minWidth: 110, textAlign: "center" },
  row: { alignItems: "center", gap: 10 },
  rowTxt: { flex: 1, fontSize: 15, fontWeight: "800" },
  unitRow: { alignItems: "center", gap: 10, paddingVertical: 8 },
  unitName: { fontSize: 14, fontWeight: "800", lineHeight: 21 },
  subRow: { alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  groupHead: { fontSize: 13.5, fontWeight: "900", marginTop: 2 },
  stepRow: { alignItems: "center", gap: 8, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 10 },
  stepTxt: { flex: 1, fontSize: 13.5, fontWeight: "700" },
  stepMin: { fontSize: 12.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  stepTag: { fontSize: 11.5, fontWeight: "800" },
  strike: { textDecorationLine: "line-through" },
  track: { height: 7, borderRadius: 4, overflow: "hidden" },
  fill: { height: 7, borderRadius: 4 },
  banner: { alignItems: "center", gap: 10, padding: 12, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  bannerTxt: { flex: 1, fontSize: 13.5, lineHeight: 21, fontWeight: "700" },
  curRow: { alignItems: "center", gap: 12 },
  curIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  curName: { fontSize: 16.5, fontWeight: "900", lineHeight: 24 },
  timer: { fontSize: 13.5, fontWeight: "900", fontVariant: ["tabular-nums"] },
  pair: { gap: 10 },
  btn: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  btnTxt: { fontSize: 15.5, fontWeight: "900" },
  btn2: { minHeight: 46, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btn2Txt: { fontSize: 14, fontWeight: "800", flexShrink: 1, textAlign: "center" },
});
