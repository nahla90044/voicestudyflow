// app/(tabs)/more.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { AppDrawer } from "../../components/brand/app-drawer";
import { SceneBanner, SceneCard, SceneScreen } from "../../components/brand/scene-screen";
import { THEMES } from "../../constants/themes";
import { SCENE_PALETTE, setScenePref, useScene, type ScenePref } from "../../lib/scene";
import { useTheme } from "../../lib/themeContext";
import { LANGS, LANG_LABELS, useDir, useI18n } from "../../lib/i18n";
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

// أوقات التذكير المتاحة (٥ صباحًا حتى ١١ مساءً)
const REMINDER_HOURS = Array.from({ length: 19 }, (_, i) => i + 5);

const ACC_ID = "kbd-more";

export default function MoreScreen() {
  const router = useRouter();
  const { t, lang: uiLang, setLang: setUiLang } = useI18n();
  const dir = useDir();
  const { themeId, setThemeId } = useTheme();
  const scene = useScene();
  const { pal } = scene;
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
        <View style={[styles.accessory, { backgroundColor: pal.nav, borderTopColor: pal.cardBorder }]}>
          <Pressable onPress={() => Keyboard.dismiss()} style={[styles.accessoryBtn, { backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}>
            <Text style={[styles.accessoryTxt, { color: pal.accent }]}>{t("common.done")}</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    );
  }, [t, pal]);

  // ألوان مشتركة محسوبة من المشهد (حديقة فاتحة / سهرة وسماء داكنتان)
  const surface = pal.dark ? "rgba(255,255,255,0.05)" : pal.soft;
  const hairline = pal.dark ? "rgba(255,255,255,0.12)" : "rgba(31,53,39,0.12)";
  const titleStyle = [styles.title, { color: pal.ink, textAlign: dir.textAlign }];
  const helpStyle = [styles.help, { color: pal.dim, textAlign: dir.textAlign }];
  const labelStyle = [styles.label, { color: pal.ink, textAlign: dir.textAlign }];

  // شريحة اختيار: محدّدة = إطار وتعبئة خفيفة بلون المشهد
  const pill = (on: boolean) => [
    styles.pill,
    { backgroundColor: on ? pal.soft : surface, borderColor: on ? pal.accent : hairline },
    on && { borderWidth: 1.5 },
  ];
  const pillTxt = (on: boolean) => [styles.pillTxt, { color: on ? pal.accent : pal.dim }];

  return (
    <SceneScreen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <SceneBanner
          title={t("more.header.title")}
          subtitle={t("more.header.subtitle")}
          left={<AppDrawer tint={pal.dark ? "#FFFFFF" : pal.ink} light={!pal.dark} />}
        />

        <View style={styles.body}>
          {/* اللغة */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("lang.title")}</Text>
            <View style={[styles.row, { flexDirection: dir.row }]}>
              {LANGS.map((l) => {
                const on = l === uiLang;
                return (
                  <Pressable
                    key={l}
                    onPress={() => setUiLang(l)}
                    style={[pill(on), styles.langChip]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={pillTxt(on)}>{LANG_LABELS[l]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SceneCard>

          {/* مشهد الواجهة: حسب وقت اليوم أو مشهد ثابت */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("scene.pref.title")}</Text>
            <View style={[styles.themeGrid, { flexDirection: dir.row }]}>
              {(["auto", "garden", "study", "sky"] as ScenePref[]).map((p) => {
                const active = scene.pref === p;
                const sw = p === "auto" ? null : SCENE_PALETTE[p];
                return (
                  <Pressable
                    key={p}
                    onPress={() => void setScenePref(p)}
                    style={[
                      styles.themeCell,
                      { backgroundColor: active ? pal.soft : surface, borderColor: active ? pal.accent : hairline },
                      active && { borderWidth: 2 },
                    ]}
                  >
                    {sw ? (
                      <View style={[styles.themeSwatch, { flexDirection: dir.row, backgroundColor: sw.bg, borderColor: hairline }]}>
                        <View style={[styles.themeDot, { backgroundColor: sw.accent }]} />
                        <View style={[styles.themeDot, { backgroundColor: sw.card, borderWidth: 1, borderColor: sw.cardBorder }]} />
                      </View>
                    ) : (
                      <View style={[styles.themeSwatch, styles.swatchSplit, { flexDirection: dir.row, borderColor: hairline }]}>
                        {(["garden", "study", "sky"] as const).map((k) => (
                          <View key={k} style={[styles.swatchPart, { backgroundColor: SCENE_PALETTE[k].bg }]}>
                            <View style={[styles.themeDot, { backgroundColor: SCENE_PALETTE[k].accent }]} />
                          </View>
                        ))}
                      </View>
                    )}
                    <Text style={[styles.themeName, { color: active ? pal.accent : pal.ink }]}>{t(`scene.pref.${p}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SceneCard>

          {/* الثيمات */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("more.theme.title")}</Text>
            <Text style={helpStyle}>{t("more.theme.help")}</Text>
            <View style={[styles.themeGrid, { flexDirection: dir.row }]}>
              {THEMES.map((theme) => {
                const active = theme.id === themeId;
                return (
                  <Pressable
                    key={theme.id}
                    onPress={() => setThemeId(theme.id)}
                    style={[
                      styles.themeCell,
                      { backgroundColor: active ? pal.soft : surface, borderColor: active ? pal.accent : hairline },
                      active && { borderWidth: 2 },
                    ]}
                  >
                    <LinearGradient
                      colors={theme.bg}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.themeSwatch, { flexDirection: dir.row, borderColor: hairline }]}
                    >
                      <View style={[styles.themeDot, { backgroundColor: theme.glow1 }]} />
                      <View style={[styles.themeDot, { backgroundColor: theme.glow2 }]} />
                      <View style={[styles.themeDot, { backgroundColor: theme.accent }]} />
                    </LinearGradient>
                    <Text style={[styles.themeName, { color: active ? pal.accent : pal.ink }]}>
                      {theme.emoji} {t(`themes.${theme.id}`)}
                    </Text>
                    {active ? <Text style={[styles.themeActive, { color: pal.accent }]}>{t("more.theme.active")}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </SceneCard>

          {/* إعدادات الخطة */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("more.plan.settingsTitle")}</Text>
            <Text style={labelStyle}>{t("more.plan.minPerPageLabel")}</Text>

            <TextInput
              value={minPerPage}
              onChangeText={setMinPerPageState}
              keyboardType="decimal-pad"
              editable={!loading}
              style={[
                styles.input,
                { backgroundColor: surface, borderColor: hairline, color: pal.ink, textAlign: dir.textAlign, writingDirection: dir.writingDirection },
              ]}
              placeholder={t("more.plan.minPerPagePlaceholder")}
              placeholderTextColor={pal.dim}
              inputAccessoryViewID={Platform.OS === "ios" ? ACC_ID : undefined}
            />

            <Text style={helpStyle}>{t("more.plan.minPerPageHelp")}</Text>

            <SceneButton title={t("common.save")} icon="save" onPress={save} loading={loading} />

            {kbVisible ? <SceneButton title={t("more.hideKeyboard")} variant="ghost" onPress={() => Keyboard.dismiss()} /> : null}
          </SceneCard>

          {/* إعدادات الصوت */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("more.voice.title")}</Text>

            <Text style={labelStyle}>{t("more.voice.langLabel")}</Text>
            <View style={[styles.row, { flexDirection: dir.row }]}>
              <Pressable onPress={() => setLang("ar")} style={pill(lang === "ar")}>
                <Text style={pillTxt(lang === "ar")}>{t("more.voice.langAr")}</Text>
              </Pressable>
              <Pressable onPress={() => setLang("en")} style={pill(lang === "en")}>
                <Text style={pillTxt(lang === "en")}>{t("more.voice.langEn")}</Text>
              </Pressable>
            </View>

            <Text style={labelStyle}>{t("more.voice.voiceLabel")}</Text>
            <View style={[styles.row, { flexDirection: dir.row }]}>
              <Pressable onPress={() => setGender("female")} style={pill(gender === "female")}>
                <Text style={pillTxt(gender === "female")}>{t("more.voice.female")}</Text>
              </Pressable>
              <Pressable onPress={() => setGender("male")} style={pill(gender === "male")}>
                <Text style={pillTxt(gender === "male")}>{t("more.voice.male")}</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: dir.row, gap: 10 }}>
              <SceneButton title={t("more.voice.testPlay")} icon="play" onPress={testVoice} style={{ flex: 1 }} />
              <SceneButton title={t("more.voice.stop")} icon="stop" variant="ghost" onPress={stopSpeaking} style={{ flex: 0.9 }} />
            </View>

            <Text style={helpStyle}>{isHumanVoiceEnabled() ? t("more.voice.humanOn") : t("more.voice.humanOff")}</Text>
          </SceneCard>

          {/* التنبيه اليومي */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("more.reminder.title")}</Text>
            <Text style={helpStyle}>{t("more.reminder.help")}</Text>

            {/* قائمة التذكيرات الحالية */}
            {reminderHours.length > 0 ? (
              <View style={[styles.remindersWrap, { flexDirection: dir.row }]}>
                {reminderHours.map((h) => (
                  <View
                    key={h}
                    style={[styles.reminderChip, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}
                  >
                    <Ionicons name="time-outline" size={15} color={pal.accent} />
                    <Text style={[styles.reminderChipTxt, { color: pal.ink }]}>{fmtHour(h)}</Text>
                    <Pressable onPress={() => removeReminder(h)} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={pal.dim} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={helpStyle}>{t("more.reminder.none")}</Text>
            )}

            <SceneButton title={t("more.reminder.add")} icon="add-circle" onPress={() => setTimePickerOpen(true)} />
            <SceneButton title={t("more.reminder.sendTest")} icon="notifications-circle" variant="ghost" onPress={testNotification} />

            {/* قائمة اختيار وقت التذكير للإضافة */}
            <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={() => setTimePickerOpen(false)}>
              <Pressable style={styles.pickerMask} onPress={() => setTimePickerOpen(false)}>
                <View style={[styles.pickerCard, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
                  <Text style={[styles.pickerTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("more.reminder.pickTime")}</Text>
                  <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                    {REMINDER_HOURS.map((h) => {
                      const added = reminderHours.includes(h);
                      return (
                        <Pressable
                          key={h}
                          onPress={() => addReminder(h)}
                          style={[
                            styles.pickerRow,
                            { flexDirection: dir.row, backgroundColor: added ? pal.soft : surface },
                            added && { borderWidth: 1, borderColor: pal.accent + "66" },
                          ]}
                        >
                          <Text style={[styles.pickerRowTxt, { color: added ? pal.accent : pal.ink }]}>🕐 {fmtHour(h)}</Text>
                          {added ? <Ionicons name="checkmark" size={18} color={pal.accent} /> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </Pressable>
            </Modal>
          </SceneCard>

          {/* التعريف بالتطبيق */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("more.tutorial.title")}</Text>
            <Text style={helpStyle}>{t("more.tutorial.help")}</Text>
            <SceneButton title={t("more.tutorial.replay")} icon="sparkles" variant="ghost" onPress={replayTutorial} />
          </SceneCard>

          {/* التخزين */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("more.storage.title")}</Text>
            <Text style={helpStyle}>{t("more.storage.help", { size: formatBytes(cacheBytes) })}</Text>
            <SceneButton title={t("more.storage.clear")} icon="trash" variant="ghost" onPress={clearCache} />
          </SceneCard>

          {/* حول التطبيق */}
          <SceneCard style={styles.cardGap}>
            <Text style={titleStyle}>{t("more.about.title")}</Text>
            <Text style={helpStyle}>
              {t("more.about.designer", { name: "Nahla Bin Shablan" })}
              {"\n"}
              {t("more.about.purpose")}
              {"\n"}
              {t("more.about.disclaimer")}
              {"\n"}
              {t("more.about.music")}
            </Text>
            <Text style={[styles.madeIn, { color: pal.dim }]}>{t("more.madeIn")}</Text>
          </SceneCard>
        </View>
      </ScrollView>

      {accessory}
    </SceneScreen>
  );
}

/** زر بألوان المشهد: ممتلئ باللون المميّز، أو محدّد بإطار هادئ */
function SceneButton({
  title,
  onPress,
  icon,
  loading = false,
  variant = "solid",
  style,
}: {
  title: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  variant?: "solid" | "ghost";
  style?: StyleProp<ViewStyle>;
}) {
  const { pal } = useScene();
  const solid = variant === "solid";
  const fg = solid ? pal.onAccent : pal.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.btn,
        { flexDirection: "row" },
        solid
          ? { backgroundColor: pal.accent, shadowColor: pal.accent }
          : { backgroundColor: pal.soft, borderWidth: 1, borderColor: pal.accent + "55" },
        solid && styles.btnShadow,
        (pressed || loading) && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.btnTxt, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 14, marginTop: 4 },
  cardGap: { gap: 10 },

  title: { fontWeight: "900", fontSize: 17 },
  label: { fontWeight: "800", fontSize: 14 },
  help: { fontSize: 13, fontWeight: "600", lineHeight: 20 },
  madeIn: { fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 10 },

  input: { borderWidth: 1, borderRadius: 16, padding: 14, fontSize: 16, fontWeight: "700" },

  row: { gap: 10, flexWrap: "wrap" },
  pill: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1 },
  pillTxt: { fontWeight: "900", fontSize: 14 },
  langChip: { flex: 1, alignItems: "center", borderRadius: 16, paddingVertical: 12 },

  btn: {
    minHeight: 50,
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnShadow: { shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  btnTxt: { fontWeight: "900", fontSize: 15 },

  themeGrid: { flexWrap: "wrap", gap: 10, marginTop: 4 },
  themeCell: { width: "47%", flexGrow: 1, borderRadius: 20, borderWidth: 1, padding: 8, gap: 6 },
  themeSwatch: {
    height: 54,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  swatchSplit: { gap: 0, alignItems: "stretch" },
  swatchPart: { flex: 1, alignItems: "center", justifyContent: "center" },
  themeDot: { width: 12, height: 12, borderRadius: 6 },
  themeName: { fontSize: 13, fontWeight: "800", textAlign: "center" },
  themeActive: { fontSize: 11, fontWeight: "900", textAlign: "center" },

  remindersWrap: { flexWrap: "wrap", gap: 8, marginBottom: 4 },
  reminderChip: { alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
  reminderChipTxt: { fontWeight: "800", fontSize: 14 },

  pickerMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  pickerCard: { width: "100%", maxWidth: 340, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  pickerTitle: { fontSize: 17, fontWeight: "900", marginBottom: 10 },
  pickerRow: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginVertical: 3,
  },
  pickerRowTxt: { fontSize: 15, fontWeight: "800" },

  accessory: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, alignItems: "flex-end" },
  accessoryBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  accessoryTxt: { fontWeight: "900" },
});
