// app/two-factor.tsx
// التحقق الثنائي (2FA / TOTP): تفعيل عبر مسح رمز QR بتطبيق مصادقة، أو إيقافه.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { ScreenBackground } from "../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../constants/design";
import { enrollMfa, hasMfaEnabled, listMfaFactors, unenrollMfa, verifyMfa } from "../lib/auth";
import { useDir, useI18n } from "../lib/i18n";

// يحوّل قيمة qr_code من Supabase إلى نص SVG صالح للعرض
function toSvgXml(qr: string): string {
  if (qr.startsWith("data:")) {
    const payload = qr.slice(qr.indexOf(",") + 1);
    if (!qr.includes("base64")) {
      try {
        return decodeURIComponent(payload);
      } catch {
        return payload;
      }
    }
    return ""; // base64 غير مدعوم — نكتفي بالمفتاح النصي
  }
  return qr;
}

export default function TwoFactorScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enroll, setEnroll] = useState<{ factorId: string; svg: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    (async () => {
      setEnabled(await hasMfaEnabled().catch(() => false));
      setLoading(false);
    })();
  }, []);

  async function startEnroll() {
    setBusy(true);
    try {
      const r = await enrollMfa();
      setEnroll({ factorId: r.factorId, svg: toSvgXml(r.qrSvg), secret: r.secret });
      setCode("");
    } catch (e: any) {
      Alert.alert(t("addBook.alert.errorTitle"), e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!enroll || code.trim().length < 6) return;
    setBusy(true);
    try {
      await verifyMfa(enroll.factorId, code);
      setEnabled(true);
      setEnroll(null);
      setCode("");
      Alert.alert("✅", t("twofa.enabledMsg"));
    } catch {
      Alert.alert(t("addBook.alert.warnTitle"), t("twofa.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  function confirmDisable() {
    Alert.alert(t("twofa.title"), t("twofa.disableConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("twofa.disable"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const factors = await listMfaFactors();
            for (const f of factors) await unenrollMfa(f.id).catch(() => {});
            setEnabled(false);
            Alert.alert(t("twofa.disabledMsg"));
          } catch (e: any) {
            Alert.alert(t("addBook.alert.errorTitle"), e?.message ?? String(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={[styles.head, { flexDirection: dir.row }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={24} color={Palette.text} />
          </Pressable>
          <Text style={styles.title}>{t("twofa.title")}</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.subtitle, { textAlign: dir.textAlign }]}>{t("twofa.subtitle")}</Text>

          {loading ? (
            <ActivityIndicator color={Palette.neonCyan} style={{ marginTop: 30 }} />
          ) : enabled ? (
            <View style={styles.card}>
              <View style={[styles.statusRow, { flexDirection: dir.row }]}>
                <Ionicons name="shield-checkmark" size={22} color={Palette.neonCyan} />
                <Text style={styles.statusOn}>{t("twofa.statusOn")}</Text>
              </View>
              <Pressable onPress={confirmDisable} style={[styles.btn, styles.btnDanger]} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>{t("twofa.disable")}</Text>}
              </Pressable>
            </View>
          ) : enroll ? (
            <View style={styles.card}>
              <Text style={[styles.step, { textAlign: dir.textAlign }]}>{t("twofa.step1")}</Text>
              {enroll.svg ? (
                <View style={styles.qrBox}>
                  <SvgXml xml={enroll.svg} width={216} height={216} />
                </View>
              ) : null}
              <Text style={[styles.secretLabel, { textAlign: dir.textAlign }]}>{t("twofa.secretLabel")}</Text>
              <Text selectable style={styles.secret}>{enroll.secret}</Text>

              <Text style={[styles.step, { textAlign: dir.textAlign, marginTop: 14 }]}>{t("twofa.step2")}</Text>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder={t("twofa.codePlaceholder")}
                placeholderTextColor={Palette.textDim}
                keyboardType="number-pad"
                style={styles.input}
                maxLength={6}
              />
              <Pressable onPress={confirmEnroll} style={[styles.btn, styles.btnPrimary]} disabled={busy || code.length < 6}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>{t("twofa.verify")}</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={[styles.statusRow, { flexDirection: dir.row }]}>
                <Ionicons name="shield-outline" size={22} color={Palette.textMuted} />
                <Text style={styles.statusOff}>{t("twofa.statusOff")}</Text>
              </View>
              <Pressable onPress={startEnroll} style={[styles.btn, styles.btnPrimary]} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>{t("twofa.enable")}</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg, paddingTop: 6 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder },
  title: { color: Palette.text, fontSize: 20, fontWeight: "900" },
  scroll: { padding: Spacing.lg, gap: 8 },
  subtitle: { color: Palette.textDim, fontSize: 14, fontWeight: "600", marginBottom: 8, lineHeight: 22 },
  card: { backgroundColor: Palette.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Palette.border, padding: 18, gap: 12 },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  statusOn: { color: Palette.neonCyan, fontSize: 17, fontWeight: "900" },
  statusOff: { color: Palette.textMuted, fontSize: 17, fontWeight: "900" },
  step: { color: Palette.text, fontSize: 15, fontWeight: "800", lineHeight: 24 },
  // هامش أبيض واسع (quiet zone) ضروري لقراءة QR، وحوافّ شبه مستقيمة حتى لا تُقصّ زواياه
  qrBox: { backgroundColor: "#fff", borderRadius: 8, padding: 28, alignSelf: "center" },
  secretLabel: { color: Palette.textDim, fontSize: 13, fontWeight: "700" },
  secret: { color: Palette.neonCyan, fontSize: 16, fontWeight: "900", letterSpacing: 2, textAlign: "center", backgroundColor: Palette.surface, borderRadius: 10, paddingVertical: 10 },
  input: { backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder, borderRadius: Radius.md, paddingVertical: 13, paddingHorizontal: 14, color: Palette.text, fontSize: 20, fontWeight: "900", textAlign: "center", letterSpacing: 6 },
  btn: { borderRadius: Radius.md, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: Palette.neonViolet },
  btnDanger: { backgroundColor: "#ff5d6c" },
  btnTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
