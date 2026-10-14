// app/profile.tsx
// الملف الشخصي: معلومات الحساب + الإحصاءات + إعادة الضبط + الحذف النهائي + الخروج.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { SubscriptionCard } from "../components/brand/subscription-card";
import { VersionTag } from "../components/brand/version-tag";
import { Radius, Spacing } from "../constants/design";
import { deleteAccountPermanently, resetAccountData } from "../lib/account";
import { getDisplayName, getSession, updateName } from "../lib/auth";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { getFocusLevel, getUserName, setFocusLevel, setUserName, type FocusLevel } from "../lib/settings";
import { getMyBookCount, getStats, type Stats } from "../lib/stats";


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
  const { pal } = useScene();
  // ألوان التحذير والحذف: مقروءة على الحديقة الفاتحة وعلى المشاهد الداكنة
  const WARN = pal.dark ? "#F6B880" : "#A8641E";
  const DANGER = pal.dark ? "#FF8C96" : "#B83A44";

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
    <SceneScreen>
      <SceneBanner
        title={t("profile.title")}
        height={150}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("common.close")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* بطاقة الحساب */}
        <SceneCard>
          <View style={[styles.accountRow, { flexDirection: dir.row }]}>
            <View style={[styles.avatar, { backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}>
              <Ionicons name="person" size={26} color={pal.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.email, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                {displayName || email || "—"}
              </Text>
              {email ? (
                <Text style={[styles.memberSince, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                  {email}
                </Text>
              ) : null}
              <Text style={[styles.memberSince, { color: pal.dim, textAlign: dir.textAlign }]}>
                {t("profile.memberSince", { date: formatDate(createdAt) })}
              </Text>
            </View>
          </View>
        </SceneCard>

        {/* الإحصاءات */}
        <Text style={[styles.sectionTitle, { color: pal.dim, textAlign: dir.textAlign }]}>{t("profile.stats")}</Text>
        <View style={[styles.statsGrid, { flexDirection: dir.row }]}>
          {statCells.map((c) => (
            <SceneCard key={c.key} padded={false} style={styles.statCell}>
              <Text style={[styles.statValue, { color: pal.accent }]}>{c.value}</Text>
              <Text style={[styles.statLabel, { color: pal.dim }]} numberOfLines={1}>
                {t(`activity.stat.${c.key}`)}
              </Text>
            </SceneCard>
          ))}
        </View>

        {/* الاشتراك والاستهلاك */}
        <Text style={[styles.sectionTitle, { color: pal.dim, textAlign: dir.textAlign }]}>{t("sub.title")}</Text>
        <SubscriptionCard />

        {/* الاسم ووضع التركيز */}
        <Text style={[styles.sectionTitle, { color: pal.dim, textAlign: dir.textAlign }]}>{t("more.name.title")}</Text>
        <SceneCard>
          <Text style={[styles.fieldLabel, { color: pal.ink, textAlign: dir.textAlign }]}>{t("more.name.label")}</Text>
          <TextInput
            value={nameInput}
            onChangeText={setNameInput}
            style={[
              styles.input,
              { backgroundColor: pal.dark ? pal.soft : pal.bg, borderColor: pal.cardBorder, color: pal.ink },
              { textAlign: dir.textAlign, writingDirection: dir.writingDirection },
            ]}
            placeholder={t("more.name.placeholder")}
            placeholderTextColor={pal.dim}
            selectionColor={pal.accent}
            maxLength={20}
          />
          <Text style={[styles.fieldLabel, { color: pal.ink, textAlign: dir.textAlign, marginTop: 14 }]}>{t("more.focus.title")}</Text>
          <Text style={[styles.actionSub, { color: pal.dim, textAlign: dir.textAlign, marginBottom: 8 }]}>
            {t("more.focus.sub", { name: nameInput.trim() || "..." })}
          </Text>
          <View style={[styles.focusRow, { flexDirection: dir.row }]}>
            {FOCUS_LABELS.map((f) => {
              const active = focus === f.level;
              return (
                <Pressable
                  key={f.level}
                  onPress={() => pickFocus(f.level)}
                  style={[
                    styles.pill,
                    { backgroundColor: pal.soft, borderColor: pal.cardBorder },
                    active && { backgroundColor: pal.accent, borderColor: pal.accent },
                  ]}
                >
                  <Text style={[styles.pillTxt, { color: active ? pal.onAccent : pal.ink }]}>{t(f.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={saveName} style={[styles.saveBtn, { backgroundColor: pal.accent }]} disabled={savingName}>
            {savingName ? (
              <ActivityIndicator color={pal.onAccent} />
            ) : (
              <Text style={[styles.saveTxt, { color: pal.onAccent }]}>{t("more.name.save")}</Text>
            )}
          </Pressable>
        </SceneCard>

        {/* الإجراءات */}
        <Text style={[styles.sectionTitle, { color: pal.dim, textAlign: dir.textAlign }]}>{t("profile.manage")}</Text>

        <Pressable onPress={() => router.push("/two-factor" as never)} disabled={busy}>
          <SceneCard style={[styles.action, { flexDirection: dir.row }]}>
            <View style={[styles.actionIcon, { backgroundColor: pal.soft }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={pal.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{t("profile.twofa")}</Text>
              <Text style={[styles.actionSub, { color: pal.dim, textAlign: dir.textAlign }]}>{t("profile.twofaSub")}</Text>
            </View>
          </SceneCard>
        </Pressable>

        <Pressable onPress={confirmReset} disabled={busy}>
          <SceneCard style={[styles.action, { flexDirection: dir.row, borderColor: WARN + "66" }]}>
            <View style={[styles.actionIcon, { backgroundColor: WARN + "1F" }]}>
              <Ionicons name="refresh-outline" size={20} color={WARN} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTxt, { color: WARN, textAlign: dir.textAlign }]}>{t("profile.reset")}</Text>
              <Text style={[styles.actionSub, { color: pal.dim, textAlign: dir.textAlign }]}>{t("profile.resetDesc")}</Text>
            </View>
          </SceneCard>
        </Pressable>

        <Pressable onPress={confirmDelete} disabled={busy}>
          <SceneCard style={[styles.action, { flexDirection: dir.row, borderColor: DANGER + "66" }]}>
            <View style={[styles.actionIcon, { backgroundColor: DANGER + "1F" }]}>
              <Ionicons name="trash-outline" size={20} color={DANGER} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTxt, { color: DANGER, textAlign: dir.textAlign }]}>{t("profile.delete")}</Text>
              <Text style={[styles.actionSub, { color: pal.dim, textAlign: dir.textAlign }]}>{t("profile.deleteDesc")}</Text>
            </View>
          </SceneCard>
        </Pressable>

        {busy ? <ActivityIndicator color={pal.accent} style={{ marginTop: 18 }} /> : null}
        <VersionTag color={pal.dim} />
      </ScrollView>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 6, gap: 14, paddingBottom: 40 },
  accountRow: { alignItems: "center", gap: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  email: { fontSize: 17, fontWeight: "900" },
  memberSince: { fontSize: 13, marginTop: 3, fontWeight: "600" },
  sectionTitle: { fontSize: 13, fontWeight: "800", marginTop: 6, marginBottom: -2 },
  statsGrid: { gap: 10 },
  statCell: { flex: 1, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 4, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  action: { alignItems: "center", gap: 12, borderRadius: 22 },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  actionTxt: { fontWeight: "900", fontSize: 15 },
  actionSub: { fontSize: 12, marginTop: 2, fontWeight: "600" },
  fieldLabel: { fontSize: 13, fontWeight: "800", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
  },
  focusRow: { gap: 8, flexWrap: "wrap" },
  pill: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillTxt: { fontWeight: "800", fontSize: 13 },
  saveBtn: {
    marginTop: 14,
    borderRadius: 18,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveTxt: { fontWeight: "900", fontSize: 15 },
});
