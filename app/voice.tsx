// app/voice.tsx
// المساعد الصوتي (تصميم 2.0): ضغطة مطوّلة على الكرة ثم الكلام، والإفلات عند الانتهاء.
// الكلام يتحوّل لنص بخدمة آبل (lib/stt)، ويُفهم محليًا (lib/voiceIntents)، فينفَّذ:
// متابعة القراءة، ملخص وحدة، اختبار، مراجعة الأخطاء، الجاهزية، البطاقات، جلسة تركيز،
// تذكير بموعد — وما سوى ذلك يُجاب عنه من صفحات الكتاب («كتابك يجيب»).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "../components/brand/motion";
import { SceneCard, SceneScreen } from "../components/brand/scene-screen";
import { getSpokenName } from "../lib/auth";
import { askBooks, myBooks } from "../lib/bookQA";
import { countDue } from "../lib/flashcards";
import { getContinueBook, type ContinueBook } from "../lib/home";
import { dropEmptyVocative, useDir, useI18n } from "../lib/i18n";
import { scheduleOnce } from "../lib/notify";
import { canUseVoiceAsk, requestPaywall } from "../lib/plan";
import { setLastPage } from "../lib/readerPrefs";
import { useScene } from "../lib/scene";
import { getBookReadiness, type BookReadiness } from "../lib/readiness";
import { useDictation, type SttLang } from "../lib/stt";
import { speakText, stopSpeaking, VOICE_CATALOG } from "../lib/voice";
import { parseIntents, type Intent } from "../lib/voiceIntents";

type Card = { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; tag: string; go?: () => void };
type Phase = "idle" | "listening" | "thinking" | "done";

/** هالة الكرة: حلقات بلون المشهد تتنفّس (أسرع وأوسع أثناء الاستماع) */
function AuroraOrb({ active }: { active: boolean }) {
  const { pal } = useScene();
  const a = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = a.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: (active ? 900 : 2000) + i * 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: (active ? 900 : 2000) + i * 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, a]);
  const ring = (v: Animated.Value, size: number, opacity: number) => (
    <Animated.View
      style={[
        styles.blob,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pal.accent,
          shadowColor: pal.accent,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [opacity * 0.6, active ? opacity * 1.4 : opacity] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, active ? 1.22 : 1.08] }) }],
        },
      ]}
    />
  );
  return (
    <View style={styles.orbBox} pointerEvents="none">
      {ring(a[0], 190, pal.dark ? 0.1 : 0.08)}
      {ring(a[1], 150, pal.dark ? 0.14 : 0.12)}
      {ring(a[2], 112, pal.dark ? 0.2 : 0.16)}
    </View>
  );
}

