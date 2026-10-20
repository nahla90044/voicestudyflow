// app/book/[id].tsx
// صفحة الكتاب (تصميم 2.0): كل ما يخصّ الكتاب في مكان واحد — متابعة الاستماع،
// وحدات المنهج (ملخص صوتي + اختبار لكل وحدة)، وكل الأدوات. المكتبة تفتح هذه الصفحة
// بدل القارئ مباشرة، فلا حاجة للتنقّل بين تبويبات متفرّقة لإيجاد أداة.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { listSaves, type StudySave } from "../../lib/studySaves";
import { loadNotes } from "../../lib/notes";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { BookCover } from "../../components/brand/book-cover";
import { ExamDateSheet } from "../../components/brand/exam-date-sheet";
import { CoachHelpButton, useCoachTour } from "../../components/brand/coach-mark";
import { PressableScale } from "../../components/brand/motion";
import { NowPlayingDock } from "../../components/brand/now-playing-dock";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { BookAudioCard } from "../../components/brand/book-audio-card";
import { Radius, Spacing } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import { getCards } from "../../lib/flashcards";
import { useDir, useI18n } from "../../lib/i18n";
import { getLastPage } from "../../lib/readerPrefs";
import { useScene } from "../../lib/scene";
import { getBookReadiness, setExamDate, type BookReadiness } from "../../lib/readiness";
import { getCachedUnitRanges, getUnitRanges, type UnitRange } from "../../lib/glossary";
import { supabase } from "../../lib/supabase";
import { getSyllabus, type Syllabus } from "../../lib/syllabus";

type Book = { id: string; title: string; pdf_path: string; page_count: number | null };
type Tab = "units" | "tools" | "saves";

