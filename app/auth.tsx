// app/auth.tsx
// شاشة الحساب: إنشاء حساب جديد (ببريد + كلمة مرور وتأكيد بالبريد) أو تسجيل دخول.
// بعد أول دخول مؤكَّد تُرحَّل بيانات الجهاز القديمة تلقائيًا إلى الحساب.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "../components/brand/screen-background";
import { Gradients, Palette, Radius, Spacing } from "../constants/design";
import { claimDeviceData, signInWithEmail, signUpEmail } from "../lib/auth";
import { useDir, useI18n } from "../lib/i18n";
import { ONBOARDING_KEY } from "./onboarding";

type Mode = "signup" | "login";

export default function AuthScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  async function finishLogin() {
    await claimDeviceData().catch(() => null);
    // أول دخول: نعرض الجولة التعريفية، وإلا ندخل التطبيق مباشرة
    const seen = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
    router.replace(seen === "1" ? "/" : "/onboarding");
  }

  async function onSubmit() {
    setErr("");
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) return setErr(t("auth.err.email"));
    if (password.length < 6) return setErr(t("auth.err.password"));
    setBusy(true);
    try {
      if (mode === "signup") {
        const { needsConfirm } = await signUpEmail(e, password);
        if (needsConfirm) {
          setAwaitingConfirm(true);
        } else {
          await finishLogin();
        }
      } else {
        await signInWithEmail(e, password);
        await finishLogin();
      }
    } catch (ex: any) {
      const m = String(ex?.message ?? "");
      if (/already registered|exists/i.test(m)) setErr(t("auth.err.exists"));
      else if (/invalid login|credentials/i.test(m)) setErr(t("auth.err.credentials"));
      else if (/not confirmed|confirm/i.test(m)) setErr(t("auth.err.notConfirmed"));
      else setErr(m || t("auth.err.generic"));
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

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
              <Ionicons name="headset" size={38} color="#fff" />
            </LinearGradient>
            <Text style={styles.title}>VoiceStudyFlow</Text>

            {awaitingConfirm ? (
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
                <View style={[styles.tabs, { flexDirection: dir.row }]}>
                  <Pressable onPress={() => setMode("signup")} style={[styles.tab, mode === "signup" && styles.tabOn]}>
                    <Text style={[styles.tabTxt, mode === "signup" && styles.tabTxtOn]}>{t("auth.tab.signup")}</Text>
                  </Pressable>
                  <Pressable onPress={() => setMode("login")} style={[styles.tab, mode === "login" && styles.tabOn]}>
                    <Text style={[styles.tabTxt, mode === "login" && styles.tabTxtOn]}>{t("auth.tab.login")}</Text>
                  </Pressable>
                </View>

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
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t("auth.passwordHint")}
                  placeholderTextColor={Palette.textDim}
                  secureTextEntry
                  style={[styles.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                />

                {!!err && <Text style={styles.err}>{err}</Text>}

                <Pressable onPress={onSubmit} style={styles.submit} disabled={busy}>
                  <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitTxt}>{mode === "signup" ? t("auth.cta.signup") : t("auth.cta.login")}</Text>
                    )}
                  </LinearGradient>
                </Pressable>

                <Text style={styles.note}>{t("auth.note")}</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
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
  err: { color: "#ff8a8a", fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 12 },
  submit: { marginTop: 20, borderRadius: Radius.lg, overflow: "hidden" },
  submitGrad: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  submitTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
  note: { color: Palette.textDim, fontSize: 12, lineHeight: 20, textAlign: "center", marginTop: 16 },
  switchTxt: { color: Palette.neonCyan, fontSize: 14, fontWeight: "700" },
  confirmTitle: { color: Palette.text, fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 12 },
  confirmBody: { color: Palette.textMuted, fontSize: 14, lineHeight: 24, textAlign: "center", marginTop: 10 },
});