export default function VoiceAssistant() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const { pal } = useScene();
  const sttLang: SttLang = lang === "en" || lang === "fr" ? lang : "ar";
  const replyVoice = VOICE_CATALOG.find((v) => (v.lang ?? "ar") === sttLang)?.voiceId;

  const [phase, setPhase] = useState<Phase>("idle");
  const [said, setSaid] = useState("");
  const [reply, setReply] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const ctx = useRef<{ cont: ContinueBook | null; ready: BookReadiness | null; name: string } | null>(null);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // سياق جاهز مسبقًا (الكتاب الحالي والجاهزية والاسم) حتى يكون الرد فوريًا
  useEffect(() => {
    (async () => {
      const [cont, name] = await Promise.all([getContinueBook(), getSpokenName()]);
      const ready = cont ? await getBookReadiness(cont.pdf_path) : null;
      ctx.current = { cont, ready, name: name.trim() };
    })();
    return () => {
      stopSpeaking();
      if (navTimer.current) clearTimeout(navTimer.current);
    };
  }, []);

  const dict = useDictation({
    lang: sttLang,
    onEnd: (finalText) => {
      if (finalText) void handle(finalText);
      else setPhase("idle");
    },
  });
  useEffect(() => {
    if (dict.listening) setSaid(dict.text);
  }, [dict.text, dict.listening]);

  /** يغلق المساعد ثم يفتح الوجهة */
  const go = (fn: () => void) => () => {
    stopSpeaking();
    router.back();
    setTimeout(fn, 30);
  };

  async function handle(text: string) {
    setSaid(text);
    setPhase("thinking");
    setCards([]);
    setReply("");
    if (navTimer.current) clearTimeout(navTimer.current);
    if (!ctx.current) {
      const [cont, name] = await Promise.all([getContinueBook(), getSpokenName()]);
      ctx.current = { cont, ready: cont ? await getBookReadiness(cont.pdf_path) : null, name: name.trim() };
    }
    const { cont, ready, name } = ctx.current;
    const intents = parseIntents(text);
    const parts: string[] = [];
    const out: Card[] = [];
    let autoGo: (() => void) | undefined;

    const unitFor = (n: number | null) => {
      if (!ready || ready.unitCount === 0) return null;
      const idx = n !== null ? Math.min(ready.unitCount, Math.max(1, n)) - 1 : ready.weakUnit ?? 0;
      return { idx, title: ready.unitTitles[idx] ?? "" };
    };

    for (const it of intents) {
      await runIntent(it);
    }

    async function runIntent(it: Intent) {
      if (!cont && it.type !== "remind" && it.type !== "focus" && it.type !== "cards") {
        parts.push(t("va.noBook"));
        out.push({ key: "add", icon: "add-circle", title: t("cmd.addBook"), sub: "", tag: "", go: go(() => router.push("/add-book")) });
        return;
      }
      switch (it.type) {
        case "resume": {
          parts.push(t("va.resume", { book: cont!.title, page: cont!.page }));
          const g = go(() => router.push({ pathname: "/reader/[id]", params: { id: cont!.id, title: cont!.title, pdf_path: cont!.pdf_path } }));
          out.push({ key: "resume", icon: "play", title: t("va.card.resume", { page: cont!.page }), sub: cont!.title, tag: t("va.tag.play"), go: g });
          autoGo = g;
          return;
        }
        case "summary":
        case "quiz": {
          const u = unitFor(it.unit);
          if (!u) {
            parts.push(t("va.noSyllabus"));
            out.push({ key: "hub", icon: "list", title: t("book.units.create"), sub: cont!.title, tag: "", go: go(() => router.push({ pathname: "/book/[id]", params: { id: cont!.id } })) });
            return;
          }
          const params = { pdf_path: cont!.pdf_path, unit: String(u.idx), title: u.title, book_title: cont!.title };
          if (it.type === "summary") {
            parts.push(t("va.summary", { n: u.idx + 1 }));
            const g = go(() => router.push({ pathname: "/unit-summary", params }));
            out.push({ key: "sum", icon: "headset", title: t("va.card.summary", { n: u.idx + 1 }), sub: u.title, tag: t("va.tag.open"), go: g });
            autoGo = autoGo ?? g;
          } else {
            parts.push(t("va.quiz", { n: u.idx + 1 }));
            const g = go(() => router.push({ pathname: "/unit-quiz", params }));
            out.push({ key: "quiz", icon: "checkbox", title: t("va.card.quiz", { n: u.idx + 1 }), sub: u.title, tag: t("va.tag.start"), go: g });
            autoGo = autoGo ?? g;
          }
          return;
        }
        case "mistakes": {
          const n = ready?.dueMistakes ?? 0;
          if (!n) {
            parts.push(t("quiz2.noMistakes"));
            return;
          }
          parts.push(t("va.mistakes", { n }));
          const g = go(() => router.push({ pathname: "/unit-quiz", params: { pdf_path: cont!.pdf_path, mode: "mistakes", book_title: cont!.title } }));
          out.push({ key: "mis", icon: "refresh-circle", title: t("book.mistakes", { n }), sub: cont!.title, tag: t("va.tag.start"), go: g });
          autoGo = autoGo ?? g;
          return;
        }
        case "readiness": {
          if (!ready) {
            parts.push(t("va.noReady"));
            return;
          }
          const exam =
            ready.daysLeft == null || ready.daysLeft < 0
              ? t("va.readyNoExam", { book: cont!.title, score: ready.score })
              : t("va.readyExam", { n: ready.daysLeft, book: cont!.title, score: ready.score });
          const weak = ready.weakUnit !== null && !ready.weakUntested ? " " + t("va.weak", { n: ready.weakUnit + 1 }) : "";
          parts.push(exam + weak);
          out.push({
            key: "ready",
            icon: "stats-chart",
            title: t("va.card.ready", { score: ready.score }),
            sub: ready.weakUnit !== null ? t(ready.weakUntested ? "ready.untested" : "ready.weak", { n: ready.weakUnit + 1 }) : cont!.title,
            tag: t("va.tag.details"),
            go: go(() => router.push({ pathname: "/book/[id]", params: { id: cont!.id } })),
          });
          return;
        }
        case "cards": {
          const n = await countDue();
          parts.push(n ? t("va.cards", { n }) : t("va.cardsNone"));
          const g = go(() => router.push("/flashcards"));
          out.push({ key: "cards", icon: "albums", title: t("path.cards.title", { n }), sub: "", tag: t("va.tag.start"), go: g });
          if (n) autoGo = autoGo ?? g;
          return;
        }
        case "focus": {
          parts.push(t("va.focus"));
          const g = go(() => router.push("/pomodoro"));
          out.push({ key: "focus", icon: "timer", title: t("cmd.focus"), sub: "", tag: t("va.tag.start"), go: g });
          autoGo = autoGo ?? g;
          return;
        }
        case "remind": {
          const what = it.what || t("va.remindDefault");
          const when = await scheduleOnce(it.hour, it.minute, t("va.remindTitle"), what);
          const time = `${it.hour % 12 || 12}:${String(it.minute).padStart(2, "0")} ${it.hour >= 12 ? t("va.pm") : t("va.am")}`;
          if (!when) {
            parts.push(t("va.remindDenied"));
            return;
          }
          parts.push(t("va.remind", { time }));
          out.push({ key: "remind", icon: "alarm", title: t("va.card.remind", { time }), sub: what, tag: t("va.tag.reminder") });
          return;
        }
        case "ask": {
          if (!(await canUseVoiceAsk())) {
            parts.push(t("pay.reason.voiceAsk"));
            out.push({ key: "pro", icon: "sparkles", title: t("sub.upgrade"), sub: t("pay.pro"), tag: "", go: () => requestPaywall("voiceAsk", true) });
            return;
          }
          try {
            const books = (await myBooks()).filter((b) => b.id === cont!.id);
            const ans = await askBooks(books, it.question);
            parts.push(ans.text);
            ans.cites.slice(0, 2).forEach((c) =>
              out.push({
                key: "p" + c.page,
                icon: "document-text",
                title: t("va.card.page", { page: c.page }),
                sub: c.bookTitle,
                tag: t("va.tag.open"),
                go: go(async () => {
                  await setLastPage(c.bookId, c.page);
                  router.push({ pathname: "/reader/[id]", params: { id: c.bookId, title: c.bookTitle, pdf_path: c.pdfPath } });
                }),
              })
            );
          } catch {
            parts.push(t("va.askFailed"));
          }
          return;
        }
      }
    }

    // «تمام يا نور.» قبل تنفيذ الأوامر (لا قبل إجابة سؤال)
    const isCommand = intents.some((i) => i.type !== "ask");
    const lead = isCommand ? dropEmptyVocative(t("va.ok", { name })) + " " : "";
    const full = (lead + parts.join(" ")).trim();
    setReply(full);
    setCards(out);
    setPhase("done");

    // أمر واحد واضح (فتح شاشة) → ننفّذه بعد أن يُقال الرد؛ عدة أوامر → تبقى البطاقات للاختيار
    const navCount = out.filter((c) => c.go).length;
    const single = intents.length === 1 && navCount === 1 && autoGo;
    speakText(full, {
      voiceId: replyVoice,
      onDone: () => {
        if (single && autoGo) navTimer.current = setTimeout(autoGo, 300);
      },
      onError: () => {},
    });
  }

  const status =
    phase === "listening" || dict.listening
      ? t("va.listening")
      : phase === "thinking"
        ? t("va.thinking")
        : dict.error === "denied"
          ? t("va.denied")
          : dict.error
            ? t("va.unavailable")
            : t("va.holdToTalk");

  const examples = [t("va.ex1"), t("va.ex2"), t("va.ex3"), t("va.ex4")];

  return (
    <SceneScreen>
      {/* نافذة ملء الشاشة لا تطبّق الهوامش الآمنة تلقائيًا — نضيفها يدويًا */}
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={[styles.top, { flexDirection: dir.row }]}>
          <PressableScale
            onPress={() => router.back()}
            style={[styles.ghost, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}
          >
            <Ionicons name="close" size={18} color={pal.ink} accessibilityLabel={t("common.close")} />
          </PressableScale>
          <View style={[styles.statusPill, { backgroundColor: pal.soft, flexDirection: dir.row }]}>
            {(phase === "listening" || dict.listening) && <View style={[styles.dot, { backgroundColor: pal.accent }]} />}
            <Text style={[styles.status, { color: phase === "listening" || dict.listening ? pal.accent : pal.dim }]}>{status}</Text>
          </View>
        </View>
        {__DEV__ && !!dict.errorCode && <Text style={[styles.status, { color: pal.dim, paddingHorizontal: 18 }]}>{dict.errorCode}</Text>}
        <View>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {!!said && (
            <SceneCard style={{ gap: 6 }}>
              <Text style={[styles.cap, { color: pal.dim, textAlign: dir.textAlign }]}>{t("va.request")}</Text>
              <Text style={[styles.said, { color: pal.ink, textAlign: dir.textAlign }]}>«{said}»</Text>
            </SceneCard>
          )}
          {phase === "thinking" && <ActivityIndicator color={pal.accent} style={{ alignSelf: "flex-start" }} />}
          {!!reply && (
            <SceneCard style={{ backgroundColor: pal.soft, borderColor: pal.accent + "33", shadowOpacity: 0, elevation: 0 }}>
              <View style={[styles.replyHead, { flexDirection: dir.row }]}>
                <Ionicons name="sparkles" size={14} color={pal.accent} />
              </View>
              <Text style={[styles.reply, { color: pal.ink, textAlign: dir.textAlign }]}>{reply}</Text>
            </SceneCard>
          )}
          {cards.map((c) => (
            <PressableScale key={c.key} onPress={c.go} disabled={!c.go}>
              <SceneCard padded={false} style={[styles.card, { flexDirection: dir.row }]}>
                <View style={[styles.cardIcon, { backgroundColor: pal.soft }]}>
                  <Ionicons name={c.icon} size={18} color={pal.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                    {c.title}
                  </Text>
                  {!!c.sub && (
                    <Text style={[styles.cardSub, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                      {c.sub}
                    </Text>
                  )}
                </View>
                {!!c.tag && (
                  <View style={[styles.tagPill, { backgroundColor: c.go ? pal.accent : pal.soft }]}>
                    <Text style={[styles.cardTag, { color: c.go ? pal.onAccent : pal.dim }]}>{c.tag}</Text>
                  </View>
                )}
              </SceneCard>
            </PressableScale>
          ))}
        </ScrollView>

        {/* الكرة: ضغطة مطوّلة للحديث، والإفلات للإرسال */}
        <Pressable
          onPressIn={() => {
            stopSpeaking();
            setPhase("listening");
            setSaid("");
            setReply("");
            setCards([]);
            void dict.start().then((ok) => !ok && setPhase("idle"));
          }}
          onPressOut={() => dict.stop()}
          style={styles.orbPress}
          accessibilityRole="button"
          accessibilityLabel={t("va.holdToTalk")}
        >
          <AuroraOrb active={dict.listening} />
          <View style={[styles.mic, { backgroundColor: pal.accent, shadowColor: pal.accent }]}>
            <Ionicons name="mic" size={28} color={pal.onAccent} />
          </View>
        </Pressable>

        <View style={styles.examples}>
          <Text style={[styles.cap, { color: pal.dim }]}>{t("va.examples")}</Text>
          <View style={styles.chips}>
            {examples.map((e) => (
              <PressableScale key={e} onPress={() => void handle(e)} style={[styles.chip, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
                <Text style={[styles.chipTxt, { color: pal.ink }]}>{e}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      </View>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 8 },
  ghost: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  statusPill: { alignItems: "center", gap: 7, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontSize: 12.5, fontWeight: "700" },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 12 },
  cap: { fontSize: 12, fontWeight: "700" },
  said: { fontSize: 21, fontWeight: "800", lineHeight: 34 },
  replyHead: { marginBottom: 6 },
  reply: { fontSize: 15, lineHeight: 27, fontWeight: "500" },
  card: { alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 22 },
  cardIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  cardSub: { fontSize: 12, marginTop: 2 },
  tagPill: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999 },
  cardTag: { fontSize: 12, fontWeight: "700" },
  orbPress: { alignSelf: "center", width: 220, height: 220, alignItems: "center", justifyContent: "center" },
  orbBox: { position: "absolute", width: 220, height: 220, alignItems: "center", justifyContent: "center" },
  blob: { position: "absolute", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
  mic: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  examples: { alignItems: "center", gap: 10, paddingBottom: 12, paddingTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, paddingHorizontal: 16 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  chipTxt: { fontSize: 13, fontWeight: "600" },
});
