// components/brand/language-switcher.tsx
// مبدّل لغة الواجهة (العربية / English). الفرنسية مؤجَّلة لتحديث لاحق.
// يعرض ما في LANGS تلقائيًا — مستقل، يعتمد على نظام i18n فقط.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Palette } from "../../constants/design";
import { LANGS, LANG_LABELS, useDir, useI18n } from "../../lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const dir = useDir();
  return (
    <View>
      <Text style={[styles.label, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}>
        {t("lang.title")}
      </Text>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        {LANGS.map((l) => {
          const on = l === lang;
          return (
            <Pressable
              key={l}
              onPress={() => setLang(l)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{LANG_LABELS[l]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: Palette.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 10 },
  row: { gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
    alignItems: "center",
  },
  chipOn: { borderColor: Palette.primary, backgroundColor: Palette.primarySoft },
  chipText: { color: Palette.textMuted, fontSize: 15, fontWeight: "700" },
  chipTextOn: { color: Palette.text },
});
