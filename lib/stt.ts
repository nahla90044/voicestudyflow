// lib/stt.ts
// تحويل الكلام إلى نص بخدمة آبل (SFSpeechRecognizer عبر expo-speech-recognition).
// على الجهاز متى كانت لغة الجهاز مثبّتة للتعرّف المحلي، وإلا فخدمة آبل نفسها.
// لا تسجيلات تُحفظ، ولا خدمة طرف ثالث.
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useCallback, useRef, useState } from "react";

import { ensureAudioMode, invalidateAudioMode } from "./voice";

export type SttLang = "ar" | "en" | "fr";
const LOCALE: Record<SttLang, string> = { ar: "ar-SA", en: "en-US", fr: "fr-FR" };

let onDeviceLocales: string[] | null = null;
const onDeviceFailed = new Set<string>(); // لغات فشل تعرّفها المحلي (ملفاتها غير مثبّتة) → خدمة آبل مباشرة

/** هل التعرّف المحلي (بدون إنترنت) متاح لهذه اللغة على الجهاز؟ */
async function canRunOnDevice(locale: string): Promise<boolean> {
  try {
    if (onDeviceFailed.has(locale)) return false;
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return false;
    if (!onDeviceLocales) {
      const r = await ExpoSpeechRecognitionModule.getSupportedLocales({});
      onDeviceLocales = r.installedLocales ?? [];
    }
    return onDeviceLocales.some((l) => l.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()));
  } catch {
    return false;
  }
}

export type DictationError = "denied" | "unavailable" | "failed" | null;

type Options = {
  lang: SttLang;
  /** استماع مستمر (وضع المشي) بدل جملة واحدة */
  continuous?: boolean;
  /** يُلغي صدى صوت التطبيق من الميكروفون (حين يقرأ الكتاب أثناء الاستماع) */
  echoCancel?: boolean;
  /** إعادة وضع التشغيل المعتاد بعد الانتهاء (افتراضي نعم؛ وضع المشي يديره بنفسه) */
  restoreAudio?: boolean;
  /** كلمات متوقّعة تحسّن الدقة (أوامر وضع المشي) */
  hints?: string[];
  onText?: (text: string, isFinal: boolean) => void;
  onEnd?: (finalText: string) => void;
};

/**
 * ميكروفون «اضغط وتحدّث»: start عند الضغط، stop عند الإفلات.
 * يُرجع النص المتغيّر أثناء الكلام، والنص النهائي عبر onEnd.
 */
export function useDictation(opts: Options) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<DictationError>(null);
  const [errorCode, setErrorCode] = useState(""); // للتشخيص أثناء التطوير
  const textRef = useRef("");
  const activeRef = useRef(false); // هذا المكوّن هو من بدأ الجلسة (لا نلتقط جلسات غيره)
  const cancelledRef = useRef(false); // أُلغيت الجلسة → لا نعالج ما قيل
  const startingRef = useRef(false); // البدء ينتظر الإذن/التهيئة
  const stopAfterStartRef = useRef(false); // رُفع الإصبع قبل أن يبدأ الاستماع فعلًا
  const sessionRef = useRef<{ locale: string; onDevice: boolean; retried: boolean } | null>(null);
  const retryRef = useRef(false);

  /** يبدأ جلسة التعرّف بالإعدادات الحالية (محلي إن أمكن) */
  function launch() {
    const o = optsRef.current;
    const sess = sessionRef.current;
    if (!sess) return;
    sess.onDevice = sess.onDevice && !onDeviceFailed.has(sess.locale);
    ExpoSpeechRecognitionModule.start({
      lang: sess.locale,
      interimResults: true,
      continuous: !!o.continuous,
      requiresOnDeviceRecognition: sess.onDevice,
      addsPunctuation: false,
      contextualStrings: o.hints,
      iosTaskHint: o.continuous ? "confirmation" : "dictation",
      iosVoiceProcessingEnabled: !!o.echoCancel,
      iosCategory: o.echoCancel
        ? { category: "playAndRecord", categoryOptions: ["defaultToSpeaker", "allowBluetooth", "mixWithOthers"], mode: "voiceChat" }
        : undefined,
    });
  }
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useSpeechRecognitionEvent("start", () => {
    if (!activeRef.current) return;
    setListening(true);
    // رُفع الإصبع أثناء طلب الإذن → لا نترك الميكروفون مفتوحًا
    if (stopAfterStartRef.current) {
      stopAfterStartRef.current = false;
      cancelledRef.current = true;
      ExpoSpeechRecognitionModule.abort();
    }
  });
  useSpeechRecognitionEvent("result", (e) => {
    if (!activeRef.current) return;
    const tx = e.results[0]?.transcript ?? "";
    textRef.current = tx;
    setText(tx);
    optsRef.current.onText?.(tx, e.isFinal);
  });
  useSpeechRecognitionEvent("error", (e) => {
    if (!activeRef.current) return;
    if (__DEV__) setErrorCode(`${e.error}: ${e.message}`);
    // التعرّف المحلي غير متاح لهذه اللغة → نعيد المحاولة فورًا بخدمة آبل (مرة واحدة)
    const sess = sessionRef.current;
    if (sess?.onDevice && !sess.retried && (e.error === "language-not-supported" || e.error === "service-not-allowed")) {
      onDeviceFailed.add(sess.locale);
      sess.retried = true;
      retryRef.current = true;
      return;
    }
    // «لا كلام» أو الإلغاء ليسا خطأً يستحق رسالة
    if (e.error === "no-speech" || e.error === "aborted") return;
    setError(e.error === "not-allowed" ? "denied" : e.error === "language-not-supported" || e.error === "service-not-allowed" ? "unavailable" : "failed");
  });
  useSpeechRecognitionEvent("end", () => {
    if (!activeRef.current) return;
    if (retryRef.current) {
      retryRef.current = false;
      launch();
      return;
    }
    activeRef.current = false;
    setListening(false);
    // نعيد وضع التشغيل المعتاد (الصامت/الخلفية) قبل أي قراءة صوتية تالية
    if (optsRef.current.restoreAudio !== false) {
      invalidateAudioMode();
      void ensureAudioMode();
    }
    if (!cancelledRef.current) optsRef.current.onEnd?.(textRef.current.trim());
  });

  const start = useCallback(async () => {
    setError(null);
    setText("");
    textRef.current = "";
    cancelledRef.current = false;
    stopAfterStartRef.current = false;
    startingRef.current = true;
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      startingRef.current = false;
      setError("denied");
      return false;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      startingRef.current = false;
      setError("unavailable");
      return false;
    }
    const o = optsRef.current;
    const locale = LOCALE[o.lang];
    const onDevice = await canRunOnDevice(locale);
    startingRef.current = false;
    activeRef.current = true;
    sessionRef.current = { locale, onDevice, retried: false };
    launch();
    return true;
  }, []);

  /** إنهاء الاستماع ومعالجة ما قيل */
  const stop = useCallback(() => {
    if (activeRef.current) ExpoSpeechRecognitionModule.stop();
    else if (startingRef.current) stopAfterStartRef.current = true;
  }, []);

  /** إلغاء بلا معالجة */
  const cancel = useCallback(() => {
    if (!activeRef.current) return;
    cancelledRef.current = true;
    ExpoSpeechRecognitionModule.abort();
  }, []);

  return { listening, text, error, errorCode, start, stop, cancel };
}
