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

import { GlassCard } from "../../components/brand/glass-card";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Palette, Radius } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { getUnitForDate } from "../../lib/syllabus";

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
const ايام_الاسبوع = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const ايام_مختصرة = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
const اشهر_ميلادية = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
function formatMonthArabic(iso: string) {
  const d = safeDateFromISO(iso);
  return `${اشهر_ميلادية[d.getMonth()]} ${d.getFullYear()}`;
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
    if (mode === "daily") return { caption: "اليوم", value: cursorISO };
    if (mode === "weekly") {
      const start = startOfWeekISO(cursorISO);
      const end = addDaysISO(start, 6);
      return { caption: "الأسبوع", value: `${start}  →  ${end}` };
    }
    return { caption: "الشهر", value: formatMonthArabic(cursorISO) };
  }, [mode, cursorISO]);

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
          study_plans:study_plans ( id, user_id, book_id ),
          book:books ( id, title )
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
          title: String(r.title ?? r.name ?? "حدث"),
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

        const bookId = r.book?.id ?? r.book_id ?? r.study_plans?.book_id ?? null;
        const bookTitle = r.book?.title ?? r.book_title ?? null;
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
          title: String(r.title ?? r.kind ?? "جلسة مذاكرة"),
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
    Alert.alert(b.title, "خيارات", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تعديل (لاحقًا)",
        onPress: () => Alert.alert("تعديل", "سيتم لاحقًا ربط شاشة تعديل كاملة بنفس مودال الإضافة."),
      },
      {
        text: "حذف",
        style: "destructive",
        onPress: () => handleDelete(b),
      },
      {
        text: "إلغاء المهمة",
        onPress: () => setStatus(b, "canceled"),
      },
    ]);
  }

  async function handleDelete(b: CalendarBlock) {
    Alert.alert("حذف نهائي؟", b.title, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
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
    <ScreenBackground>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <ScreenHeader
        icon="calendar"
        title="التخطيط"
        subtitle="خطتك اليومية ونسبة إنجازك"
        color={Palette.neonCyan}
      />

      {/* Chart بدل Tabs */}
      <GlassCard style={styles.chartCardOuter} contentStyle={styles.chartCardC} glow={Palette.neonCyan}>
        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.chartTitle}>ملخص الإنجاز</Text>
          <Text style={styles.chartPct}>{chart.pct}%</Text>
        </View>

        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${chart.pct}%` }]} />
        </View>

        <View style={styles.chartRow}>
          <MiniStat label="منجزة" value={chart.done} tint="green" />
          <MiniStat label="تحتاج وقت" value={chart.more} tint="orange" />
          <MiniStat label="غير منجزة" value={chart.pending} tint="blue" />
        </View>
      </GlassCard>

      {/* Date row: سهم يمين + الأسبوع في المنتصف + سهم يسار */}
      <View style={styles.dateRow}>
        <Pressable onPress={goPrev} style={styles.navBtn} hitSlop={10}>
          <Ionicons name="chevron-forward" size={20} color={Palette.primary} />
        </Pressable>

        <View style={styles.rangeCenter}>
          <Text style={styles.rangeCaption}>{range.caption}</Text>
          <Text style={styles.rangeValue} numberOfLines={1}>{range.value}</Text>
        </View>

        <Pressable onPress={goNext} style={styles.navBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={Palette.primary} />
        </Pressable>
      </View>

      {/* Mode buttons بجنب بعض */}
      <View style={styles.modeRow}>
        <ModeBtn label="شهري" active={mode === "monthly"} onPress={() => setMode("monthly")} />
        <ModeBtn label="أسبوعي" active={mode === "weekly"} onPress={() => setMode("weekly")} />
        <ModeBtn label="يومي" active={mode === "daily"} onPress={() => setMode("daily")} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header section actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {mode === "daily" ? "جدول اليوم" : mode === "weekly" ? "الجدول الأسبوعي" : "الجدول الشهري"}
          </Text>
        </View>

        {/* محتوى حسب الوضع */}
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={{ color: "#9fb3c8", textAlign: "right" }}>جاري التحميل…</Text>
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
                <View
                  key={d}
                  style={[
                    styles.weekDayCard,
                    isWeekend && styles.weekDayWeekend,
                    isToday && styles.weekDayToday,
                  ]}
                >
                  <View style={styles.weekDayHead}>
                    <View style={[styles.weekDayBadge, isToday && { backgroundColor: Palette.primary }]}>
                      <Text style={styles.weekDayNum}>{Number(d.slice(8, 10))}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.weekDayName}>
                        {ايام_الاسبوع[idx]}
                        {isWeekend ? "  • عطلة" : ""}
                      </Text>
                      <Text style={styles.weekDayDate}>{d}</Text>
                    </View>

                    {total > 0 ? (
                      <Text
                        style={[
                          styles.pctTag,
                          { color: pct === 100 ? Palette.success : pct > 0 ? Palette.warn : Palette.textDim },
                        ]}
                      >
                        {pct}%
                      </Text>
                    ) : null}
                    {isToday ? <Text style={styles.todayTag}>اليوم</Text> : null}
                  </View>

                  {list.length === 0 ? (
                    <Text style={styles.weekDayEmpty}>— لا يوجد</Text>
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
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {/* رؤوس أيام الأسبوع */}
            <View style={styles.monthHeadRow}>
              {DAYS_EN.map((d, i) => (
                <Text
                  key={d}
                  style={[styles.monthHeadCell, WEEKEND_IDX.includes(i) && { color: Palette.warn }]}
                >
                  {d}
                </Text>
              ))}
            </View>

            {/* شبكة أيام الشهر */}
            <View style={styles.monthGrid}>
              {monthMatrix.map((d, i) => {
                const inMonth = monthKey(d) === monthKey(cursorISO);
                const isToday = d === todayISO();
                const isWeekend = WEEKEND_IDX.includes(i % 7);
                const st = monthStatsByDay.get(d);
                const dotColor = st
                  ? st.done === st.total
                    ? Palette.success
                    : st.done > 0
                    ? Palette.warn
                    : Palette.neonCyan
                  : null;
                return (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setCursorISO(d);
                      setMode("daily");
                    }}
                    style={[styles.monthCell, isWeekend && styles.monthCellWeekend]}
                  >
                    <Text
                      style={[
                        styles.monthCellTxt,
                        !inMonth && styles.monthCellDim,
                        isToday && { color: "#fff", backgroundColor: Palette.primary },
                      ]}
                    >
                      {Number(d.slice(8, 10))}
                    </Text>
                    {dotColor ? <View style={[styles.monthDot, { backgroundColor: dotColor }]} /> : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.monthHint}>
              اضغط على أي يوم لعرض مهامه • أعمدة الجمعة والسبت عطلة
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ✅ Summary sheet (tap) */}
      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.mask} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {selected ? (
              <>
                {/* عنوان: اسم الكتاب/المادة بوضوح */}
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {selected.kind === "session"
                    ? selected.bookTitle || "جلسة مذاكرة"
                    : selected.title}
                </Text>
                <Text style={styles.sheetMeta}>
                  {selected.dateISO}
                  {selected.minutesPlanned ? ` · ${selected.minutesPlanned} دقيقة` : ""}
                  {selected.kind === "session" && selected.pagesTarget
                    ? ` · ${selected.pagesDone ?? 0}/${selected.pagesTarget} صفحة`
                    : ""}
                </Text>

                {/* المنهج اليوم */}
                {selected.kind === "session" && (unitLoading || unitLabel) ? (
                  <View style={styles.unitChip}>
                    <Ionicons name="reader-outline" size={15} color={Palette.neonCyan} />
                    <Text style={styles.unitChipTxt} numberOfLines={2}>
                      {unitLoading ? "…المنهج اليوم" : `المنهج اليوم: ${unitLabel}`}
                    </Text>
                  </View>
                ) : null}

                {/* الحالة — اختيار واحد واضح */}
                <Text style={styles.sheetLabel}>الحالة</Text>
                <View style={styles.statusRow}>
                  {([
                    { k: "done", label: "✅ تم", on: Palette.success },
                    { k: "more_time", label: "⏳ يحتاج وقت", on: Palette.warn },
                    { k: "pending", label: "○ لم تتم", on: Palette.textMuted },
                  ] as const).map((opt) => {
                    const active = selected.status === opt.k;
                    return (
                      <Pressable
                        key={opt.k}
                        onPress={() => setStatus(selected, opt.k as TaskStatus)}
                        style={[
                          styles.statusPill,
                          active && { backgroundColor: opt.on + "26", borderColor: opt.on },
                        ]}
                      >
                        <Text style={[styles.statusPillTxt, active && { color: opt.on }]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* أزرار حقيقية */}
                {selected.kind === "session" && selected.bookId ? (
                  <Pressable onPress={() => openBookFromSession(selected)} style={styles.sheetPrimary}>
                    <Ionicons name="book" size={18} color="#0b1220" />
                    <Text style={styles.sheetPrimaryTxt}>افتح الكتاب واقرأ</Text>
                  </Pressable>
                ) : null}

                <View style={styles.sheetFooter}>
                  <Pressable onPress={() => handleDelete(selected)} hitSlop={6}>
                    <Text style={styles.sheetDanger}>حذف</Text>
                  </Pressable>
                  <Pressable onPress={() => setSheetOpen(false)} hitSlop={6}>
                    <Text style={styles.sheetClose}>إغلاق</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ✅ Fullscreen zoom */}
      <Modal visible={fullOpen} animationType="slide" onRequestClose={() => setFullOpen(false)} presentationStyle="fullScreen">
        <SafeAreaView style={styles.modalSafe} edges={["top", "left", "right"]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {mode === "daily" ? "تكبير اليوم" : mode === "weekly" ? "تكبير الأسبوع" : "تكبير الشهر"}
            </Text>
            <Pressable onPress={() => setFullOpen(false)} style={styles.modalCloseBtn} hitSlop={12}>
              <Text style={styles.modalCloseTxt}>إغلاق</Text>
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
                    <View key={d} style={styles.bigBlock}>
                      <Text style={styles.bigBlockTitle}>
                        {ايام_الاسبوع[idx]} • {d}
                      </Text>

                      <View style={{ gap: 10, marginTop: 10 }}>
                        {list.length === 0 ? (
                          <Text style={styles.muted}>— لا يوجد</Text>
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
                    </View>
                  );
                })}
              </View>
            ) : (
              <MonthList blocks={blocks} big onPress={openSummary} onLongPress={openActions} />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
    </ScreenBackground>
  );
}

/* ---------------- Components ---------------- */

function MiniStat({ label, value, tint }: { label: string; value: number; tint: "blue" | "green" | "orange" }) {
  const bg =
    tint === "green"
      ? "rgba(46,204,113,0.18)"
      : tint === "orange"
      ? "rgba(255,165,0,0.18)"
      : "rgba(79,140,255,0.18)";
  const bd =
    tint === "green"
      ? "rgba(46,204,113,0.35)"
      : tint === "orange"
      ? "rgba(255,165,0,0.35)"
      : "rgba(79,140,255,0.35)";

  return (
    <View style={[styles.miniStat, { backgroundColor: bg, borderColor: bd }]}>
      <Text style={styles.miniStatVal}>{value}</Text>
      <Text style={styles.miniStatLab}>{label}</Text>
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
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeBtn,
        active && { backgroundColor: Palette.primary, borderColor: Palette.primary },
      ]}
    >
      <Text style={[styles.modeTxt, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function Empty() {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTxt}>لا يوجد عناصر في هذا النطاق.</Text>
    </View>
  );
}

function EmptySlot() {
  return (
    <View style={styles.emptyIconWrap}>
      <Text style={styles.emptyIcon}>—</Text>
    </View>
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
  const done = b.status === "done";
  const more = b.status === "more_time";

  const leftColor = b.kind === "session" ? (b.color ?? "rgba(46,204,113,0.35)") : "rgba(79,140,255,0.35)";
  const badgeTxt = b.kind === "session" ? (b.bookTitle ? `كتاب: ${b.bookTitle}` : "جلسة") : (b.eventType ?? "حدث");

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[styles.block, compact && styles.blockCompact, big && styles.blockBig]}>
      <View style={[styles.blockInner, { borderLeftColor: leftColor, opacity: done ? 0.65 : 1 }]}>
        <View style={styles.blockTop}>
          <View style={[styles.badge, more && { borderColor: "rgba(255,165,0,0.45)" }]}>
            <Text style={styles.badgeTxt} numberOfLines={1}>{badgeTxt}</Text>
          </View>

          {/* ✅ أيقونات ثابتة داخل الإطار (حل السلة خارج الاطار) */}
          <View style={styles.iconRow}>
            <View style={[styles.stateDot, done ? styles.dotDone : more ? styles.dotMore : styles.dotPending]} />
          </View>
        </View>

        <Text style={[styles.blockTitle, big && { fontSize: 14 }]} numberOfLines={2}>
          {b.title}
        </Text>

        <Text style={styles.blockMeta} numberOfLines={1}>
          {b.dateISO} • {b.time ?? "—"} • {done ? "منجزة" : more ? "تحتاج وقت" : "غير منجزة"}
        </Text>

        {b.kind === "session" ? (
          <Text style={styles.blockMeta} numberOfLines={1}>
            {b.minutesPlanned ? `${b.minutesPlanned} د` : ""}
            {b.pagesTarget ? ` • صفحات: ${b.pagesDone ?? 0}/${b.pagesTarget}` : ""}
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
  const grouped = useMemo(() => {
    const m = new Map<string, CalendarBlock[]>();
    for (const b of blocks) {
      if (!m.has(b.dateISO)) m.set(b.dateISO, []);
      m.get(b.dateISO)!.push(b);
    }
    for (const [k, arr] of m.entries()) arr.sort((a, b) => compareTime(a.time, b.time));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [blocks]);

  if (grouped.length === 0) return <Empty />;

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {grouped.map(([dateISO, list]) => (
        <View key={dateISO} style={[styles.bigBlock, big && { padding: 16 }]}>
          <Text style={styles.bigBlockTitle}>{dateISO}</Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            {list.map((b) => (
              <BlockCard key={b.id} b={b} big={big} onPress={() => onPress(b)} onLongPress={() => onLongPress(b)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },

  headerRow: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", textAlign: "right" },

  chartCardOuter: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  chartCardC: {
    padding: 14,
    gap: 10,
  },
  chartTitle: { color: Palette.text, fontWeight: "900", textAlign: "right", fontSize: 16 },
  chartPct: { color: Palette.neonCyan, fontWeight: "900", fontSize: 18 },
  barBg: { height: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#4f8cff" },
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
  miniStatVal: { color: "#fff", fontWeight: "900", fontSize: 18 },
  miniStatLab: { color: "#c9d4e2", fontWeight: "800" },

  dateRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rangeCenter: { flex: 1, alignItems: "center" },
  rangeCaption: { color: Palette.primary, fontWeight: "800", fontSize: 12, marginBottom: 2 },
  rangeValue: { color: Palette.text, fontWeight: "900", fontSize: 15, letterSpacing: 0.3 },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Palette.primarySoft,
    borderWidth: 1,
    borderColor: Palette.primary + "55",
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
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    alignItems: "center",
  },
  modeTxt: { color: Palette.textMuted, fontWeight: "900" },

  // --- قائمة الأيام (الأسبوعي) ---
  weekDayCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    backgroundColor: Palette.surface,
    padding: 12,
  },
  weekDayToday: {
    borderColor: Palette.primary + "88",
    backgroundColor: Palette.primarySoft,
  },
  weekDayWeekend: {
    borderColor: "rgba(241,196,15,0.30)",
    backgroundColor: "rgba(241,196,15,0.06)",
  },
  pctTag: { fontSize: 14, fontWeight: "900" },
  weekDayHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  weekDayBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Palette.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  weekDayNum: { color: "#fff", fontWeight: "900", fontSize: 16 },
  weekDayName: { color: Palette.text, fontWeight: "900", fontSize: 15, textAlign: "right" },
  weekDayDate: { color: Palette.textDim, fontSize: 12, textAlign: "right", marginTop: 1 },
  todayTag: {
    color: "#fff",
    backgroundColor: Palette.primary,
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  weekDayEmpty: { color: Palette.textDim, fontSize: 12, textAlign: "right", marginTop: 8 },

  // --- شبكة التقويم الشهري ---
  monthHeadRow: { flexDirection: "row-reverse", marginBottom: 8 },
  monthHeadCell: { flex: 1, textAlign: "center", color: Palette.textDim, fontWeight: "800", fontSize: 12 },
  monthGrid: { flexDirection: "row-reverse", flexWrap: "wrap" },
  monthCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  monthCellWeekend: { backgroundColor: "rgba(241,196,15,0.05)", borderRadius: Radius.sm },
  monthCellTxt: {
    color: Palette.text,
    fontWeight: "800",
    fontSize: 15,
    width: 36,
    height: 36,
    lineHeight: 36,
    textAlign: "center",
    borderRadius: 18,
    overflow: "hidden",
  },
  monthCellDim: { color: "rgba(159,179,200,0.35)" },
  monthDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Palette.neonCyan,
    marginTop: 2,
  },
  monthHint: { color: Palette.textDim, fontSize: 12, textAlign: "center", marginTop: 12 },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { color: Palette.text, fontWeight: "900", fontSize: 15 },

  zoomBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: Palette.primarySoft,
    borderWidth: 1,
    borderColor: Palette.primary + "55",
  },
  zoomTxt: { color: Palette.text, fontWeight: "900" },

  // weekly grid
  weekGrid: { flexDirection: "row-reverse", gap: 12, paddingVertical: 12 },
  dayCol: {
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
  },
  dow: { color: "#9fb3c8", fontWeight: "900", fontSize: 12, textAlign: "right" },
  dayNum: { color: "#fff", fontWeight: "900", fontSize: 20, marginTop: 6, textAlign: "right" },

  // blocks
  block: { borderRadius: 14 },
  blockCompact: {},
  blockBig: {},

  blockInner: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderLeftWidth: 4,
    gap: 6,
  },

  blockTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  badge: {
    maxWidth: "85%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  badgeTxt: { color: "#fff", fontWeight: "900", fontSize: 12 },

  iconRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    width: 30,
    justifyContent: "flex-start",
  },
  stateDot: { width: 10, height: 10, borderRadius: 999 },
  dotDone: { backgroundColor: "#2ecc71" },
  dotMore: { backgroundColor: "#ff9f43" },
  dotPending: { backgroundColor: "#4f8cff" },

  blockTitle: { color: "#fff", fontWeight: "900", fontSize: 13, textAlign: "right" },
  blockMeta: { color: "#c9d4e2", fontSize: 12, textAlign: "right" },

  emptyCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 14,
  },
  emptyTxt: { color: "#9fb3c8", textAlign: "right", fontWeight: "800" },

  emptyIconWrap: {
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: { color: "rgba(201,212,226,0.55)", fontWeight: "900", fontSize: 22 },

  // fullscreen modal
  modalSafe: { flex: 1, backgroundColor: "#0b1220" },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 20 },
  modalCloseBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalCloseTxt: { color: "#fff", fontWeight: "900", fontSize: 16 },

  bigBlock: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
  },
  bigBlockTitle: { color: "#fff", fontWeight: "900", textAlign: "right" },
  muted: { color: "#9fb3c8", textAlign: "right" },

  // summary sheet
  mask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    backgroundColor: Palette.bgElevated,
    padding: 20,
  },
  sheetTitle: { color: Palette.text, fontWeight: "900", fontSize: 20, textAlign: "center" },
  sheetMeta: { color: Palette.textMuted, textAlign: "center", marginTop: 8, lineHeight: 22, fontSize: 13 },

  unitChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  unitChipTxt: { flex: 1, color: Palette.text, fontSize: 13, fontWeight: "800", textAlign: "center" },

  sheetLabel: { color: Palette.textDim, fontSize: 12, fontWeight: "800", textAlign: "center", marginTop: 16, marginBottom: 8 },
  statusRow: { flexDirection: "row-reverse", gap: 8 },
  statusPill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: Radius.md,
    alignItems: "center",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  statusPillTxt: { color: Palette.textMuted, fontWeight: "800", fontSize: 13 },

  sheetPrimary: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Palette.neonCyan,
  },
  sheetPrimaryTxt: { color: "#0b1220", fontWeight: "900", fontSize: 15 },
  sheetFooter: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 16, paddingHorizontal: 6 },
  sheetDanger: { color: Palette.danger, fontWeight: "800", fontSize: 14 },
  sheetClose: { color: Palette.textMuted, fontWeight: "800", fontSize: 14 },
});