export default function BookHubScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  // ألوان الحالة (ممتاز/متوسط/ضعيف) بدرجات تُقرأ على المشهد الفاتح والداكن
  const tone = pal.dark
    ? { good: "#7BD8A4", mid: "#F2B36B", bad: "#FF8A96" }
    : { good: "#2F7D4A", mid: "#B86B12", bad: "#B83A48" };
  const { id } = useLocalSearchParams<{ id?: string }>();
  const coach = useCoachTour("book_v1", [
    { id: "cta", title: t("coach.book.cta.title"), body: t("coach.book.cta.body"), shape: "rect" },
    { id: "seg", title: t("coach.book.seg.title"), body: t("coach.book.seg.body"), shape: "rect" },
    { id: "unit", title: t("coach.book.unit.title"), body: t("coach.book.unit.body"), shape: "rect",
      rows: [
        { icon: "book", text: t("coach.book.unit.glossary") },
        { icon: "headset", text: t("coach.book.unit.summary") },
        { icon: "checkbox", text: t("coach.book.unit.quiz") },
      ] },
    { id: "create", title: t("coach.book.create.title"), body: t("coach.book.create.body"), shape: "rect" },
  ], { delay: 1500 });
  const bookId = typeof id === "string" ? id : "";

  const [book, setBook] = useState<Book | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [syl, setSyl] = useState<{ data: Syllabus; done: boolean[] } | null>(null);
  const [cards, setCards] = useState(0);
  const [tab, setTab] = useState<Tab>("units");
  // «المحفوظات»: العروض وإجابات المساعد المحفوظة من القارئ لهذا الكتاب
  const [saves, setSaves] = useState<StudySave[] | null>(null);
  const loadSaves = useCallback(() => {
    if (!bookId) return;
    listSaves(bookId).then(setSaves).catch(() => setSaves([]));
    loadNotes(bookId)
      .then((ps) => setNoteCount(ps.filter((p) => p.text.trim() || p.strokes.length).length))
      .catch(() => setNoteCount(0));
  }, [bookId]);
  useFocusEffect(
    useCallback(() => {
      if (tab === "saves") loadSaves();
    }, [tab, loadSaves])
  );
  const [ready, setReady] = useState<BookReadiness | null>(null);
  const [noteCount, setNoteCount] = useState(0); // صفحات الملاحظات المكتوبة لهذا الكتاب
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

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const backBtn = (
    <PressableScale onPress={goBack}>
      <SceneIconButton>
        <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} accessibilityLabel={t("common.back")} />
      </SceneIconButton>
    </PressableScale>
  );

  if (failed) {
    return (
      <SceneScreen>
        <SceneBanner title="" height={110} left={backBtn} />
        <View style={[styles.center, { gap: 16 }]}>
          <Text style={[styles.dim, { color: pal.dim }]}>{t("book.notFound")}</Text>
        </View>
      </SceneScreen>
    );
  }
  if (!book) {
    return (
      <SceneScreen style={styles.center}>
        <ActivityIndicator color={pal.accent} />
      </SceneScreen>
    );
  }

  const pages = Number(book.page_count) || 0;
  // الصفحة الأولى = لم تبدأ القراءة بعد (كان كتاب من صفحتين جديد يظهر «50٪ مقروء»)
  const pct = pages > 0 && page > 1 ? Math.min(100, Math.round((page / pages) * 100)) : 0;
  const started = page > 1;
  const units = syl?.data.units ?? [];

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

  const tools: { key: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap; badge?: string; go: () => void }[] = [
    { key: "read", labelKey: "book.tool.read", icon: "headset", go: openReader },
    { key: "ask", labelKey: "book.tool.ask", icon: "chatbubble-ellipses", go: () => router.push({ pathname: "/ask/[id]", params: { id: book.id } }) },
    { key: "syllabus", labelKey: "book.tool.syllabus", icon: "list", go: openSyllabus },
    { key: "glossary", labelKey: "book.tool.glossary", icon: "book", go: () => (units.length ? openGlossary(0) : openSyllabus()) },
    { key: "mindmap", labelKey: "book.tool.mindmap", icon: "git-network", go: openSyllabus },
    { key: "cards", labelKey: "book.tool.cards", icon: "albums", badge: cards ? String(cards) : undefined, go: () => router.push({ pathname: "/flashcards", params: { book_id: book.id, from_book: "1" } }) },
    { key: "translate", labelKey: "book.tool.translate", icon: "language", go: openReader },
    { key: "slides", labelKey: "book.tool.slides", icon: "easel", go: openReader },
    { key: "focus", labelKey: "book.tool.focus", icon: "timer", go: () => router.push("/pomodoro") },
  ];

  return (
    <SceneScreen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SceneBanner title="" height={150} left={backBtn} right={<CoachHelpButton onPress={coach.replay} />} />

        <View style={styles.body}>
          {/* بطاقة الكتاب: الغلاف (بألوانه) + العنوان + الشارات + متابعة الاستماع */}
          <SceneCard style={styles.heroCard}>
            <View style={[styles.hero, { flexDirection: dir.row }]}>
              <BookCover title={book.title} width={96} height={132} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={3}>
                  {book.title}
                </Text>
                <Text style={[styles.meta, { color: pal.dim, textAlign: dir.textAlign }]}>
                  {units.length
                    ? t("book.metaUnits", { pages: pages || "—", units: units.length })
                    : t("book.meta", { pages: pages || "—" })}
                </Text>
                <View style={[styles.chips, { flexDirection: dir.row }]}>
                  {pages > 0 && (
                    <View style={[styles.chip, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
                      <Text style={[styles.chipTxt, { color: pal.ink }]}>{t("book.progress", { pct })}</Text>
                    </View>
                  )}
                  {ready && (ready.unitCount > 0 || ready.answered > 0) && (
                    <View style={[styles.chip, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
                      <Text style={[styles.chipTxt, { color: pal.ink }]}>{t("book.ready", { n: ready.score })}</Text>
                    </View>
                  )}
                  <PressableScale
                    onPress={() => setExamOpen(true)}
                    style={[styles.chip, { backgroundColor: pal.soft, borderColor: pal.accent }]}
                  >
                    <Text style={[styles.chipTxt, { color: pal.accent }]}>
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

            {pages > 0 && (
              <View style={[styles.progTrack, { backgroundColor: pal.track }]}>
                <View
                  style={[
                    styles.progFill,
                    { width: `${Math.max(2, pct)}%`, backgroundColor: pal.accent },
                    dir.isRTL ? { alignSelf: "flex-end" } : null,
                  ]}
                />
              </View>
            )}

            <PressableScale {...coach.bind("cta")} onPress={openReader} style={[styles.cta, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
              <Ionicons name="play" size={18} color={pal.onAccent} />
              <Text style={[styles.ctaTxt, { color: pal.onAccent }]}>{started ? t("book.continue", { page }) : t("book.start")}</Text>
            </PressableScale>
          </SceneCard>

          {/* الصوت المحفوظ: المكان الواضح لحفظ صوت الكتاب كله ومتابعة تقدّمه */}
          <BookAudioCard pdfPath={book.pdf_path} bookTitle={book.title} total={pages} />

          {/* تبويبات الصفحة */}
          <View {...coach.bind("seg")} style={[styles.seg, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
            {(["units", "tools", "saves"] as Tab[]).map((k) => {
              const on = tab === k;
              return (
                <PressableScale key={k} onPress={() => setTab(k)} style={[styles.segItem, on && { backgroundColor: pal.accent }]}>
                  <Text style={[styles.segTxt, { color: on ? pal.onAccent : pal.dim }]} numberOfLines={1}>
                    {t(`book.tab.${k}`)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {tab === "units" && !!ready?.dueMistakes && (
            <PressableScale
              onPress={() => router.push({ pathname: "/unit-quiz", params: { pdf_path: book.pdf_path, mode: "mistakes", book_title: book.title } })}
              style={[styles.mistakes, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }]}
            >
              <View style={[styles.mistakesIcon, { backgroundColor: pal.soft }]}>
                <Ionicons name="refresh-circle" size={22} color={pal.accent} />
              </View>
              <Text style={[styles.mistakesTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{t("book.mistakes", { n: ready.dueMistakes })}</Text>
              <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.dim} />
            </PressableScale>
          )}

          {tab === "units" &&
            (units.length ? (
              <SceneCard padded={false} style={{ overflow: "hidden" }}>
                {units.map((u, i) => {
                  const done = !!syl?.done[i];
                  const acc = ready?.accuracy[i] ?? null;
                  const accColor = acc === null ? pal.dim : acc >= 0.75 ? tone.good : acc >= 0.5 ? tone.mid : tone.bad;
                  const weak = ready?.weakUnit === i && !ready.weakUntested;
                  return (
                    <View
                      key={i}
                      {...(i === 0 ? coach.bind("unit") : null)}
                      style={[
                        styles.unit,
                        { flexDirection: dir.row },
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.track },
                        weak && { backgroundColor: pal.soft },
                      ]}
                    >
                      <View
                        style={[
                          styles.unitNum,
                          { borderColor: pal.track },
                          done && { borderColor: pal.accent, backgroundColor: pal.accent },
                        ]}
                      >
                        {done ? (
                          <Ionicons name="checkmark" size={15} color={pal.onAccent} />
                        ) : (
                          <Text style={[styles.unitNumTxt, { color: pal.dim }]}>{i + 1}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.unitTitle, { color: done ? pal.dim : pal.ink, textAlign: dir.textAlign }]}
                          numberOfLines={2}
                        >
                          {u.title}
                        </Text>
                        {ranges?.[i] && (
                          <Text style={[styles.unitRange, { color: pal.dim, textAlign: dir.textAlign }]}>
                            {t("glossary.pages", { from: ranges[i].from, to: ranges[i].to })}
                            {ranges[i].found ? "" : " " + t("glossary.approx")}
                          </Text>
                        )}
                        {acc !== null && (
                          <View style={[styles.accRow, { flexDirection: dir.row }]}>
                            <View style={[styles.accTrack, { backgroundColor: pal.track }]}>
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
                      <PressableScale onPress={() => openGlossary(i)} style={[styles.mini, { backgroundColor: pal.soft }]}>
                        <Ionicons name="book" size={16} color={pal.accent} accessibilityLabel={t("book.unit.glossary")} />
                      </PressableScale>
                      <PressableScale
                        onPress={() => router.push({ pathname: "/unit-summary", params: unitParams(i, u.title) })}
                        style={[styles.mini, { backgroundColor: pal.soft }]}
                      >
                        <Ionicons name="headset" size={17} color={pal.accent} accessibilityLabel={t("book.unit.summary")} />
                      </PressableScale>
                      <PressableScale
                        onPress={() => router.push({ pathname: "/unit-video", params: unitParams(i, u.title) })}
                        style={[styles.mini, { backgroundColor: pal.soft }]}
                      >
                        <Ionicons name="videocam" size={17} color={pal.accent} accessibilityLabel={t("video.open")} />
                      </PressableScale>
                      <PressableScale
                        onPress={() => router.push({ pathname: "/unit-quiz", params: unitParams(i, u.title) })}
                        style={[styles.mini, { backgroundColor: pal.soft }]}
                      >
                        <Ionicons name="checkbox" size={17} color={pal.accent} accessibilityLabel={t("book.unit.quiz")} />
                      </PressableScale>
                    </View>
                  );
                })}
              </SceneCard>
            ) : (
              <SceneCard style={{ padding: Spacing.lg, gap: 12 }}>
                <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign, lineHeight: 22 }]}>{t("book.units.empty")}</Text>
                <PressableScale {...coach.bind("create")} onPress={openSyllabus} style={[styles.create, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
                  <Ionicons name="sparkles" size={16} color={pal.onAccent} />
                  <Text style={[styles.createTxt, { color: pal.onAccent }]}>{t("book.units.create")}</Text>
                </PressableScale>
              </SceneCard>
            ))}

          {/* صفحة الملاحظات: مكانها الثابت في محفوظات الكتاب (تُحفظ تلقائيًا، وتُفتح فوق القارئ) */}
          {tab === "saves" && (
            <PressableScale
              onPress={() => router.push({ pathname: "/reader/[id]", params: { id: book.id, title: book.title, pdf_path: book.pdf_path, notes: "1" } })}
              style={{ marginBottom: 10 }}
            >
              <SceneCard style={{ flexDirection: dir.row, alignItems: "center", gap: 12 }}>
                <View style={[styles.toolIcon, { backgroundColor: pal.soft }]}>
                  <Ionicons name="create-outline" size={19} color={pal.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toolTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{t("notes.title")}</Text>
                  <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign, marginTop: 2 }]} numberOfLines={1}>
                    {noteCount > 0 ? t("notes.savedCount", { n: noteCount }) : t("notes.emptyHint")}
                  </Text>
                </View>
                <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.dim} />
              </SceneCard>
            </PressableScale>
          )}
          {tab === "saves" &&
            (saves === null ? (
              <ActivityIndicator color={pal.accent} style={{ marginTop: 24 }} />
            ) : saves.length === 0 ? (
              <SceneCard style={{ padding: Spacing.lg }}>
                <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign, lineHeight: 22 }]}>{t("saves.empty")}</Text>
              </SceneCard>
            ) : (
              <View style={{ gap: 10 }}>
                {saves.map((sv) => (
                  <PressableScale key={sv.id} onPress={() => router.push({ pathname: "/saved/[id]", params: { id: sv.id, book_title: book.title } })}>
                    <SceneCard style={{ flexDirection: dir.row, alignItems: "center", gap: 12 }}>
                      <View style={[styles.toolIcon, { backgroundColor: pal.soft }]}>
                        <Ionicons name={sv.kind === "slides" ? "easel-outline" : "sparkles-outline"} size={19} color={pal.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.toolTxt, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>{sv.title}</Text>
                        <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign, marginTop: 2 }]} numberOfLines={1}>
                          {t(`saves.kind.${sv.kind}`)}
                          {sv.kind === "slides" && sv.content.slides ? ` · ${t("saves.slidesCount", { n: sv.content.slides.length })}` : ""}
                          {` · ${new Date(sv.created_at).toLocaleDateString()}`}
                        </Text>
                      </View>
                      <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.dim} />
                    </SceneCard>
                  </PressableScale>
                ))}
              </View>
            ))}

          {tab === "tools" && (
            <View style={[styles.grid, { flexDirection: dir.row }]}>
              {tools.map((tl) => (
                <PressableScale key={tl.key} onPress={tl.go} style={styles.toolWrap}>
                  <SceneCard padded={false} style={styles.tool}>
                    <View style={[styles.toolIcon, { backgroundColor: pal.soft }]}>
                      <Ionicons name={tl.icon} size={19} color={pal.accent} />
                    </View>
                    <Text style={[styles.toolTxt, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
                      {t(tl.labelKey)}
                      {tl.badge ? ` · ${tl.badge}` : ""}
                    </Text>
                  </SceneCard>
                </PressableScale>
              ))}
            </View>
          )}
        </View>
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
      {coach.overlay}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { fontSize: 14 },
  scroll: { paddingBottom: 120 },
  body: { paddingHorizontal: Spacing.lg, gap: 14, marginTop: -44 },
  dockWrap: { position: "absolute", left: 12, right: 12, bottom: 18 },
  heroCard: { gap: 14 },
  hero: { alignItems: "flex-end", gap: 16 },
  title: { fontSize: 21, fontWeight: "900", lineHeight: 30 },
  meta: { fontSize: 13, fontWeight: "600" },
  chips: { flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  chipTxt: { fontSize: 11.5, fontWeight: "800" },
  progTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progFill: { height: 6, borderRadius: 3 },
  cta: { height: 54, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 10 },
  ctaTxt: { fontSize: 15.5, fontWeight: "900" },
  seg: { padding: 4, gap: 4, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  segItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: Radius.pill },
  segTxt: { fontSize: 14, fontWeight: "800" },
  mistakes: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    height: 58,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mistakesIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  mistakesTxt: { flex: 1, fontSize: 14.5, fontWeight: "800" },
  unit: { alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  unitNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  unitNumTxt: { fontSize: 12, fontWeight: "800" },
  unitTitle: { fontSize: 14.5, fontWeight: "700", lineHeight: 21 },
  unitRange: { fontSize: 11.5, marginTop: 3 },
  accRow: { alignItems: "center", gap: 8, marginTop: 6 },
  accTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  accFill: { height: 4, borderRadius: 2 },
  accTxt: { fontSize: 11.5, fontWeight: "800" },
  mini: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  create: { height: 48, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  createTxt: { fontWeight: "900", fontSize: 14.5 },
  grid: { flexWrap: "wrap", gap: 8 },
  toolWrap: { width: "31.8%" },
  tool: { padding: 12, gap: 10, minHeight: 96, borderRadius: 22 },
  toolIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toolTxt: { fontSize: 12.5, fontWeight: "700" },
});
