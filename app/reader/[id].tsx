import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { aiAssist, generateFlashcards, type AiAction } from "../../lib/ai";
import { addCards } from "../../lib/flashcards";
import {
  addHighlight,
  getBookmarks,
  getHighlights,
  removeHighlight,
  setHighlightNote,
  toggleBookmark,
  type Highlight,
} from "../../lib/annotations";
import { extractPdfPageText } from "../../lib/pdfText";
import { splitSentences } from "../../lib/textUtils";
import {
  getLastPage,
  getReadingRate,
  setLastPage,
  setReadingRate,
} from "../../lib/readerPrefs";
import { recordActivity, recordBookCompleted } from "../../lib/stats";
import { supabase } from "../../lib/supabase";
import { speakText, stopSpeaking, type VoiceGender } from "../../lib/voice";
import { Palette, Radius, Spacing } from "../../constants/design";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const SLEEP_OPTIONS = [0, 5, 15, 30] as const; // 0 = مطفأ (بالدقائق)

export default function ReaderScreen() {
  const router = useRouter();
  const { id, title, pdf_path } = useLocalSearchParams<{
    id?: string;
    title?: string;
    pdf_path?: string;
  }>();

  const bookId = typeof id === "string" ? id : undefined;
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";

  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [gender, setGender] = useState<VoiceGender>("female");
  const [rate, setRate] = useState(1);
  const [sleepMin, setSleepMin] = useState(0);
  const [viewMode, setViewMode] = useState<"pdf" | "text">("pdf");
  const [sentences, setSentences] = useState<string[]>([]);
  const [activeSentence, setActiveSentence] = useState(-1);
  const [status, setStatus] = useState(""); // رسالة حالة ظاهرة للمستخدم

  // علامات + تظليل + ملاحظات
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id: string; text: string } | null>(null);

  // مساعد الذكاء الاصطناعي
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");

  // مراجع
  const playingRef = useRef(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsLoadedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<number[]>([]);
  const playStartRef = useRef<number | null>(null);

  // رابط موقّت موقّع للعرض في WebView (الحاوية خاصة، ليست عامة)
  const [pdfUrl, setPdfUrl] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      if (!pdfPath) {
        setPdfUrl("");
        return;
      }
      const { data } = await supabase.storage
        .from("pdfs")
        .createSignedUrl(pdfPath, 60 * 60); // ساعة
      if (active) setPdfUrl(data?.signedUrl ?? "");
    })();
    return () => {
      active = false;
    };
  }, [pdfPath]);

  // تحميل التفضيلات: آخر صفحة + السرعة
  useEffect(() => {
    (async () => {
      const [savedPage, savedRate] = await Promise.all([
        getLastPage(bookId),
        getReadingRate(),
      ]);
      setPage(savedPage);
      setRate(savedRate);
      prefsLoadedRef.current = true;
    })();

    return () => {
      playingRef.current = false;
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // حفظ آخر صفحة عند تغيّرها (بعد تحميل التفضيلات لتفادي الكتابة فوق المحفوظ)
  useEffect(() => {
    if (prefsLoadedRef.current && bookId && page >= 1) setLastPage(bookId, page);
  }, [bookId, page]);

  // تحميل العلامات والتظليلات
  useEffect(() => {
    (async () => {
      const [bm, hl] = await Promise.all([getBookmarks(bookId), getHighlights(bookId)]);
      setBookmarks(bm);
      setHighlights(hl);
    })();
  }, [bookId]);

  const isBookmarked = bookmarks.includes(page);

  async function onToggleBookmark() {
    setBookmarks(await toggleBookmark(bookId, page));
  }

  // ضغطة مطوّلة على جملة في وضع النص → تظليل/إزالة
  async function onSentenceLongPress(text: string) {
    const existing = highlights.find((h) => h.page === page && h.text === text);
    if (existing) {
      setHighlights(await removeHighlight(bookId, existing.id));
    } else {
      setHighlights(await addHighlight(bookId, { page, text }));
    }
  }

  function isHighlighted(text: string) {
    return highlights.some((h) => h.page === page && h.text === text);
  }

  async function saveNoteDraft() {
    if (!noteDraft) return;
    setHighlights(await setHighlightNote(bookId, noteDraft.id, noteDraft.text.trim()));
    setNoteDraft(null);
  }

  async function deleteHighlight(id: string) {
    setHighlights(await removeHighlight(bookId, id));
  }

  function jumpTo(p: number) {
    setNotesOpen(false);
    stop();
    setPage(p);
    if (viewMode === "text") loadSentences(p);
  }

  function stop() {
    playingRef.current = false;
    stopSpeaking();
    setSpeaking(false);
    setActiveSentence(-1);

    // سجّل دقائق الاستماع لهذه الجلسة + حدّث السلسلة
    if (playStartRef.current) {
      const mins = (Date.now() - playStartRef.current) / 60000;
      playStartRef.current = null;
      recordActivity({ minutes: mins });
    }
  }

  // تمرير تلقائي للجملة المقروءة في وضع النص
  useEffect(() => {
    if (viewMode !== "text" || activeSentence < 0) return;
    const y = offsetsRef.current[activeSentence];
    if (typeof y === "number") {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 90), animated: true });
    }
  }, [activeSentence, viewMode]);

  function cycleSpeed() {
    const idx = SPEEDS.indexOf(rate as (typeof SPEEDS)[number]);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setRate(next);
    setReadingRate(next);
  }

  function cycleSleep() {
    const idx = SLEEP_OPTIONS.indexOf(sleepMin as (typeof SLEEP_OPTIONS)[number]);
    const next = SLEEP_OPTIONS[(idx + 1) % SLEEP_OPTIONS.length];
    setSleepMin(next);

    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (next > 0) {
      sleepTimerRef.current = setTimeout(() => {
        stop();
        setSleepMin(0);
        sleepTimerRef.current = null;
      }, next * 60 * 1000);
    }
  }

  // يقرأ صفحة جملة-بجملة، وعند انتهائها ينتقل تلقائيًا للتالية
  async function playFromPage(p: number) {
    if (!pdfPath) return;
    setBusy(true);
    setStatus(`جارٍ تحضير نص الصفحة ${p}…`);
    try {
      const res = await extractPdfPageText(pdfPath, p);
      if (res.totalPages) setTotalPages(res.totalPages);
      setPage(res.page);

      const sents = splitSentences(res.text);
      setSentences(sents);
      offsetsRef.current = [];

      if (!playingRef.current) return; // أُوقف أثناء التحميل

      if (sents.length === 0) {
        // صفحة بدون نص (قد تكون صورة ممسوحة) → جرّب التالية أو أوقف
        if (res.page < res.totalPages) {
          setStatus(`الصفحة ${res.page} بدون نص — أتنقّل للتالية…`);
          return playFromPage(res.page + 1);
        }
        setStatus("لا يوجد نص قابل للقراءة في هذا الكتاب.");
        stop();
        return;
      }

      setBusy(false);
      setStatus("");
      playSentence(sents, 0, res.page, res.totalPages);
    } catch (e: any) {
      setBusy(false);
      setStatus(`تعذّر تحميل النص: ${e?.message ?? "تحقّقي من الاتصال"}`);
      stop();
    }
  }

  // يقرأ جملة واحدة ثم ينتقل للتالية (أو للصفحة التالية)
  function playSentence(sents: string[], i: number, p: number, total: number) {
    if (!playingRef.current) return;

    if (i >= sents.length) {
      recordActivity({ pages: 1 }); // أنهى صفحة
      if (p < total) {
        playFromPage(p + 1);
      } else {
        recordBookCompleted(); // أنهى الكتاب
        stop();
      }
      return;
    }

    setActiveSentence(i);
    setStatus(`🎙️ يقرأ الآن — جملة ${i + 1} من ${sents.length}`);
    speakText(sents[i], {
      gender,
      rate,
      onDone: () => playSentence(sents, i + 1, p, total),
      onError: (e) => {
        setStatus(`تعذّر تشغيل الصوت: ${(e as any)?.message ?? "خطأ"}`);
        stop();
      },
    });
  }

  function togglePlay() {
    if (speaking) {
      stop();
      setStatus("");
      return;
    }
    setStatus("");
    setViewMode("text"); // أظهر النص ليبان التحديد المتحرك أثناء القراءة
    playingRef.current = true;
    setSpeaking(true);
    playStartRef.current = Date.now();
    recordActivity({}); // علّم اليوم نشطًا (السلسلة)
    playFromPage(page);
  }

  // تنقّل بين الصفحات: يحمّل نص الصفحة الجديدة، ويكمل القراءة إن كانت شغّالة
  function goPage(delta: number) {
    const next = Math.max(1, totalPages ? Math.min(totalPages, page + delta) : page + delta);
    if (next === page) return;
    const wasPlaying = playingRef.current;
    stop();
    setPage(next);
    setViewMode("text");
    if (wasPlaying) {
      playingRef.current = true;
      setSpeaking(true);
      playStartRef.current = Date.now();
      playFromPage(next);
    } else {
      loadSentences(next);
    }
  }

  // تحميل نص الصفحة للعرض فقط (بدون قراءة)
  async function loadSentences(p: number) {
    if (!pdfPath) return;
    setBusy(true);
    try {
      const res = await extractPdfPageText(pdfPath, p);
      if (res.totalPages) setTotalPages(res.totalPages);
      setPage(res.page);
      setSentences(splitSentences(res.text));
      offsetsRef.current = [];
    } catch {
      // تجاهل
    } finally {
      setBusy(false);
    }
  }

  function toggleViewMode() {
    const next = viewMode === "pdf" ? "text" : "pdf";
    setViewMode(next);
    if (next === "text" && sentences.length === 0 && !speaking) {
      loadSentences(page);
    }
  }

  // يضمن وجود نص الصفحة الحالية (يجلبه إن لزم) ويُرجعه كنص واحد
  async function ensurePageText(): Promise<string> {
    if (sentences.length > 0) return sentences.join(" ");
    if (!pdfPath) return "";
    const res = await extractPdfPageText(pdfPath, page);
    if (res.totalPages) setTotalPages(res.totalPages);
    const sents = splitSentences(res.text);
    setSentences(sents);
    return sents.join(" ");
  }

  async function runAi(action: AiAction) {
    setAiBusy(true);
    setAiResult("");
    try {
      const text = await ensurePageText();
      if (!text.trim()) {
        setAiResult("لا يوجد نص في هذه الصفحة.");
        return;
      }
      const out = await aiAssist(action, text, aiQuestion);
      setAiResult(out || "لا توجد نتيجة.");
    } catch {
      setAiResult("تعذّر تنفيذ الطلب. ميزة الذكاء تحتاج تفعيل مفتاح Claude.");
    } finally {
      setAiBusy(false);
    }
  }

  async function makeFlashcards() {
    setAiBusy(true);
    setAiResult("");
    try {
      const text = await ensurePageText();
      if (!text.trim()) {
        setAiResult("لا يوجد نص في هذه الصفحة.");
        return;
      }
      const cards = await generateFlashcards(text);
      if (cards.length === 0) {
        setAiResult("تعذّر توليد بطاقات من هذه الصفحة.");
        return;
      }
      const bookTitle = typeof title === "string" ? title : undefined;
      const n = await addCards(cards.map((c) => ({ ...c, bookId, bookTitle })));
      setAiResult(`✅ تم حفظ ${n} بطاقة مراجعة. راجعيها من تبويب «البطاقات».`);
    } catch {
      setAiResult("تعذّر تنفيذ الطلب. ميزة الذكاء تحتاج تفعيل مفتاح Claude.");
    } finally {
      setAiBusy(false);
    }
  }

  function goBack() {
    stop();
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* الهيدر */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={Palette.textMuted} />
        </Pressable>
        <Text style={styles.hTitle} numberOfLines={1}>
          {typeof title === "string" && title.trim() ? title : "الكتاب"}
        </Text>

        <Pressable onPress={onToggleBookmark} style={styles.iconBtn} hitSlop={8}>
          <Ionicons
            name={isBookmarked ? "bookmark" : "bookmark-outline"}
            size={18}
            color={isBookmarked ? Palette.warn : Palette.text}
          />
        </Pressable>

        <Pressable onPress={() => setNotesOpen(true)} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="list" size={18} color={Palette.text} />
          {bookmarks.length + highlights.length > 0 ? (
            <View style={styles.countDot}>
              <Text style={styles.countDotTxt}>{bookmarks.length + highlights.length}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable onPress={() => setAiOpen(true)} style={styles.aiBtn} hitSlop={8}>
          <Ionicons name="sparkles" size={15} color="#fff" />
        </Pressable>

        <Pressable onPress={toggleViewMode} style={styles.modeToggle} hitSlop={8}>
          <Ionicons
            name={viewMode === "pdf" ? "text" : "document"}
            size={16}
            color={Palette.text}
          />
          <Text style={styles.modeToggleTxt}>{viewMode === "pdf" ? "نص" : "PDF"}</Text>
        </Pressable>
      </View>

      {/* العارض: PDF أو نص بتظليل الجملة المقروءة */}
      <View style={styles.viewer}>
        {viewMode === "text" ? (
          <ScrollView ref={scrollRef} contentContainerStyle={styles.textContent}>
            {sentences.length === 0 ? (
              <Text style={styles.emptyTextSmall}>
                {busy ? "جارٍ تحميل النص…" : "لا يوجد نص لعرضه في هذه الصفحة."}
              </Text>
            ) : (
              sentences.map((s, i) => {
                const hl = isHighlighted(s);
                return (
                  <Pressable
                    key={i}
                    onLongPress={() => onSentenceLongPress(s)}
                    delayLongPress={300}
                    onLayout={(e) => {
                      offsetsRef.current[i] = e.nativeEvent.layout.y;
                    }}
                    style={
                      i === activeSentence
                        ? styles.sentenceRowActive
                        : hl
                        ? styles.sentenceRowHL
                        : styles.sentenceRow
                    }
                  >
                    <Text style={i === activeSentence ? styles.sentenceActive : styles.sentence}>
                      {s}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        ) : pdfUrl ? (
          <WebView source={{ uri: pdfUrl }} style={{ flex: 1 }} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={36} color={Palette.textDim} />
            <Text style={styles.emptyText}>لا يوجد رابط PDF</Text>
            <Text style={styles.emptyTextSmall}>
              تأكّد أن pdf_path محفوظ في جدول books وأن الملف موجود في Storage: pdfs
            </Text>
          </View>
        )}
      </View>

      {/* لوحة التحكم بالصوت */}
      <View style={styles.player}>
        {/* اختيار صوت القارئ */}
        <View style={styles.optionsRow}>
          <View style={styles.segment}>
            <Seg label="👩 امرأة" active={gender === "female"} onPress={() => setGender("female")} />
            <Seg label="👨 رجل" active={gender === "male"} onPress={() => setGender("male")} />
          </View>
        </View>

        {/* التحكم: السابقة — تشغيل — التالية (يمين ← يسار) */}
        <View style={styles.controls}>
          <Pressable onPress={() => goPage(-1)} style={styles.navBtn} disabled={page <= 1} hitSlop={6}>
            <Ionicons name="chevron-forward" size={22} color={page <= 1 ? Palette.textDim : Palette.text} />
            <Text style={[styles.navTxt, page <= 1 && { color: Palette.textDim }]}>السابقة</Text>
          </Pressable>

          <Pressable onPress={togglePlay} style={styles.playBtn}>
            {busy ? (
              <ActivityIndicator color="#0b1220" />
            ) : (
              <Ionicons name={speaking ? "pause" : "play"} size={28} color="#0b1220" />
            )}
          </Pressable>

          <Pressable
            onPress={() => goPage(1)}
            style={styles.navBtn}
            disabled={!!totalPages && page >= totalPages}
            hitSlop={6}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={!!totalPages && page >= totalPages ? Palette.textDim : Palette.text}
            />
            <Text style={[styles.navTxt, !!totalPages && page >= totalPages && { color: Palette.textDim }]}>
              التالية
            </Text>
          </Pressable>
        </View>

        {/* السرعة + مؤقّت النوم */}
        <View style={styles.extraRow}>
          <Pressable onPress={cycleSpeed} style={styles.chip}>
            <Ionicons name="speedometer-outline" size={16} color={Palette.text} />
            <Text style={styles.chipTxt}>السرعة {rate}x</Text>
          </Pressable>

          <Pressable
            onPress={cycleSleep}
            style={[styles.chip, sleepMin > 0 && styles.chipActive]}
          >
            <Ionicons
              name="moon-outline"
              size={16}
              color={sleepMin > 0 ? "#fff" : Palette.text}
            />
            <Text style={[styles.chipTxt, sleepMin > 0 && styles.chipTxtActive]}>
              {sleepMin > 0 ? `${sleepMin} دقيقة` : "مؤقّت النوم"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.pageInfo}>
          الصفحة {page}
          {totalPages ? ` من ${totalPages}` : ""}
        </Text>

        {status ? <Text style={styles.statusTxt}>{status}</Text> : null}
      </View>

      {/* مودال الملاحظات والعلامات */}
      <Modal visible={notesOpen} transparent animationType="slide" onRequestClose={() => setNotesOpen(false)}>
        <View style={styles.aiMask}>
          <View style={styles.aiSheet}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiTitle}>🔖 علاماتي وملاحظاتي</Text>
              <Pressable onPress={() => setNotesOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
              {bookmarks.length === 0 && highlights.length === 0 ? (
                <Text style={styles.notesHint}>
                  لا توجد علامات بعد. استخدمي 🔖 لحفظ صفحة، أو اضغطي مطوّلاً على جملة في وضع النص لتظليلها.
                </Text>
              ) : null}

              {bookmarks.length > 0 ? (
                <>
                  <Text style={styles.notesSection}>الصفحات المحفوظة</Text>
                  <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
                    {bookmarks.map((p) => (
                      <Pressable key={p} onPress={() => jumpTo(p)} style={styles.bmChip}>
                        <Ionicons name="bookmark" size={13} color={Palette.warn} />
                        <Text style={styles.bmChipTxt}>صفحة {p}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {highlights.length > 0 ? (
                <Text style={styles.notesSection}>المقاطع المظلّلة</Text>
              ) : null}
              {highlights.map((h) => (
                <View key={h.id} style={styles.hlCard}>
                  <Pressable onPress={() => jumpTo(h.page)}>
                    <Text style={styles.hlPage}>صفحة {h.page}</Text>
                    <Text style={styles.hlText} numberOfLines={3}>{h.text}</Text>
                  </Pressable>

                  {noteDraft?.id === h.id ? (
                    <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 8 }}>
                      <TextInput
                        value={noteDraft.text}
                        onChangeText={(t) => setNoteDraft({ id: h.id, text: t })}
                        placeholder="اكتبي ملاحظة…"
                        placeholderTextColor={Palette.placeholder}
                        style={styles.noteInput}
                        textAlign="right"
                        autoFocus
                      />
                      <Pressable onPress={saveNoteDraft} style={styles.noteSave}>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      </Pressable>
                    </View>
                  ) : h.note ? (
                    <Pressable onPress={() => setNoteDraft({ id: h.id, text: h.note ?? "" })}>
                      <Text style={styles.hlNote}>📝 {h.note}</Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.hlActions}>
                    <Pressable onPress={() => setNoteDraft({ id: h.id, text: h.note ?? "" })} hitSlop={6}>
                      <Text style={styles.hlAction}>{h.note ? "تعديل الملاحظة" : "+ ملاحظة"}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert("حذف", "حذف هذا التظليل؟", [
                          { text: "إلغاء", style: "cancel" },
                          { text: "حذف", style: "destructive", onPress: () => deleteHighlight(h.id) },
                        ])
                      }
                      hitSlop={6}
                    >
                      <Text style={[styles.hlAction, { color: Palette.danger }]}>حذف</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* مودال الذكاء الاصطناعي */}
      <Modal visible={aiOpen} transparent animationType="slide" onRequestClose={() => setAiOpen(false)}>
        <View style={styles.aiMask}>
          <View style={styles.aiSheet}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiTitle}>✨ مساعد الذكاء (الصفحة {page})</Text>
              <Pressable onPress={() => setAiOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            <View style={styles.aiActions}>
              <Pressable style={styles.aiAction} onPress={() => runAi("summarize")} disabled={aiBusy}>
                <Ionicons name="list" size={18} color={Palette.neonCyan} />
                <Text style={styles.aiActionTxt}>تلخيص</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={() => runAi("quiz")} disabled={aiBusy}>
                <Ionicons name="help-circle" size={18} color={Palette.neonViolet} />
                <Text style={styles.aiActionTxt}>اختبرني</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={makeFlashcards} disabled={aiBusy}>
                <Ionicons name="albums" size={18} color={Palette.neonPink} />
                <Text style={styles.aiActionTxt}>بطاقات</Text>
              </Pressable>
            </View>

            <View style={styles.aiAskRow}>
              <TextInput
                value={aiQuestion}
                onChangeText={setAiQuestion}
                placeholder="اسأل عن هذه الصفحة…"
                placeholderTextColor={Palette.placeholder}
                style={styles.aiInput}
                textAlign="right"
                editable={!aiBusy}
              />
              <Pressable style={styles.aiSend} onPress={() => runAi("ask")} disabled={aiBusy || !aiQuestion.trim()}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>

            <ScrollView style={styles.aiResultBox} contentContainerStyle={{ padding: 14 }}>
              {aiBusy ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <ActivityIndicator color={Palette.primary} />
                  <Text style={styles.aiHint}>جارٍ التفكير…</Text>
                </View>
              ) : aiResult ? (
                <Text style={styles.aiResultTxt}>{aiResult}</Text>
              ) : (
                <Text style={styles.aiHint}>
                  اختر «تلخيص» أو «اختبرني»، أو اكتب سؤالاً عن محتوى الصفحة.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Seg({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]}>
      <Text style={[styles.segTxt, active && styles.segTxtActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Palette.bg },
  header: {
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
  },
  hTitle: { flex: 1, color: Palette.text, fontSize: 16, fontWeight: "900", textAlign: "right" },

  modeToggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  modeToggleTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },

  aiBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.accent,
  },
  aiBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },

  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
  },
  countDot: {
    position: "absolute",
    top: -4,
    left: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  countDotTxt: { color: "#fff", fontSize: 10, fontWeight: "900" },

  notesHint: { color: Palette.textDim, fontSize: 13, lineHeight: 20, textAlign: "right" },
  notesSection: { color: Palette.textMuted, fontSize: 13, fontWeight: "900", textAlign: "right", marginTop: 4 },
  bmChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  bmChipTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },
  hlCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    borderRadius: Radius.md,
    padding: 12,
  },
  hlPage: { color: Palette.warn, fontSize: 12, fontWeight: "800", textAlign: "right" },
  hlText: { color: Palette.textMuted, fontSize: 14, lineHeight: 22, textAlign: "right", marginTop: 4 },
  hlNote: { color: Palette.neonCyan, fontSize: 13, textAlign: "right", marginTop: 8 },
  hlActions: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 8 },
  hlAction: { color: Palette.primary, fontSize: 13, fontWeight: "800" },
  noteInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    color: Palette.text,
  },
  noteSave: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.primary,
  },

  aiMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  aiSheet: {
    backgroundColor: Palette.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.lg,
    gap: 12,
    maxHeight: "80%",
  },
  aiHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  aiTitle: { color: Palette.text, fontSize: 16, fontWeight: "900" },
  aiActions: { flexDirection: "row-reverse", gap: 10 },
  aiAction: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  aiActionTxt: { color: Palette.text, fontWeight: "800", fontSize: 14 },
  aiAskRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  aiInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    color: Palette.text,
  },
  aiSend: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.primary,
  },
  aiResultBox: {
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    minHeight: 120,
  },
  aiResultTxt: { color: Palette.textMuted, fontSize: 15, lineHeight: 26, textAlign: "right" },
  aiHint: { color: Palette.textDim, fontSize: 13, textAlign: "center", marginTop: 8 },

  textContent: { padding: 16, gap: 8 },
  readingText: { color: Palette.textMuted, fontSize: 18, lineHeight: 32, textAlign: "right" },
  sentenceRow: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.sm },
  sentenceRowHL: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(241,196,15,0.14)",
    borderWidth: 1,
    borderColor: "rgba(241,196,15,0.4)",
  },
  sentenceRowActive: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Palette.primarySoft,
    borderWidth: 1,
    borderColor: Palette.primary,
  },
  sentence: { color: Palette.textDim, fontSize: 18, lineHeight: 32, textAlign: "right" },
  sentenceActive: { color: Palette.text, fontSize: 18, lineHeight: 32, textAlign: "right", fontWeight: "800" },

  viewer: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: Palette.border,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, gap: 8 },
  emptyText: { color: Palette.textDim, fontWeight: "800" },
  emptyTextSmall: {
    color: "rgba(159,179,200,0.85)",
    textAlign: "center",
    lineHeight: 18,
    fontSize: 12,
  },

  player: {
    margin: 14,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.border,
    gap: 12,
  },
  optionsRow: { flexDirection: "row", justifyContent: "center" },
  segment: {
    flexDirection: "row",
    backgroundColor: Palette.surface,
    borderRadius: Radius.pill,
    padding: 3,
    gap: 2,
  },
  seg: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.pill },
  segActive: { backgroundColor: Palette.primary },
  segTxt: { color: Palette.textDim, fontWeight: "800", fontSize: 13 },
  segTxtActive: { color: "#fff" },

  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  navBtn: {
    minWidth: 66,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: Palette.surface,
  },
  navTxt: { color: Palette.text, fontSize: 11, fontWeight: "800" },
  playBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.success,
  },

  extraRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  chip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  chipActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },
  chipTxtActive: { color: "#fff" },

  pageInfo: { color: Palette.textMuted, textAlign: "center", fontWeight: "800", fontSize: 13 },
  statusTxt: { color: Palette.neonCyan, textAlign: "center", fontWeight: "700", fontSize: 12, marginTop: 2 },
});
