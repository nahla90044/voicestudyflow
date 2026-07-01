// app/syllabus/[id].tsx
// المنهج الدراسي (Syllabus) لكتاب: وحدات بعناوين ومواضيع ومخرجات،
// تشيك ليست لمتابعة التقدّم، ونسبة إنجاز، وطباعة/مشاركة المنهج.
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassCard } from "../../components/brand/glass-card";
import { BuzanMindMap } from "../../components/brand/mindmap";
import { getUnitContent, setUnitContent } from "../../lib/unitContent";
import { stopSpeaking } from "../../lib/voice";
import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import {
  generateMindmap,
  generateSyllabus,
  getSyllabus,
  getUnitSchedule,
  setUnitDone,
  type MindMap,
  type Syllabus,
  type UnitSchedule,
} from "../../lib/syllabus";

const MM_COLORS = ["#7c5cff", "#4f8cff", "#22d3ee", "#2ecc71", "#f5a623", "#ff6b9d"];

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
function fmtISO(iso: string): string {
  const p = (iso || "").split("-");
  if (p.length < 3) return iso;
  return `${Number(p[2])} ${AR_MONTHS[Number(p[1]) - 1] ?? ""}`.trim();
}
function fmtRange(s: UnitSchedule): string {
  return s.startISO === s.endISO ? fmtISO(s.startISO) : `${fmtISO(s.startISO)} – ${fmtISO(s.endISO)}`;
}

