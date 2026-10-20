// app/syllabus/[id].tsx
// المنهج الدراسي (Syllabus) لكتاب: وحدات بعناوين ومواضيع ومخرجات،
// تشيك ليست لمتابعة التقدّم، ونسبة إنجاز، وطباعة/مشاركة المنهج.
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuzanMindMap, MM_COLORS, mindmapPrintHtml } from "../../components/brand/mindmap";
import { getUnitContent, setUnitContent } from "../../lib/unitContent";
import { stopSpeaking } from "../../lib/voice";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { removeUnitContentWhere } from "../../lib/unitContent";
import { PressableScale } from "../../components/brand/motion";
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
  const { pal } = useScene();
  // ألوان الحالة بدرجات تُقرأ على المشهد الفاتح والداكن (كما في صفحة الكتاب)
  const tone = pal.dark ? { good: "#7BD8A4", bad: "#FF8A96" } : { good: "#2F7D4A", bad: "#B83A48" };
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
  const [mmFull, setMmFull] = useState(false);
  const [mmW, setMmW] = useState(0);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const mmTheme = { dark: !!pal.dark, bg: pal.card, ink: pal.ink, dim: pal.dim };

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

  // إعادة إنشاء المنهج (بتأكيد: تُحسب طلبًا) — من الفهرس الدقيق
  function confirmRegenerate() {
    Alert.alert(t("syllabus.regenTitle"), t("syllabus.regenBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("syllabus.regenerate"), onPress: () => void onGenerate() },
    ]);
  }

  async function onGenerate() {
    setErr("");
    setBusy(true);
    try {
      const before = (syl?.units ?? []).map((u) => u.title).join("|");
      const data = await generateSyllabus(pdfPath);
      // تغيّرت الوحدات → محتوى الوحدات القديم (ملخصات، اختبارات، خرائط، فيديو) لم يعد يطابقها فيُحذف
      if (before && before !== data.units.map((u) => u.title).join("|")) {
        const unitOnly = (u: number) => u < 1_000_000;
        for (const k of ["quiz", "mindmap", "glossary", "summary"] as const) await removeUnitContentWhere(pdfPath, k, () => true).catch(() => {});
        await removeUnitContentWhere(pdfPath, "studysummary", unitOnly).catch(() => {});
        // أجزاء ملخص الوحدة: 2e12 + الوحدة×1e4 + …  (النطاقات بأرقام أكبر بكثير فلا تُمس)
        await removeUnitContentWhere(pdfPath, "studysummarypart", (u: number) => u >= 2e12 && u < 2e12 + 1_000_000 * 1e4).catch(() => {});
        await removeUnitContentWhere(pdfPath, "video", (u: number) => u >= 2e12 && u < 2e12 + 1_000_000).catch(() => {});
        await removeUnitContentWhere(pdfPath, "videopart", (u: number) => u >= 2e12 * 1e4 && u < (2e12 + 1_000_000) * 1e4).catch(() => {});
      }
      setSyl(data);
      setDone(new Array(data.units.length).fill(false));
      await loadSchedule(data.units.length);
    } catch (e: any) {
      // رسالة الخطأ الخام (مثل USER_QUOTA) لا تُعرض للمستخدم
      setErr(e?.message === "USER_QUOTA" ? t("pay.reason.ai") : t("syllabus.err.generate"));
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
          ${sched[i] ? `<p class="when">${esc(t("syllabus.studyOn"))}: ${esc(fmtRange(sched[i]))}</p>` : ""}
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
      await Print.printAsync({ html });
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
            {syl ? (
              <PressableScale onPress={busy ? undefined : confirmRegenerate}>
                <SceneIconButton>
                  {busy ? <ActivityIndicator color={pal.ink} /> : <Ionicons name="refresh" size={20} color={pal.ink} accessibilityLabel={t("syllabus.regenerate")} />}
                </SceneIconButton>
              </PressableScale>
            ) : null}
            {printBtn}
          </View>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={pal.accent} />
        </View>
      ) : !syl ? (
        <View style={styles.center}>
          <Ionicons name="sparkles" size={40} color={pal.accent} />
          <Text style={[styles.emptyTitle, { color: pal.ink }]}>{t("syllabus.empty.title")}</Text>
          <Text style={[styles.emptySub, { color: pal.dim }]}>
            {t("syllabus.empty.sub")}
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
          <Pressable
            onPress={startReading}
            style={[styles.readNowBtn, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.accent }]}
          >
            <Ionicons name="book" size={18} color={pal.accent} />
            <Text style={[styles.readNowTxt, { color: pal.ink }]}>{t("syllabus.readNowFull")}</Text>
          </Pressable>
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
            {sched.length === 0 && (
              <Text style={[styles.noPlanHint, { marginTop: 12, color: pal.dim }]}>
                {t("syllabus.noPlanHint")}
              </Text>
            )}
          </SceneCard>

          {/* زر الدخول للقراءة — بارز فوق الوحدات */}
          <Pressable
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
            onPress={() => router.push({ pathname: "/study-file", params: { pdf_path: pdfPath, book_title: bookTitle } })}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: pal.soft, borderWidth: 1, borderColor: pal.cardBorder, flexDirection: dir.row, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Ionicons name="documents-outline" size={18} color={pal.accent} />
            <Text style={[styles.ctaTxt, { color: pal.ink }]}>{t("studyFile.open")}</Text>
          </Pressable>

          {/* الوحدات (تشيك ليست) */}
          {syl.units.map((u, i) => {
            const isDone = done[i];
            return (
              <Pressable key={i} onPress={() => toggle(i)} style={styles.unitWrap}>
                <SceneCard style={[styles.unitCard, isDone && { borderColor: pal.accent }]}>
                  <View style={[styles.unitHead, { flexDirection: dir.row }]}>
                    <View
                      style={[
                        styles.check,
                        { borderColor: pal.track },
                        isDone && { backgroundColor: pal.accent, borderColor: pal.accent },
                      ]}
                    >
                      {isDone && <Ionicons name="checkmark" size={16} color={pal.onAccent} />}
                    </View>
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
                  {sched[i] && (
                    <View style={[styles.schedRow, { flexDirection: dir.row }]}>
                      <Ionicons name="calendar-outline" size={13} color={pal.accent} />
                      <Text style={[styles.schedTxt, { color: pal.accent }]}>
                        {t("syllabus.studyOn")}: {fmtRange(sched[i])}{"  ·  "}
                        {sched[i].dayTo !== sched[i].dayFrom
                          ? t("syllabus.dayRange", { from: sched[i].dayFrom, to: sched[i].dayTo })
                          : t("syllabus.day", { day: sched[i].dayFrom })}
                      </Text>
                    </View>
                  )}
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

                  {/* أدوات الوحدة: شبكة ٢×٢ متوازنة (النص والأيقونة في منتصف كل إطار، سطر واحد) */}
                  {(() => {
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
          <Pressable
            onPress={busy ? undefined : confirmRegenerate}
            style={({ pressed }) => [
              styles.ghostBtn,
              {
                flexDirection: dir.row,
                backgroundColor: pal.card,
                borderColor: pal.cardBorder,
                marginTop: Spacing.md,
                opacity: busy ? 0.5 : pressed ? 0.9 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={pal.ink} />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color={pal.ink} />
                <Text style={[styles.ctaTxt, { color: pal.ink }]}>{t("syllabus.regenerate")}</Text>
              </>
            )}
          </Pressable>
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
