// components/brand/howto-tour.tsx
// إعادة عرض الجولة التعريفية (من «المساعدة») — نفس صفحات شاشة الترحيب.
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Modal, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useI18n } from "../../lib/i18n";
import { TourPager } from "./tour-pager";

export function HowToTour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        <LinearGradient colors={["rgba(124,108,255,0.30)", "rgba(7,8,13,0)"]} style={styles.glow} />
        <SafeAreaView style={{ flex: 1 }}>{visible && <TourPager onDone={onClose} doneLabel={t("howto.start")} />}</SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#07080D" },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
});
