import AsyncStorage from "@react-native-async-storage/async-storage";
import { checkBook } from "../../lib/ai";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";

import { celebrate } from "../../components/brand/feedback-host";
import React, { useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { Spacing } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { FREE_BOOKS_BASE, FREE_BOOKS_UNLOCKED, getBookLimit } from "../../lib/perks";
import { requestPaywall } from "../../lib/plan";
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
// حد الكتب صار ديناميكيًا في lib/perks.ts:
// ٣ أساسًا → ١٠ بعد إنهاء أول كتاب → بلا حد للمالك.
const MAX_PAGES = 700; // حدّ أعلى لصفحات الكتاب (لا يُعرض الرقم للمستخدم)
const AGREED_KEY = "vsf_upload_agreed";

export default function AddBookScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();

  const [title, setTitle] = useState("");
  const autoTitle = useRef(""); // آخر عنوان مأخوذ من اسم ملف
  const [minutes, setMinutes] = useState("60");
  const [pageCountManual, setPageCountManual] = useState(""); // اختياري
  const [file, setFile] = useState<any>(null);
  // أي زر يحمّل حاليًا (حتى لا يدور الزرّان معًا)
  const [busyMode, setBusyMode] = useState<null | "save" | "plan">(null);
  const [checking, setChecking] = useState(false); // فحص الكتاب الإلزامي على السيرفر
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

      // عنوان تلقائي من اسم الملف إذا كان فارغًا أو تلقائيًا من ملف سابق (لا نمسّ ما كتبه المستخدم)
      if ((!title.trim() || title === autoTitle.current) && typeof picked?.name === "string") {
        autoTitle.current = picked.name.replace(/\.pdf$/i, "");
        setTitle(autoTitle.current);
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

      // حد عدد الكتب: ٣ أساسًا، و١٠ بعد إنهاء أول كتاب، وبلا حد للمالك
      const limit = await getBookLimit();
      if (Number.isFinite(limit)) {
        // نحسب المؤرشف أيضًا: الكتاب المؤرشف ما زال مخزّنًا ويكلّف فعليًا،
        // ولو استثنيناه لصار بالإمكان تجاوز الحد بالأرشفة المتكرّرة.
        const { count: bookCount } = await supabase
          .from("books")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);

        if ((bookCount ?? 0) >= limit) {
          // الاشتراك متاح → شاشة الاشتراك (كتب بلا حد للعدد) بدل رسالة مسدودة
          if (requestPaywall("books", true)) return;
          // عند الحد الأساسي نعرض طريق المكافأة بدل طريق مسدود
          if (limit === FREE_BOOKS_BASE) {
            Alert.alert(
              t("addBook.limit.lockedTitle"),
              t("addBook.limit.lockedBody", { max: FREE_BOOKS_BASE, next: FREE_BOOKS_UNLOCKED }),
            );
          } else {
            Alert.alert(t("addBook.alert.warnTitle"), t("addBook.limit.tooManyBooks", { max: limit }));
          }
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

      // 1.5) فحص إلزامي على السيرفر قبل أي معالجة: الأوامر الخفية، الصور المخلة، وسياسة المحتوى بحسب السياق
      setChecking(true);
      const chk = await checkBook(path).finally(() => setChecking(false));
      if (chk.status !== "allow") {
        if (chk.status === "error") await supabase.storage.from("pdfs").remove([path]).catch(() => {});
        Alert.alert(
          chk.status === "error" ? t("addBook.check.failedTitle") : t("addBook.moderation.blockedTitle"),
          chk.status === "error" ? t("addBook.check.failedBody") : chk.advice || t("addBook.moderation.blockedBody")
        );
        setFile(null);
        if (title === autoTitle.current) setTitle(""); // عنوان الملف المرفوض لا يبقى
        return;
      }

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

        // بطاقة احتفالية؛ «عرض الخطة» ينقل لشاشة الخطة
        celebrateBook(book.id, safeTitle, { pages: pageCount, days: result.days });
      } else {
        celebrateBook(book.id, safeTitle);
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

  /** بطاقة النجاح بعد الرفع: فتح الكتاب مباشرة، أو المكتبة/الخطة */
  function celebrateBook(id: string, name: string, plan?: { pages: number; days: number }) {
    celebrate({
      emoji: "📖",
      title: t("addBook.success.title"),
      subtitle: `«${name}»`,
      body: plan ? t("addBook.success.plan", plan) : t("addBook.success.body"),
      tip: t("addBook.success.tip"),
      primary: { text: `${t("addBook.success.open")} 🚀`, onPress: () => router.push({ pathname: "/book/[id]", params: { id } }) },
      secondary: { text: plan ? t("addBook.success.viewPlan") : t("addBook.success.later"), onPress: () => router.push(plan ? "/calendar" : "/library") },
    });
  }

  // ألوان الحقول: نفس نمط الملف الشخصي (مقروءة في المشهد الفاتح والداكن)
  const inputColors = { backgroundColor: pal.dark ? pal.soft : pal.bg, borderColor: pal.cardBorder, color: pal.ink };
  const planDisabled = !canCreatePlan || busy;

  return (
    <SceneScreen>

      <SceneBanner
        title={t("addBook.header.title")}
        subtitle={t("addBook.header.subtitle")}
        height={150}
        left={
          // تُفتح من زر «+» في المكتبة → زر رجوع (لا القائمة الجانبية)
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/library"))} hitSlop={8} accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <SceneCard style={styles.formCard}>
          <Pressable
            onPress={pickPdf}
            disabled={busy}
            style={[
              styles.pickBtn,
              { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: file ? pal.accent : pal.cardBorder },
              busy && styles.disabled,
            ]}
          >
            <Ionicons name={file ? "checkmark-circle" : "document-attach"} size={20} color={pal.accent} />
            <Text style={[styles.pickTxt, { color: pal.ink }]} numberOfLines={1}>
              {file ? t("addBook.fileChosen") : t("addBook.pickFile")}
            </Text>
          </Pressable>

          <Text style={[styles.label, { color: pal.ink, textAlign: dir.textAlign }]}>{t("addBook.titleLabel")}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("addBook.titlePlaceholder")}
            placeholderTextColor={pal.dim}
            selectionColor={pal.accent}
            style={[styles.input, inputColors, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
            editable={!busy}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>{t("addBook.pageCountLabel")}</Text>
              <TextInput
                value={pageCountManual}
                onChangeText={setPageCountManual}
                keyboardType="number-pad"
                style={[styles.input, inputColors, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                editable={!busy}
                placeholder={t("addBook.pageCountPlaceholder")}
                placeholderTextColor={pal.dim}
                selectionColor={pal.accent}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>{t("addBook.dailyMinutesLabel")}</Text>
              <TextInput
                value={minutes}
                onChangeText={setMinutes}
                keyboardType="number-pad"
                style={[styles.input, inputColors, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                editable={!busy}
                selectionColor={pal.accent}
              />
            </View>
          </View>

          {/* حفظ فقط: زر ثانوي بإطار */}
          <Pressable
            onPress={() => save(false)}
            disabled={busy}
            style={[
              styles.btn,
              { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.accent + "66", borderWidth: 1 },
              busy && busyMode !== "save" && styles.disabled,
            ]}
          >
            {busyMode === "save" ? (
              <ActivityIndicator color={pal.accent} />
            ) : (
              <>
                <Ionicons name="save" size={18} color={pal.accent} />
                <Text style={[styles.btnTxt, { color: pal.ink }]}>{t("addBook.saveOnly")}</Text>
              </>
            )}
          </Pressable>

          {checking ? (
            <Text style={[styles.checkingTxt, { color: pal.dim, textAlign: dir.textAlign }]}>{t("addBook.moderation.checking")}</Text>
          ) : null}
          {/* حفظ وإنشاء خطة: الزر الرئيسي بلون المشهد */}
          <Pressable
            onPress={() => save(true)}
            disabled={planDisabled}
            style={[
              styles.btn,
              { flexDirection: dir.row, backgroundColor: pal.accent },
              planDisabled && busyMode !== "plan" && styles.disabled,
            ]}
          >
            {busyMode === "plan" ? (
              <ActivityIndicator color={pal.onAccent} />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color={pal.onAccent} />
                <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("addBook.saveAndPlan")}</Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.hint, { color: pal.dim, textAlign: dir.textAlign }]}>
            {t("addBook.agreement.note")}
          </Text>
        </SceneCard>
      </ScrollView>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  checkingTxt: { fontSize: 13.5, fontWeight: "700", textAlign: "center" },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 6, paddingBottom: 40 },
  formCard: { gap: 12 },
  label: { fontWeight: "800", fontSize: 13 },
  hint: { marginTop: 4, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
  },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-end" },
  pickBtn: {
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  pickTxt: { fontWeight: "900", fontSize: 15, flexShrink: 1 },
  btn: {
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnTxt: { fontWeight: "900", fontSize: 15 },
  disabled: { opacity: 0.5 },
});
