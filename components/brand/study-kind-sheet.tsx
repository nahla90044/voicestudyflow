// components/brand/study-kind-sheet.tsx
// اختيار «نوع الدراسة» للكتاب (قرار نهلة ٢٧ أكتوبر): دراسة عادية · لغة · شهادة مهنية،
// ومع الشهادة اسم الاختبار اختياريًا (لتوزيع الاختبار التجريبي على أوزان أقسامه).
// على شكل نافذة موعد الاختبار نفسها.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Palette, Radius } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { STUDY_KINDS, type StudyKind } from "../../lib/studyKindCore";
import { PressableScale } from "./motion";

type Props = {
  visible: boolean;
  kind: StudyKind;
  exam?: string;
  onClose: () => void;
  onSave: (kind: StudyKind, exam?: string) => void;
};

export function StudyKindSheet({ visible, kind, exam, onClose, onSave }: Props) {
  const { t } = useI18n();
  const dir = useDir();
  const [k, setK] = useState<StudyKind>(kind);
  const [name, setName] = useState(exam ?? "");

  useEffect(() => {
    if (visible) {
      setK(kind);
      setName(exam ?? "");
    }
  }, [visible, kind, exam]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.mask} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grip} />
            <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("kind.title")}</Text>
            <Text style={[styles.sub, { textAlign: dir.textAlign }]}>{t("kind.sub")}</Text>

            {STUDY_KINDS.map((x) => {
              const on = x === k;
              return (
                <PressableScale
                  key={x}
                  onPress={() => setK(x)}
                  style={[styles.row, { flexDirection: dir.row }, on && styles.rowOn]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.rowTitle, { textAlign: dir.textAlign }]}>{t(`kind.${x}`)}</Text>
                    <Text style={[styles.rowHint, { textAlign: dir.textAlign }]}>{t(`kind.${x}Hint`)}</Text>
                  </View>
                  <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? "#D9D3FF" : Palette.textDim} />
                </PressableScale>
              );
            })}

            {k === "cert" ? (
              <View style={{ gap: 6 }}>
                <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("kind.exam")}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t("kind.examPh")}
                  placeholderTextColor={Palette.textDim}
                  style={[styles.input, { textAlign: dir.textAlign }]}
                  maxLength={60}
                  returnKeyType="done"
                />
              </View>
            ) : null}

            <PressableScale onPress={() => onSave(k, k === "cert" ? name : undefined)} style={styles.save}>
              <Text style={styles.saveTxt}>{t("kind.save")}</Text>
            </PressableScale>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#10121B",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    paddingBottom: 38,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  title: { color: Palette.text, fontSize: 19, fontWeight: "800" },
  sub: { color: Palette.textDim, fontSize: 13, lineHeight: 20, marginTop: -4 },
  row: {
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: Radius.xl,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  rowOn: { backgroundColor: "rgba(124,108,255,0.12)", borderColor: "rgba(124,108,255,0.45)" },
  rowTitle: { color: Palette.text, fontSize: 16, fontWeight: "800" },
  rowHint: { color: Palette.textDim, fontSize: 12.5, lineHeight: 18 },
  label: { color: Palette.textMuted, fontSize: 13, fontWeight: "700" },
  input: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: Palette.text,
    fontSize: 15,
  },
  save: { height: 54, borderRadius: 18, backgroundColor: Palette.text, alignItems: "center", justifyContent: "center", marginTop: 4 },
  saveTxt: { color: Palette.bg, fontSize: 16, fontWeight: "800" },
});
