import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import React, { useMemo, useState } from "react";
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { WebView } from "react-native-webview";
import { supabase } from "../lib/supabase";

export default function ReaderScreen() {
  const router = useRouter();
  const { title, pdf_path } = useLocalSearchParams<{
    title?: string;
    pdf_path?: string;
  }>();

  const [speaking, setSpeaking] = useState(false);

  // رابط PDF من Supabase (صحيح)
  const pdfUrl = useMemo(() => {
    const path = typeof pdf_path === "string" ? pdf_path : "";
    if (!path) return "";
    const { data } = supabase.storage.from("pdfs").getPublicUrl(path);
    return data.publicUrl || "";
  }, [pdf_path]);

  const toggleSpeech = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }

    setSpeaking(true);

    // ✅ الآن يقرأ مباشرة (نص تجريبي) عشان نتأكد الصوت شغال
    Speech.speak(
      "الصوت يعمل الآن. في الخطوة التالية سنفعّل قراءة صفحات الكتاب عبر OCR.",
      {
        language: "ar-SA",
        rate: 0.95,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      }
    );
  };

  const stopSpeech = () => {
    Speech.stop();
    setSpeaking(false);
  };

  const testEnglish = () => {
    stopSpeech();
    setSpeaking(true);
    Speech.speak("English voice is working. OCR will come next.", {
      language: "en-US",
      rate: 0.95,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← رجوع</Text>
        </TouchableOpacity>

        <Text style={styles.hTitle} numberOfLines={1}>
          {typeof title === "string" && title.trim() ? title : "الكتاب"}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.audioBtn} onPress={toggleSpeech}>
          <Text style={styles.audioText}>
            {speaking ? "⏹ إيقاف الصوت" : "🔊 قراءة بصوت"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.smallBtn} onPress={testEnglish}>
          <Text style={styles.smallBtnText}>Test EN</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.viewer}>
        {pdfUrl ? (
          <WebView source={{ uri: pdfUrl }} style={{ flex: 1 }} />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>لا يوجد رابط PDF</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0b1220" },
  header: {
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  backText: { color: "#c9d4e2", fontWeight: "800" },
  hTitle: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "900" },

  actions: { paddingHorizontal: 14, paddingBottom: 10, gap: 10 },
  audioBtn: {
    backgroundColor: "#2ecc71",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  audioText: { color: "#0b1220", fontWeight: "900", fontSize: 16 },

  smallBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  smallBtnText: { color: "#c9d4e2", fontWeight: "800" },

  viewer: {
    flex: 1,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#9fb3c8" },
});
