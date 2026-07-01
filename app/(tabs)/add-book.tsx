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
import { useDir, useI18n } from "../../lib/i18n";
import { extractPdfPageText } from "../../lib/pdfText";
import { generatePlan } from "../../lib/plans";
import { supabase } from "../../lib/supabase";

function randomId(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const MPP_KEY = "vsf_minutes_per_page"; // إعداد عام: دقيقة/صفحة (بنضيفه لاحقًا في more)

// حدود الرفع — تُعرض للمستخدم وتُفرض قبل الرفع
const MAX_FILE_MB = 50;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const MAX_BOOKS = 3; // الخطة المجانية: ٣ كتب فقط
const OWNER_EMAIL = "nahlah@hotmail.com"; // حساب المالك: كتب غير محدودة
const MAX_PAGES = 700; // حدّ أعلى لصفحات الكتاب (لا يُعرض الرقم للمستخدم)
const AGREED_KEY = "vsf_upload_agreed";

export default function AddBookScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();

  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [pageCountManual, setPageCountManual] = useState(""); // اختياري
  const [file, setFile] = useState<any>(null);
  // أي زر يحمّل حاليًا (حتى لا يدور الزرّان معًا)
  const [busyMode, setBusyMode] = useState<null | "save" | "plan">(null);
  const busy = busyMode !== null;

  const canCreatePlan = useMemo(() => {
    const m = parseInt(minutes || "60", 10) || 60;
    return !!file && m >= 5;
  }, [file, minutes]);

  async function pickPdf() {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
    if (!res.canceled) {
      const picked = res.assets[0];
      if (typeof picked?.size === "number" && picked.size > MAX_FILE_BYTES) {
        Alert.alert(t("addBook.alert.warnTitle"), t("addBook.limit.fileTooLarge", { mb: MAX_FILE_MB }));
        return;
      }
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

    // 2) غير كذا: نحسبه تلقائيًا من Edge Function (مع بديل عند الفشل)
    try {
      const { data, error } = await supabase.functions.invoke("pdf-pagecount", {
        body: { bookId, pdfPath },
      });
      if (!error) {
        const n = Number(data?.pageCount ?? 0);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch {
      // نتجاهل ونجرّب البديل
    }

    // بديل: استخرج عدد الصفحات من دالة استخراج النص (totalPages)
    try {
      const res = await extractPdfPageText(pdfPath, 1);
      const n = Number(res.totalPages ?? 0);
      if (Number.isFinite(n) && n > 0) {
        await supabase.from("books").update({ page_count: n }).eq("id", bookId);
        return n;
      }
    } catch {
      // نتجاهل
    }

    return 0;
  }

  async function ensureAgreement(): Promise<boolean> {
    const agreed = await AsyncStorage.getItem(AGREED_KEY).catch(() => null);
    if (agreed === "1") return true;
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        t("addBook.agreement.title"),
        t("addBook.agreement.body"),
        [
          { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
          {
            text: t("addBook.agreement.agree"),
            onPress: async () => {
              await AsyncStorage.setItem(AGREED_KEY, "1").catch(() => {});
              resolve(true);
            },
          },
        ],
        { cancelable: false }
      );
    });
  }

  async function save(createPlanNow: boolean) {
    if (!file) {
      Alert.alert(t("addBook.alert.warnTitle"), t("addBook.alert.pickFirst"));
      return;
    }

    // اتفاقية رفع المحتوى — موافقة إلزامية (مرة واحدة) قبل أول رفع
    if (!(await ensureAgreement())) return;

    const dailyMinutes = Math.max(5, parseInt(minutes || "60", 10) || 60);

    try {
      setBusyMode(createPlanNow ? "plan" : "save");

      // معرّف المستخدم الحقيقي (تفرضه RLS على القاعدة والتخزين)
      const userId = await getUserId();

      // حساب المالك: عدد كتب غير محدود (باقي الحسابات محدودة بـMAX_BOOKS)
      const { data: { user } } = await supabase.auth.getUser();
      const isOwner = user?.email?.trim().toLowerCase() === OWNER_EMAIL;

      // حد عدد الكتب لكل مستخدم (يُتجاوز للمالك)
      if (!isOwner) {
        const { count: bookCount } = await supabase
          .from("books")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        if ((bookCount ?? 0) >= MAX_BOOKS) {
          Alert.alert(t("addBook.alert.warnTitle"), t("addBook.limit.tooManyBooks", { max: MAX_BOOKS }));
          return;
        }
      }

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

      // 2.5) حدّ حجم الكتاب: نحسب عدد الصفحات ونرفض الكتاب الكبير (دون كشف الرقم)
      const pageCount = await resolvePageCount(book.id, path);
      if (pageCount > MAX_PAGES) {
        await supabase.from("books").delete().eq("id", book.id);
        await supabase.storage.from("pdfs").remove([path]);
        Alert.alert(t("addBook.alert.warnTitle"), t("addBook.limit.bookTooLarge"));
        setTitle("");
        setPageCountManual("");
        setFile(null);
        return;
      }

      // 3) create plan
      if (createPlanNow) {
        const today = new Date().toISOString().slice(0, 10);

        const minutesPerPage = await getMinutesPerPage();

        if (!pageCount || pageCount <= 0) {
          // الكتاب اتضاف فعلاً، بس ما قدرنا نحسب الصفحات للخطة
          Alert.alert(
            t("addBook.alert.bookAddedTitle"),
            t("addBook.alert.pageCountFailed")
          );
          setTitle("");
          setPageCountManual("");
          setFile(null);
          router.push("/library");
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

        Alert.alert("✅", t("addBook.alert.planCreated", { pages: pageCount, days: result.days }));

        // ✅ الانتقال لشاشة الخطة لعرضها
        router.push("/calendar");
      } else {
        Alert.alert("✅", t("addBook.alert.bookAdded"));
        router.push("/library");
      }

      setTitle("");
      setPageCountManual("");
      setFile(null);
    } catch (e: any) {
      Alert.alert(t("addBook.alert.errorTitle"), e?.message ?? String(e));
    } finally {
      setBusyMode(null);
    }
  }

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader
        icon="add-circle"
        title={t("addBook.header.title")}
        subtitle={t("addBook.header.subtitle")}
        color={Palette.neonViolet}
        style={{ marginHorizontal: 0, marginTop: 0 }}
      />

      <GlassCard contentStyle={styles.formCard} glow={Palette.neonViolet}>
        <GradientButton
          title={file ? t("addBook.fileChosen") : t("addBook.pickFile")}
          icon="document-attach"
          variant="ghost"
          onPress={pickPdf}
          disabled={busy}
        />

        <Text style={[styles.label, { textAlign: dir.textAlign }]}>{t("addBook.titleLabel")}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("addBook.titlePlaceholder")}
          placeholderTextColor="#8aa0b8"
          style={[styles.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
          editable={!busy}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { textAlign: dir.textAlign }]} numberOfLines={1}>{t("addBook.pageCountLabel")}</Text>
            <TextInput
              value={pageCountManual}
              onChangeText={setPageCountManual}
              keyboardType="number-pad"
              style={[styles.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
              editable={!busy}
              placeholder={t("addBook.pageCountPlaceholder")}
              placeholderTextColor="#8aa0b8"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { textAlign: dir.textAlign }]} numberOfLines={1}>{t("addBook.dailyMinutesLabel")}</Text>
            <TextInput
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              style={[styles.input, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
              editable={!busy}
            />
          </View>
        </View>

        <GradientButton
          title={t("addBook.saveOnly")}
          icon="save"
          onPress={() => save(false)}
          loading={busyMode === "save"}
          disabled={busy}
        />

        <GradientButton
          title={t("addBook.saveAndPlan")}
          icon="sparkles"
          colors={Gradients.neon}
          onPress={() => save(true)}
          loading={busyMode === "plan"}
          disabled={!canCreatePlan || busy}
        />

        <Text style={[styles.hint, { textAlign: dir.textAlign }]}>
          {t("addBook.agreement.note")}
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
  row: { flexDirection: "row", gap: 12, alignItems: "flex-end" },
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
