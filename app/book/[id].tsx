// app/book/[id].tsx
// صفحة الكتاب (تصميم 2.0): كل ما يخصّ الكتاب في مكان واحد — متابعة الاستماع،
// وحدات المنهج (ملخص صوتي + اختبار لكل وحدة)، وكل الأدوات. المكتبة تفتح هذه الصفحة
// بدل القارئ مباشرة، فلا حاجة للتنقّل بين تبويبات متفرّقة لإيجاد أداة.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BookCover, coverColors } from "../../components/brand/book-cover";
import { ExamDateSheet } from "../../components/brand/exam-date-sheet";
import { GlassCard } from "../../components/brand/glass-card";
import { PressableScale } from "../../components/brand/motion";
import { NowPlayingDock } from "../../components/brand/now-playing-dock";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import { getCards } from "../../lib/flashcards";
import { useDir, useI18n } from "../../lib/i18n";
import { getLastPage } from "../../lib/readerPrefs";
import { getBookReadiness, setExamDate, type BookReadiness } from "../../lib/readiness";
import { getCachedUnitRanges, getUnitRanges, type UnitRange } from "../../lib/glossary";
import { supabase } from "../../lib/supabase";
import { getSyllabus, type Syllabus } from "../../lib/syllabus";

type Book = { id: string; title: string; pdf_path: string; page_count: number | null };
type Tab = "units" | "tools";

