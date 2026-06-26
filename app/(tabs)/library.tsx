import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassCard } from "../../components/brand/glass-card";
import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Gradients, Palette, Radius } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import {
  addFolder,
  getAssignments,
  getFolders,
  removeFolder,
  renameFolder,
  setBookFolder,
  type Folder,
} from "../../lib/folders";
import { getPageImage } from "../../lib/pageImage";
import { supabase } from "../../lib/supabase";

type Book = {
  id: string;
  title: string;
  pdf_path: string;
  created_at?: string;

  // ✅ للأرشيف (لا تؤثر لو ما استخدمتيها في UI)
  is_archived?: boolean;
  archived_at?: string | null;
};

type Plan = {
  id: string;
  book_id: string;
  start_date: string;
  end_date: string;
  daily_minutes: number;
};

type BookRow = Book & { plan?: Plan | null };

export default function LibraryScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({}); // id → صورة الغلاف (أول صفحة)

  // يجلب صورة أول صفحة كغلاف لكل كتاب (بالتسلسل تفاديًا للحِمل؛ مع تخزين محلي)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const b of rows) {
        if (thumbs[b.id] || !b.pdf_path) continue;
        try {
          const uri = await getPageImage(b.pdf_path, 1);
          if (cancelled) return;
          if (uri) setThumbs((prev) => ({ ...prev, [b.id]: uri }));
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ “تحت الإجراء”
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  // بحث + فرز + تصنيف
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"new" | "old" | "title">("new");
  const [filter, setFilter] = useState<"all" | "withPlan" | "noPlan">("all");

  // Undo delete
  const pendingRef = useRef<{ book: BookRow; timer: any } | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoTitle, setUndoTitle] = useState("");

  // Rename modal
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBook, setRenameBook] = useState<BookRow | null>(null);

  // المجلدات
  const [folders, setFolders] = useState<Folder[]>([]);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  async function loadFolders() {
    const [f, a] = await Promise.all([getFolders(), getAssignments()]);
    setFolders(f);
    setAssign(a);
  }

  useEffect(() => {
    load();
    loadFolders();

    // ✅ Realtime: books + study_plans
    const ch = supabase
      .channel("vsf-library")
      .on("postgres_changes", { event: "*", schema: "public", table: "books" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "study_plans" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      if (pendingRef.current?.timer) clearTimeout(pendingRef.current.timer);
    };
  }, []);

  async function load() {
    setLoading(true);

    const userId = await getUserId();

    const { data: books, error: booksErr } = await supabase
      .from("books")
      .select("id,title,pdf_path,created_at,is_archived,archived_at")
      .eq("is_archived", false) // ✅ نخفي المؤرشف من المكتبة
      .order("created_at", { ascending: false });

    if (booksErr) {
      Alert.alert("Error", booksErr.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: plans, error: plansErr } = await supabase
      .from("study_plans")
      .select("id,book_id,start_date,end_date,daily_minutes")
      .eq("user_id", userId);

    if (plansErr) {
      Alert.alert("Error", plansErr.message);
      setRows((books || []) as any);
      setLoading(false);
      return;
    }

    const planByBook = new Map<string, Plan>();
    (plans || []).forEach((p: any) => planByBook.set(p.book_id, p));

    const merged: BookRow[] = (books || []).map((b: any) => ({
      ...b,
      plan: planByBook.get(b.id) ?? null,
    }));

    setRows(merged);
    setLoading(false);
  }

  // ✅ نقل للأرشيف
  async function archiveBook(book: BookRow) {
    try {
      const { error } = await supabase
        .from("books")
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
        })
        .eq("id", book.id);

      if (error) throw error;

      Alert.alert("✅", "تم نقل الكتاب للأرشيف");
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  }

  function confirmDelete(book: BookRow) {
    Alert.alert(
      "حذف نهائي؟",
      "سيتم حذف الكتاب من التخزين نهائيًا. لديك 6 ثواني للتراجع بعد الحذف.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف نهائي",
          style: "destructive",
          onPress: () => startPendingDelete(book),
        },
      ]
    );
  }

  function startPendingDelete(book: BookRow) {
    // اخفيه فوراً من القائمة
    setRows((prev) => prev.filter((x) => x.id !== book.id));

    // اظهر Undo bar
    setUndoTitle(book.title);
    setUndoVisible(true);

    // بعد 6 ثواني ننفذ الحذف الحقيقي
    const timer = setTimeout(async () => {
      try {
        // 1) delete file from storage
        const { error: sErr } = await supabase.storage.from("pdfs").remove([book.pdf_path]);
        if (sErr) throw sErr;

        // 2) delete book row
        const { error: bErr } = await supabase.from("books").delete().eq("id", book.id);
        if (bErr) throw bErr;
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? String(e));
        // رجّع الكتاب لو فشل الحذف
        setRows((prev) => [book, ...prev]);
      } finally {
        pendingRef.current = null;
        setUndoVisible(false);
      }
    }, 6000);

    pendingRef.current = { book, timer };
  }

  function undoDelete() {
    if (!pendingRef.current) return;
    clearTimeout(pendingRef.current.timer);
    const book = pendingRef.current.book;
    pendingRef.current = null;

    // رجع الكتاب
    setRows((prev) => [book, ...prev]);
    setUndoVisible(false);
  }

  function openRename(book: BookRow) {
    setRenameBook(book);
    setRenameValue(book.title);
    setRenameOpen(true);
  }

  async function saveRename() {
    if (!renameBook) return;
    const newTitle = renameValue.trim();
    if (!newTitle) return;

    const { error } = await supabase
      .from("books")
      .update({ title: newTitle })
      .eq("id", renameBook.id);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    setRenameOpen(false);
    setRenameBook(null);
    setRenameValue("");
    load();
  }

  function onPressBook(item: BookRow) {
    setActiveBookId(item.id);

    // الدخول للكتاب مباشرة. المنهج يُفتح من الضغط المطوّل → «📋 المنهج الدراسي».
    router.push({
      pathname: "/reader/[id]",
      params: {
        id: item.id,
        title: item.title,
        pdf_path: item.pdf_path,
      },
    });
  }

  const data = useMemo(() => {
    let list = rows;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((b) => (b.title || "").toLowerCase().includes(q));
    if (filter === "withPlan") list = list.filter((b) => !!b.plan);
    else if (filter === "noPlan") list = list.filter((b) => !b.plan);
    if (selectedFolder) list = list.filter((b) => assign[b.id] === selectedFolder);

    const sorted = [...list];
    if (sortBy === "title") {
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || "", "ar"));
    } else {
      sorted.sort((a, b) => {
        const ta = a.created_at || "";
        const tb = b.created_at || "";
        return sortBy === "new" ? tb.localeCompare(ta) : ta.localeCompare(tb);
      });
    }
    return sorted;
  }, [rows, query, filter, sortBy, selectedFolder, assign]);

  const folderCount = (id: string) => Object.values(assign).filter((v) => v === id).length;

  function createFolder() {
    Alert.prompt?.("مجلد جديد", "اسم المجلد", async (name?: string) => {
      if (name && name.trim()) {
        const f = await addFolder(name);
        await loadFolders();
        setSelectedFolder(f.id);
      }
    });
  }

  function editFolder(f: Folder) {
    Alert.alert(f.name, "خيارات المجلد", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "إعادة تسمية",
        onPress: () =>
          Alert.prompt?.("إعادة تسمية", "الاسم الجديد", async (name?: string) => {
            if (name && name.trim()) {
              await renameFolder(f.id, name);
              loadFolders();
            }
          }, undefined, f.name),
      },
      {
        text: "حذف المجلد",
        style: "destructive",
        onPress: async () => {
          await removeFolder(f.id);
          if (selectedFolder === f.id) setSelectedFolder(null);
          loadFolders();
        },
      },
    ]);
  }

  function moveBookToFolder(book: BookRow) {
    const buttons: any[] = folders.map((f) => ({
      text: assign[book.id] === f.id ? `✓ ${f.name}` : f.name,
      onPress: async () => {
        await setBookFolder(book.id, f.id);
        loadFolders();
      },
    }));
    buttons.push({
      text: "بدون مجلد",
      onPress: async () => {
        await setBookFolder(book.id, null);
        loadFolders();
      },
    });
    buttons.push({ text: "إنشاء مجلد جديد", onPress: createFolder });
    buttons.push({ text: "إلغاء", style: "cancel" });
    Alert.alert("نقل إلى مجلد", book.title, buttons);
  }

  function cycleSort() {
    setSortBy((s) => (s === "new" ? "old" : s === "old" ? "title" : "new"));
  }
  const sortLabel = sortBy === "new" ? "الأحدث" : sortBy === "old" ? "الأقدم" : "أبجدي";

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "withPlan", label: "لها خطة" },
    { key: "noPlan", label: "بدون خطة" },
  ];

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader icon="library" title="المكتبة" subtitle="كل كتبك في مكان واحد" color={Palette.neonBlue} />

      <View style={styles.header}>
        {/* شريط البحث */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Palette.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن كتاب…"
            placeholderTextColor={Palette.placeholder}
            style={styles.searchInput}
            textAlign="right"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Palette.textDim} />
            </Pressable>
          ) : null}
        </View>

        {/* الفلاتر + الفرز */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.fChip, filter === f.key && styles.fChipActive]}
            >
              <Text style={[styles.fChipTxt, filter === f.key && styles.fChipTxtActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}

          <Pressable onPress={cycleSort} style={styles.sortBtn}>
            <Ionicons name="swap-vertical" size={16} color={Palette.text} />
            <Text style={styles.sortTxt}>{sortLabel}</Text>
          </Pressable>
        </View>

        {/* المجلدات */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.folderRow}
        >
          <Pressable
            onPress={() => setSelectedFolder(null)}
            style={[styles.folderChip, !selectedFolder && styles.folderChipActive]}
          >
            <Text style={[styles.folderChipTxt, !selectedFolder && styles.folderChipTxtActive]}>
              📚 الكل
            </Text>
          </Pressable>

          {folders.map((f) => {
            const active = selectedFolder === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setSelectedFolder(f.id)}
                onLongPress={() => editFolder(f)}
                style={[
                  styles.folderChip,
                  { borderColor: f.color + "66" },
                  active && { backgroundColor: f.color + "26", borderColor: f.color },
                ]}
              >
                <View style={[styles.folderDot, { backgroundColor: f.color }]} />
                <Text style={[styles.folderChipTxt, active && { color: f.color }]}>
                  {f.name} ({folderCount(f.id)})
                </Text>
              </Pressable>
            );
          })}

          <Pressable onPress={createFolder} style={[styles.folderChip, styles.folderAdd]}>
            <Ionicons name="add" size={15} color={Palette.neonBlue} />
            <Text style={[styles.folderChipTxt, { color: Palette.neonBlue }]}>مجلد</Text>
          </Pressable>
        </ScrollView>
      </View>

      <FlatList
        data={data}
        refreshing={loading}
        onRefresh={load}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 90 }}
        renderItem={({ item }) => {
          const isActive = activeBookId === item.id;
          const bookFolder = folders.find((f) => f.id === assign[item.id]);

          return (
            <Pressable
              style={styles.bookCardWrap}
              onPress={() => onPressBook(item)}
              onLongPress={() => {
                Alert.alert(item.title, "اختر إجراءً", [
                  { text: "إلغاء", style: "cancel" },

                  // 📁 نقل إلى مجلد
                  { text: "📁 نقل إلى مجلد", onPress: () => moveBookToFolder(item) },

                  // 📋 المنهج الدراسي (syllabus)
                  {
                    text: "📋 المنهج الدراسي",
                    onPress: () =>
                      router.push({
                        pathname: "/syllabus/[id]",
                        params: { id: item.id, title: item.title, pdf_path: item.pdf_path },
                      }),
                  },

                  // ✅ زر الأرشفة
                  { text: "نقل للأرشيف", onPress: () => archiveBook(item) },

                  { text: "تعديل العنوان", onPress: () => openRename(item) },
                  {
                    text: "حذف نهائي",
                    style: "destructive",
                    onPress: () => confirmDelete(item),
                  },
                ]);
              }}
            >
              <GlassCard
                radius={18}
                glow={isActive ? Palette.primary : Palette.neonBlue}
                style={{ flex: 1 }}
              >
                <View style={styles.cover}>
                  {thumbs[item.id] ? (
                    <>
                      <Image source={{ uri: thumbs[item.id] }} style={styles.coverImg} resizeMode="cover" />
                      <LinearGradient
                        colors={["rgba(8,12,22,0.05)", "rgba(8,12,22,0.92)"]}
                        style={StyleSheet.absoluteFill}
                      />
                    </>
                  ) : (
                    <View style={styles.coverPlaceholder}>
                      <Ionicons name="book" size={34} color="rgba(255,255,255,0.25)" />
                    </View>
                  )}

                  {isActive ? (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>تحت الإجراء</Text>
                    </View>
                  ) : null}

                  {bookFolder ? (
                    <View style={[styles.folderBadge, { backgroundColor: bookFolder.color + "E6" }]}>
                      <Ionicons name="folder" size={10} color="#fff" />
                      <Text style={styles.folderBadgeTxt} numberOfLines={1}>{bookFolder.name}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.coverTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                </View>

                <View style={styles.meta}>
                  {item.plan ? (
                    <>
                      <Text style={styles.metaTxt}>
                        {item.plan.start_date} → {item.plan.end_date}
                      </Text>
                      <Text style={styles.metaTxt}>⏱ {item.plan.daily_minutes} دقيقة/يوم</Text>
                    </>
                  ) : (
                    <Text style={styles.metaTxt}>لا توجد خطة</Text>
                  )}
                </View>
              </GlassCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Text style={{ color: "#9fb3c8", textAlign: "right" }}>
              {rows.length > 0
                ? "لا نتائج مطابقة للبحث أو الفلتر."
                : "لا توجد كتب بعد. أضِف كتابًا من تبويب “إضافة”."}
            </Text>
          </View>
        }
      />

      {undoVisible ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoTxt} numberOfLines={1}>
            سيتم حذف “{undoTitle}” نهائيًا…
          </Text>
          <GradientButton
            title="تراجع"
            icon="arrow-undo"
            colors={Gradients.success}
            onPress={undoDelete}
          />
        </View>
      ) : null}

      {renameOpen ? (
        <View style={styles.modalMask}>
          <GlassCard contentStyle={styles.modal} style={{ width: "100%", maxWidth: 420 }}>
            <Text style={styles.modalTitle}>تعديل العنوان</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              style={styles.modalInput}
              placeholder="العنوان"
              placeholderTextColor="#8aa0b8"
              textAlign="right"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <GradientButton title="حفظ" icon="checkmark" onPress={saveRename} style={{ flex: 1 }} />
              <GradientButton
                title="إلغاء"
                variant="ghost"
                onPress={() => setRenameOpen(false)}
                style={{ flex: 1 }}
              />
            </View>
          </GlassCard>
        </View>
      ) : null}
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, gap: 10 },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", textAlign: "right" },

  searchBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  searchInput: { flex: 1, color: Palette.text, fontSize: 14, padding: 0 },

  filterRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  fChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  fChipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
  fChipTxt: { color: Palette.textDim, fontWeight: "800", fontSize: 13 },
  fChipTxtActive: { color: "#fff" },

  sortBtn: {
    marginRight: "auto",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  sortTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },

  bookCardWrap: { flex: 1 },

  cover: {
    height: 170,
    padding: 14,
    justifyContent: "flex-end",
    backgroundColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  coverImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  coverPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  activeBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(79,140,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(79,140,255,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  activeBadgeText: { color: "#ffffff", fontWeight: "900", fontSize: 11 },

  coverTitle: { color: "#fff", fontWeight: "900", fontSize: 16, textAlign: "right" },
  meta: { padding: 12, gap: 4, minHeight: 62, justifyContent: "center" },
  metaTxt: { color: "#c9d4e2", fontSize: 12, textAlign: "right" },
  syllabusChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.5)",
  },
  syllabusChipTxt: { color: "#cdbdff", fontSize: 12, fontWeight: "800" },
  folderRow: { flexDirection: "row-reverse", gap: 8, paddingTop: 10, paddingHorizontal: 2 },
  folderChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  folderChipActive: { backgroundColor: "rgba(79,140,255,0.2)", borderColor: Palette.neonBlue },
  folderChipTxt: { color: "#c9d4e2", fontSize: 13, fontWeight: "800" },
  folderChipTxtActive: { color: Palette.neonBlue },
  folderDot: { width: 9, height: 9, borderRadius: 5 },
  folderAdd: { borderColor: "rgba(79,140,255,0.5)", borderStyle: "dashed" },
  folderBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    maxWidth: "75%",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  folderBadgeTxt: { color: "#fff", fontSize: 10, fontWeight: "900" },

  undoBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.65)",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  undoTxt: { color: "#fff", flex: 1, textAlign: "right" },
  undoBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#2ecc71" },
  undoBtnTxt: { color: "#0b1220", fontWeight: "900" },

  modalMask: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modal: { padding: 16, gap: 12 },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 18, textAlign: "right" },
  modalInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 14,
    color: "#fff",
  },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  modalBtnTxt: { color: "#fff", fontWeight: "900" },
});
