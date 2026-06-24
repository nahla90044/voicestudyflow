import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassCard } from "../../components/brand/glass-card";
import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Gradients, Palette } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import { generatePlan } from "../../lib/plans";
import { supabase } from "../../lib/supabase";

function randomId(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const MPP_KEY = "vsf_minutes_per_page"; // إعداد عام: دقيقة/صفحة (بنضيفه لاحقًا في more)

export default function AddBookScreen() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [pageCountManual, setPageCountManual] = useState(""); // اختياري
  const [file, setFile] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const canCreatePlan = useMemo(() => {
    const m = parseInt(minutes || "60", 10) || 60;
    return !!file && m >= 5;
  }, [file, minutes]);

  async function pickPdf() {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
    if (!res.canceled) {
      const picked = res.assets[0];
      setFile(picked);

      // عنوان تلقائي من اسم الملف إذا فاضي
      if (!title.trim() && typeof picked?.name === "string") {
        setTitle(picked.name.replace(/\.pdf$/i, ""));
      }
    }
  }

  async function getMinutesPerPage(): Promise<number> {
    const saved = await AsyncStorage.getItem(MPP_KEY);
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 2; // افتراضي 2 دقيقة/صفحة
  }

  async function resolvePageCount(bookId: string, pdfPath: string): Promise<number> {
    // 1) لو كتبتِ عدد الصفحات يدويًا
    const manual = Math.max(0, parseInt(pageCountManual || "0", 10) || 0);
    if (manual > 0) {
      await supabase.from("books").update({ page_count: manual }).eq("id", bookId);
      return manual;
    }

    // 2) غير كذا: نحسبه تلقائيًا من Edge Function
    const { data, error } = await supabase.functions.invoke("pdf-pagecount", {
      body: { bookId, pdfPath },
    });

    if (error) throw error;

    const n = Number(data?.pageCount ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  async function save(createPlanNow: boolean) {
    if (!file) {
      Alert.alert("تنبيه", "اختر ملف PDF أولاً");
      return;
    }

    const dailyMinutes = Math.max(5, parseInt(minutes || "60", 10) || 60);

    try {
      setBusy(true);

      // معرّف المستخدم الحقيقي (تفرضه RLS على القاعدة والتخزين)
      const userId = await getUserId();

      // 1) upload — المسار يبدأ بمجلّد المستخدم حتى لا يصل غيره لملفاته
      const path = `${userId}/${Date.now()}_${randomId(8)}.pdf`;
      const buffer = await fetch(file.uri).then((r) => r.arrayBuffer());

      const { error: upErr } = await supabase.storage.from("pdfs").upload(path, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upErr) throw upErr;

      // 2) insert book
      const safeTitle =
        title.trim() ||
        (typeof file?.name === "string" ? file.name.replace(/\.pdf$/i, "") : "كتاب");

      const { data: book, error: bErr } = await supabase
        .from("books")
        .insert({
          user_id: userId,
          title: safeTitle,
          pdf_path: path,
          page_count: 0, // سيتم تحديثه بعد قليل
        })
        .select()
        .single();

      if (bErr) throw bErr;

      // 3) create plan
      if (createPlanNow) {
        const today = new Date().toISOString().slice(0, 10);

        const minutesPerPage = await getMinutesPerPage();
        const pageCount = await resolvePageCount(book.id, path);

        if (!pageCount || pageCount <= 0) {
          Alert.alert(
            "تنبيه",
            "تعذّر تحديد عدد صفحات الكتاب تلقائيًا. اكتبه يدويًا في خانة الصفحات وحاول مرة ثانية."
          );
          return;
        }

        const result = await generatePlan({
          userId,
          bookId: book.id,
          startDateISO: today,
          pageCount,
          minutesPerPage,
          dailyMinutes,
          bufferEvery: 7,
        });

        Alert.alert("✅", `تم إنشاء خطة ذكية\nعدد الصفحات: ${pageCount}\nالأيام: ${result.days}`);

        // ✅ الانتقال لشاشة الخطة لعرضها
        router.push("/calendar");
      } else {
        Alert.alert("✅", "تمت إضافة الكتاب");
        router.push("/library");
      }

      setTitle("");
      setPageCountManual("");
      setFile(null);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader
        icon="add-circle"
        title="إضافة كتاب"
        subtitle="ارفع ملف PDF وأنشئ خطة"
        color={Palette.neonViolet}
        style={{ marginHorizontal: 0, marginTop: 0 }}
      />

      <GlassCard contentStyle={styles.formCard} glow={Palette.neonViolet}>
        <GradientButton
          title={file ? "✅ تم اختيار ملف" : "اختيار ملف PDF"}
          icon="document-attach"
          variant="ghost"
          onPress={pickPdf}
          disabled={busy}
        />

        <Text style={styles.label}>عنوان الكتاب (اختياري)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="إذا تُرك فارغًا يأخذ اسم الملف"
          placeholderTextColor="#8aa0b8"
          style={styles.input}
          editable={!busy}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>عدد الصفحات (اختياري)</Text>
            <TextInput
              value={pageCountManual}
              onChangeText={setPageCountManual}
              keyboardType="number-pad"
              style={styles.input}
              editable={!busy}
              placeholder="إذا تُرك فارغًا يُحسب تلقائيًا"
              placeholderTextColor="#8aa0b8"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.label}>الدقائق اليومية</Text>
            <TextInput
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              style={styles.input}
              editable={!busy}
            />
          </View>
        </View>

        <GradientButton
          title="حفظ الكتاب فقط"
          icon="save"
          onPress={() => save(false)}
          loading={busy}
        />

        <GradientButton
          title="حفظ + إنشاء خطة ذكية"
          icon="sparkles"
          colors={Gradients.neon}
          onPress={() => save(true)}
          loading={busy}
          disabled={!canCreatePlan}
        />

        <Text style={styles.hint}>
          إذا لم تُدخل عدد الصفحات، يحسبه التطبيق تلقائيًا من ملف PDF (عبر Supabase Function).
        </Text>
      </GlassCard>
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent", padding: 16, gap: 12 },
  formCard: { padding: 16, gap: 12 },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900", marginBottom: 6, textAlign: "right" },
  label: { color: "#c9d4e2", fontWeight: "900", textAlign: "right" },
  hint: { color: "#9fb3c8", textAlign: "right", marginTop: 4, fontSize: 12 },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 14,
    color: "#fff",
    textAlign: "right",
  },
  row: { flexDirection: "row", gap: 12 },
  btn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  btnTxt: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
