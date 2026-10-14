// components/brand/version-tag.tsx
// سطر صغير بنسخة التطبيق ورقم التحديث الهوائي الحالي — لمعرفة هل وصل آخر تحديث للجهاز.
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import React from "react";
import { StyleSheet, Text } from "react-native";

export function VersionTag({ color }: { color: string }) {
  const version = Constants.expoConfig?.version ?? "";
  const update = Updates.updateId ? Updates.updateId.slice(0, 8) : "—";
  return <Text style={[styles.txt, { color }]}>{`v${version} · ${update}`}</Text>;
}

const styles = StyleSheet.create({
  txt: { fontSize: 11, textAlign: "center", marginTop: 18, opacity: 0.7, writingDirection: "ltr" },
});
