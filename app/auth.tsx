// app/auth.tsx
// شاشة الحساب: إنشاء حساب جديد (ببريد + كلمة مرور وتأكيد بالبريد) أو تسجيل دخول.
// بعد أول دخول مؤكَّد تُرحَّل بيانات الجهاز القديمة تلقائيًا إلى الحساب.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CodePad } from "../components/brand/code-pad";
import { SceneArt } from "../components/brand/scene-art";
import { SceneCard, SceneScreen } from "../components/brand/scene-screen";
import { VersionTag } from "../components/brand/version-tag";
import { BrandMark } from "../components/brand/logo";
import { Radius, Spacing } from "../constants/design";
import {
  clearUserCache,
  mfaChallengeRequired,
  sendLoginCode,
  setNewPassword,
  signInWithApple,
  signInWithEmail,
  signUpEmail,
  solveMfaChallenge,
  verifyLoginCode,
} from "../lib/auth";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { sceneGrowth } from "../lib/sceneCore";
import { supabase } from "../lib/supabase";
import { setUserName } from "../lib/settings";
import { ONBOARDING_KEY } from "./onboarding";

type Mode = "signup" | "login";

// حد أقصى لأي طلب دخول/رمز: طلب عالق (شبكة ضعيفة أو التطبيق رجع من الخلفية) كان يُبقي
// الأزرار معطّلة فتبدو الشاشة معلّقة. بعد المهلة نُظهر رسالة ونرجّع الأزرار.
const AUTH_TIMEOUT_MS = 20_000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), AUTH_TIMEOUT_MS))]);
}
const isTimeout = (e: unknown) => String((e as Error)?.message ?? "") === "TIMEOUT";