export default function BookHubScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bookId = typeof id === "string" ? id : "";

  const [book, setBook] = useState<Book | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [syl, setSyl] = useState<{ data: Syllabus; done: boolean[] } | null>(null);
  const [cards, setCards] = useState(0);
  const [tab, setTab] = useState<Tab>("units");
  const [ready, setReady] = useState<BookReadiness | null>(null);
  const [examOpen, setExamOpen] = useState(false);
  const [ranges, setRanges] = useState<UnitRange[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      (async () => {
        try {
          const uid = await getUserId();
          const { data, error } = await supabase
            .from("books")
            .select("id,title,pdf_path,page_count")
            .eq("id", bookId)
            .eq("user_id", uid)
            .maybeSingle();
          if (!on) return;
          if (error || !data) return setFailed(true);
          setBook(data as Book);
          const [p, s, all, r] = await Promise.all([
            getLastPage(bookId),
            getSyllabus(data.pdf_path).catch(() => null),
            getCards().catch(() => []),
            getBookReadiness(data.pdf_path),
          ]);
          if (!on) return;
          setPage(p);
          setReady(r);
          // صفحات كل وحدة: فوريًا من آخر حساب، وإن لم يوجد نحسبها بالخلفية
          const titles = s?.data.units.map((u) => u.title) ?? [];
          if (titles.length) {
            const cached = await getCachedUnitRanges(data.pdf_path);
            if (on && cached?.length === titles.length) setRanges(cached);
            else
              getUnitRanges(data.pdf_path, titles, Number(data.page_count) || 0)
                .then((rr) => on && setRanges(rr))
                .catch(() => {});
          }
          setSyl(s);
          setCards(all.filter((c) => c.bookId === bookId && !c.archived).length);
        } catch {
          if (on) setFailed(true);
        }
      })();
      return () => {
        on = false;
      };
    }, [bookId])
  );

  if (failed) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { gap: 16 }]}>
        <Text style={styles.dim}>{t("book.notFound")}</Text>
        <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.ghost}>
          <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Palette.text} accessibilityLabel={t("common.back")} />
        </PressableScale>
      </SafeAreaView>
    );
  }
  if (!book) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={Palette.neonViolet} />
      </SafeAreaView>
    );
  }

  const pages = Number(book.page_count) || 0;
  const pct = pages > 0 ? Math.min(100, Math.round((page / pages) * 100)) : 0;
  const started = page > 1;
  const units = syl?.data.units ?? [];
  const [c1] = coverColors(book.title);

  const openReader = () =>
    router.push({ pathname: "/reader/[id]", params: { id: book.id, title: book.title, pdf_path: book.pdf_path } });
  const openSyllabus = () =>
    router.push({ pathname: "/syllabus/[id]", params: { id: book.id, title: book.title, pdf_path: book.pdf_path } });
  const unitParams = (i: number, title: string) => ({ pdf_path: book.pdf_path, unit: String(i), title, book_title: book.title });
  const openGlossary = (i: number) =>
    router.push({
      pathname: "/glossary",
      params: { pdf_path: book.pdf_path, book_id: book.id, book_title: book.title, unit: String(i), page_count: String(pages) },
    });

  const tools: { key: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap; color: string; badge?: string; go: () => void }[] = [
    { key: "read", labelKey: "book.tool.read", icon: "headset", color: Palette.neonCyan, go: openReader },
    { key: "ask", labelKey: "book.tool.ask", icon: "chatbubble-ellipses", color: Palette.primary, go: () => router.push({ pathname: "/ask/[id]", params: { id: book.id } }) },
    { key: "syllabus", labelKey: "book.tool.syllabus", icon: "list", color: Palette.neonViolet, go: openSyllabus },
    { key: "glossary", labelKey: "book.tool.glossary", icon: "book", color: "#6CF3C5", go: () => (units.length ? openGlossary(0) : openSyllabus()) },
    { key: "mindmap", labelKey: "book.tool.mindmap", icon: "git-network", color: Palette.success, go: openSyllabus },
    { key: "cards", labelKey: "book.tool.cards", icon: "albums", color: Palette.neonPink, badge: cards ? String(cards) : undefined, go: () => router.push("/flashcards") },
    { key: "translate", labelKey: "book.tool.translate", icon: "language", color: Palette.warn, go: openReader },
    { key: "slides", labelKey: "book.tool.slides", icon: "easel", color: Palette.neonBlue, go: openReader },
    { key: "focus", labelKey: "book.tool.focus", icon: "timer", color: Palette.success, go: () => router.push("/pomodoro") },
  ];

  return (
    <View style={styles.safe}>
      {/* رأس ملوّن بلون غلاف الكتاب */}
      <LinearGradient colors={[c1 + "88", c1 + "22", Palette.bg]} style={styles.headerGlow} />
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.topBar, { flexDirection: dir.row }]}>
            <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.ghost}>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Palette.text} />
            </PressableScale>
          </View>

          <View style={[styles.hero, { flexDirection: dir.row }]}>
            <BookCover title={book.title} width={96} height={132} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[styles.title, { textAlign: dir.textAlign }]} numberOfLines={3}>
                {book.title}
              </Text>
              <Text style={[styles.meta, { textAlign: dir.textAlign }]}>
                {units.length
                  ? t("book.metaUnits", { pages: pages || "—", units: units.length })
                  : t("book.meta", { pages: pages || "—" })}
              </Text>
              <View style={[styles.chips, { flexDirection: dir.row }]}>
                {pages > 0 && (
                  <View style={styles.chip}>
                    <Text style={styles.chipTxt}>{t("book.progress", { pct })}</Text>
                  </View>
                )}
                {ready && (ready.unitCount > 0 || ready.answered > 0) && (
                  <View style={styles.chip}>
                    <Text style={styles.chipTxt}>{t("book.ready", { n: ready.score })}</Text>
                  </View>
                )}
                <PressableScale onPress={() => setExamOpen(true)} style={[styles.chip, styles.chipExam]}>
                  <Text style={[styles.chipTxt, { color: "#FFB38A" }]}>
                    {ready?.daysLeft == null
                      ? t("book.examSet")
                      : ready.daysLeft > 0
                        ? t("book.examIn", { n: ready.daysLeft })
                        : ready.daysLeft === 0
                          ? t("book.examToday")
                          : t("book.examPast")}
                  </Text>
                </PressableScale>
              </View>
            </View>
          </View>

          <PressableScale onPress={openReader} style={styles.cta}>
            <Ionicons name="play" size={18} color={Palette.bg} />
            <Text style={styles.ctaTxt}>{started ? t("book.continue", { page }) : t("book.start")}</Text>
          </PressableScale>

          {/* تبويبات الصفحة */}
          <View style={[styles.seg, { flexDirection: dir.row }]}>
            {(["units", "tools"] as Tab[]).map((k) => (
              <PressableScale key={k} onPress={() => setTab(k)} style={[styles.segItem, tab === k && styles.segOn]}>
                <Text style={[styles.segTxt, tab === k && styles.segTxtOn]}>{t(`book.tab.${k}`)}</Text>
              </PressableScale>
            ))}
          </View>

          {tab === "units" && !!ready?.dueMistakes && (
            <PressableScale
              onPress={() => router.push({ pathname: "/unit-quiz", params: { pdf_path: book.pdf_path, mode: "mistakes", book_title: book.title } })}
              style={[styles.mistakes, { flexDirection: dir.row }]}
            >
              <Ionicons name="refresh-circle" size={22} color="#FFB38A" />
              <Text style={[styles.mistakesTxt, { textAlign: dir.textAlign }]}>{t("book.mistakes", { n: ready.dueMistakes })}</Text>
              <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={Palette.textDim} />
            </PressableScale>
          )}

          {tab === "units" &&
            (units.length ? (
              <GlassCard>
                {units.map((u, i) => {
                  const done = !!syl?.done[i];
                  const acc = ready?.accuracy[i] ?? null;
                  const accColor = acc === null ? Palette.textDim : acc >= 0.75 ? "#6CF3C5" : acc >= 0.5 ? "#FFB38A" : "#FF6B81";
                  const weak = ready?.weakUnit === i && !ready.weakUntested;
                  return (
                    <View
                      key={i}
                      style={[styles.unit, { flexDirection: dir.row }, i > 0 && styles.divider, weak && styles.unitWeak]}
                    >
                      <View style={[styles.unitNum, done && styles.unitNumDone]}>
                        {done ? (
                          <Ionicons name="checkmark" size={15} color={Palette.success} />
                        ) : (
                          <Text style={styles.unitNumTxt}>{i + 1}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.unitTitle, { textAlign: dir.textAlign }, done && { color: Palette.textDim }]} numberOfLines={2}>
                          {u.title}
                        </Text>
                        {ranges?.[i] && (
                          <Text style={[styles.unitRange, { textAlign: dir.textAlign }]}>
                            {t("glossary.pages", { from: ranges[i].from, to: ranges[i].to })}
                            {ranges[i].found ? "" : " " + t("glossary.approx")}
                          </Text>
                        )}
                        {acc !== null && (
                          <View style={[styles.accRow, { flexDirection: dir.row }]}>
                            <View style={styles.accTrack}>
                              <View
                                style={[
                                  styles.accFill,
                                  { width: `${Math.max(4, Math.round(acc * 100))}%`, backgroundColor: accColor },
                                  dir.isRTL ? { alignSelf: "flex-end" } : null,
                                ]}
                              />
                            </View>
                            <Text style={[styles.accTxt, { color: accColor }]}>{t("book.unit.accuracy", { n: Math.round(acc * 100) })}</Text>
                          </View>
                        )}
                      </View>
                      <PressableScale onPress={() => openGlossary(i)} style={styles.mini}>
                        <Ionicons name="book" size={16} color="#6CF3C5" accessibilityLabel={t("book.unit.glossary")} />
                      </PressableScale>
                      <PressableScale
                        onPress={() => router.push({ pathname: "/unit-summary", params: unitParams(i, u.title) })}
                        style={styles.mini}
                      >
                        <Ionicons name="headset" size={17} color={Palette.neonCyan} accessibilityLabel={t("book.unit.summary")} />
                      </PressableScale>
                      <PressableScale
                        onPress={() => router.push({ pathname: "/unit-quiz", params: unitParams(i, u.title) })}
                        style={styles.mini}
                      >
                        <Ionicons name="checkbox" size={17} color={Palette.warn} accessibilityLabel={t("book.unit.quiz")} />
                      </PressableScale>
                    </View>
                  );
                })}
              </GlassCard>
            ) : (
              <GlassCard contentStyle={{ padding: Spacing.lg, gap: 12 }}>
                <Text style={[styles.dim, { textAlign: dir.textAlign, lineHeight: 22 }]}>{t("book.units.empty")}</Text>
                <PressableScale onPress={openSyllabus}>
                  <LinearGradient colors={Gradients.neonBlue} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.create}>
                    <Ionicons name="sparkles" size={16} color="#fff" />
                    <Text style={styles.createTxt}>{t("book.units.create")}</Text>
                  </LinearGradient>
                </PressableScale>
              </GlassCard>
            ))}

          {tab === "tools" && (
            <View style={[styles.grid, { flexDirection: dir.row }]}>
              {tools.map((tl) => (
                <PressableScale key={tl.key} onPress={tl.go} style={styles.toolWrap}>
                  <GlassCard contentStyle={styles.tool}>
                    <View style={[styles.toolIcon, { backgroundColor: tl.color + "22" }]}>
                      <Ionicons name={tl.icon} size={19} color={tl.color} />
                    </View>
                    <Text style={styles.toolTxt} numberOfLines={2}>
                      {t(tl.labelKey)}
                      {tl.badge ? ` · ${tl.badge}` : ""}
                    </Text>
                  </GlassCard>
                </PressableScale>
              ))}
            </View>
          )}
        </ScrollView>
        <ExamDateSheet
          visible={examOpen}
          value={ready?.examISO ?? null}
          onClose={() => setExamOpen(false)}
          onSave={async (iso) => {
            setExamOpen(false);
            await setExamDate(book.id, iso);
            setReady(await getBookReadiness(book.pdf_path));
          }}
        />
        {/* الشريط العائم يرافق المستخدم هنا أيضًا */}
        <View style={styles.dockWrap}>
          <NowPlayingDock />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Palette.bg },
  center: { alignItems: "center", justifyContent: "center" },
  dim: { color: Palette.textDim, fontSize: 14 },
  headerGlow: { position: "absolute", top: 0, left: 0, right: 0, height: 340 },
  scroll: { padding: Spacing.lg, paddingBottom: 110, gap: 14 },
  dockWrap: { position: "absolute", left: 12, right: 12, bottom: 18 },
  topBar: { justifyContent: "flex-start" },
  ghost: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "flex-end", gap: 16, marginTop: 4 },
  title: { color: Palette.text, fontSize: 22, fontWeight: "800", lineHeight: 30 },
  meta: { color: Palette.textMuted, fontSize: 13 },
  chips: { flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, backgroundColor: "rgba(255,255,255,0.12)" },
  chipExam: { backgroundColor: "rgba(255,179,138,0.16)" },
  mistakes: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,179,138,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,179,138,0.30)",
  },
  mistakesTxt: { flex: 1, color: Palette.text, fontSize: 14.5, fontWeight: "700" },
  unitWeak: { backgroundColor: "rgba(255,179,138,0.06)" },
  accRow: { alignItems: "center", gap: 8, marginTop: 6 },
  unitRange: { color: Palette.textDim, fontSize: 11.5, marginTop: 3 },
  accTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  accFill: { height: 4, borderRadius: 2 },
  accTxt: { fontSize: 11.5, fontWeight: "700" },
  chipTxt: { color: Palette.text, fontSize: 11.5, fontWeight: "700" },
  cta: {
    height: 54,
    borderRadius: 18,
    backgroundColor: Palette.text,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaTxt: { color: Palette.bg, fontSize: 15.5, fontWeight: "800" },
  seg: { padding: 4, borderRadius: 16, backgroundColor: "#10121B", gap: 4 },
  segItem: { flex: 1, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: "#262A3D" },
  segTxt: { color: Palette.textDim, fontSize: 14, fontWeight: "600" },
  segTxtOn: { color: Palette.text },
  unit: { alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.glassBorder },
  unitNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  unitNumDone: { borderColor: Palette.success, backgroundColor: Palette.successSoft },
  unitNumTxt: { color: Palette.textMuted, fontSize: 12, fontWeight: "700" },
  unitTitle: { color: Palette.text, fontSize: 14.5, fontWeight: "600", lineHeight: 21 },
  mini: { width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  create: { height: 46, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  createTxt: { color: "#fff", fontWeight: "800", fontSize: 14.5 },
  grid: { flexWrap: "wrap", gap: 8 },
  toolWrap: { width: "31.8%" },
  tool: { padding: 12, gap: 10, minHeight: 96 },
  toolIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  toolTxt: { color: Palette.text, fontSize: 12.5, fontWeight: "600" },
});
