// app/ask/[id].tsx
// «كتابك يجيب»: محادثة مع الكتاب. الإجابة من صفحاته فقط، وتحتها أرقام الصفحات التي
// استندت إليها (ضغطة تفتح الصفحة في القارئ)، مع «استماع» و«حفظ كبطاقة».
// كل كتاب يجيب من نفسه فقط (لا خلط بين الكتب)، والمحادثات محفوظة لكل كتاب: تبدأ محادثة جديدة بعد يوم
// بلا أسئلة وتبقى القديمة في «المحادثات السابقة»، مع طباعة وحذف الإجابة أو المحادثة. البحث يشمل الصفحات الجاهزة؛ وإن لم يكن الكتاب
// كله جاهزًا نعرض ذلك بوضوح مع زر «تجهيز الكتاب كاملًا».
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { PressableScale } from "../../components/brand/motion";
import { SceneBanner, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { Radius } from "../../constants/design";
import { currentSession, deleteSession, exportAskPdf, loadSessions, newSession, saveSession, type AskSession, type AskTurn } from "../../lib/askHistory";
import { askBooks, coverage, myBooks, type QAAnswer, type QABook } from "../../lib/bookQA";
import { getDownloadState, startDownload, subscribeDownload, type DownloadState } from "../../lib/downloadManager";
import { addCards } from "../../lib/flashcards";
import { useDir, useI18n } from "../../lib/i18n";
import { setLastPage } from "../../lib/readerPrefs";
import { canUseVoiceAsk, requestPaywall } from "../../lib/plan";
import { useScene } from "../../lib/scene";
import { useDictation } from "../../lib/stt";
import { speakText, stopSpeaking } from "../../lib/voice";

type Turn = AskTurn;

export default function AskScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  // ألوان التنبيه والنجاح: مقروءة على المشهد الفاتح والداكن
  const WARN = pal.dark ? "#F6B880" : "#A8641E";
  const SUCCESS = pal.dark ? "#6CF3C5" : "#2F7D4A";
  const { id, q } = useLocalSearchParams<{ id?: string; q?: string }>();

  const [books, setBooks] = useState<QABook[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [session, setSession] = useState<AskSession | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AskSession[]>([]);
  // سؤال جاهز قادم من شاشة أخرى (مثل «سؤال عنها» في الاختبار) — يُكتب في الخانة ولا يُرسل تلقائيًا
  const [input, setInput] = useState(typeof q === "string" ? q : "");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<number | null>(null);
  const [dl, setDl] = useState<DownloadState | null>(getDownloadState());
  const [speaking, setSpeaking] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  const nextId = useRef(1);

  const book = books.find((b) => b.id === id) ?? null;
  const total = Number(book?.page_count) || 0;

  useEffect(() => {
    myBooks().then(setBooks).catch(() => setBooks([]));
    const off = subscribeDownload(setDl);
    return () => {
      off();
      stopSpeaking().catch(() => {});
    };
  }, []);

  // المحادثة الحالية لهذا الكتاب (أو جديدة بعد يوم بلا أسئلة)
  useEffect(() => {
    if (!id) return;
    currentSession(id).then((s) => {
      setSession(s);
      setTurns(s.turns);
      nextId.current = s.turns.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    });
  }, [id]);

  // حفظ تلقائي بعد كل إجابة أو حذف
  useEffect(() => {
    if (!id || !session) return;
    void saveSession(id, { ...session, turns });
  }, [id, session, turns]);

  function openSession(s: AskSession) {
    stopSpeaking().catch(() => {});
    setSession(s);
    setTurns(s.turns);
    nextId.current = s.turns.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  }

  async function openHistory() {
    if (!id) return;
    setHistory((await loadSessions(id)).sort((a, b) => b.updatedAt - a.updatedAt));
    setHistoryOpen(true);
  }

  function startNew() {
    if (!turns.length) return;
    openSession(newSession());
  }

  function confirmDeleteSession(s: AskSession, isCurrent: boolean) {
    Alert.alert(t("ask.deleteChat.title"), t("ask.deleteChat.body"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          if (!id) return;
          await deleteSession(id, s.id);
          if (isCurrent) openSession(newSession());
          setHistory((h) => h.filter((x) => x.id !== s.id));
        },
      },
    ]);
  }

  function deleteTurn(turn: Turn) {
    Alert.alert(t("ask.deleteAnswer.title"), t("ask.deleteAnswer.body"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => setTurns((ts) => ts.filter((x) => x.id !== turn.id)) },
    ]);
  }

  function printTurns(list: Turn[], when: number) {
    if (!list.some((x) => x.a)) return;
    void exportAskPdf(list, {
      title: t("ask.title"),
      bookTitle: book?.title ?? "",
      dateLabel: new Date(when).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : lang),
      question: t("ask.pdf.q"),
      answer: t("ask.pdf.a"),
      pages: t("ask.pdf.pages"),
      rtl: lang === "ar",
    }).catch(() => {});
  }

  // نسبة الجاهزية تُحدَّث مع تقدّم التجهيز في الخلفية
  useEffect(() => {
    if (book) coverage(book.pdf_path).then(setReady).catch(() => setReady(null));
  }, [book, dl?.done]);

  const dict = useDictation({
    lang: lang === "en" || lang === "fr" ? lang : "ar",
    onText: (tx) => setInput(tx),
    onEnd: (finalText) => {
      if (finalText) void ask(finalText);
    },
  });

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const targets = book ? [book] : []; // كل كتاب يجيب من نفسه فقط
    if (targets.length === 0) return;
    const tid = nextId.current++;
    setTurns((ts) => [...ts, { id: tid, q }]);
    setInput("");
    setBusy(true);
    try {
      const a = await askBooks(targets, q, turns.map((x) => x.q).slice(-9));
      setTurns((ts) => ts.map((x) => (x.id === tid ? { ...x, a } : x)));
    } catch (e) {
      const msg = (e as Error)?.message;
      // سؤال مخالف: لا يبقى في المحادثة (يظهر التحذير من الشاشة العامة)
      if (msg === "UNSAFE_CONTENT" || msg === "ACCOUNT_LOCKED") {
        setTurns((ts) => ts.filter((x) => x.id !== tid));
        return;
      }
      const noText = msg === "NO_TEXT";
      setTurns((ts) =>
        ts.map((x) => (x.id === tid ? { ...x, error: true, a: noText ? { text: t("ask.noText"), cites: [] } : undefined } : x))
      );
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  async function listen(turn: Turn) {
    if (!turn.a) return;
    if (speaking === turn.id) {
      await stopSpeaking().catch(() => {});
      setSpeaking(null);
      return;
    }
    await stopSpeaking().catch(() => {});
    setSpeaking(turn.id);
    speakText(turn.a.text, { onDone: () => setSpeaking(null), onError: () => setSpeaking(null) }).catch(() => setSpeaking(null));
  }

  async function save(turn: Turn) {
    if (!turn.a || turn.saved) return;
    const first = turn.a.cites[0];
    await addCards([{ front: turn.q, back: turn.a.text, bookId: first?.bookId ?? book?.id, bookTitle: first?.bookTitle ?? book?.title }]);
    setTurns((ts) => ts.map((x) => (x.id === turn.id ? { ...x, saved: true } : x)));
  }

  async function openPage(c: QAAnswer["cites"][number]) {
    await setLastPage(c.bookId, c.page); // القارئ يفتح على آخر صفحة محفوظة
    router.push({ pathname: "/reader/[id]", params: { id: c.bookId, title: c.bookTitle, pdf_path: c.pdfPath } });
  }

  const preparing = !!(dl?.running && book && dl.pdfPath === book.pdf_path);
  const showCoverage = book && total > 0 && ready !== null && ready < total;

  return (
    <SceneScreen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* الرأس */}
        <SceneBanner
          title={t("ask.title")}
          subtitle={book ? book.title : t("ask.sub")}
          height={140}
          right={
            <View style={{ flexDirection: dir.row, gap: 8 }}>
              {turns.some((x) => x.a) && (
                <PressableScale onPress={() => printTurns(turns, session?.startedAt ?? Date.now())}>
                  <SceneIconButton>
                    <Ionicons name="print-outline" size={20} color={pal.ink} accessibilityLabel={t("ask.printChat")} />
                  </SceneIconButton>
                </PressableScale>
              )}
              {turns.length > 0 && session && (
                <PressableScale onPress={() => confirmDeleteSession(session, true)}>
                  <SceneIconButton>
                    <Ionicons name="trash-outline" size={20} color={pal.ink} accessibilityLabel={t("ask.deleteChat.title")} />
                  </SceneIconButton>
                </PressableScale>
              )}
              <PressableScale onPress={openHistory}>
                <SceneIconButton>
                  <Ionicons name="time-outline" size={20} color={pal.ink} accessibilityLabel={t("ask.history")} />
                </SceneIconButton>
              </PressableScale>
              {turns.length > 0 && (
                <PressableScale onPress={startNew}>
                  <SceneIconButton accent>
                    <Ionicons name="add" size={22} color={pal.onAccent} accessibilityLabel={t("ask.newChat")} />
                  </SceneIconButton>
                </PressableScale>
              )}
            </View>
          }
          left={
            <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
              <SceneIconButton>
                <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
              </SceneIconButton>
            </PressableScale>
          }
        />

        {/* نطاق ثابت: هذا الكتاب فقط */}
        <View style={[styles.scopes, { flexDirection: dir.row }]}>
          <View style={[styles.scope, { flexDirection: dir.row, alignItems: "center", gap: 6, backgroundColor: pal.soft }]}>
            <Ionicons name="book-outline" size={14} color={pal.accent} />
            <Text style={[styles.scopeTxt, { color: pal.dim }]}>{t("ask.onlyThisBook")}</Text>
          </View>
        </View>

        <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* الجاهزية: نقول بوضوح كم صفحة يشملها البحث */}
          {showCoverage && (
            <View style={[styles.cover, { flexDirection: dir.row, backgroundColor: WARN + "14", borderColor: WARN + "59" }]}>
              <Ionicons name="information-circle" size={18} color={WARN} />
              <Text style={[styles.coverTxt, { color: pal.dim, textAlign: dir.textAlign }]}>
                {preparing ? t("ask.preparing", { done: dl!.done, total: dl!.total }) : t("ask.coverage", { done: ready!, total })}
              </Text>
              {!preparing && (
                <PressableScale onPress={() => book && startDownload(book.pdf_path, book.title, total)} style={[styles.coverBtn, { backgroundColor: WARN + "2E" }]}>
                  <Text style={[styles.coverBtnTxt, { color: WARN }]}>{t("ask.prepare")}</Text>
                </PressableScale>
              )}
            </View>
          )}

          {turns.map((tn) => (
            <View key={tn.id} style={{ gap: 10 }}>
              <View style={[styles.qBubble, { backgroundColor: pal.accent, alignSelf: dir.isRTL ? "flex-start" : "flex-end" }]}>
                <Text style={[styles.qTxt, { color: pal.onAccent }]}>{tn.q}</Text>
              </View>
              <View style={[styles.aBubble, { backgroundColor: pal.card, borderColor: pal.cardBorder, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]}>
                {!tn.a && !tn.error ? (
                  <View style={[styles.thinking, { flexDirection: dir.row }]}>
                    <ActivityIndicator color={pal.accent} />
                    <Text style={[styles.dim, { color: pal.dim }]}>{t("ask.thinking")}</Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.aTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{tn.a?.text ?? t("ask.error")}</Text>
                    {!!tn.a?.cites.length && (
                      <View style={[styles.cites, { flexDirection: dir.row }]}>
                        {tn.a.cites.map((c) => (
                          <PressableScale key={`${c.bookId}:${c.page}`} onPress={() => openPage(c)} style={[styles.cite, { backgroundColor: pal.soft, borderColor: pal.accent + "40" }]}>
                            <Ionicons name="document-text" size={13} color={pal.accent} />
                            <Text style={[styles.citeTxt, { color: pal.accent }]}>
                              {t("ask.page", { page: c.page })}
                            </Text>
                          </PressableScale>
                        ))}
                      </View>
                    )}
                    {tn.a && !tn.error && (
                      <View style={[styles.actions, { flexDirection: dir.row, borderTopColor: pal.track }]}>
                        <PressableScale onPress={() => listen(tn)} style={[styles.action, { flexDirection: dir.row }]}>
                          <Ionicons name={speaking === tn.id ? "stop-circle" : "volume-high"} size={17} color={pal.accent} />
                          <Text style={[styles.actionTxt, { color: pal.accent }]}>{speaking === tn.id ? t("ask.stop") : t("ask.listen")}</Text>
                        </PressableScale>
                        <PressableScale onPress={() => save(tn)} style={[styles.action, { flexDirection: dir.row }]}>
                          <Ionicons name={tn.saved ? "checkmark-circle" : "albums"} size={17} color={tn.saved ? SUCCESS : pal.accent} />
                          <Text style={[styles.actionTxt, { color: tn.saved ? SUCCESS : pal.accent }]}>
                            {tn.saved ? t("ask.saved") : t("ask.saveCard")}
                          </Text>
                        </PressableScale>
                        <PressableScale onPress={() => printTurns([tn], Date.now())} style={[styles.action, { flexDirection: dir.row }]}>
                          <Ionicons name="print-outline" size={17} color={pal.accent} />
                          <Text style={[styles.actionTxt, { color: pal.accent }]}>{t("ask.print")}</Text>
                        </PressableScale>
                        <PressableScale onPress={() => deleteTurn(tn)} style={[styles.action, { flexDirection: dir.row }]}>
                          <Ionicons name="trash-outline" size={17} color={pal.dim} />
                          <Text style={[styles.actionTxt, { color: pal.dim }]}>{t("common.delete")}</Text>
                        </PressableScale>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          ))}

          {turns.length === 0 && (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign }]}>{t("ask.suggest.title")}</Text>
              {[0, 1, 2].map((i) => (
                <PressableScale
                  key={i}
                  onPress={() => ask(t(`ask.suggest.${i}`))}
                  style={[styles.sugg, { backgroundColor: pal.card, borderColor: pal.cardBorder, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]}
                >
                  <Text style={[styles.suggTxt, { color: pal.ink }]}>{t(`ask.suggest.${i}`)}</Text>
                </PressableScale>
              ))}
            </View>
          )}
        </ScrollView>

        {/* الإدخال */}
        <View style={[styles.inputRow, { flexDirection: dir.row, backgroundColor: pal.bg, borderTopColor: pal.cardBorder }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("ask.placeholder")}
            placeholderTextColor={pal.dim}
            selectionColor={pal.accent}
            style={[styles.input, { backgroundColor: pal.card, borderColor: pal.cardBorder, color: pal.ink, textAlign: dir.textAlign }]}
            multiline
            onSubmitEditing={() => ask(input)}
            blurOnSubmit
            returnKeyType="send"
          />
          {/* سؤال بالصوت: ضغطة مطوّلة، والإفلات يرسل السؤال */}
          <Pressable
            onPressIn={async () => {
              if (!(await canUseVoiceAsk())) return void requestPaywall("voiceAsk", true);
              void dict.start();
            }}
            onPressOut={() => dict.stop()}
            disabled={busy}
            style={[styles.mic, { backgroundColor: dict.listening ? pal.accent : pal.card, borderColor: pal.cardBorder }]}
            accessibilityLabel={t("ask.voice")}
          >
            <Ionicons name="mic" size={21} color={dict.listening ? pal.onAccent : pal.ink} />
          </Pressable>
          <PressableScale onPress={() => ask(input)} disabled={busy || !input.trim()}>
            <View style={[styles.send, { backgroundColor: pal.accent }, (busy || !input.trim()) && { opacity: 0.45 }]}>
              <Ionicons name={dir.isRTL ? "arrow-back" : "arrow-forward"} size={22} color={pal.onAccent} accessibilityLabel={t("ask.send")} />
            </View>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>

      {/* المحادثات السابقة لهذا الكتاب */}
      <Modal visible={historyOpen} transparent animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setHistoryOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]}>
          <View style={[styles.sheetHead, { flexDirection: dir.row }]}>
            <Text style={[styles.sheetTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("ask.history")}</Text>
            <Pressable onPress={() => setHistoryOpen(false)} hitSlop={10} accessibilityLabel={t("common.close")}>
              <Ionicons name="close" size={24} color={pal.dim} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 30 }}>
            {history.length === 0 ? (
              <Text style={[styles.dim, { color: pal.dim, textAlign: "center", marginTop: 20 }]}>{t("ask.historyEmpty")}</Text>
            ) : (
              history.map((h) => {
                const isCurrent = h.id === session?.id;
                return (
                  <View key={h.id} style={[styles.histRow, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: isCurrent ? pal.accent : pal.cardBorder }]}>
                    <Pressable
                      style={{ flex: 1 }}
                      onPress={() => {
                        openSession(h);
                        setHistoryOpen(false);
                      }}
                    >
                      <Text style={[styles.histQ, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
                        {h.turns[0]?.q ?? ""}
                      </Text>
                      <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign }]}>
                        {new Date(h.updatedAt).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : lang)} · {t("ask.historyCount", { n: h.turns.length })}
                        {isCurrent ? ` · ${t("ask.historyCurrent")}` : ""}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => printTurns(h.turns, h.startedAt)} hitSlop={8} accessibilityLabel={t("ask.printChat")}>
                      <Ionicons name="print-outline" size={20} color={pal.accent} />
                    </Pressable>
                    <Pressable onPress={() => confirmDeleteSession(h, isCurrent)} hitSlop={8} accessibilityLabel={t("ask.deleteChat.title")}>
                      <Ionicons name="trash-outline" size={20} color={pal.dim} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scopes: { gap: 6, paddingHorizontal: 16, paddingTop: 4 },
  scope: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill },
  scopeTxt: { fontSize: 13, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { maxHeight: "75%", borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  sheetHead: { alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetTitle: { fontSize: 19, fontWeight: "800" },
  histRow: { alignItems: "center", gap: 14, padding: 14, borderRadius: 16, borderWidth: 1 },
  histQ: { fontSize: 14.5, fontWeight: "700", marginBottom: 4 },
  body: { padding: 16, gap: 16, paddingBottom: 30 },
  cover: {
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverTxt: { flex: 1, fontSize: 12.5, lineHeight: 19 },
  coverBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill },
  coverBtnTxt: { fontSize: 12.5, fontWeight: "700" },
  qBubble: { maxWidth: "82%", paddingHorizontal: 16, paddingVertical: 11, borderRadius: 20 },
  qTxt: { fontSize: 15, lineHeight: 23 },
  aBubble: {
    maxWidth: "92%",
    padding: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  thinking: { alignItems: "center", gap: 10 },
  dim: { fontSize: 13 },
  aTxt: { fontSize: 15, lineHeight: 26 },
  cites: { flexWrap: "wrap", gap: 6 },
  cite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  citeTxt: { fontSize: 12, fontWeight: "700" },
  actions: { gap: 18, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  action: { alignItems: "center", gap: 6 },
  actionTxt: { fontSize: 13, fontWeight: "700" },
  sugg: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  suggTxt: { fontSize: 13.5 },
  inputRow: { alignItems: "flex-end", gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
  },
  send: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  mic: { width: 46, height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
});