export default function AuthScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { id, pal } = useScene();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [lockSeconds, setLockSeconds] = useState(0); // قفل مؤقت بعد محاولات كثيرة
  const [mfaMode, setMfaMode] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  // استعادة الدخول برمز البريد (بديل رابط إعادة التعيين)
  const [otpMode, setOtpMode] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendIn, setResendIn] = useState(0); // Supabase يسمح برمز كل ٦٠ ثانية (لكل بريد)
  const [codeEmail, setCodeEmail] = useState(""); // البريد الذي أُرسل له آخر رمز
  const [recovering, setRecovering] = useState(false); // دخل بالرمز → نعرض كلمة مرور جديدة بعد 2FA
  const [newPwMode, setNewPwMode] = useState(false);
  const [newPw, setNewPw] = useState("");

  // عدّاد تنازلي للقفل
  useEffect(() => {
    if (lockSeconds <= 0) return;
    const id = setInterval(() => setLockSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [lockSeconds > 0]);

  // عدّاد إعادة إرسال الرمز — يتبع «هل العدّ جارٍ» لا القيمة، فلا يُعاد إنشاؤه كل ثانية
  const resending = resendIn > 0;
  useEffect(() => {
    if (!resending) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resending]);

  const MAX_TRIES = 5;
  const LOCK_SECONDS = 30;

  async function finishLogin() {
    // أول دخول: نعرض الجولة التعريفية، وإلا ندخل التطبيق مباشرة
    const seen = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
    router.replace(seen === "1" ? "/" : "/onboarding");
  }

  // الدخول بحساب Apple: الطريقة الأولى (وشرط التجربة المجانية)
  async function onApple() {
    setErr("");
    setBusy(true);
    try {
      const r = await signInWithApple();
      if (r === "ok") await finishLogin();
    } catch {
      setErr(t("trial.apple.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (lockSeconds > 0) return setErr(t("auth.err.locked", { sec: lockSeconds }));
    setErr("");
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) return setErr(t("auth.err.email"));
    if (password.length < 6) return setErr(t("auth.err.password"));
    setBusy(true);
    try {
      if (mode === "signup") {
        const { needsConfirm } = await withTimeout(signUpEmail(e, password, name));
        await clearUserCache(); // امسح أي بيانات حساب سابق على الجهاز قبل تهيئة الحساب الجديد
        if (name.trim()) await setUserName(name.trim()); // يُحيّا باسمه الذي سجّله (بعد المسح)
        if (needsConfirm) {
          setAwaitingConfirm(true);
        } else {
          await finishLogin();
        }
      } else {
        await withTimeout(signInWithEmail(e, password));
        await clearUserCache(); // امسح بيانات أي حساب سابق على الجهاز — منعًا لتسرّب الإحصاءات/البطاقات/الاسم
        if (await mfaChallengeRequired().catch(() => false)) {
          setMfaMode(true); // يحتاج تحدّي 2FA قبل الدخول
        } else {
          await finishLogin();
        }
      }
      setFailCount(0); // نجاح → صفّر العدّاد
    } catch (ex: any) {
      const m = String(ex?.message ?? "");
      if (isTimeout(ex)) {
        setErr(t("auth.err.timeout"));
      } else if (/rate ?limit|too many|429/i.test(m)) {
        setErr(t("auth.err.rateLimit"));
      } else if (/already registered|exists/i.test(m)) {
        setErr(t("auth.err.exists"));
      } else if (/not confirmed|confirm/i.test(m)) {
        setErr(t("auth.err.notConfirmed"));
      } else if (/invalid login|credentials|password/i.test(m)) {
        // محاولة فاشلة → بعد عدد محدد نقفل مؤقتًا
        const next = failCount + 1;
        if (next >= MAX_TRIES) {
          setFailCount(0);
          setLockSeconds(LOCK_SECONDS);
          setErr(t("auth.err.locked", { sec: LOCK_SECONDS }));
        } else {
          setFailCount(next);
          setErr(t("auth.err.credentials"));
        }
      } else {
        setErr(m || t("auth.err.generic"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmedLogin() {
    setErr("");
    setBusy(true);
    try {
      await signInWithEmail(email.trim().toLowerCase(), password);
      await finishLogin();
    } catch {
      setErr(t("auth.err.notConfirmedRetry"));
    } finally {
      setBusy(false);
    }
  }

  // «نسيت كلمة المرور؟» → رمز دخول بالبريد، يُكتب هنا بلا متصفح ولا صفحة خارجية
  async function onForgot() {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) return setErr(t("auth.err.emailFirst"));
    if (busy) return; // ضغطة مكررة أثناء الإرسال — كانت ترسل طلبين فيرفض الثاني
    // رمز أُرسل لنفس البريد قبل أقل من دقيقة: نعرض شاشة الرمز مباشرة بدل التجاهل الصامت
    if (resendIn > 0 && e === codeEmail) {
      setErr("");
      Keyboard.dismiss();
      setOtpMode(true);
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await withTimeout(sendLoginCode(e));
      setCodeEmail(e);
      setOtpCode("");
      Keyboard.dismiss();
      setOtpMode(true);
      setResendIn(60);
    } catch (ex: any) {
      const m = String(ex?.message ?? "");
      setErr(isTimeout(ex) ? t("auth.err.timeout") : /rate ?limit|too many|429|seconds/i.test(m) ? t("auth.err.rateLimit") : t("auth.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyCode(codeArg?: string) {
    const code = codeArg ?? otpCode;
    if (code.length < 6 || busy) return;
    setErr("");
    setBusy(true);
    const e = email.trim().toLowerCase();
    try {
      try {
        await withTimeout(verifyLoginCode(e, code));
      } catch (ex) {
        // ربما نجح الدخول فعلًا رغم المهلة/الخطأ (الرمز يُستهلك مرة واحدة) → نتأكد من الجلسة
        const { data } = await supabase.auth.getSession();
        if (data.session?.user?.email?.toLowerCase() !== e) throw ex;
      }
      await clearUserCache(); // كالدخول العادي: لا تتسرّب بيانات حساب سابق على الجهاز
      setRecovering(true);
      setOtpMode(false);
      // التحقق الثنائي أولًا: تعيين كلمة المرور بعده يتطلّب جلسة aal2
      if (await mfaChallengeRequired().catch(() => false)) {
        setMfaMode(true);
      } else {
        setNewPwMode(true);
      }
    } catch (ex) {
      setOtpCode(""); // نفرّغ الخانات ليُكتب الرمز من جديد مباشرة
      setErr(isTimeout(ex) ? t("auth.err.timeout") : t("auth.code.invalid"));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveNewPw() {
    if (newPw.length < 6) return setErr(t("auth.err.password"));
    setErr("");
    setBusy(true);
    try {
      await withTimeout(setNewPassword(newPw));
      await finishLogin();
    } catch {
      setErr(t("auth.newPw.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyMfa(codeArg?: string) {
    const code = codeArg ?? mfaCode;
    if (code.length < 6 || busy) return;
    setErr("");
    setBusy(true);
    try {
      await withTimeout(solveMfaChallenge(code));
      if (recovering) {
        // جاء من الاستعادة → الجلسة صارت aal2، فتعيين كلمة المرور سيقبل الآن
        setMfaMode(false);
        setNewPwMode(true);
      } else {
        await finishLogin();
      }
    } catch (ex) {
      setMfaCode("");
      setErr(isTimeout(ex) ? t("auth.err.timeout") : t("twofa.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  // ألوان المشهد (صباح فاتح / مساء وليل داكن) — تُحسب كل رسم حتى تتبدّل مع وقت اليوم
  const errColor = pal.dark ? "#FF8A8A" : "#C62F3B";
  const th = {
    card: { padding: Spacing.xl },
    title: { color: pal.ink },
    confirmTitle: { color: pal.ink },
    confirmBody: { color: pal.dim },
    // في المشهد الفاتح حدود البطاقة باهتة جدًا → حدود الحقول أوضح (pal.track)
    input: { backgroundColor: pal.soft, borderColor: pal.dark ? pal.cardBorder : pal.track, color: pal.ink },
    label: { color: pal.dim },
    tabs: { backgroundColor: pal.track },
    tabOn: { backgroundColor: pal.accent },
    tabTxt: { color: pal.dim },
    tabTxtOn: { color: pal.onAccent },
    orTxt: { color: pal.dim },
    err: { color: errColor },
    submit: { backgroundColor: pal.accent },
    submitTxt: { color: pal.onAccent },
    link: { color: pal.accent },
    bigLink: { borderColor: pal.accent },
  };
  const growth = sceneGrowth(id, { pagesToday: 3, unitsDone: 2, unitCount: 6, readiness: 50 });
  const artH = (width * 470) / 390;

  return (
    <SceneScreen>
      {/* مقطع من مشهد اليوم أعلى الشاشة يتلاشى في الخلفية (كالجولة وشاشة الاشتراك) */}
      <View style={[styles.art, { height: ART_H }]} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: pal.dark ? 0.75 : 0.9 }]}>
          <View style={{ position: "absolute", left: 0, right: 0, top: Math.min(0, ART_H - artH) }}>
            <SceneArt id={id} growth={growth} width={width} height={artH} />
          </View>
        </View>
        <LinearGradient colors={[pal.bg + "00", pal.bg + "CC", pal.bg]} locations={[0.3, 0.75, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.logo}>
              <BrandMark size={78} />
            </View>
            <Text style={[styles.title, th.title]}>VoiceStudyFlow</Text>

            {newPwMode ? (
              <SceneCard style={th.card}>
                <Ionicons name="key" size={40} color={pal.accent} style={{ alignSelf: "center" }} />
                <Text style={[styles.confirmTitle, th.confirmTitle]}>{t("auth.newPw.title")}</Text>
                <Text style={[styles.confirmBody, th.confirmBody]}>{t("auth.newPw.body")}</Text>
                <View style={[styles.pwWrap, { marginTop: 14 }]}>
                  <TextInput
                    value={newPw}
                    onChangeText={setNewPw}
                    placeholder={t("auth.passwordHint")}
                    placeholderTextColor={pal.dim}
                    secureTextEntry={!showPw}
                    autoFocus
                    style={[
                      styles.input,
                      th.input,
                      { textAlign: dir.textAlign, writingDirection: dir.writingDirection },
                      dir.isRTL ? { paddingLeft: 46 } : { paddingRight: 46 },
                    ]}
                  />
                  <Pressable
                    onPress={() => setShowPw((v) => !v)}
                    style={[styles.eyeBtn, dir.isRTL ? { left: 6 } : { right: 6 }]}
                    hitSlop={8}
                  >
                    <Ionicons name={showPw ? "eye-outline" : "eye-off-outline"} size={20} color={pal.dim} />
                  </Pressable>
                </View>
                {!!err && <Text style={[styles.err, th.err]}>{err}</Text>}
                <Pressable onPress={onSaveNewPw} style={[styles.submit, th.submit]} disabled={busy || newPw.length < 6}>
                  {busy ? <ActivityIndicator color={pal.onAccent} /> : <Text style={[styles.submitTxt, th.submitTxt]}>{t("auth.newPw.cta")}</Text>}
                </Pressable>
                {/* التخطّي آمن: يمكن الدخول برمز البريد في أي وقت لاحق */}
                <Pressable onPress={finishLogin} hitSlop={6} style={{ marginTop: 14, alignSelf: "center" }} disabled={busy}>
                  <Text style={[styles.switchTxt, th.link]}>{t("auth.newPw.skip")}</Text>
                </Pressable>
              </SceneCard>
            ) : otpMode ? (
              <SceneCard style={th.card}>
                <Ionicons name="mail-open" size={40} color={pal.accent} style={{ alignSelf: "center" }} />
                <Text style={[styles.confirmTitle, th.confirmTitle]}>{t("auth.code.title")}</Text>
                <Text style={[styles.confirmBody, th.confirmBody]}>{t("auth.code.body", { email: email.trim() })}</Text>
                <CodePad value={otpCode} onChange={(v) => { setOtpCode(v); if (err) setErr(""); }} disabled={busy} onComplete={(c) => onVerifyCode(c)} />
                {!!err && <Text style={[styles.err, th.err]}>{err}</Text>}
                <Pressable onPress={() => onVerifyCode()} style={[styles.submit, th.submit]} disabled={busy || otpCode.length < 6}>
                  {busy ? <ActivityIndicator color={pal.onAccent} /> : <Text style={[styles.submitTxt, th.submitTxt]}>{t("auth.code.cta")}</Text>}
                </Pressable>
                <Pressable
                  onPress={onForgot}
                  disabled={busy || resendIn > 0}
                  style={[styles.bigLink, th.bigLink, (busy || resendIn > 0) && { opacity: 0.55 }]}
                >
                  <Ionicons name="refresh" size={18} color={pal.accent} />
                  <Text style={[styles.bigLinkTxt, th.link]}>
                    {resendIn > 0 ? t("auth.code.resendIn", { sec: resendIn }) : t("auth.code.resend")}
                  </Text>
                </Pressable>
                <Pressable onPress={() => { setOtpMode(false); setOtpCode(""); setErr(""); }} hitSlop={8} style={{ marginTop: 14, alignSelf: "center" }}>
                  <Text style={[styles.switchTxt, th.link]}>{t("auth.code.editEmail")}</Text>
                </Pressable>
              </SceneCard>
            ) : mfaMode ? (
              <SceneCard style={th.card}>
                <Ionicons name="shield-checkmark" size={40} color={pal.accent} style={{ alignSelf: "center" }} />
                <Text style={[styles.confirmTitle, th.confirmTitle]}>{t("twofa.challengeTitle")}</Text>
                <Text style={[styles.confirmBody, th.confirmBody]}>{t("twofa.challengeBody")}</Text>
                <CodePad value={mfaCode} onChange={(v) => { setMfaCode(v); if (err) setErr(""); }} disabled={busy} onComplete={(c) => onVerifyMfa(c)} />
                {!!err && <Text style={[styles.err, th.err]}>{err}</Text>}
                <Pressable onPress={() => onVerifyMfa()} style={[styles.submit, th.submit]} disabled={busy || mfaCode.length < 6}>
                  {busy ? <ActivityIndicator color={pal.onAccent} /> : <Text style={[styles.submitTxt, th.submitTxt]}>{t("twofa.challengeCta")}</Text>}
                </Pressable>
                <Pressable onPress={() => { setMfaMode(false); setMfaCode(""); setErr(""); setRecovering(false); }} hitSlop={6} style={{ marginTop: 14, alignSelf: "center" }}>
                  <Text style={[styles.switchTxt, th.link]}>{t("common.back")}</Text>
                </Pressable>
              </SceneCard>
            ) : awaitingConfirm ? (
              <SceneCard style={th.card}>
                <Ionicons name="mail-unread" size={40} color={pal.accent} style={{ alignSelf: "center" }} />
                <Text style={[styles.confirmTitle, th.confirmTitle]}>{t("auth.confirm.title")}</Text>
                <Text style={[styles.confirmBody, th.confirmBody]}>
                  {t("auth.confirm.sentTo")}{"\n"}
                  <Text style={{ color: pal.ink, fontWeight: "900" }}>{email.trim()}</Text>
                  {"\n"}{t("auth.confirm.instructions")}
                </Text>
                {!!err && <Text style={[styles.err, th.err]}>{err}</Text>}
                <Pressable onPress={onConfirmedLogin} style={[styles.submit, th.submit]} disabled={busy}>
                  {busy ? <ActivityIndicator color={pal.onAccent} /> : <Text style={[styles.submitTxt, th.submitTxt]}>{t("auth.confirm.cta")}</Text>}
                </Pressable>
                <Pressable onPress={() => setAwaitingConfirm(false)} hitSlop={6} style={{ marginTop: 14, alignSelf: "center" }}>
                  <Text style={[styles.switchTxt, th.link]}>{t("common.back")}</Text>
                </Pressable>
              </SceneCard>
            ) : (
              <SceneCard style={th.card}>
                {Platform.OS === "ios" && AppleAuthentication ? (
                  <>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                      cornerRadius={14}
                      style={styles.appleBtn}
                      onPress={onApple}
                    />
                    <Text style={[styles.orTxt, th.orTxt]}>{t("auth.or")}</Text>
                  </>
                ) : null}
                <View style={[styles.tabs, th.tabs, { flexDirection: dir.row }]}>
                  <Pressable onPress={() => setMode("signup")} style={[styles.tab, mode === "signup" && th.tabOn]}>
                    <Text style={[styles.tabTxt, th.tabTxt, mode === "signup" && th.tabTxtOn]}>{t("auth.tab.signup")}</Text>
                  </Pressable>
                  <Pressable onPress={() => setMode("login")} style={[styles.tab, mode === "login" && th.tabOn]}>
                    <Text style={[styles.tabTxt, th.tabTxt, mode === "login" && th.tabTxtOn]}>{t("auth.tab.login")}</Text>
                  </Pressable>
                </View>

                {mode === "signup" ? (
                  <>
                    <Text style={[styles.label, th.label, { textAlign: dir.textAlign }]}>{t("auth.name")}</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder={t("auth.nameHint")}
                      placeholderTextColor={pal.dim}
                      style={[styles.input, th.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                    />
                  </>
                ) : null}

                <Text style={[styles.label, th.label, { textAlign: dir.textAlign }]}>{t("auth.email")}</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={pal.dim}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={[styles.input, th.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                />
                <Text style={[styles.label, th.label, { textAlign: dir.textAlign }]}>{t("auth.password")}</Text>
                <View style={styles.pwWrap}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t("auth.passwordHint")}
                    placeholderTextColor={pal.dim}
                    secureTextEntry={!showPw}
                    style={[
                      styles.input,
                      th.input,
                      { textAlign: dir.textAlign, writingDirection: dir.writingDirection },
                      dir.isRTL ? { paddingLeft: 46 } : { paddingRight: 46 },
                    ]}
                  />
                  <Pressable
                    onPress={() => setShowPw((v) => !v)}
                    style={[styles.eyeBtn, dir.isRTL ? { left: 6 } : { right: 6 }]}
                    hitSlop={8}
                  >
                    <Ionicons name={showPw ? "eye-outline" : "eye-off-outline"} size={20} color={pal.dim} />
                  </Pressable>
                </View>

                {mode === "login" ? (
                  <Pressable onPress={onForgot} disabled={busy} style={[styles.bigLink, th.bigLink, { marginTop: 12 }, busy && { opacity: 0.55 }]}>
                    {busy ? <ActivityIndicator size="small" color={pal.accent} /> : <Ionicons name="key-outline" size={18} color={pal.accent} />}
                    <Text style={[styles.bigLinkTxt, th.link]}>{t("auth.forgot.link")}</Text>
                  </Pressable>
                ) : null}

                {!!err && <Text style={[styles.err, th.err]}>{err}</Text>}

                <Pressable onPress={onSubmit} style={[styles.submit, th.submit]} disabled={busy || lockSeconds > 0}>
                  {busy ? (
                    <ActivityIndicator color={pal.onAccent} />
                  ) : lockSeconds > 0 ? (
                    <Text style={[styles.submitTxt, th.submitTxt]}>{t("auth.err.locked", { sec: lockSeconds })}</Text>
                  ) : (
                    <Text style={[styles.submitTxt, th.submitTxt]}>{mode === "signup" ? t("auth.cta.signup") : t("auth.cta.login")}</Text>
                  )}
                </Pressable>
              </SceneCard>
            )}
            <VersionTag color={pal.dim} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SceneScreen>
  );
}

// الوحدة الأصلية موجودة من البناء 10؛ في البناءات الأقدم (تحديث هوائي) لا يظهر الزر بدل أن يتعطل التطبيق
let AppleAuthentication: typeof import("expo-apple-authentication") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AppleAuthentication = require("expo-apple-authentication");
} catch {
  AppleAuthentication = null;
}

// ارتفاع مقطع المشهد خلف الشعار
const ART_H = 300;

// التخطيط فقط هنا؛ الألوان من المشهد داخل المكوّن (c)
const styles = StyleSheet.create({
  art: { position: "absolute", top: 0, left: 0, right: 0 },
  appleBtn: { width: "100%", height: 50 },
  orTxt: { fontSize: 12.5, fontWeight: "600", textAlign: "center", marginVertical: 14 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: Spacing.xl },
  logo: { width: 78, height: 78, borderRadius: 24, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  title: { fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 14, marginBottom: 20 },
  tabs: { flexDirection: "row-reverse", borderRadius: Radius.md, padding: 4, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: Radius.sm, alignItems: "center" },
  tabTxt: { fontWeight: "900", fontSize: 15 },
  label: { fontSize: 13, fontWeight: "700", textAlign: "right", marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    textAlign: "right",
  },
  pwWrap: { position: "relative", justifyContent: "center" },
  eyeBtn: { position: "absolute", top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 8 },
  err: { fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 12 },
  submit: { marginTop: 20, borderRadius: Radius.lg, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  submitTxt: { fontSize: 16, fontWeight: "900" },
  switchTxt: { fontSize: 14, fontWeight: "700" },
  // أزرار الاستعادة: كبيرة وواضحة (كانت رابطًا صغيرًا لا يُلاحظ)
  bigLink: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  bigLinkTxt: { fontSize: 16, fontWeight: "800" },
  confirmTitle: { fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 12 },
  confirmBody: { fontSize: 14, lineHeight: 24, textAlign: "center", marginTop: 10 },
});
