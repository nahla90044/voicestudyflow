// app/profile.tsx
// الملف الشخصي: معلومات الحساب + الإحصاءات + إعادة الضبط + الحذف النهائي + الخروج.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../constants/design";
import { deleteAccountPermanently, resetAccountData } from "../lib/account";
import { getDisplayName, getSession, updateName } from "../lib/auth";
import { useDir, useI18n } from "../lib/i18n";
import { getFocusLevel, getUserName, setFocusLevel, setUserName, type FocusLevel } from "../lib/settings";
import { getMyBookCount, getStats, type Stats } from "../lib/stats";

const WARN = "#f5a623"; // لون تحذير لزر إعادة الضبط

const FOCUS_LABELS: { level: FocusLevel; labelKey: string; hintKey: string }[] = [
  { level: 0, labelKey: "more.focus.level0", hintKey: "more.focus.level0Hint" },
  { level: 1, labelKey: "more.focus.level1", hintKey: "more.focus.level1Hint" },
  { level: 2, labelKey: "more.focus.level2", hintKey: "more.focus.level2Hint" },
  { level: 3, labelKey: "more.focus.level3", hintKey: "more.focus.level3Hint" },
];

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createdAt, setCreatedAt] = useState<string | undefined>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [bookCount, setBookCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [focus, setFocus] = useState<FocusLevel>(0);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSession().catch(() => null);
      setEmail(s?.user?.email ?? "");
      setCreatedAt(s?.user?.created_at);
      setDisplayName(await getDisplayName().catch(() => ""));
      setNameInput(await getUserName().catch(() => ""));
      setFocus(await getFocusLevel().catch((): FocusLevel => 0));
      setStats(await getStats().catch(() => null));
      setBookCount(await getMyBookCount().catch(() => 0));
    })();
  }, []);

  async function saveName() {
    setSavingName(true);
    try {
      const n = nameInput.trim();
      await setUserName(n);
      await updateName(n); // يبقى مع الحساب على أي جهاز
      setDisplayName(await getDisplayName().catch(() => ""));
      Alert.alert("✅", t("common.done"));
    } finally {
      setSavingName(false);
    }
  }

  async function pickFocus(level: FocusLevel) {
    setFocus(level);
    await setFocusLevel(level).catch(() => {});
  }

  function confirmReset() {
    Alert.alert(t("profile.resetConfirmTitle"), t("profile.resetConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.reset"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await resetAccountData();
            setStats(await getStats().catch(() => null));
            Alert.alert(t("profile.resetDone"));
          } catch {
            Alert.alert(t("profile.actionFailed"));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function confirmDelete() {
    // تأكيد مزدوج لأنه إجراء لا رجعة فيه
    Alert.alert(t("profile.deleteConfirmTitle"), t("profile.deleteConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.deleteContinue"),
        style: "destructive",
        onPress: () =>
          Alert.alert(t("profile.deleteFinalTitle"), t("profile.deleteFinalBody"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("profile.deleteFinalCta"),
              style: "destructive",
              onPress: async () => {
                setBusy(true);
                try {
                  await deleteAccountPermanently();
                  router.replace("/auth");
                } catch {
                  setBusy(false);
                  Alert.alert(t("profile.actionFailed"));
                }
              },
            },
          ]),
      },
    ]);
  }

  const statCells = [
    { key: "streak", value: stats?.streak ?? 0 },
    { key: "pages", value: stats?.totalPages ?? 0 },
    { key: "minutes", value: stats?.totalMinutes ?? 0 },
    { key: "books", value: bookCount },
  ] as const;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={[styles.header, { flexDirection: dir.row }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("profile.title")}</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* بطاقة الحساب */}
          <View style={styles.card}>
            <View style={[styles.accountRow, { flexDirection: dir.row }]}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={26} color={Palette.neonBlue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.email, { textAlign: dir.textAlign }]} numberOfLines={1}>
                  {displayName || email || "—"}
                </Text>
                {email ? (
                  <Text style={[styles.memberSince, { textAlign: dir.textAlign }]} numberOfLines={1}>
                    {email}
                  </Text>
                ) : null}
                <Text style={[styles.memberSince, { textAlign: dir.textAlign }]}>
                  {t("profile.memberSince", { date: formatDate(createdAt) })}
                </Text>
              </View>
            </View>
          </View>

          {/* الإحصاءات */}
          <Text style={[styles.sectionTitle, { textAlign: dir.textAlign }]}>{t("profile.stats")}</Text>
          <View style={[styles.statsGrid, { flexDirection: dir.row }]}>
            {statCells.map((c) => (
              <View key={c.key} style={styles.statCell}>
                <Text style={styles.statValue}>{c.value}</Text>
                <Text style={styles.statLabel}>{t(`activity.stat.${c.key}`)}</Text>
              </View>
            ))}
          </View>

          {/* الاسم ووضع التركيز */}
          <Text style={[styles.sectionTitle, { textAlign: dir.textAlign }]}>{t("more.name.title")}</Text>
          <View style={styles.card}>
            <Text style={[styles.fieldLabel, { textAlign: dir.textAlign }]}>{t("more.name.label")}</Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              style={[styles.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
              placeholder={t("more.name.placeholder")}
              placeholderTextColor={Palette.textDim}
              maxLength={20}
            />
            <Text style={[styles.fieldLabel, { textAlign: dir.textAlign, marginTop: 14 }]}>{t("more.focus.title")}</Text>
            <Text style={[styles.actionSub, { textAlign: dir.textAlign, marginBottom: 8 }]}>
              {t("more.focus.sub", { name: nameInput.trim() || "..." })}
            </Text>
            <View style={[styles.focusRow, { flexDirection: dir.row }]}>
              {FOCUS_LABELS.map((f) => {
                const active = focus === f.level;
                return (
                  <Pressable key={f.level} onPress={() => pickFocus(f.level)} style={[styles.pill, active && styles.pillOn]}>
                    <Text style={[styles.pillTxt, active && styles.pillTxtOn]}>{t(f.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={saveName} style={styles.saveBtn} disabled={savingName}>
              {savingName ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>{t("more.name.save")}</Text>}
            </Pressable>
          </View>

          {/* الإجراءات */}
          <Text style={[styles.sectionTitle, { textAlign: dir.textAlign }]}>{t("profile.manage")}</Text>

          <Pressable onPress={() => router.push("/two-factor" as never)} style={[styles.action, { flexDirection: dir.row }]} disabled={busy}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Palette.neonCyan} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTxt, { textAlign: dir.textAlign }]}>{t("profile.twofa")}</Text>
              <Text style={[styles.actionSub, { textAlign: dir.textAlign }]}>{t("profile.twofaSub")}</Text>
            </View>
          </Pressable>

          <Pressable onPress={confirmReset} style={[styles.action, styles.warn, { flexDirection: dir.row }]} disabled={busy}>
            <Ionicons name="refresh-outline" size={20} color={WARN} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTxt, { color: WARN, textAlign: dir.textAlign }]}>
                {t("profile.reset")}
              </Text>
              <Text style={[styles.actionSub, { textAlign: dir.textAlign }]}>{t("profile.resetDesc")}</Text>
            </View>
          </Pressable>

          <Pressable onPress={confirmDelete} style={[styles.action, styles.danger, { flexDirection: dir.row }]} disabled={busy}>
            <Ionicons name="trash-outline" size={20} color={Palette.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTxt, { color: Palette.danger, textAlign: dir.textAlign }]}>
                {t("profile.delete")}
              </Text>
              <Text style={[styles.actionSub, { textAlign: dir.textAlign }]}>{t("profile.deleteDesc")}</Text>
            </View>
          </Pressable>

          {busy ? <ActivityIndicator color={Palette.neonCyan} style={{ marginTop: 18 }} /> : null}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: Palette.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
  scroll: { padding: Spacing.lg, gap: 14, paddingBottom: 40 },
  card: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    padding: Spacing.lg,
  },
  accountRow: { alignItems: "center", gap: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Palette.neonBlue + "22",
    borderWidth: 1,
    borderColor: Palette.neonBlue + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  email: { color: Palette.text, fontSize: 16, fontWeight: "900" },
  memberSince: { color: Palette.textMuted, fontSize: 13, marginTop: 3 },
  divider: { height: 1, backgroundColor: Palette.glassBorder, marginVertical: 14 },
  planRow: { alignItems: "center", justifyContent: "space-between" },
  planLabel: { color: Palette.textMuted, fontSize: 14, fontWeight: "700" },
  planValue: { color: Palette.neonViolet, fontSize: 15, fontWeight: "900" },
  sectionTitle: { color: Palette.textMuted, fontSize: 13, fontWeight: "800", marginTop: 6, marginBottom: -2 },
  statsGrid: { flexDirection: "row", gap: 10 },
  statCell: {
    flex: 1,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    paddingVertical: 16,
    alignItems: "center",
  },
  statValue: { color: Palette.text, fontSize: 20, fontWeight: "900" },
  statLabel: { color: Palette.textDim, fontSize: 11, fontWeight: "700", marginTop: 4 },
  action: {
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  warn: { borderColor: WARN + "55" },
  danger: { borderColor: Palette.danger + "55" },
  actionTxt: { flex: 1, color: Palette.text, fontWeight: "900", fontSize: 15 },
  actionSub: { color: Palette.textDim, fontSize: 12, marginTop: 2 },
  fieldLabel: { color: Palette.textMuted, fontSize: 13, fontWeight: "800", marginBottom: 6 },
  input: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: Palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  focusRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  pillOn: { backgroundColor: Palette.neonViolet, borderColor: Palette.neonViolet },
  pillTxt: { color: Palette.textMuted, fontWeight: "800", fontSize: 13 },
  pillTxtOn: { color: "#fff" },
  saveBtn: {
    marginTop: 14,
    backgroundColor: Palette.neonViolet,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  saveTxt: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
