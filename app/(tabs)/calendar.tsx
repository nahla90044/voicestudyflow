// app/(tabs)/calendar.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDrawer } from "../../components/brand/app-drawer";
import { SceneBanner, SceneCard, SceneScreen } from "../../components/brand/scene-screen";
import { Radius } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import {
  DEFAULT_SESSION_TYPE,
  getSessionTypes,
  SESSION_TYPES,
  setSessionType,
} from "../../lib/sessionMeta";
import { supabase } from "../../lib/supabase";
import { getUnitForDate } from "../../lib/syllabus";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";

type ViewMode = "daily" | "weekly" | "monthly";

// أحداث الطالب
type StudentEventType = "اختبار" | "واجب" | "برزنتيشن" | "بحث";
type TaskStatus = "pending" | "done" | "canceled" | "more_time";

// نوع البلوك في التقويم: حدث أو جلسة خطة
type BlockKind = "event" | "session";

type CalendarBlock = {
  id: string;
  kind: BlockKind;
  dateISO: string; // YYYY-MM-DD
  title: string;
  time?: string;
  status: TaskStatus;

  // للأحداث
  eventType?: StudentEventType;

  // للجلسات (خطة)
  minutesPlanned?: number;
  minutesDone?: number;
  pagesTarget?: number | null;
  pagesDone?: number | null;

  // للكتب
  bookId?: string | null;
  bookTitle?: string | null;
  color?: string; // لون ثابت للكتاب/الوضع
};

// الأسبوع يبدأ الأحد، والعطلة الجمعة (مؤشر 5) والسبت (مؤشر 6)
const ايام_الاسبوع_KEYS = [
  "calendar.day.sun",
  "calendar.day.mon",
  "calendar.day.tue",
  "calendar.day.wed",
  "calendar.day.thu",
  "calendar.day.fri",
  "calendar.day.sat",
];
const DAYS_EN_KEYS = [
  "calendar.dayHead.sun",
  "calendar.dayHead.mon",
  "calendar.dayHead.tue",
  "calendar.dayHead.wed",
  "calendar.dayHead.thu",
  "calendar.dayHead.fri",
  "calendar.dayHead.sat",
];
const MONTH_KEYS = [
  "calendar.month.jan",
  "calendar.month.feb",
  "calendar.month.mar",
  "calendar.month.apr",
  "calendar.month.may",
  "calendar.month.jun",
  "calendar.month.jul",
  "calendar.month.aug",
  "calendar.month.sep",
  "calendar.month.oct",
  "calendar.month.nov",
  "calendar.month.dec",
];
const WEEKEND_IDX = [5, 6]; // الجمعة، السبت

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// ✅ تنسيق محلي (لا UTC) — يتفادى تزحلق اليوم في التوقيتات غير UTC
function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ✅ تاريخ آمن: ما يطيّح التطبيق
function safeDateFromISO(iso: string): Date {
  // نقبل YYYY-MM-DD فقط
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const fallback = new Date();
  if (!ok) return fallback;

  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function addDaysISO(startISO: string, add: number) {
  const d = safeDateFromISO(startISO);
  d.setDate(d.getDate() + add);
  // ✅ لو صار شيء غريب، رجّع اليوم بدل crash
  const t = d.getTime();
  if (!Number.isFinite(t) || Number.isNaN(t)) return todayISO();
  return toLocalISO(d);
}

function startOfWeekISO(anyISO: string) {
  const d = safeDateFromISO(anyISO);
  const day = d.getDay(); // 0 Sunday ... 6 Saturday
  // الأسبوع يبدأ الأحد → نرجع لأقرب أحد
  d.setDate(d.getDate() - day);
  return toLocalISO(d);
}

function monthKey(iso: string) {
  return iso.slice(0, 7); // YYYY-MM
}

// أشهر ميلادية بالعربي (ثابتة) — نتفادى ar-SA لأنها هجرية
function formatMonthArabic(iso: string, t: (k: string) => string) {
  const d = safeDateFromISO(iso);
  return `${t(MONTH_KEYS[d.getMonth()])} ${d.getFullYear()}`;
}

function compareTime(a?: string, b?: string) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  // نحاول نحولها لوقت مفهوم، وإذا ما ضبط خلها في الآخر
  const norm = (t: string) => {
    const tt = t.replace("ص", " AM").replace("م", " PM");
    const guess = Date.parse(`1970-01-01 ${tt}`);
    return Number.isNaN(guess) ? 999999999 : guess;
  };
  return norm(a) - norm(b);
}

function hashColor(id: string) {
  // لون ثابت من id
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const palette = ["#4f8cff", "#2ecc71", "#ff9f43", "#9b59b6", "#e74c3c", "#1abc9c"];
  return palette[h % palette.length];
}

