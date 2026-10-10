// app/auth.tsx
// شاشة الحساب: إنشاء حساب جديد (ببريد + كلمة مرور وتأكيد بالبريد) أو تسجيل دخول.
// بعد أول دخول مؤكَّد تُرحَّل بيانات الجهاز القديمة تلقائيًا إلى الحساب.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "../components/brand/screen-background";
import { BrandMark } from "../components/brand/logo";
import { Gradients, Palette, Radius, Spacing } from "../constants/design";
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
import { setUserName } from "../lib/settings";
import { ONBOARDING_KEY } from "./onboarding";

type Mode = "signup" | "login";

export default function AuthScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
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
  const [resendIn, setResendIn] = useState(0); // Supabase يسمح برمز كل ٦٠ ثانية
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
        const { needsConfirm } = await signUpEmail(e, password, name);
        await clearUserCache(); // امسح أي بيانات حساب سابق على الجهاز قبل تهيئة الحساب الجديد
        if (name.trim()) await setUserName(name.trim()); // يُحيّا باسمه الذي سجّله (بعد المسح)
        if (needsConfirm) {
          setAwaitingConfirm(true);
        } else {
          await finishLogin();
        }
      } else {
        await signInWithEmail(e, password);
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
      if (/rate ?limit|too many|429/i.test(m)) {
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
    if (resendIn > 0) return;
    setErr("");
    setBusy(true);
    try {
      await sendLoginCode(e);
      setOtpCode("");
      setOtpMode(true);
      setResendIn(60);
    } catch (ex: any) {
      const m = String(ex?.message ?? "");
      setErr(/rate ?limit|too many|429|seconds/i.test(m) ? t("auth.err.rateLimit") : t("auth.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyCode() {
    if (otpCode.length < 6) return;
    setErr("");
    setBusy(true);
    try {
      await verifyLoginCode(email, otpCode);
      await clearUserCache(); // كالدخول العادي: لا تتسرّب بيانات حساب سابق على الجهاز
      setRecovering(true);
      setOtpMode(false);
      // التحقق الثنائي أولًا: تعيين كلمة المرور بعده يتطلّب جلسة aal2
      if (await mfaChallengeRequired().catch(() => false)) {
        setMfaMode(true);
      } else {
        setNewPwMode(true);
      }
    } catch {
      setErr(t("auth.code.invalid"));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveNewPw() {
    if (newPw.length < 6) return setErr(t("auth.err.password"));
    setErr("");
    setBusy(true);
    try {
      await setNewPassword(newPw);
      await finishLogin();
    } catch {
      setErr(t("auth.newPw.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyMfa() {
    if (mfaCode.trim().length < 6) return;
    setErr("");
    setBusy(true);
    try {
      await solveMfaChallenge(mfaCode);
      if (recovering) {
        // جاء من الاستعادة → الجلسة صارت aal2، فتعيين كلمة المرور سيقبل الآن
        setMfaMode(false);
        setNewPwMode(true);
      } else {
        await finishLogin();
      }
    } catch {
      setErr(t("twofa.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.logo}>
              <BrandMark size={78} />
            </View>
            <Text style={styles.title}>VoiceStudyFlow</Text>

            {newPwMode ? (
              <View style={styles.card}>
                <Ionicons name="key" size={40} color={Palette.neonCyan} style={{ alignSelf: "center" }} />
                <Text style={styles.confirmTitle}>{t("auth.newPw.title")}</Text>
                <Text style={styles.confirmBody}>{t("auth.newPw.body")}</Text>
                <View style={[styles.pwWrap, { marginTop: 14 }]}>
                  <TextInput
                    value={newPw}
                    onChangeText={setNewPw}
                    placeholder={t("auth.passwordHint")}
                    placeholderTextColor={Palette.textDim}
                    secureTextEntry={!showPw}
                    autoFocus
                    style={[
                      styles.input,
                      { textAlign: dir.textAlign, writingDirection: dir.writingDirection },
                      dir.isRTL ? { paddingLeft: 46 } : { paddingRight: 46 },
                    ]}
                  />
                  <Pressable
                    onPress={() => setShowPw((v) => !v)}
                    style={[styles.eyeBtn, dir.isRTL ? { left: 6 } : { right: 6 }]}
                    hitSlop={8}
                  >
                    <Ionicons name={showPw ? "eye-outline" : "eye-off-outline"} size={20} color={Palette.textDim} />
                  </Pressable>
                </View>
                {!!err && <Text style={styles.err}>{err}</Text>}
                <Pressable onPress={onSaveNewPw} style={styles.submit} disabled={busy || newPw.length < 6}>
                  <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>{t("auth.newPw.cta")}</Text>}
                  </LinearGradient>
                </Pressable>
                {/* التخطّي آمن: يمكن الدخول برمز البريد في أي وقت لاحق */}
                <Pressable onPress={finishLogin} hitSlop={6} style={{ marginTop: 14, alignSelf: "center" }} disabled={busy}>
                  <Text style={styles.switchTxt}>{t("auth.newPw.skip")}</Text>
                </Pressable>
              </View>
            ) : otpMode ? (
              <View style={styles.card}>
                <Ionicons name="mail-open" size={40} color={Palette.neonCyan} style={{ alignSelf: "center" }} />
                <Text style={styles.confirmTitle}>{t("auth.code.title")}</Text>
                <Text style={styles.confirmBody}>{t("auth.code.body", { email: email.trim() })}</Text>
                <TextInput
                  value={otpCode}
                  onChangeText={(v) => setOtpCode(v.replace(/[^0-9]/g, "").slice(0, 8))}
                  placeholder="••••••"
                  placeholderTextColor={Palette.textDim}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={8}
                  style={[styles.input, { textAlign: "center", letterSpacing: 6, marginTop: 14 }]}
                />
                {!!err && <Text style={styles.err}>{err}</Text>}
                <Pressable onPress={onVerifyCode} style={styles.submit} disabled={busy || otpCode.length < 6}>
                  <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>{t("auth.code.cta")}</Text>}
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={onForgot} hitSlop={6} style={{ marginTop: 14, alignSelf: "center" }} disabled={busy || resendIn > 0}>
                  <Text style={[styles.switchTxt, resendIn > 0 && { color: Palette.textDim }]}>
                    {resendIn > 0 ? t("auth.code.resendIn", { sec: resendIn }) : t("auth.code.resend")}
                  </Text>
                </Pressable>
                <Pressable onPress={() => { setOtpMode(false); setOtpCode(""); setErr(""); }} hitSlop={6} style={{ marginTop: 10, alignSelf: "center" }}>
                  <Text style={styles.switchTxt}>{t("common.back")}</Text>
                </Pressable>
              </View>
            ) : mfaMode ? (
              <View style={styles.card}>
                <Ionicons name="shield-checkmark" size={40} color={Palette.neonCyan} style={{ alignSelf: "center" }} />
                <Text style={styles.confirmTitle}>{t("twofa.challengeTitle")}</Text>
                <Text style={styles.confirmBody}>{t("twofa.challengeBody")}</Text>
                <TextInput
                  value={mfaCode}
                  onChangeText={(v) => setMfaCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder={t("twofa.codePlaceholder")}
                  placeholderTextColor={Palette.textDim}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={[styles.input, { textAlign: "center", letterSpacing: 6, marginTop: 14 }]}
                />
                {!!err && <Text style={styles.err}>{err}</Text>}
                <Pressable onPress={onVerifyMfa} style={styles.submit} disabled={busy || mfaCode.length < 6}>
                  <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>{t("twofa.challengeCta")}</Text>}
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={() => { setMfaMode(false); setMfaCode(""); setErr(""); setRecovering(false); }} hitSlop={6} style={{ marginTop: 14, alignSelf: "center" }}>
                  <Text style={styles.switchTxt}>{t("common.back")}</Text>
                </Pressable>
              </View>
            ) : awaitingConfirm ? (
              <View style={styles.card}>
                <Ionicons name="mail-unread" size={40} color={Palette.neonCyan} style={{ alignSelf: "center" }} />
                <Text style={styles.confirmTitle}>{t("auth.confirm.title")}</Text>
                <Text style={styles.confirmBody}>
                  {t("auth.confirm.sentTo")}{"\n"}
                  <Text style={{ color: Palette.text, fontWeight: "900" }}>{email.trim()}</Text>
                  {"\n"}{t("auth.confirm.instructions")}
                </Text>
                {!!err && <Text style={styles.err}>{err}</Text>}
                <Pressable onPress={onConfirmedLogin} style={styles.submit} disabled={busy}>
                  <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>{t("auth.confirm.cta")}</Text>}
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={() => setAwaitingConfirm(false)} hitSlop={6} style={{ marginTop: 14, alignSelf: "center" }}>
                  <Text style={styles.switchTxt}>{t("common.back")}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.card}>
                {Platform.OS === "ios" && AppleAuthentication ? (
                  <>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                      cornerRadius={14}
                      style={styles.appleBtn}
                      onPress={onApple}
                    />
                    <Text style={styles.orTxt}>{t("auth.or")}</Text>
                  </>
                ) : null}
                <View style={[styles.tabs, { flexDirection: dir.row }]}>
                  <Pressable onPress={() => setMode("signup")} style={[styles.tab, mode === "signup" && styles.tabOn]}>
                    <Text style={[styles.tabTxt, mode === "signup" && styles.tabTxtOn]}>{t("auth.tab.signup")}</Text>
                  </Pressable>
                  <Pressable onPress={() => setMode("login")} style={[styles.tab, mode === "login" && styles.tabOn]}>
                    <Text style={[styles.tabTxt, mode === "login" && styles.tabTxtOn]}>{t("auth.tab.login")}</Text>
                  </Pressable>
                </View>

                {mode === "signup" ? (
                  <>
                    <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("auth.name")}</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder={t("auth.nameHint")}
                      placeholderTextColor={Palette.textDim}
                      style={[styles.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                    />
                  </>
                ) : null}

                <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("auth.email")}</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={Palette.textDim}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={[styles.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                />
                <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("auth.password")}</Text>
                <View style={styles.pwWrap}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t("auth.passwordHint")}
                    placeholderTextColor={Palette.textDim}
                    secureTextEntry={!showPw}
                    style={[
                      styles.input,
                      { textAlign: dir.textAlign, writingDirection: dir.writingDirection },
                      dir.isRTL ? { paddingLeft: 46 } : { paddingRight: 46 },
                    ]}
                  />
                  <Pressable
                    onPress={() => setShowPw((v) => !v)}
                    style={[styles.eyeBtn, dir.isRTL ? { left: 6 } : { right: 6 }]}
                    hitSlop={8}
                  >
                    <Ionicons name={showPw ? "eye-outline" : "eye-off-outline"} size={20} color={Palette.textDim} />
                  </Pressable>
                </View>

                {mode === "login" ? (
                  <Pressable onPress={onForgot} hitSlop={6} style={{ alignSelf: dir.isRTL ? "flex-start" : "flex-end", marginTop: 8 }}>
                    <Text style={styles.forgotTxt}>{t("auth.forgot.link")}</Text>
                  </Pressable>
                ) : null}

                {!!err && <Text style={styles.err}>{err}</Text>}

                <Pressable onPress={onSubmit} style={styles.submit} disabled={busy || lockSeconds > 0}>
                  <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : lockSeconds > 0 ? (
                      <Text style={styles.submitTxt}>{t("auth.err.locked", { sec: lockSeconds })}</Text>
                    ) : (
                      <Text style={styles.submitTxt}>{mode === "signup" ? t("auth.cta.signup") : t("auth.cta.login")}</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
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

const styles = StyleSheet.create({
  appleBtn: { width: "100%", height: 50 },
  orTxt: { color: Palette.textDim, fontSize: 12.5, fontWeight: "600", textAlign: "center", marginVertical: 14 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: Spacing.xl },
  logo: { width: 78, height: 78, borderRadius: 24, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  title: { color: Palette.text, fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 14, marginBottom: 20 },
  card: {
    backgroundColor: Palette.bgElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.xl,
  },
  tabs: { flexDirection: "row-reverse", backgroundColor: Palette.surface, borderRadius: Radius.md, padding: 4, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: Radius.sm, alignItems: "center" },
  tabOn: { backgroundColor: Palette.neonViolet },
  tabTxt: { color: Palette.textMuted, fontWeight: "900", fontSize: 15 },
  tabTxtOn: { color: "#fff" },
  label: { color: Palette.textMuted, fontSize: 13, fontWeight: "700", textAlign: "right", marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Palette.text,
    fontSize: 16,
    textAlign: "right",
  },
  pwWrap: { position: "relative", justifyContent: "center" },
  eyeBtn: { position: "absolute", top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 8 },
  err: { color: "#ff8a8a", fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 12 },
  submit: { marginTop: 20, borderRadius: Radius.lg, overflow: "hidden" },
  submitGrad: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  submitTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
  note: { color: Palette.textDim, fontSize: 12, lineHeight: 20, textAlign: "center", marginTop: 16 },
  switchTxt: { color: Palette.neonCyan, fontSize: 14, fontWeight: "700" },
  forgotTxt: { color: Palette.neonCyan, fontSize: 13, fontWeight: "700" },
  confirmTitle: { color: Palette.text, fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 12 },
  confirmBody: { color: Palette.textMuted, fontSize: 14, lineHeight: 24, textAlign: "center", marginTop: 10 },
});
