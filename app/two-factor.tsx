// app/two-factor.tsx
// التحقق الثنائي (2FA / TOTP): تفعيل عبر مسح رمز QR بتطبيق مصادقة، أو إيقافه.
import { CodePad } from "../components/brand/code-pad";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { enrollMfa, hasMfaEnabled, listMfaFactors, unenrollMfa, verifyMfa } from "../lib/auth";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";

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
  const { pal } = useScene();
  const insets = useSafeAreaInsets();

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
      Alert.alert(t("common.done"), t("twofa.enabledMsg"));
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

  // ألوان المشهد؛ زر الإيقاف أحمر مقروء على الفاتح والداكن
  const danger = pal.dark ? "#E5525F" : "#C62F3B";

  return (
    <SceneScreen>
      <SceneBanner
        title={t("twofa.title")}
        height={150}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.subtitle, { color: pal.dim, textAlign: dir.textAlign }]}>{t("twofa.subtitle")}</Text>

        {loading ? (
          <ActivityIndicator color={pal.accent} style={{ marginTop: 30 }} />
        ) : enabled ? (
          <SceneCard style={styles.card}>
            <View style={[styles.statusRow, { flexDirection: dir.row }]}>
              <Ionicons name="shield-checkmark" size={22} color={pal.accent} />
              <Text style={[styles.statusTxt, { color: pal.accent }]}>{t("twofa.statusOn")}</Text>
            </View>
            <Pressable onPress={confirmDisable} style={[styles.btn, { backgroundColor: danger }]} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnTxt, { color: "#fff" }]}>{t("twofa.disable")}</Text>}
            </Pressable>
          </SceneCard>
        ) : enroll ? (
          <SceneCard style={styles.card}>
            <Text style={[styles.step, { color: pal.ink, textAlign: dir.textAlign }]}>{t("twofa.step1")}</Text>
            {enroll.svg ? (
              <View style={styles.qrBox}>
                <SvgXml xml={enroll.svg} width={216} height={216} />
              </View>
            ) : null}
            <Text style={[styles.secretLabel, { color: pal.dim, textAlign: dir.textAlign }]}>{t("twofa.secretLabel")}</Text>
            <Text selectable style={[styles.secret, { color: pal.accent, backgroundColor: pal.soft }]}>{enroll.secret}</Text>

            <Text style={[styles.step, { color: pal.ink, textAlign: dir.textAlign, marginTop: 14 }]}>{t("twofa.step2")}</Text>
            <CodePad value={code} onChange={setCode} disabled={busy} />
            <Pressable onPress={confirmEnroll} style={[styles.btn, { backgroundColor: pal.accent }]} disabled={busy || code.length < 6}>
              {busy ? <ActivityIndicator color={pal.onAccent} /> : <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("twofa.verify")}</Text>}
            </Pressable>
          </SceneCard>
        ) : (
          <SceneCard style={styles.card}>
            <View style={[styles.statusRow, { flexDirection: dir.row }]}>
              <Ionicons name="shield-outline" size={22} color={pal.dim} />
              <Text style={[styles.statusTxt, { color: pal.dim }]}>{t("twofa.statusOff")}</Text>
            </View>
            <Pressable onPress={startEnroll} style={[styles.btn, { backgroundColor: pal.accent }]} disabled={busy}>
              {busy ? <ActivityIndicator color={pal.onAccent} /> : <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("twofa.enable")}</Text>}
            </Pressable>
          </SceneCard>
        )}
      </ScrollView>
    </SceneScreen>
  );
}

// التخطيط فقط هنا؛ الألوان من المشهد داخل المكوّن
const styles = StyleSheet.create({
  scroll: { padding: Spacing.lg, paddingTop: 4, gap: 8 },
  subtitle: { fontSize: 14, fontWeight: "600", marginBottom: 8, lineHeight: 22 },
  card: { padding: 18, gap: 12 },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  statusTxt: { fontSize: 17, fontWeight: "900" },
  step: { fontSize: 15, fontWeight: "800", lineHeight: 24 },
  // هامش أبيض واسع (quiet zone) ضروري لقراءة QR، وحوافّ شبه مستقيمة حتى لا تُقصّ زواياه
  qrBox: { backgroundColor: "#fff", borderRadius: 8, padding: 28, alignSelf: "center" },
  secretLabel: { fontSize: 13, fontWeight: "700" },
  secret: { fontSize: 16, fontWeight: "900", letterSpacing: 2, textAlign: "center", borderRadius: 10, paddingVertical: 10 },
  btn: { borderRadius: Radius.md, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  btnTxt: { fontSize: 16, fontWeight: "900" },
});