export default function SyllabusScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { id, title, pdf_path } = useLocalSearchParams<{
    id?: string;
    title?: string;
    pdf_path?: string;
  }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookId = typeof id === "string" ? id : "";
  const bookTitle = typeof title === "string" ? title : t("syllabus.title");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [genPct, setGenPct] = useState(0); // تقدّم توليد المنهج (٪)
  const [genMsg, setGenMsg] = useState(""); // رسالة المرحلة الحالية
  const [syl, setSyl] = useState<Syllabus | null>(null);
  const [done, setDone] = useState<boolean[]>([]);
  const [sched, setSched] = useState<UnitSchedule[]>([]);
  const [err, setErr] = useState("");

  // الخريطة الذهنية (الاختبار والملخّص صارا صفحتين مستقلتين: unit-quiz / unit-summary)
  const [mmUnit, setMmUnit] = useState<number | null>(null);
  const [mmLoading, setMmLoading] = useState(false);
  const [mm, setMm] = useState<MindMap | null>(null);

  async function loadSchedule(unitCount: number) {
    try {
      setSched(await getUnitSchedule(bookId, unitCount));
    } catch {
      setSched([]);
    }
  }

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
          await loadSchedule(r.data.units.length);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [pdfPath]);

  // مؤشّر تقدّم لتوليد المنهج — يوضّح أن التطبيق يعمل وكم تقريبًا تبقّى.
  // (توليد المنهج الكامل نداءٌ واحد لا يبثّ تقدّمًا، فنُظهر تقدّمًا زمنيًا سلسًا.)
  useEffect(() => {
    if (!busy) {
      setGenPct(0);
      return;
    }
    const msgs = [
      t("syllabus.gen.reading"),
      t("syllabus.gen.extracting"),
      t("syllabus.gen.lectures"),
      t("syllabus.gen.finishing"),
    ];
    let p = 0;
    setGenPct(3);
    setGenMsg(msgs[0]);
    const id = setInterval(() => {
      p = Math.min(92, p + Math.max(1, Math.round((92 - p) * 0.07)));
      setGenPct(p);
      setGenMsg(msgs[p < 25 ? 0 : p < 55 ? 1 : p < 82 ? 2 : 3]);
    }, 450);
    return () => clearInterval(id);
  }, [busy, t]);

  async function onGenerate() {
    setErr("");
    setBusy(true);
    try {
      const data = await generateSyllabus(pdfPath);
      setSyl(data);
      setDone(new Array(data.units.length).fill(false));
      await loadSchedule(data.units.length);
    } catch (e: any) {
      setErr(e?.message ?? t("syllabus.err.generate"));
    } finally {
      setBusy(false);
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
          ${sched[i] ? `<p class="when">📅 ${esc(t("syllabus.studyOn"))}: ${esc(fmtRange(sched[i]))}</p>` : ""}
          ${u.topics.length ? `<ul>${u.topics.map((topic) => `<li>${esc(topic)}</li>`).join("")}</ul>` : ""}
          ${u.outcome ? `<p class="out">🎯 ${esc(u.outcome)}</p>` : ""}
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
      await Print.printAsync({ html });
    } catch {}
  }

  // طباعة الخريطة الذهنية بشكلها **الشجري** الحقيقي (SVG): عقدة مركزية يمينًا،
  // وفروع منحنية متفرّعة يسارًا، وتحت كل فرع نقاطه — كما تظهر على الشاشة تمامًا.
  async function printMindmap() {
    if (!mm) return;
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const clip = (s: string, n: number) => {
      const x = (s || "").trim();
      return x.length > n ? x.slice(0, n - 1) + "…" : x;
    };
    const centerLines = (s: string): string[] => {
      const words = (s || "").split(/\s+/);
      if (words.length <= 2) return [s || ""];
      const mid = Math.ceil(words.length / 2);
      return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    };

    // هندسة الشجرة (وحدات SVG) — الجذر يمينًا، الفروع تتفرّع يسارًا (RTL)
    const W = 1240;
    const ROW = 48;
    const BR_GAP = 32;
    const ROOT_RX = 118;
    const ROOT_RY = 62;
    const X_ROOT = W - 150; // مركز العقدة الجذرية
    const X_BRANCH = 560; // عقد الفروع
    const X_POINT = 300; // النقاط الفرعية

    let y = 80;
    const layout = mm.branches.map((b) => {
      const pts = b.points;
      const startY = y;
      const pointYs = pts.map((_, j) => startY + j * ROW);
      const by = startY + ((Math.max(1, pts.length) - 1) / 2) * ROW;
      y += Math.max(1, pts.length) * ROW + BR_GAP;
      return { label: b.label, pts, pointYs, by };
    });
    const H = Math.max(y + 40, ROOT_RY * 2 + 160);
    const rootY = H / 2;

    const parts: string[] = [];
    layout.forEach((b, i) => {
      const c = MM_COLORS[i % MM_COLORS.length];
      const rootEdge = X_ROOT - ROOT_RX;
      // فرع منحنٍ من الجذر إلى عقدة الفرع
      parts.push(
        `<path d="M ${rootEdge} ${rootY} C ${(rootEdge + X_BRANCH) / 2} ${rootY} ${(rootEdge + X_BRANCH) / 2} ${b.by} ${X_BRANCH} ${b.by}" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/>`
      );
      parts.push(`<circle cx="${X_BRANCH}" cy="${b.by}" r="14" fill="${c}"/>`);
      parts.push(
        `<text x="${X_BRANCH + 24}" y="${b.by + 8}" fill="${c}" font-size="25" font-weight="800" text-anchor="start">${esc(clip(b.label, 32))}</text>`
      );
      // النقاط الفرعية — كل نقطة على سطر بمنحنى خاص
      b.pts.forEach((p, j) => {
        const py = b.pointYs[j];
        parts.push(
          `<path d="M ${X_BRANCH} ${b.by} C ${(X_POINT + X_BRANCH) / 2} ${b.by} ${(X_POINT + X_BRANCH) / 2} ${py} ${X_POINT} ${py}" stroke="${c}" stroke-width="2.5" fill="none" opacity="0.7" stroke-linecap="round"/>`
        );
        parts.push(`<circle cx="${X_POINT}" cy="${py}" r="7" fill="${c}"/>`);
        parts.push(
          `<text x="${X_POINT - 18}" y="${py + 7}" fill="#20304a" font-size="22" text-anchor="end">${esc(clip(p, 34))}</text>`
        );
      });
    });
    // العقدة المركزية
    parts.push(`<ellipse cx="${X_ROOT}" cy="${rootY}" rx="${ROOT_RX}" ry="${ROOT_RY}" fill="#5b3df5"/>`);
    const clines = centerLines(mm.center);
    clines.forEach((ln, k) => {
      parts.push(
        `<text x="${X_ROOT}" y="${rootY - (clines.length - 1) * 16 + k * 32 + 8}" fill="#ffffff" font-size="25" font-weight="800" text-anchor="middle">${esc(clip(ln, 15))}</text>`
      );
    });

    const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, 'SF Arabic', sans-serif">${parts.join("")}</svg>`;

    const html = `<!doctype html><html dir="${dir.writingDirection}" lang="ar"><head><meta charset="utf-8">
      <style>
        @page { size: landscape; margin: 14px; }
        * { font-family: -apple-system, 'SF Arabic', sans-serif; }
        body { margin: 0; padding: 16px; color: #14233a; }
        h1 { font-size: 20px; text-align: center; margin: 0 0 10px; }
        .wrap { width: 100%; }
      </style></head><body>
      <h1>🗺️ ${esc(t("syllabus.mindmap.title"))} — ${esc(bookTitle)}</h1>
      <div class="wrap">${svg}</div>
    </body></html>`;
    try {
      await Print.printAsync({ html });
    } catch {}
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* رأس */}
        <View style={[styles.header, { flexDirection: dir.row }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t("syllabus.title")}
          </Text>
          {syl ? (
            <Pressable onPress={onPrint} style={styles.iconBtn} hitSlop={8}>
              <Ionicons name="print" size={20} color={Palette.text} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.primary} />
          </View>
        ) : !syl ? (
          <View style={styles.center}>
            <Ionicons name="sparkles" size={40} color={Palette.neonViolet} />
            <Text style={styles.emptyTitle}>{t("syllabus.empty.title")}</Text>
            <Text style={styles.emptySub}>
              {t("syllabus.empty.sub")}
            </Text>
            {!!err && <Text style={styles.err}>{err}</Text>}
            {busy ? (
              // شريط تقدّم واضح: يطمئن المستخدم أن التطبيق يعمل ويوضّح ما تبقّى
              <View style={styles.genWrap}>
                <View style={[styles.genHead, { flexDirection: dir.row }]}>
                  <Text style={styles.genMsg}>{genMsg}</Text>
                  <Text style={styles.genPct}>{genPct}%</Text>
                </View>
                <View style={styles.genTrack}>
                  <View style={[styles.genFill, { width: `${genPct}%` }]} />
                </View>
                <Text style={styles.genHint}>{t("syllabus.gen.hint")}</Text>
              </View>
            ) : (
              <GradientButton
                title={t("syllabus.empty.generate")}
                icon="sparkles"
                onPress={onGenerate}
                style={{ marginTop: Spacing.lg, alignSelf: "stretch" }}
              />
            )}
            <Pressable onPress={startReading} style={styles.readNowBtn}>
              <Ionicons name="book" size={18} color={Palette.text} />
              <Text style={styles.readNowTxt}>{t("syllabus.readNowFull")}</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* عنوان + تقدّم */}
            <GlassCard contentStyle={styles.progCard} glow={Palette.neonViolet}>
              <Text style={styles.bookTitle} numberOfLines={3}>
                {syl.title ?? bookTitle}
              </Text>
              <View style={[styles.progRow, { flexDirection: dir.row }]}>
                <Text style={styles.progPct}>{pct}%</Text>
                <Text style={styles.progLabel}>
                  {t("syllabus.progress.completed", { completed, total })}
                </Text>
              </View>
              <View style={styles.progTrack}>
                <View style={[styles.progFill, { width: `${pct}%` }]} />
              </View>
              {sched.length === 0 && (
                <Text style={[styles.noPlanHint, { marginTop: 12 }]}>
                  {t("syllabus.noPlanHint")}
                </Text>
              )}
            </GlassCard>

            {/* زر الدخول للقراءة — بارز فوق الوحدات */}
            <Pressable onPress={startReading} style={styles.readNowBtn}>
              <Ionicons name="book" size={18} color={Palette.text} />
              <Text style={styles.readNowTxt}>{t("syllabus.readNow")}</Text>
            </Pressable>

            {/* الوحدات (تشيك ليست) */}
            {syl.units.map((u, i) => {
              const isDone = done[i];
              return (
                <Pressable key={i} onPress={() => toggle(i)} style={styles.unitWrap}>
                  <GlassCard contentStyle={styles.unitCard} glow={isDone ? Palette.neonCyan : undefined}>
                    <View style={[styles.unitHead, { flexDirection: dir.row }]}>
                      <View style={[styles.check, isDone && styles.checkOn]}>
                        {isDone && <Ionicons name="checkmark" size={16} color="#0b1220" />}
                      </View>
                      <Text style={[styles.unitTitle, isDone && styles.unitTitleDone, { textAlign: dir.textAlign }]}>
                        {i + 1}. {u.title}
                      </Text>
                    </View>
                    {sched[i] && (
                      <View style={[styles.schedRow, { flexDirection: dir.row }]}>
                        <Ionicons name="calendar-outline" size={13} color={Palette.neonCyan} />
                        <Text style={styles.schedTxt}>
                          {t("syllabus.studyOn")}: {fmtRange(sched[i])}{"  ·  "}
                          {sched[i].dayTo !== sched[i].dayFrom
                            ? t("syllabus.dayRange", { from: sched[i].dayFrom, to: sched[i].dayTo })
                            : t("syllabus.day", { day: sched[i].dayFrom })}
                        </Text>
                      </View>
                    )}
                    {u.topics.map((topic, k) => (
                      <View key={k} style={[styles.topicRow, { flexDirection: dir.row }]}>
                        <Text style={styles.topicDot}>•</Text>
                        <Text style={[styles.topicTxt, { textAlign: dir.textAlign }]}>{topic}</Text>
                      </View>
                    ))}
                    {!!u.outcome && (
                      <Text style={[styles.outcome, { textAlign: dir.textAlign }]}>🎯 {u.outcome}</Text>
                    )}

                    <View style={[styles.unitActions, { flexDirection: dir.row }]}>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: "/unit-summary",
                            params: { pdf_path: pdfPath, unit: i, title: u.title, book_title: bookTitle },
                          })
                        }
                        style={[styles.quizBtn, styles.sumBtn, { flexDirection: dir.row }]}
                      >
                        <Ionicons name="headset" size={15} color={Palette.neonCyan} />
                        <Text style={[styles.quizBtnTxt, { color: Palette.neonCyan }]}>
                          {t("syllabus.action.summary")}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: "/unit-quiz",
                            params: { pdf_path: pdfPath, unit: i, title: u.title, book_title: bookTitle },
                          })
                        }
                        style={[styles.quizBtn, { flex: 1, marginTop: 0, flexDirection: dir.row }]}
                      >
                        <Ionicons name="help-circle" size={15} color={Palette.neonViolet} />
                        <Text style={styles.quizBtnTxt}>
                          {t("syllabus.action.quiz")}
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => startMindmap(i)}
                      disabled={mmLoading}
                      style={[styles.quizBtn, styles.mmBtn, { flexDirection: dir.row }]}
                    >
                      {mmLoading && mmUnit === i ? (
                        <ActivityIndicator size="small" color="#a3e635" />
                      ) : (
                        <Ionicons name="git-network" size={15} color="#a3e635" />
                      )}
                      <Text style={[styles.quizBtnTxt, { color: "#bef264" }]}>
                        {mmLoading && mmUnit === i ? t("syllabus.action.drawing") : t("syllabus.action.mindmap")}
                      </Text>
                    </Pressable>
                  </GlassCard>
                </Pressable>
              );
            })}

            {/* نصائح */}
            {!!syl.tips?.length && (
              <GlassCard contentStyle={styles.tipsCard} glow={Palette.neonCyan}>
                <Text style={[styles.tipsTitle, { textAlign: dir.textAlign }]}>{t("syllabus.tipsTitle")}</Text>
                {syl.tips.map((tip, i) => (
                  <View key={i} style={[styles.topicRow, { flexDirection: dir.row }]}>
                    <Text style={styles.topicDot}>•</Text>
                    <Text style={[styles.topicTxt, { textAlign: dir.textAlign }]}>{tip}</Text>
                  </View>
                ))}
              </GlassCard>
            )}

            {/* دور مستقل عن طابعة الهيدر: إعادة توليد المنهج كاملًا من الكتاب
                (يعيد بناء الوحدات بالفهرس الكامل بدل النسخة القديمة المختصرة). */}
            <GradientButton
              title={t("syllabus.regenerate")}
              icon="refresh"
              variant="ghost"
              onPress={onGenerate}
              loading={busy}
              style={{ marginTop: Spacing.md }}
            />
            <View style={{ height: 24 }} />
          </ScrollView>
        )}

        {/* مودال الخريطة الذهنية */}
        <Modal
          visible={mmUnit !== null && !!mm}
          transparent
          animationType="slide"
          onRequestClose={() => setMmUnit(null)}
        >
          <View style={styles.quizMask}>
            <View style={styles.quizSheet}>
              <View style={[styles.quizHeader, { flexDirection: dir.row }]}>
                <Text style={styles.quizHeaderTxt}>🗺️ {t("syllabus.mindmap.title")}</Text>
                <View style={{ flexDirection: dir.row, alignItems: "center", gap: 14 }}>
                  <Pressable onPress={printMindmap} hitSlop={8}>
                    <Ionicons name="print-outline" size={21} color={Palette.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => setMmUnit(null)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={Palette.textMuted} />
                  </Pressable>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                {/* خريطة شعاعية (توني بوزان) — عرض ثابت داخل حاوية عادية.
                    أزلنا التكبير المتداخل (ScrollView داخل ScrollView) لأنه كان
                    يُوقف الإيماءات ويجمّد الصفحة؛ التفاصيل الكاملة في القائمة بالأسفل. */}
                {mm ? (
                  <View style={[styles.mmCanvasWrap, styles.mmCanvas]}>
                    <BuzanMindMap map={mm} size={320} />
                  </View>
                ) : null}
                <Text style={styles.mmHint}>{t("syllabus.mindmap.hintList")}</Text>

                {/* العقدة المركزية (قائمة) */}
                <View style={styles.mmCenter}>
                  <Text style={styles.mmCenterTxt}>{mm?.center}</Text>
                </View>
                <View style={styles.mmStem} />

                {/* الفروع */}
                {mm?.branches.map((b, bi) => {
                  const c = MM_COLORS[bi % MM_COLORS.length];
                  return (
                    <View key={bi} style={[styles.mmBranch2, { borderColor: c + "66" }]}>
                      <View style={[styles.mmBranchHead, { backgroundColor: c + "22", flexDirection: dir.row }]}>
                        <View style={[styles.mmDot, { backgroundColor: c }]} />
                        <Text style={[styles.mmBranchLabel, { color: c, textAlign: dir.textAlign }]}>{b.label}</Text>
                      </View>
                      {b.points.map((p, pi) => (
                        <View key={pi} style={[styles.mmPointRow, { flexDirection: dir.row }]}>
                          <Text style={[styles.mmPointDash, { color: c }]}>—</Text>
                          <Text style={[styles.mmPointTxt, { textAlign: dir.textAlign }]}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { flex: 1, textAlign: "center", color: Palette.text, fontSize: 18, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.xl, gap: 8 },
  emptyTitle: { color: Palette.text, fontSize: 19, fontWeight: "900", textAlign: "center", marginTop: 10 },
  emptySub: { color: Palette.textMuted, fontSize: 14, lineHeight: 24, textAlign: "center" },
  readNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    marginTop: 12,
    marginBottom: 6,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1.5,
    borderColor: Palette.neonCyan + "88",
  },
  readNowTxt: { color: Palette.text, fontSize: 16, fontWeight: "900" },
  err: { color: Palette.warn, fontSize: 13, textAlign: "center", marginTop: 8, fontWeight: "700" },

  genWrap: { alignSelf: "stretch", marginTop: Spacing.lg, gap: 8 },
  genHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  genMsg: { color: Palette.text, fontSize: 14, fontWeight: "800" },
  genPct: { color: Palette.neonViolet, fontSize: 15, fontWeight: "900" },
  genTrack: { height: 10, borderRadius: 5, backgroundColor: Palette.surface, overflow: "hidden" },
  genFill: { height: "100%", borderRadius: 5, backgroundColor: Palette.neonViolet },
  genHint: { color: Palette.textDim, fontSize: 12, textAlign: "center", lineHeight: 19, marginTop: 4 },

  scroll: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, gap: 12 },
  progCard: { padding: Spacing.lg },
  bookTitle: { color: Palette.text, fontSize: 17, fontWeight: "900", textAlign: "center", lineHeight: 28 },
  progRow: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "center", gap: 10, marginTop: 12 },
  progPct: { color: Palette.neonCyan, fontSize: 28, fontWeight: "900" },
  progLabel: { color: Palette.textMuted, fontSize: 13, fontWeight: "700" },
  progTrack: { height: 10, borderRadius: 5, backgroundColor: Palette.surface, marginTop: 10, overflow: "hidden" },
  progFill: { height: "100%", borderRadius: 5, backgroundColor: Palette.neonCyan },

  unitWrap: {},
  unitCard: { padding: Spacing.md },
  unitHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Palette.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: Palette.neonCyan, borderColor: Palette.neonCyan },
  unitTitle: { flex: 1, color: Palette.text, fontSize: 16, fontWeight: "800", lineHeight: 26 },
  unitTitleDone: { color: Palette.textDim, textDecorationLine: "line-through" },
  schedRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingStart: 36,
  },
  schedTxt: { color: Palette.neonCyan, fontSize: 12.5, fontWeight: "800" },
  noPlanHint: {
    color: Palette.textDim,
    fontSize: 12.5,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  topicRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 6, marginTop: 6, paddingStart: 36 },
  topicDot: { color: Palette.neonViolet, fontSize: 15, lineHeight: 22 },
  topicTxt: { flex: 1, color: Palette.textMuted, fontSize: 14, lineHeight: 22 },
  outcome: { color: Palette.success ?? Palette.neonCyan, fontSize: 13, fontWeight: "700", marginTop: 8, paddingStart: 36, lineHeight: 21 },

  tipsCard: { padding: Spacing.md },
  tipsTitle: { color: Palette.text, fontSize: 16, fontWeight: "900", marginBottom: 4 },

  quizBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(124,92,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.4)",
  },
  quizBtnTxt: { color: "#cdbdff", fontSize: 13, fontWeight: "800" },
  unitActions: { flexDirection: "row-reverse", gap: 8, marginTop: 12 },
  sumBtn: {
    marginTop: 0,
    backgroundColor: "rgba(34,211,238,0.12)",
    borderColor: "rgba(34,211,238,0.4)",
  },
  sumPlay: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: Radius.lg,
    backgroundColor: Palette.neonCyan,
    marginBottom: Spacing.md,
  },
  sumPlayTxt: { color: "#0b1220", fontSize: 15, fontWeight: "900" },
  sumText: { color: Palette.textMuted, fontSize: 15, lineHeight: 28, textAlign: "right" },
  mmBtn: { marginTop: 8, backgroundColor: "rgba(163,230,53,0.10)", borderColor: "rgba(163,230,53,0.4)" },
  mmCanvasWrap: {
    backgroundColor: "#0b1220",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    maxHeight: 340,
  },
  mmCanvas: { alignItems: "center", justifyContent: "center", padding: 8 },
  mmHint: { color: Palette.textDim, fontSize: 11.5, textAlign: "center", marginTop: 8, marginBottom: 12 },
  mmCenter: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: Radius.lg,
    backgroundColor: Palette.neonViolet,
    maxWidth: "90%",
  },
  mmCenterTxt: { color: "#fff", fontSize: 16, fontWeight: "900", textAlign: "center" },
  mmStem: { alignSelf: "center", width: 2, height: 18, backgroundColor: Palette.glassBorder },
  mmBranch2: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    marginBottom: 10,
    overflow: "hidden",
  },
  mmBranchHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14 },
  mmDot: { width: 10, height: 10, borderRadius: 5 },
  mmBranchLabel: { flex: 1, fontSize: 15, fontWeight: "900", textAlign: "right" },
  mmPointRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, paddingHorizontal: 16, paddingVertical: 5 },
  mmPointDash: { fontSize: 14, fontWeight: "900", lineHeight: 22 },
  mmPointTxt: { flex: 1, color: Palette.textMuted, fontSize: 14, lineHeight: 22, textAlign: "right" },

  quizMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  quizSheet: {
    backgroundColor: Palette.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    padding: Spacing.lg,
    maxHeight: "82%",
  },
  quizHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  quizHeaderTxt: { color: Palette.text, fontSize: 15, fontWeight: "900" },
  quizQ: { color: Palette.text, fontSize: 18, fontWeight: "900", textAlign: "right", lineHeight: 30, marginBottom: Spacing.md },
  quizOpt: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    marginBottom: 10,
  },
  quizOptCorrect: { backgroundColor: "rgba(46,204,113,0.18)", borderColor: Palette.success },
  quizOptWrong: { backgroundColor: "rgba(231,76,60,0.16)", borderColor: Palette.danger },
  quizOptTxt: { flex: 1, color: Palette.text, fontSize: 15, fontWeight: "700", textAlign: "right" },
  quizResult: { alignItems: "center", paddingVertical: Spacing.lg, gap: 10 },
  quizScoreBig: { color: Palette.neonCyan, fontSize: 44, fontWeight: "900" },
  quizResultMsg: { color: Palette.textMuted, fontSize: 15, fontWeight: "700", textAlign: "center" },
  levelPill: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1.5 },
  levelPillTxt: { fontSize: 15, fontWeight: "900" },
  diffRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  diffBadge: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1.5 },
  diffBadgeTxt: { fontSize: 13, fontWeight: "900" },
  dotsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  qDot: { width: 8, height: 8, borderRadius: 4 },
});