export default function CalendarScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const tone = useTones();
  const { pal } = tone;
  const [mode, setMode] = useState<ViewMode>("weekly");
  const [cursorISO, setCursorISO] = useState(todayISO());

  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);

  // ملخص (tap)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarBlock | null>(null);
  const [unitLabel, setUnitLabel] = useState<string | null>(null); // وحدة المنهج لهذا اليوم
  const [unitLoading, setUnitLoading] = useState(false);
  const unitCache = useRef<Map<string, string | null>>(new Map());

  // نوع الجلسة (مذاكرة/قراءة/…)
  const [sessionTypes, setSessionTypes] = useState<Record<string, string>>({});
  useEffect(() => {
    getSessionTypes().then(setSessionTypes);
  }, []);
  function chooseSessionType(b: CalendarBlock) {
    const opts: any[] = SESSION_TYPES.map((item) => ({
      text: sessionTypes[b.id] === item ? `✓ ${item}` : item,
      onPress: async () => {
        await setSessionType(b.id, item);
        setSessionTypes((p) => ({ ...p, [b.id]: item }));
      },
    }));
    opts.push({
      text: t("calendar.sessionType.other"),
      onPress: () =>
        Alert.prompt?.(t("calendar.sessionType.title"), t("calendar.sessionType.prompt"), async (txt?: string) => {
          if (txt && txt.trim()) {
            await setSessionType(b.id, txt.trim());
            setSessionTypes((p) => ({ ...p, [b.id]: txt.trim() }));
          }
        }),
    });
    opts.push({ text: t("common.cancel"), style: "cancel" });
    Alert.alert(t("calendar.sessionType.title"), t("calendar.sessionType.pick"), opts);
  }

  // عند فتح جلسة لكتاب له منهج: اعرض وحدة المنهج المقابلة لتاريخها (مع تخزين مؤقت للسرعة)
  useEffect(() => {
    const s = selected as any;
    if (!s || s.kind !== "session" || !s.bookId) {
      setUnitLabel(null);
      setUnitLoading(false);
      return;
    }
    const key = `${s.bookId}|${s.dateISO}`;
    if (unitCache.current.has(key)) {
      setUnitLabel(unitCache.current.get(key) ?? null);
      setUnitLoading(false);
      return;
    }
    setUnitLabel(null);
    setUnitLoading(true);
    let cancelled = false;
    getUnitForDate(s.bookId, s.dateISO)
      .then((u) => {
        const label = u ? `${u.index + 1}. ${u.title}` : null;
        unitCache.current.set(key, label);
        if (!cancelled) setUnitLabel(label);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setUnitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // فتح الكتاب من جلسة الخطة
  async function openBookFromSession(b: CalendarBlock) {
    if (!b.bookId) return;
    setSheetOpen(false);
    try {
      const { data } = await supabase.from("books").select("pdf_path,title").eq("id", b.bookId).maybeSingle();
      if (data?.pdf_path) {
        router.push({
          pathname: "/reader/[id]",
          params: { id: b.bookId, title: data.title ?? b.bookTitle ?? "", pdf_path: data.pdf_path },
        });
      }
    } catch {}
  }

  // تكبير
  const [fullOpen, setFullOpen] = useState(false);

  // ✅ عنوان التاريخ حسب الوضع
  const range = useMemo(() => {
    if (mode === "daily") return { caption: t("calendar.range.day"), value: cursorISO };
    if (mode === "weekly") {
      const start = startOfWeekISO(cursorISO);
      const end = addDaysISO(start, 6);
      return { caption: t("calendar.range.week"), value: `${start}  →  ${end}` };
    }
    return { caption: t("calendar.range.month"), value: formatMonthArabic(cursorISO, t) };
  }, [mode, cursorISO, t]);

  function goPrev() {
    if (mode === "daily") setCursorISO((p) => addDaysISO(p, -1));
    if (mode === "weekly") setCursorISO((p) => addDaysISO(p, -7));
    if (mode === "monthly") {
      const d = safeDateFromISO(cursorISO);
      d.setMonth(d.getMonth() - 1);
      setCursorISO(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`);
    }
  }
  function goNext() {
    if (mode === "daily") setCursorISO((p) => addDaysISO(p, 1));
    if (mode === "weekly") setCursorISO((p) => addDaysISO(p, 7));
    if (mode === "monthly") {
      const d = safeDateFromISO(cursorISO);
      d.setMonth(d.getMonth() + 1);
      setCursorISO(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`);
    }
  }

  // ✅ تحميل من Supabase: student_events + plan_sessions
  useEffect(() => {
    load();
    // (لو تبين realtime نضيفه بعد ما يثبت كل شيء)
  }, [cursorISO, mode]);

  async function load() {
    setLoading(true);
    try {
      const userId = await getUserId();

      // نحدد نطاق التحميل حسب mode
      let from = cursorISO;
      let to = cursorISO;

      if (mode === "weekly") {
        from = startOfWeekISO(cursorISO);
        to = addDaysISO(from, 6);
      } else if (mode === "monthly") {
        const mk = monthKey(cursorISO);
        from = `${mk}-01`;
        // نهاية الشهر تقريبية: + 40 يوم ثم نرجع لبداية الشهر اللي بعده -1 (بس هنا نستخدم فلترة monthKey بالذاكرة)
        to = addDaysISO(from, 40);
      }

      // 1) student_events (أحداث)
      const { data: evData, error: evErr } = await supabase
        .from("student_events")
        .select("*")
        .eq("user_id", userId);

      if (evErr) throw evErr;

      // 2) plan_sessions (جلسات) + join للخطة + الكتاب إذا كان موجود عندك
      const { data: sesData, error: sesErr } = await supabase
        .from("plan_sessions")
        .select(
          `
          *,
          study_plans:study_plans ( id, user_id, book_id, book:books ( id, title ) )
        `
        )
        .eq("study_plans.user_id", userId);

      if (sesErr) throw sesErr;

      // تحويل أحداث
      const events: CalendarBlock[] = (evData ?? []).map((r: any) => {
        const dateISO =
          r.dateISO ??
          r.date_iso ??
          r.date ??
          r.event_date ??
          r.session_date ??
          todayISO();

        const status: TaskStatus = (r.status ?? "pending") as TaskStatus;

        return {
          id: `event_${r.id}`,
          kind: "event",
          dateISO: String(dateISO).slice(0, 10),
          title: String(r.title ?? r.name ?? t("calendar.fallback.event")),
          time: r.time ?? r.event_time ?? undefined,
          status,
          eventType: (r.type ?? r.event_type ?? "اختبار") as StudentEventType,
          color: "rgba(79,140,255,0.18)",
        };
      });

      // تحويل جلسات الخطة
      const sessions: CalendarBlock[] = (sesData ?? []).map((r: any) => {
        const dateISO =
          r.dateISO ??
          r.date_iso ??
          r.session_date ??
          r.date ??
          todayISO();

        const bookId = r.study_plans?.book_id ?? r.study_plans?.book?.id ?? r.book?.id ?? null;
        const bookTitle = r.study_plans?.book?.title ?? r.book?.title ?? r.book_title ?? null;
        const color = bookId ? hashColor(String(bookId)) : "rgba(46,204,113,0.18)";

        const statusRaw = r.status ?? "pending";
        const status: TaskStatus =
          statusRaw === "done" || statusRaw === "canceled" || statusRaw === "more_time"
            ? statusRaw
            : "pending";

        return {
          id: `session_${r.id}`,
          kind: "session",
          dateISO: String(dateISO).slice(0, 10),
          title: String(r.title ?? r.kind ?? t("calendar.fallback.session")),
          time: r.time ?? undefined,
          status,
          minutesPlanned: Number(r.minutes ?? r.minutes_planned ?? 0),
          minutesDone: Number(r.minutes_done ?? 0),
          pagesTarget: r.pages_target ?? null,
          pagesDone: r.pages_done ?? null,
          bookId,
          bookTitle,
          color,
        };
      });

      // فلترة نطاق العرض في الذاكرة (خصوصًا الشهري)
      const all = [...events, ...sessions].filter((b) => {
        if (mode === "daily") return b.dateISO === cursorISO && b.status !== "canceled";
        if (mode === "weekly") return b.dateISO >= from && b.dateISO <= to && b.status !== "canceled";
        // monthly
        return monthKey(b.dateISO) === monthKey(cursorISO) && b.status !== "canceled";
      });

      all.sort((a, b) => (a.dateISO === b.dateISO ? compareTime(a.time, b.time) : a.dateISO.localeCompare(b.dateISO)));

      setBlocks(all);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // ✅ أسبوعي “شكل قديم”: أعمدة/Days card (غير شريط طويل للأزرار)
  const weekDays = useMemo(() => {
    const start = startOfWeekISO(cursorISO);
    return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  }, [cursorISO]);

  const blocksByDay = useMemo(() => {
    const m = new Map<string, CalendarBlock[]>();
    for (const d of weekDays) m.set(d, []);
    for (const b of blocks) {
      if (m.has(b.dateISO)) m.get(b.dateISO)!.push(b);
    }
    for (const d of weekDays) {
      m.get(d)!.sort((a, b) => compareTime(a.time, b.time));
    }
    return m;
  }, [blocks, weekDays]);

  // شبكة الشهر: 6 أسابيع × 7 أيام (تبدأ الإثنين)
  const monthMatrix = useMemo(() => {
    const first = `${monthKey(cursorISO)}-01`;
    const gridStart = startOfWeekISO(first);
    return Array.from({ length: 42 }, (_, i) => addDaysISO(gridStart, i));
  }, [cursorISO]);

  // إحصاء لكل يوم: الإجمالي والمنجز (للنقطة ونسبة الإنجاز)
  const monthStatsByDay = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const b of blocks) {
      const s = m.get(b.dateISO) ?? { total: 0, done: 0 };
      s.total += 1;
      if (b.status === "done") s.done += 1;
      m.set(b.dateISO, s);
    }
    return m;
  }, [blocks]);

  // ✅ progress chart بدل Tabs (حل “الخطة/المكتمل/المراجعة ما لها فايدة”)
  const chart = useMemo(() => {
    const total = blocks.length;
    const done = blocks.filter((x) => x.status === "done").length;
    const more = blocks.filter((x) => x.status === "more_time").length;
    const pending = total - done - more;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pending, more, pct };
  }, [blocks]);

  function openSummary(b: CalendarBlock) {
    setSelected(b);
    setSheetOpen(true);
  }

  function openActions(b: CalendarBlock) {
    // long press
    Alert.alert(b.title, t("calendar.actions.title"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("calendar.actions.editLater"),
        onPress: () => Alert.alert(t("common.edit"), t("calendar.actions.editLaterBody")),
      },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => handleDelete(b),
      },
      {
        text: t("calendar.actions.cancelTask"),
        onPress: () => setStatus(b, "canceled"),
      },
    ]);
  }

  async function handleDelete(b: CalendarBlock) {
    Alert.alert(t("calendar.delete.confirmTitle"), b.title, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            if (b.kind === "event") {
              const realId = b.id.replace("event_", "");
              const { error } = await supabase.from("student_events").delete().eq("id", realId);
              if (error) throw error;
            } else {
              const realId = b.id.replace("session_", "");
              const { error } = await supabase.from("plan_sessions").delete().eq("id", realId);
              if (error) throw error;
            }
            load();
          } catch (e: any) {
            Alert.alert("Error", e?.message ?? String(e));
          }
        },
      },
    ]);
  }

  async function setStatus(b: CalendarBlock, status: TaskStatus) {
    try {
      if (b.kind === "event") {
        const realId = b.id.replace("event_", "");
        const { error } = await supabase.from("student_events").update({ status }).eq("id", realId);
        if (error) throw error;
      } else {
        const realId = b.id.replace("session_", "");
        const { error } = await supabase.from("plan_sessions").update({ status }).eq("id", realId);
        if (error) throw error;
      }
      setSheetOpen(false);
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  }

  return (
    <SceneScreen>
      {/* Header */}
      <SceneBanner
        title={t("calendar.header.title")}
        subtitle={t("calendar.header.subtitle")}
        height={150}
        left={<AppDrawer tint={pal.dark ? "#FFFFFF" : pal.ink} light={!pal.dark} />}
      />

      {/* Chart بدل Tabs */}
      <SceneCard padded={false} style={[styles.chartCardOuter, styles.chartCardC]}>
        <View style={{ flexDirection: dir.row, justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[styles.chartTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("calendar.chart.title")}</Text>
          <Text style={[styles.chartPct, { color: pal.accent }]}>{chart.pct}%</Text>
        </View>

        <View style={[styles.barBg, { backgroundColor: pal.track }]}>
          <View style={[styles.barFill, { width: `${chart.pct}%`, backgroundColor: pal.accent }]} />
        </View>

        <View style={[styles.chartRow, { flexDirection: dir.row }]}>
          <MiniStat label={t("calendar.chart.done")} value={chart.done} tint="green" />
          <MiniStat label={t("calendar.chart.more")} value={chart.more} tint="orange" />
          <MiniStat label={t("calendar.chart.pending")} value={chart.pending} tint="blue" />
        </View>
      </SceneCard>

      {/* Date row: سهم يمين + الأسبوع في المنتصف + سهم يسار */}
      <View style={[styles.dateRow, { flexDirection: dir.row }]}>
        <Pressable
          onPress={goPrev}
          style={[styles.navBtn, { backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-forward" size={20} color={pal.accent} />
        </Pressable>

        <View style={styles.rangeCenter}>
          <Text style={[styles.rangeCaption, { color: pal.accent }]}>{range.caption}</Text>
          <Text style={[styles.rangeValue, { color: pal.ink }]} numberOfLines={1}>{range.value}</Text>
        </View>

        <Pressable
          onPress={goNext}
          style={[styles.navBtn, { backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={20} color={pal.accent} />
        </Pressable>
      </View>

      {/* Mode buttons بجنب بعض */}
      <View style={[styles.modeRow, { flexDirection: dir.row }]}>
        <ModeBtn label={t("calendar.mode.monthly")} active={mode === "monthly"} onPress={() => setMode("monthly")} />
        <ModeBtn label={t("calendar.mode.weekly")} active={mode === "weekly"} onPress={() => setMode("weekly")} />
        <ModeBtn label={t("calendar.mode.daily")} active={mode === "daily"} onPress={() => setMode("daily")} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header section actions */}
        <View style={[styles.sectionHeader, { flexDirection: dir.row }]}>
          <Text style={[styles.sectionTitle, { color: pal.dim }]}>
            {mode === "daily" ? t("calendar.schedule.daily") : mode === "weekly" ? t("calendar.schedule.weekly") : t("calendar.schedule.monthly")}
          </Text>
        </View>

        {/* محتوى حسب الوضع */}
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={{ color: pal.dim, textAlign: dir.textAlign }}>{t("common.loading")}</Text>
          </View>
        ) : mode === "daily" ? (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {blocks.length === 0 ? (
              <Empty />
            ) : (
              blocks.map((b) => (
                <BlockCard key={b.id} b={b} onPress={() => openSummary(b)} onLongPress={() => openActions(b)} />
              ))
            )}
          </View>
        ) : mode === "weekly" ? (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {weekDays.map((d, idx) => {
              const list = blocksByDay.get(d) ?? [];
              const isToday = d === todayISO();
              const isWeekend = WEEKEND_IDX.includes(idx);
              const total = list.length;
              const done = list.filter((x) => x.status === "done").length;
              const pct = total ? Math.round((done / total) * 100) : 0;

              return (
                <SceneCard
                  key={d}
                  padded={false}
                  style={[
                    styles.weekDayCard,
                    isWeekend && { backgroundColor: pal.dark ? "rgba(246,184,128,0.06)" : "rgba(168,100,30,0.05)", borderColor: tone.warn + "40" },
                    isToday && { backgroundColor: pal.soft, borderColor: pal.accent + "88", borderWidth: 1 },
                  ]}
                >
                  <View style={[styles.weekDayHead, { flexDirection: dir.row }]}>
                    <View style={[styles.weekDayBadge, { backgroundColor: isToday ? pal.accent : pal.track }]}>
                      <Text style={[styles.weekDayNum, { color: isToday ? pal.onAccent : pal.ink }]}>{Number(d.slice(8, 10))}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.weekDayName, { color: pal.ink, textAlign: dir.textAlign }]}>
                        {t(ايام_الاسبوع_KEYS[idx])}
                        {isWeekend ? `  • ${t("calendar.weekend")}` : ""}
                      </Text>
                      <Text style={[styles.weekDayDate, { color: pal.dim, textAlign: dir.textAlign }]}>{d}</Text>
                    </View>

                    {total > 0 ? (
                      <Text
                        style={[
                          styles.pctTag,
                          { color: pct === 100 ? tone.success : pct > 0 ? tone.warn : pal.dim },
                        ]}
                      >
                        {pct}%
                      </Text>
                    ) : null}
                    {isToday ? (
                      <Text style={[styles.todayTag, { color: pal.onAccent, backgroundColor: pal.accent }]}>{t("calendar.today")}</Text>
                    ) : null}
                  </View>

                  {list.length === 0 ? (
                    <Text style={[styles.weekDayEmpty, { color: pal.dim, textAlign: dir.textAlign }]}>{t("calendar.none")}</Text>
                  ) : (
                    <View style={{ gap: 8, marginTop: 8 }}>
                      {list.map((b) => (
                        <BlockCard
                          key={b.id}
                          b={b}
                          onPress={() => openSummary(b)}
                          onLongPress={() => openActions(b)}
                        />
                      ))}
                    </View>
                  )}
                </SceneCard>
              );
            })}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <SceneCard padded={false} style={styles.monthCard}>
              {/* رؤوس أيام الأسبوع */}
              <View style={[styles.monthHeadRow, { flexDirection: dir.row }]}>
                {DAYS_EN_KEYS.map((dKey, i) => (
                  <Text
                    key={dKey}
                    style={[styles.monthHeadCell, { color: WEEKEND_IDX.includes(i) ? tone.warn : pal.dim }]}
                  >
                    {t(dKey)}
                  </Text>
                ))}
              </View>

              {/* شبكة أيام الشهر */}
              <View style={[styles.monthGrid, { flexDirection: dir.row }]}>
                {monthMatrix.map((d, i) => {
                  const inMonth = monthKey(d) === monthKey(cursorISO);
                  const isToday = d === todayISO();
                  const isWeekend = WEEKEND_IDX.includes(i % 7);
                  const st = monthStatsByDay.get(d);
                  const dotColor = st
                    ? st.done === st.total
                      ? tone.success
                      : st.done > 0
                      ? tone.warn
                      : pal.accent
                    : null;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => {
                        setCursorISO(d);
                        setMode("daily");
                      }}
                      style={[
                        styles.monthCell,
                        isWeekend && [styles.monthCellWeekend, { backgroundColor: pal.dark ? "rgba(246,184,128,0.06)" : "rgba(168,100,30,0.05)" }],
                      ]}
                    >
                      <Text
                        style={[
                          styles.monthCellTxt,
                          { color: inMonth ? pal.ink : pal.dim, opacity: inMonth ? 1 : 0.45 },
                          isToday && { color: pal.onAccent, backgroundColor: pal.accent, opacity: 1 },
                        ]}
                      >
                        {Number(d.slice(8, 10))}
                      </Text>
                      {dotColor ? <View style={[styles.monthDot, { backgroundColor: dotColor }]} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </SceneCard>

            <Text style={[styles.monthHint, { color: pal.dim }]}>
              {t("calendar.monthHint")}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ✅ Summary sheet (tap) */}
      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.mask} onPress={() => setSheetOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: pal.card, borderColor: pal.cardBorder }]} onPress={() => {}}>
            {selected ? (
              <>
                {/* عنوان: اسم الكتاب/المادة بوضوح */}
                <Text style={[styles.sheetTitle, { color: pal.ink }]} numberOfLines={2}>
                  {selected.kind === "session"
                    ? selected.bookTitle || t("calendar.fallback.session")
                    : selected.title}
                </Text>

                {/* نوع الجلسة — قابل للتغيير */}
                {selected.kind === "session" ? (
                  <Pressable
                    onPress={() => chooseSessionType(selected)}
                    style={[styles.typeChip, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}
                  >
                    <Ionicons name="pricetag-outline" size={13} color={pal.accent} />
                    <Text style={[styles.typeChipTxt, { color: pal.ink }]}>
                      {sessionTypes[selected.id] || DEFAULT_SESSION_TYPE}
                    </Text>
                    <Ionicons name="chevron-down" size={13} color={pal.dim} />
                  </Pressable>
                ) : null}

                <Text style={[styles.sheetMeta, { color: pal.dim }]}>
                  {selected.dateISO}
                  {selected.minutesPlanned ? ` · ${t("calendar.sheet.minutes", { count: selected.minutesPlanned })}` : ""}
                  {selected.kind === "session" && selected.pagesTarget
                    ? ` · ${t("calendar.sheet.pages", { done: selected.pagesDone ?? 0, target: selected.pagesTarget })}`
                    : ""}
                </Text>

                {/* المنهج اليوم */}
                {selected.kind === "session" && (unitLoading || unitLabel) ? (
                  <View style={[styles.unitChip, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.track }]}>
                    <Ionicons name="reader-outline" size={15} color={pal.accent} />
                    <Text style={[styles.unitChipTxt, { color: pal.ink }]} numberOfLines={2}>
                      {unitLoading ? t("calendar.unit.loading") : t("calendar.unit.label", { unit: unitLabel ?? "" })}
                    </Text>
                  </View>
                ) : null}

                {/* الحالة — اختيار واحد واضح (أيقونة فوق نص موسّط) */}
                <Text style={[styles.sheetLabel, { color: pal.dim }]}>{t("calendar.status.label")}</Text>
                <View style={[styles.statusRow, { flexDirection: dir.row }]}>
                  {([
                    { k: "done", label: t("common.done"), icon: "checkmark-circle", on: tone.success },
                    { k: "more_time", label: t("calendar.status.moreTime"), icon: "time-outline", on: tone.warn },
                    { k: "pending", label: t("calendar.status.notDone"), icon: "ellipse-outline", on: pal.accent },
                  ] as const).map((opt) => {
                    const active = selected.status === opt.k;
                    return (
                      <Pressable
                        key={opt.k}
                        onPress={() => setStatus(selected, opt.k as TaskStatus)}
                        style={[
                          styles.statusPill,
                          { backgroundColor: pal.track, borderColor: pal.cardBorder },
                          active && { backgroundColor: opt.on + "26", borderColor: opt.on },
                        ]}
                      >
                        <Ionicons name={opt.icon} size={22} color={active ? opt.on : pal.dim} />
                        <Text style={[styles.statusPillTxt, { color: active ? opt.on : pal.dim }]} numberOfLines={1}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* أزرار حقيقية */}
                {selected.kind === "session" && selected.bookId ? (
                  <Pressable
                    onPress={() => openBookFromSession(selected)}
                    style={[styles.sheetPrimary, { flexDirection: dir.row, backgroundColor: pal.accent }]}
                  >
                    <Ionicons name="book" size={18} color={pal.onAccent} />
                    <Text style={[styles.sheetPrimaryTxt, { color: pal.onAccent }]}>{t("calendar.sheet.openBook")}</Text>
                  </Pressable>
                ) : null}

                <View style={[styles.sheetFooter, { flexDirection: dir.row }]}>
                  <Pressable
                    onPress={() => setSheetOpen(false)}
                    style={[styles.closeBtn, { backgroundColor: pal.track, borderColor: pal.cardBorder }]}
                  >
                    <Text style={[styles.closeBtnTxt, { color: pal.ink }]}>{t("common.close")}</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(selected)} style={[styles.deleteBtn, { flexDirection: dir.row }]} hitSlop={6}>
                    <Ionicons name="trash-outline" size={15} color={tone.danger} />
                    <Text style={[styles.sheetDanger, { color: tone.danger }]}>{t("common.delete")}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ✅ Fullscreen zoom */}
      <Modal visible={fullOpen} animationType="slide" onRequestClose={() => setFullOpen(false)} presentationStyle="fullScreen">
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: pal.bg }]} edges={["top", "left", "right"]}>
          <View style={[styles.modalHeader, { flexDirection: dir.row }]}>
            <Text style={[styles.modalTitle, { color: pal.ink }]}>
              {mode === "daily" ? t("calendar.zoom.day") : mode === "weekly" ? t("calendar.zoom.week") : t("calendar.zoom.month")}
            </Text>
            <Pressable
              onPress={() => setFullOpen(false)}
              style={[styles.modalCloseBtn, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}
              hitSlop={12}
            >
              <Text style={[styles.modalCloseTxt, { color: pal.ink }]}>{t("common.close")}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            {mode === "daily" ? (
              blocks.length === 0 ? (
                <Empty />
              ) : (
                blocks.map((b) => (
                  <BlockCard key={b.id} b={b} big onPress={() => openSummary(b)} onLongPress={() => openActions(b)} />
                ))
              )
            ) : mode === "weekly" ? (
              <View style={{ gap: 12 }}>
                {weekDays.map((d, idx) => {
                  const list = blocksByDay.get(d) ?? [];
                  return (
                    <SceneCard key={d} padded={false} style={styles.bigBlock}>
                      <Text style={[styles.bigBlockTitle, { color: pal.ink, textAlign: dir.textAlign }]}>
                        {t(ايام_الاسبوع_KEYS[idx])} • {d}
                      </Text>

                      <View style={{ gap: 10, marginTop: 10 }}>
                        {list.length === 0 ? (
                          <Text style={[styles.muted, { color: pal.dim, textAlign: dir.textAlign }]}>{t("calendar.none")}</Text>
                        ) : (
                          list.map((b) => (
                            <BlockCard
                              key={b.id}
                              b={b}
                              big
                              onPress={() => openSummary(b)}
                              onLongPress={() => openActions(b)}
                            />
                          ))
                        )}
                      </View>
                    </SceneCard>
                  );
                })}
              </View>
            ) : (
              <MonthList blocks={blocks} big onPress={openSummary} onLongPress={openActions} />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SceneScreen>
  );
}

/* ---------------- Components ---------------- */

// ألوان الحالة (منجز/وقت إضافي/حذف) مقروءة على المشاهد الفاتحة والداكنة
function useTones() {
  const { pal } = useScene();
  return {
    pal,
    success: pal.dark ? "#7FD69B" : "#2F7D4A",
    warn: pal.dark ? "#F6B880" : "#A8641E",
    danger: pal.dark ? "#FF8C96" : "#B83A44",
  };
}

function MiniStat({ label, value, tint }: { label: string; value: number; tint: "blue" | "green" | "orange" }) {
  const tone = useTones();
  const { pal } = tone;
  const c = tint === "green" ? tone.success : tint === "orange" ? tone.warn : pal.accent;

  return (
    <View style={[styles.miniStat, { backgroundColor: c + "1F", borderColor: c + "55" }]}>
      <Text style={[styles.miniStatVal, { color: c }]}>{value}</Text>
      <Text style={[styles.miniStatLab, { color: pal.dim }]}>{label}</Text>
    </View>
  );
}

function ModeBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { pal } = useScene();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeBtn,
        { backgroundColor: pal.card, borderColor: pal.cardBorder },
        active && { backgroundColor: pal.accent, borderColor: pal.accent },
      ]}
    >
      <Text style={[styles.modeTxt, { color: active ? pal.onAccent : pal.dim }]}>{label}</Text>
    </Pressable>
  );
}

function Empty() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  return (
    <SceneCard padded={false} style={styles.emptyCard}>
      <Text style={[styles.emptyTxt, { color: pal.dim, textAlign: dir.textAlign }]}>{t("calendar.emptyRange")}</Text>
    </SceneCard>
  );
}


function BlockCard({
  b,
  onPress,
  onLongPress,
  compact,
  big,
}: {
  b: CalendarBlock;
  onPress: () => void;
  onLongPress: () => void;
  compact?: boolean;
  big?: boolean;
}) {
  const { t } = useI18n();
  const dir = useDir();
  const tone = useTones();
  const { pal } = tone;
  const done = b.status === "done";
  const more = b.status === "more_time";

  const leftColor = b.kind === "session" ? (b.color ?? tone.success) : pal.accent;
  const badgeTxt =
    b.kind === "session"
      ? (b.bookTitle ? t("calendar.block.book", { title: b.bookTitle }) : t("calendar.block.session"))
      : (b.eventType ?? t("calendar.fallback.event"));

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[styles.block, compact && styles.blockCompact, big && styles.blockBig]}>
      <View
        style={[
          styles.blockInner,
          { backgroundColor: pal.card, borderColor: pal.cardBorder, borderLeftColor: leftColor, opacity: done ? 0.65 : 1 },
        ]}
      >
        <View style={[styles.blockTop, { flexDirection: dir.row }]}>
          <View style={[styles.badge, { backgroundColor: pal.soft, borderColor: more ? tone.warn + "73" : pal.track }]}>
            <Text style={[styles.badgeTxt, { color: pal.ink }]} numberOfLines={1}>{badgeTxt}</Text>
          </View>

          {/* ✅ أيقونات ثابتة داخل الإطار (حل السلة خارج الاطار) */}
          <View style={[styles.iconRow, { flexDirection: dir.row }]}>
            <View style={[styles.stateDot, { backgroundColor: done ? tone.success : more ? tone.warn : pal.accent }]} />
          </View>
        </View>

        <Text style={[styles.blockTitle, { color: pal.ink }, big && { fontSize: 14 }, { textAlign: dir.textAlign }]} numberOfLines={2}>
          {b.title}
        </Text>

        <Text style={[styles.blockMeta, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
          {b.dateISO} • {b.time ?? "—"} • {done ? t("calendar.block.done") : more ? t("calendar.block.more") : t("calendar.block.pending")}
        </Text>

        {b.kind === "session" ? (
          <Text style={[styles.blockMeta, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
            {b.minutesPlanned ? t("calendar.block.minutes", { count: b.minutesPlanned }) : ""}
            {b.pagesTarget ? ` • ${t("calendar.block.pages", { done: b.pagesDone ?? 0, target: b.pagesTarget })}` : ""}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function MonthList({
  blocks,
  onPress,
  onLongPress,
  big,
}: {
  blocks: CalendarBlock[];
  onPress: (b: CalendarBlock) => void;
  onLongPress: (b: CalendarBlock) => void;
  big?: boolean;
}) {
  const dir = useDir();
  const { pal } = useScene();
  const grouped = useMemo(() => {
    const m = new Map<string, CalendarBlock[]>();
    for (const b of blocks) {
      if (!m.has(b.dateISO)) m.set(b.dateISO, []);
      m.get(b.dateISO)!.push(b);
    }
    for (const arr of m.values()) arr.sort((a, b) => compareTime(a.time, b.time));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [blocks]);

  if (grouped.length === 0) return <Empty />;

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {grouped.map(([dateISO, list]) => (
        <SceneCard key={dateISO} padded={false} style={[styles.bigBlock, big && { padding: 16 }]}>
          <Text style={[styles.bigBlockTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{dateISO}</Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            {list.map((b) => (
              <BlockCard key={b.id} b={b} big={big} onPress={() => onPress(b)} onLongPress={() => onLongPress(b)} />
            ))}
          </View>
        </SceneCard>
      ))}
    </View>
  );
}

/* ---------------- Styles ---------------- */
// الألوان كلها تُمرَّر مباشرة من pal (لأنها تتبدّل مع المشهد) — هنا التخطيط فقط

const styles = StyleSheet.create({
  chartCardOuter: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  chartCardC: {
    padding: 14,
    gap: 10,
    borderRadius: Radius.lg,
  },
  chartTitle: { fontWeight: "900", textAlign: "right", fontSize: 16 },
  chartPct: { fontWeight: "900", fontSize: 18 },
  barBg: { height: 12, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  chartRow: { flexDirection: "row-reverse", gap: 10 },

  miniStat: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  miniStatVal: { fontWeight: "900", fontSize: 18 },
  miniStatLab: { fontWeight: "800" },

  dateRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rangeCenter: { flex: 1, alignItems: "center" },
  rangeCaption: { fontWeight: "800", fontSize: 12, marginBottom: 2 },
  rangeValue: { fontWeight: "900", fontSize: 15, letterSpacing: 0.3 },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  modeRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  modeTxt: { fontWeight: "900" },

  // --- قائمة الأيام (الأسبوعي) ---
  weekDayCard: {
    borderRadius: Radius.lg,
    padding: 12,
  },
  pctTag: { fontSize: 14, fontWeight: "900" },
  weekDayHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  weekDayBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  weekDayNum: { fontWeight: "900", fontSize: 16 },
  weekDayName: { fontWeight: "900", fontSize: 15, textAlign: "right" },
  weekDayDate: { fontSize: 12, textAlign: "right", marginTop: 1 },
  todayTag: {
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  weekDayEmpty: { fontSize: 12, textAlign: "right", marginTop: 8 },

  // --- شبكة التقويم الشهري ---
  monthCard: { padding: 10, borderRadius: Radius.lg },
  monthHeadRow: { flexDirection: "row-reverse", marginBottom: 8 },
  monthHeadCell: { flex: 1, textAlign: "center", fontWeight: "800", fontSize: 12 },
  monthGrid: { flexDirection: "row-reverse", flexWrap: "wrap" },
  monthCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  monthCellWeekend: { borderRadius: Radius.sm },
  monthCellTxt: {
    fontWeight: "800",
    fontSize: 15,
    width: 36,
    height: 36,
    lineHeight: 36,
    textAlign: "center",
    borderRadius: 18,
    overflow: "hidden",
  },
  monthDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 2,
  },
  monthHint: { fontSize: 12, textAlign: "center", marginTop: 12 },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontWeight: "900", fontSize: 15 },

  // blocks
  block: { borderRadius: 14 },
  blockCompact: {},
  blockBig: {},

  blockInner: {
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    gap: 6,
  },

  blockTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  badge: {
    maxWidth: "85%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeTxt: { fontWeight: "900", fontSize: 12 },

  iconRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    width: 30,
    justifyContent: "flex-start",
  },
  stateDot: { width: 10, height: 10, borderRadius: 999 },

  blockTitle: { fontWeight: "900", fontSize: 13, textAlign: "right" },
  blockMeta: { fontSize: 12, textAlign: "right" },

  emptyCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
  },
  emptyTxt: { textAlign: "right", fontWeight: "800" },

  // fullscreen modal
  modalSafe: { flex: 1 },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontWeight: "900", fontSize: 20 },
  modalCloseBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalCloseTxt: { fontWeight: "900", fontSize: 16 },

  bigBlock: {
    borderRadius: 16,
    padding: 14,
  },
  bigBlockTitle: { fontWeight: "900", textAlign: "right" },
  muted: { textAlign: "right" },

  // summary sheet
  mask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  sheetTitle: { fontWeight: "900", fontSize: 20, textAlign: "center" },
  sheetMeta: { textAlign: "center", marginTop: 8, lineHeight: 22, fontSize: 13 },

  unitChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  unitChipTxt: { flex: 1, fontSize: 13, fontWeight: "800", textAlign: "center" },

  typeChip: {
    alignSelf: "center",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  typeChipTxt: { fontSize: 13, fontWeight: "900" },

  sheetLabel: { fontSize: 12, fontWeight: "800", textAlign: "center", marginTop: 16, marginBottom: 8 },
  statusRow: { flexDirection: "row-reverse", gap: 8 },
  statusPill: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
  },
  statusPillTxt: { fontWeight: "800", fontSize: 12.5, textAlign: "center" },

  sheetPrimary: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: Radius.lg,
  },
  sheetPrimaryTxt: { fontWeight: "900", fontSize: 15 },
  sheetFooter: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  deleteBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 6 },
  sheetDanger: { fontWeight: "800", fontSize: 14 },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  closeBtnTxt: { fontWeight: "800", fontSize: 14 },
});
