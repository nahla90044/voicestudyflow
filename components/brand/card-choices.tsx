// components/brand/card-choices.tsx
// أزرار الإجابة لبطاقات «صح أو خطأ» و«اختيار من متعدد» على الوجه الأمامي للبطاقة: الضغط يلوّن
// الصحيح بالأخضر والمختار الخطأ بالأحمر، ثم يقلب البطاقة لشرح الجواب. مشترك بين شاشات البطاقات.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useDir } from "../../lib/i18n";
import { useScene } from "../../lib/scene";

const GOOD = "#15803D";
const BAD = "#D9485A";

type Props = {
  opts: string[];
  ans: number;
  /** الخيار المختار (null قبل الإجابة) */
  picked: number | null;
  onPick: (i: number) => void;
  /** صح/خطأ: زران متجاوران */
  row?: boolean;
};

export function CardChoices({ opts, ans, picked, onPick, row }: Props) {
  const dir = useDir();
  const { pal } = useScene();
  const done = picked !== null;
  return (
    <View style={[styles.wrap, row && { flexDirection: dir.row }]}>
      {opts.map((o, i) => {
        const right = done && i === ans;
        const wrong = done && i === picked && i !== ans;
        return (
          <Pressable
            key={i}
            disabled={done}
            onPress={() => onPick(i)}
            style={({ pressed }) => [
              styles.opt,
              row && { flex: 1, justifyContent: "center" },
              { flexDirection: dir.row, borderColor: right ? GOOD : wrong ? BAD : pal.cardBorder, backgroundColor: right ? GOOD + "1F" : wrong ? BAD + "1A" : pal.soft, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {!row ? (
              <View style={[styles.letter, { borderColor: right ? GOOD : wrong ? BAD : pal.track }]}>
                <Text style={[styles.letterTxt, { color: right ? GOOD : wrong ? BAD : pal.dim }]}>{"أبجدهوز"[i] ?? i + 1}</Text>
              </View>
            ) : null}
            <Text style={[styles.optTxt, { color: pal.ink, textAlign: row ? "center" : dir.textAlign }, !row && { flex: 1 }]}>{o}</Text>
            {right ? <Ionicons name="checkmark-circle" size={20} color={GOOD} /> : wrong ? <Ionicons name="close-circle" size={20} color={BAD} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: "stretch" },
  opt: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", gap: 10 },
  letter: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  letterTxt: { fontSize: 13, fontWeight: "900" },
  optTxt: { fontSize: 15.5, fontWeight: "800", lineHeight: 23 },
});
