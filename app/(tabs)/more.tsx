// app/(tabs)/more.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// أوقات التذكير المتاحة (٥ صباحًا حتى ١١ مساءً)
const REMINDER_HOURS = Array.from({ length: 19 }, (_, i) => i + 5);
import { SafeAreaView } from "react-native-safe-area-context";
import { GlassCard } from "../../components/brand/glass-card";
import { LanguageSwitcher } from "../../components/brand/language-switcher";
import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Gradients, Palette } from "../../constants/design";
import { THEMES } from "../../constants/themes";
import { useTheme } from "../../lib/themeContext";
import { useDir, useI18n } from "../../lib/i18n";
import { LinearGradient } from "expo-linear-gradient";
import { getReminders, sendTestNotification, setReminders } from "../../lib/notify";
import { getMinutesPerPage, setMinutesPerPage } from "../../lib/settings";

import {
  audioCacheSize,
  clearAudioCache,
  isHumanVoiceEnabled,
  speakText,
  stopSpeaking,
} from "../../lib/voice";
import { ONBOARDING_KEY } from "../onboarding";

const ACC_ID = "kbd-more";

export default function MoreScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { themeId, setThemeId } = useTheme();
  const [minPerPage, setMinPerPageState] = useState("1.5");
  const [loading, setLoading] = useState(true);
  const [kbVisible, setKbVisible] = useState(false);

  // إعدادات الصوت
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [gender, setGender] = useState<"male" | "female">("female");

  // التنبيه اليومي
  const [reminderHours, setReminderHours] = useState<number[]>([]);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  // تخزين الصوت
  const [cacheBytes, setCacheBytes] = useState(0);

  function refreshCacheSize() {
    setCacheBytes(audioCacheSize());
  }

  function clearCache() {
    clearAudioCache();
    refreshCacheSize();
    Alert.alert(t("common.done"), t("more.alert.cacheCleared"));
  }

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  useEffect(() => {
    (async () => {
      const v = await getMinutesPerPage();
      setMinPerPageState(String(v));
      setReminderHours(await getReminders());
      refreshCacheSize();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const s1 = Keyboard.addListener("keyboardDidShow", () => setKbVisible(true));
    const s2 = Keyboard.addListener("keyboardDidHide", () => setKbVisible(false));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  async function save() {
    const v = Number(minPerPage);
    if (!Number.isFinite(v) || v <= 0) {
      Alert.alert(t("more.alert.warnTitle"), t("more.alert.invalidNumber"));
      return;
    }
    await setMinutesPerPage(v);
    Keyboard.dismiss();
    Alert.alert("✅", t("more.alert.settingSaved"));
  }

  async function replayTutorial() {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    router.replace("/onboarding");
  }

  // يطبّق قائمة التذكيرات على النظام (جدولة) ويحفظها
  async function applyReminders(hours: number[]) {
    const uniq = [...new Set(hours)].sort((a, b) => a - b);
    const ok = await setReminders(uniq);
    if (ok) setReminderHours(uniq);
    else Alert.alert(t("more.notify.title"), t("more.notify.permDenied"));
    return ok;
  }

  async function addReminder(h: number) {
    setTimePickerOpen(false);
    if (reminderHours.includes(h)) return; // موجود مسبقًا
    const ok = await applyReminders([...reminderHours, h]);
    if (ok) Alert.alert("✅", t("more.reminder.added", { time: fmtHour(h) }));
  }

  async function removeReminder(h: number) {
    await applyReminders(reminderHours.filter((x) => x !== h));
  }

  async function testNotification() {
    try {
      const ok = await sendTestNotification();
      if (ok) {
        Alert.alert(t("more.notify.testSentTitle"), t("more.notify.testSentBody"));
      } else {
        Alert.alert(t("more.notify.title"), t("more.notify.permDeniedF"));
      }
    } catch (e: any) {
      Alert.alert(t("more.notify.sendFailed"), e?.message ?? String(e));
    }
  }

  function fmtHour(h: number) {
    const period = h < 12 ? t("more.time.am") : t("more.time.pm");
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh} ${period}`;
  }

  function testVoice() {
    const text =
      lang === "ar"
        ? gender === "male"
          ? "مرحبًا، هذا اختبار للصوت الرجالي. يمكنك اختيار اللغة ونوع الصوت."
          : "مرحبًا، هذا اختبار للصوت النسائي. يمكنك اختيار اللغة ونوع الصوت."
        : gender === "male"
          ? "Hello, this is a male voice test. You can choose the language and the voice."
          : "Hello, this is a female voice test. You can choose the language and the voice.";

    speakText(text, { lang, gender, rate: 0.95 });
  }

  const accessory = useMemo(() => {
    if (Platform.OS !== "ios") return null;
    return (
      <InputAccessoryView nativeID={ACC_ID}>
        <View style={styles.accessory}>
          <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryBtn}>
            <Text style={styles.accessoryTxt}>{t("common.done")}</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    );
  }, [t]);

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <ScreenHeader
          icon="options"
          title={t("more.header.title")}
          subtitle={t("more.header.subtitle")}
          color={Palette.neonPink}
          style={{ marginHorizontal: 0 }}
        />

        {/* اللغة */}
        <GlassCard contentStyle={styles.cardC} glow={Palette.neonBlue}>
          <LanguageSwitcher />
        </GlassCard>

        {/* الثيمات */}
        <GlassCard contentStyle={styles.cardC} glow={Palette.neonPink}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("more.theme.title")}</Text>
          <Text style={[styles.help, { textAlign: dir.textAlign }]}>{t("more.theme.help")}</Text>
          <View style={[styles.themeGrid, { flexDirection: dir.row }]}>
            {THEMES.map((theme) => {
              const active = theme.id === themeId;
              return (
                <Pressable
                  key={theme.id}
                  onPress={() => setThemeId(theme.id)}
                  style={[styles.themeCell, active && { borderColor: theme.accent, borderWidth: 2 }]}
                >
                  <LinearGradient
                    colors={theme.bg}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.themeSwatch, { flexDirection: dir.row }]}
                  >
                    <View style={[styles.themeDot, { backgroundColor: theme.glow1 }]} />
                    <View style={[styles.themeDot, { backgroundColor: theme.glow2 }]} />
                    <View style={[styles.themeDot, { backgroundColor: theme.accent }]} />
                  </LinearGradient>
                  <Text style={[styles.themeName, active && { color: theme.accent }]}>
                    {theme.emoji} {t(`themes.${theme.id}`)}
                  </Text>
                  {active ? <Text style={[styles.themeActive, { color: theme.accent }]}>{t("more.theme.active")}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {/* إعدادات الخطة */}
        <GlassCard contentStyle={styles.cardC} glow={Palette.neonBlue}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("more.plan.settingsTitle")}</Text>
          <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("more.plan.minPerPageLabel")}</Text>

          <TextInput
            value={minPerPage}
            onChangeText={setMinPerPageState}
            keyboardType="decimal-pad"
            editable={!loading}
            style={[styles.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
            placeholder={t("more.plan.minPerPagePlaceholder")}
            placeholderTextColor="#8aa0b8"
            inputAccessoryViewID={Platform.OS === "ios" ? ACC_ID : undefined}
          />

          <Text style={[styles.help, { textAlign: dir.textAlign }]}>
            {t("more.plan.minPerPageHelp")}
          </Text>

          <GradientButton title={t("common.save")} icon="save" onPress={save} loading={loading} />

          {kbVisible ? (
            <GradientButton
              title={t("more.hideKeyboard")}
              variant="ghost"
              onPress={() => Keyboard.dismiss()}
            />
          ) : null}
        </GlassCard>

        {/* إعدادات الصوت */}
        <GlassCard contentStyle={styles.cardC} glow={Palette.neonCyan}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("more.voice.title")}</Text>

          <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("more.voice.langLabel")}</Text>
          <View style={[styles.row, { flexDirection: dir.row }]}>
            <Pressable
              onPress={() => setLang("ar")}
              style={[styles.pill, lang === "ar" && styles.pillActive]}
            >
              <Text style={[styles.pillTxt, lang === "ar" && styles.pillTxtActive]}>{t("more.voice.langAr")}</Text>
            </Pressable>

            <Pressable
              onPress={() => setLang("en")}
              style={[styles.pill, lang === "en" && styles.pillActive]}
            >
              <Text style={[styles.pillTxt, lang === "en" && styles.pillTxtActive]}>{t("more.voice.langEn")}</Text>
            </Pressable>
          </View>

          <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("more.voice.voiceLabel")}</Text>
          <View style={[styles.row, { flexDirection: dir.row }]}>
            <Pressable
              onPress={() => setGender("female")}
              style={[styles.pill, gender === "female" && styles.pillActiveGreen]}
            >
              <Text style={[styles.pillTxt, gender === "female" && styles.pillTxtActive]}>{t("more.voice.female")}</Text>
            </Pressable>

            <Pressable
              onPress={() => setGender("male")}
              style={[styles.pill, gender === "male" && styles.pillActiveGreen]}
            >
              <Text style={[styles.pillTxt, gender === "male" && styles.pillTxtActive]}>{t("more.voice.male")}</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: dir.row, gap: 10 }}>
            <GradientButton
              title={t("more.voice.testPlay")}
              icon="play"
              colors={Gradients.success}
              onPress={testVoice}
              style={{ flex: 1 }}
            />
            <GradientButton
              title={t("more.voice.stop")}
              icon="stop"
              variant="ghost"
              onPress={stopSpeaking}
              style={{ flex: 0.9 }}
            />
          </View>

          <Text style={[styles.help, { textAlign: dir.textAlign }]}>
            {isHumanVoiceEnabled()
              ? t("more.voice.humanOn")
              : t("more.voice.humanOff")}
          </Text>
        </GlassCard>

        {/* التنبيه اليومي */}
        <GlassCard contentStyle={styles.cardC} glow={Palette.success}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("more.reminder.title")}</Text>
          <Text style={[styles.help, { textAlign: dir.textAlign }]}>
            {t("more.reminder.help")}
          </Text>

          {/* قائمة التذكيرات الحالية */}
          {reminderHours.length > 0 ? (
            <View style={[styles.remindersWrap, { flexDirection: dir.row }]}>
              {reminderHours.map((h) => (
                <View key={h} style={[styles.reminderChip, { flexDirection: dir.row }]}>
                  <Text style={styles.reminderChipTxt}>🕐 {fmtHour(h)}</Text>
                  <Pressable onPress={() => removeReminder(h)} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={Palette.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.help, { textAlign: dir.textAlign }]}>{t("more.reminder.none")}</Text>
          )}

          <GradientButton
            title={t("more.reminder.add")}
            icon="add-circle"
            colors={Gradients.success}
            onPress={() => setTimePickerOpen(true)}
          />

          <GradientButton
            title={t("more.reminder.sendTest")}
            icon="notifications-circle"
            colors={Gradients.neon}
            onPress={testNotification}
          />

          {/* قائمة اختيار وقت التذكير للإضافة */}
          <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={() => setTimePickerOpen(false)}>
            <Pressable style={styles.pickerMask} onPress={() => setTimePickerOpen(false)}>
              <View style={styles.pickerCard}>
                <Text style={[styles.pickerTitle, { textAlign: dir.textAlign }]}>{t("more.reminder.pickTime")}</Text>
                <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                  {REMINDER_HOURS.map((h) => {
                    const added = reminderHours.includes(h);
                    return (
                      <Pressable key={h} onPress={() => addReminder(h)} style={[styles.pickerRow, { flexDirection: dir.row }, added && styles.pickerRowOn]}>
                        <Text style={[styles.pickerRowTxt, added && styles.pickerRowTxtOn]}>🕐 {fmtHour(h)}</Text>
                        {added ? <Ionicons name="checkmark" size={18} color={Palette.success} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>
        </GlassCard>

        {/* التعريف بالتطبيق */}
        <GlassCard contentStyle={styles.cardC} glow={Palette.neonViolet}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("more.tutorial.title")}</Text>
          <Text style={[styles.help, { textAlign: dir.textAlign }]}>
            {t("more.tutorial.help")}
          </Text>
          <GradientButton
            title={t("more.tutorial.replay")}
            icon="sparkles"
            colors={Gradients.neonViolet}
            onPress={replayTutorial}
          />
        </GlassCard>

        {/* التخزين */}
        <GlassCard contentStyle={styles.cardC} glow={Palette.neonCyan}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("more.storage.title")}</Text>
          <Text style={[styles.help, { textAlign: dir.textAlign }]}>
            {t("more.storage.help", { size: formatBytes(cacheBytes) })}
          </Text>
          <GradientButton
            title={t("more.storage.clear")}
            icon="trash"
            colors={Gradients.neon}
            onPress={clearCache}
          />
        </GlassCard>

        {/* حول التطبيق */}
        <GlassCard contentStyle={styles.cardC}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("more.about.title")}</Text>
          <Text style={[styles.help, { textAlign: dir.textAlign }]}>
            {t("more.about.designer", { name: "Nahla Bin Shablan" })}
            {"\n"}
            {t("more.about.purpose")}
            {"\n"}
            {t("more.about.disclaimer")}
          </Text>
          <Text style={styles.madeIn}>{t("more.madeIn")}</Text>
        </GlassCard>
      </ScrollView>

      {accessory}
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent", padding: 16 },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", textAlign: "right" },

  cardC: { padding: 14, gap: 10 },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  timeChipTxt: { color: "#fff", fontWeight: "900" },
  pickerMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24 },
  pickerCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Palette.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: 16,
  },
  pickerTitle: { color: Palette.text, fontSize: 16, fontWeight: "900", marginBottom: 10 },
  pickerRow: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginVertical: 3,
    backgroundColor: Palette.surface,
  },
  pickerRowOn: { backgroundColor: Palette.success + "22", borderWidth: 1, borderColor: Palette.success + "66" },
  pickerRowTxt: { color: Palette.text, fontSize: 15, fontWeight: "800" },
  pickerRowTxtOn: { color: Palette.success },
  remindersWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  reminderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Palette.success + "22",
    borderWidth: 1,
    borderColor: Palette.success + "55",
  },
  reminderChipTxt: { color: Palette.text, fontWeight: "800", fontSize: 14 },
  upCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
  },
  upIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  upTitle: { color: "#fff", fontWeight: "900", fontSize: 16, textAlign: "right" },
  upSub: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 12.5, textAlign: "right", marginTop: 2 },
  title: { color: "#fff", fontWeight: "900", fontSize: 16, textAlign: "right" },
  label: { color: "#c9d4e2", fontWeight: "900", textAlign: "right" },

  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 14,
    color: "#fff",
  },

  help: { color: "#9fb3c8", lineHeight: 18, textAlign: "right" },
  madeIn: { color: "#c9d4e2", fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 10 },
  themeGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginTop: 4 },
  themeCell: {
    width: "47%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    gap: 6,
  },
  themeSwatch: {
    height: 54,
    borderRadius: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  themeDot: { width: 12, height: 12, borderRadius: 6 },
  themeName: { color: "#e6eefc", fontSize: 13, fontWeight: "800", textAlign: "center" },
  themeActive: { fontSize: 11, fontWeight: "900", textAlign: "center" },
  focusBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(124,92,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.30)",
    marginTop: 6,
  },
  focusTitle: { color: "#fff", fontWeight: "900", fontSize: 15, textAlign: "right" },
  focusSub: { color: "#b9c6d8", fontSize: 12, textAlign: "right", marginTop: 3, lineHeight: 18 },
  focusLevels: { flexDirection: "row-reverse", gap: 8, marginTop: 12 },
  levelPill: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  levelPillOn: { backgroundColor: Palette.neonCyan, borderColor: Palette.neonCyan },
  levelTxt: { color: "#e6eefc", fontSize: 13, fontWeight: "900" },
  levelTxtOn: { color: "#0b1220" },
  levelHint: { color: "#8aa0b8", fontSize: 10, fontWeight: "700" },

  btn: {
    flex: 1,
    backgroundColor: "#4f8cff",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnTxt: { color: "#fff", fontWeight: "900", fontSize: 16 },

  tutorialBtn: {
    flexDirection: "row-reverse",
    gap: 8,
    backgroundColor: "#7c5cff",
  },

  hideKbBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  hideKbTxt: { color: "#c9d4e2", fontWeight: "900" },

  row: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },

  pill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillActive: {
    backgroundColor: "rgba(79,140,255,0.18)",
    borderColor: "rgba(79,140,255,0.35)",
  },
  pillActiveGreen: {
    backgroundColor: "rgba(46,204,113,0.18)",
    borderColor: "rgba(46,204,113,0.35)",
  },
  pillTxt: { color: "#c9d4e2", fontWeight: "900" },
  pillTxtActive: { color: "#fff" },

  accessory: {
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    padding: 10,
    alignItems: "flex-end",
  },
  accessoryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  accessoryTxt: { color: "#c9d4e2", fontWeight: "900" },
});
