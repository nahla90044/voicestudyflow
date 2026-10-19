import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AppDrawer } from "../../components/brand/app-drawer";
import { CoachHelpButton, useCoachTour } from "../../components/brand/coach-mark";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { getWords } from "../../lib/words";
import { getLastPage } from "../../lib/readerPrefs";
import { useScene } from "../../lib/scene";
import { getUserId } from "../../lib/auth";
import {
  addFolder,
  FOLDER_COLORS,
  getAssignments,
  getFolders,
  removeFolder,
  renameFolder,
  setBookFolder,
  setFolderColor,
  type Folder,
} from "../../lib/folders";
import { getPageImage } from "../../lib/pageImage";
import { supabase } from "../../lib/supabase";
import { useDir, useI18n } from "../../lib/i18n";

type Book = {
  id: string;
  title: string;
  pdf_path: string;
  created_at?: string;
  page_count?: number | null;

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
  const { t } = useI18n();
  const dir = useDir();
  const coach = useCoachTour("library_v1", [
    { id: "add", title: t("coach.lib.add.title"), body: t("coach.lib.add.body") },
    { id: "book", title: t("coach.lib.book.title"), body: t("coach.lib.book.body"), shape: "rect" },
    { id: "search", title: t("coach.lib.search.title"), body: t("coach.lib.search.body"), shape: "rect" },
    { id: "words", title: t("coach.lib.words.title"), body: t("coach.lib.words.body"), shape: "rect" },
  ]);
  const { pal } = useScene();

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

  // نسبة التقدّم لكل كتاب (آخر صفحة محفوظة محليًا ÷ عدد الصفحات) — للشريط تحت الغلاف
  const [progress, setProgress] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, number> = {};
      await Promise.all(
        rows.map(async (b) => {
          const total = Number(b.page_count) || 0;
          if (!total) return;
          try {
            const page = await getLastPage(b.id);
            next[b.id] = page <= 1 ? 0 : Math.min(1, page / total);
          } catch {}
        }),
      );
      if (!cancelled) setProgress(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  // ✅ “تحت الإجراء”
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  // بحث + فرز + تصنيف
  const [query, setQuery] = useState("");
  const [wordCount, setWordCount] = useState(0);
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
  const [colorFolder, setColorFolder] = useState<Folder | null>(null); // مجلد قيد تغيير اللون

  async function loadFolders() {
    const [f, a] = await Promise.all([getFolders(), getAssignments()]);
    setFolders(f);
    setAssign(a);
  }

  // إعادة تحميل تلقائية كلما رجعتِ للمكتبة (مثلاً بعد إضافة كتاب)
  useFocusEffect(
    useCallback(() => {
      load();
      loadFolders();
      getWords().then((w) => setWordCount(w.length));
    }, []),
  );

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

    let userId: string;
    try {
      userId = await getUserId();
    } catch {
      // لا جلسة (مثلاً أثناء تسجيل الخروج) — لا نعرض شيئًا
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: books, error: booksErr } = await supabase
      .from("books")
      .select("id,title,pdf_path,created_at,is_archived,archived_at,page_count")
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

      Alert.alert(t("common.done"), t("library.alert.archived"));
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  }

  function confirmDelete(book: BookRow) {
    Alert.alert(
      t("library.delete.confirmTitle"),
      t("library.delete.confirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("library.delete.confirmCta"),
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

    // تصميم 2.0: الكتاب يفتح «صفحة الكتاب» (متابعة الاستماع + الوحدات + كل الأدوات).
    // الضغط المطوّل ما زال يعرض قائمة الإجراءات (مجلد، منهج، أرشفة، حذف).
    router.push({ pathname: "/book/[id]", params: { id: item.id } });
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

  // نعدّ الكتب **النشطة فقط** (rows تستبعد المؤرشفة) — فالكتاب المؤرشف يختفي من
  // الملف وعدّاده، ويبقى تعيينه محفوظًا ليعود لملفه عند الاسترجاع (إن كان موجودًا).
  const folderCount = (id: string) => rows.filter((b) => assign[b.id] === id).length;

  function createFolder() {
    Alert.prompt?.(t("library.folder.newTitle"), t("library.folder.newPrompt"), async (name?: string) => {
      if (name && name.trim()) {
        const f = await addFolder(name);
        await loadFolders();
        setSelectedFolder(f.id);
      }
    });
  }

  function editFolder(f: Folder) {
    Alert.alert(f.name, t("library.folder.options"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("library.folder.rename"),
        onPress: () =>
          Alert.prompt?.(t("library.folder.rename"), t("library.folder.renamePrompt"), async (name?: string) => {
            if (name && name.trim()) {
              await renameFolder(f.id, name);
              loadFolders();
            }
          }, undefined, f.name),
      },
      { text: t("library.folder.color"), onPress: () => setColorFolder(f) },
      {
        text: t("library.folder.delete"),
        style: "destructive",
        onPress: async () => {
          await removeFolder(f.id);
          if (selectedFolder === f.id) setSelectedFolder(null);
          loadFolders();
        },
      },
    ]);
  }

  async function pickFolderColor(color: string) {
    if (!colorFolder) return;
    await setFolderColor(colorFolder.id, color);
    setColorFolder(null);
    loadFolders();
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
      text: t("library.folder.none"),
      onPress: async () => {
        await setBookFolder(book.id, null);
        loadFolders();
      },
    });
    buttons.push({ text: t("library.folder.create"), onPress: createFolder });
    buttons.push({ text: t("common.cancel"), style: "cancel" });
    Alert.alert(t("library.folder.moveTitle"), book.title, buttons);
  }

  function cycleSort() {
    setSortBy((s) => (s === "new" ? "old" : s === "old" ? "title" : "new"));
  }
  const sortLabel =
    sortBy === "new" ? t("library.sort.new") : sortBy === "old" ? t("library.sort.old") : t("library.sort.title");

  const FILTERS: { key: typeof filter; labelKey: string }[] = [
    { key: "all", labelKey: "library.filter.all" },
    { key: "withPlan", labelKey: "library.filter.withPlan" },
    { key: "noPlan", labelKey: "library.filter.noPlan" },
  ];

  const chip = { backgroundColor: pal.card, borderColor: pal.cardBorder };
  const shadowTint = pal.dark ? "#000" : "#3C5028";
  // «كعب» الكتاب على جهة بداية القراءة: يمين في العربية، يسار في اللغات الأخرى
  const spineR = dir.isRTL;
  const bookShape = spineR
    ? { borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }
    : { borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 16, borderBottomRightRadius: 16 };

  const listHeader = (
    <View>
      <SceneBanner
        title={t("nav.library")}
        subtitle={t("library.header.subtitle")}
        left={<AppDrawer tint={pal.dark ? "#FFFFFF" : pal.ink} light={!pal.dark} />}
        right={
          <View style={{ flexDirection: dir.row, alignItems: "center", gap: 8 }}>
          <CoachHelpButton onPress={coach.replay} />
          <Pressable
            {...coach.bind("add")}
            onPress={() => router.push("/add-book")}
            accessibilityRole="button"
            accessibilityLabel={t("cmd.addBook")}
            hitSlop={6}
          >
            <SceneIconButton accent>
              <Ionicons name="add" size={22} color={pal.onAccent} />
            </SceneIconButton>
          </Pressable>
          </View>
        }
      />

      <View style={styles.header}>
        {/* شريط البحث */}
        <View {...coach.bind("search")} style={[styles.searchBar, chip, { shadowColor: shadowTint }]}>
          <Ionicons name="search" size={18} color={pal.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("library.searchPlaceholder")}
            placeholderTextColor={pal.dim}
            selectionColor={pal.accent}
            style={[styles.searchInput, { color: pal.ink, textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={pal.dim} />
            </Pressable>
          ) : null}
        </View>

        {/* مكتبة الكلمات: «كلماتي» بجانب الكتب */}
        <Pressable {...coach.bind("words")} onPress={() => router.push("/words")}>
          <SceneCard padded={false} style={[styles.wordsCard, { flexDirection: dir.row }]}>
            <View style={[styles.wordsIcon, { backgroundColor: pal.soft }]}>
              <Ionicons name="bookmarks" size={18} color={pal.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.wordsTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("words.title")}</Text>
              <Text style={[styles.wordsSub, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                {wordCount ? t("words.librarySub", { n: wordCount }) : t("words.libraryEmpty")}
              </Text>
            </View>
            <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.dim} />
          </SceneCard>
        </Pressable>

        {/* الفلاتر + الفرز — قابلة للتمرير أفقيًا لتصل لكل الأزرار على الشاشات الأضيق */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.fChip, chip, on && { backgroundColor: pal.accent, borderColor: pal.accent }]}
              >
                <Text style={[styles.fChipTxt, { color: on ? pal.onAccent : pal.dim }]}>{t(f.labelKey)}</Text>
              </Pressable>
            );
          })}

          <Pressable onPress={cycleSort} style={[styles.sortBtn, chip]}>
            <Ionicons name="swap-vertical" size={16} color={pal.ink} />
            <Text style={[styles.sortTxt, { color: pal.ink }]}>{sortLabel}</Text>
          </Pressable>

          <Pressable onPress={() => { load(); loadFolders(); }} style={[styles.sortBtn, chip]} hitSlop={6}>
            <Ionicons name="refresh" size={16} color={pal.ink} />
          </Pressable>
        </ScrollView>

        {/* المجلدات */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRow}>
          <Pressable
            onPress={() => setSelectedFolder(null)}
            style={[styles.folderChip, chip, !selectedFolder && { backgroundColor: pal.soft, borderColor: pal.accent }]}
          >
            <Text style={[styles.folderChipTxt, { color: !selectedFolder ? pal.accent : pal.dim }]}>
              {t("library.folder.all")}
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
                  chip,
                  { borderColor: f.color + "66" },
                  active && { backgroundColor: f.color + "26", borderColor: f.color },
                ]}
              >
                <View style={[styles.folderDot, { backgroundColor: f.color }]} />
                <Text style={[styles.folderChipTxt, { color: active ? f.color : pal.dim }]}>
                  {f.name} ({folderCount(f.id)})
                </Text>
              </Pressable>
            );
          })}

          <Pressable onPress={createFolder} style={[styles.folderChip, styles.folderAdd, { borderColor: pal.accent + "88" }]}>
            <Ionicons name="add" size={15} color={pal.accent} />
            <Text style={[styles.folderChipTxt, { color: pal.accent }]}>{t("library.folder.chip")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );

  return (
    <SceneScreen>
      <FlatList
        data={data}
        refreshing={loading}
        onRefresh={load}
        keyExtractor={(item) => item.id}
        numColumns={2}
        ListHeaderComponent={listHeader}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const isActive = activeBookId === item.id;
          const bookFolder = folders.find((f) => f.id === assign[item.id]);
          const frac = progress[item.id] ?? 0;

          return (
            <Pressable
              {...(index === 0 ? coach.bind("book") : null)}
              style={styles.bookCardWrap}
              onPress={() => onPressBook(item)}
              onLongPress={() => {
                Alert.alert(item.title, t("library.actions.title"), [
                  { text: t("common.cancel"), style: "cancel" },

                  // 📁 نقل إلى مجلد
                  { text: t("library.actions.moveToFolder"), onPress: () => moveBookToFolder(item) },

                  // 📋 المنهج الدراسي (syllabus)
                  {
                    text: t("library.actions.syllabus"),
                    onPress: () =>
                      router.push({
                        pathname: "/syllabus/[id]",
                        params: { id: item.id, title: item.title, pdf_path: item.pdf_path },
                      }),
                  },

                  // ✅ زر الأرشفة
                  { text: t("library.actions.archive"), onPress: () => archiveBook(item) },

                  { text: t("library.actions.editTitle"), onPress: () => openRename(item) },
                  {
                    text: t("library.actions.delete"),
                    style: "destructive",
                    onPress: () => confirmDelete(item),
                  },
                ]);
              }}
            >
              <SceneCard
                padded={false}
                style={[styles.bookCard, isActive && { borderColor: pal.accent, borderWidth: 1.5 }]}
              >
                {/* الغلاف كـ«كتاب»: زاوية ضيقة عند الكعب وأعرض في الجهة الأخرى + ظل ناعم */}
                <View style={[styles.coverShadow, bookShape, { shadowColor: shadowTint, backgroundColor: pal.soft }]}>
                  <View style={[styles.cover, bookShape, { backgroundColor: pal.soft }]}>
                    {thumbs[item.id] ? (
                      <Image source={{ uri: thumbs[item.id] }} style={styles.coverImg} resizeMode="cover" />
                    ) : (
                      <View style={styles.coverPlaceholder}>
                        <Ionicons name="book" size={34} color={pal.accent} style={{ opacity: 0.55 }} />
                      </View>
                    )}

                    {/* ظلّ الكعب */}
                    <LinearGradient
                      colors={["rgba(0,0,0,0.22)", "rgba(0,0,0,0)"]}
                      start={{ x: spineR ? 1 : 0, y: 0.5 }}
                      end={{ x: spineR ? 0 : 1, y: 0.5 }}
                      style={[styles.spine, spineR ? { right: 0 } : { left: 0 }]}
                      pointerEvents="none"
                    />

                    {isActive ? (
                      <View style={[styles.activeBadge, { backgroundColor: pal.accent }, spineR ? { left: 10 } : { right: 10 }]}>
                        <Text style={[styles.activeBadgeText, { color: pal.onAccent }]}>{t("library.activeBadge")}</Text>
                      </View>
                    ) : null}

                    {bookFolder ? (
                      <View
                        style={[
                          styles.folderBadge,
                          { backgroundColor: bookFolder.color + "E6", flexDirection: dir.row },
                          spineR ? { right: 14 } : { left: 14 },
                        ]}
                      >
                        <Ionicons name="folder" size={10} color="#fff" />
                        <Text style={styles.folderBadgeTxt} numberOfLines={1}>{bookFolder.name}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* شريط التقدّم تحت الغلاف */}
                <View style={[styles.progTrack, { backgroundColor: pal.track }]}>
                  <View
                    style={[
                      styles.progFill,
                      { width: `${Math.round(frac * 100)}%`, backgroundColor: pal.accent },
                      dir.isRTL ? { alignSelf: "flex-end" } : null,
                    ]}
                  />
                </View>

                <Text style={[styles.bookTitle, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
                  {item.title}
                </Text>

                <View style={styles.meta}>
                  {item.plan ? (
                    <>
                      <Text style={[styles.metaTxt, { color: pal.dim, textAlign: dir.textAlign }]}>
                        {item.plan.start_date} → {item.plan.end_date}
                      </Text>
                      <Text style={[styles.metaTxt, { color: pal.dim, textAlign: dir.textAlign }]}>
                        {t("library.meta.perDay", { minutes: item.plan.daily_minutes })}
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.metaTxt, { color: pal.dim, textAlign: dir.textAlign }]}>{t("library.meta.noPlan")}</Text>
                  )}
                </View>
              </SceneCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          // أثناء التحميل الأول لا نقول «لا توجد كتب» (كان يظهر لحظة ثم تظهر الكتب)
          loading && rows.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={pal.accent} />
            </View>
          ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <SceneCard>
              <Text style={{ color: pal.dim, textAlign: dir.textAlign, fontSize: 14, lineHeight: 22 }}>
                {rows.length > 0 ? t("library.empty.noResults") : t("library.empty.noBooks")}
              </Text>
            </SceneCard>
          </View>
          )
        }
      />

      {undoVisible ? (
        <View
          style={[
            styles.undoBar,
            { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: shadowTint },
          ]}
        >
          <Text style={[styles.undoTxt, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
            {t("library.undo.pending", { title: undoTitle })}
          </Text>
          <Pressable onPress={undoDelete} style={[styles.solidBtn, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
            <Ionicons name="arrow-undo" size={16} color={pal.onAccent} />
            <Text style={[styles.solidBtnTxt, { color: pal.onAccent }]}>{t("library.undo.cta")}</Text>
          </Pressable>
        </View>
      ) : null}

      {renameOpen ? (
        <View style={styles.modalMask}>
          <SceneCard style={[styles.modal, { width: "100%", maxWidth: 420 }]}>
            <Text style={[styles.modalTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("library.rename.title")}</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              style={[
                styles.modalInput,
                {
                  backgroundColor: pal.soft,
                  borderColor: pal.cardBorder,
                  color: pal.ink,
                  textAlign: dir.textAlign,
                  writingDirection: dir.writingDirection,
                },
              ]}
              placeholder={t("library.rename.placeholder")}
              placeholderTextColor={pal.dim}
              selectionColor={pal.accent}
            />
            <View style={{ flexDirection: dir.row, gap: 10 }}>
              <Pressable onPress={saveRename} style={[styles.solidBtn, { flex: 1, backgroundColor: pal.accent, flexDirection: dir.row }]}>
                <Ionicons name="checkmark" size={18} color={pal.onAccent} />
                <Text style={[styles.solidBtnTxt, { color: pal.onAccent }]}>{t("common.save")}</Text>
              </Pressable>
              <Pressable
                onPress={() => setRenameOpen(false)}
                style={[styles.solidBtn, { flex: 1, backgroundColor: pal.soft, borderWidth: 1, borderColor: pal.cardBorder }]}
              >
                <Text style={[styles.solidBtnTxt, { color: pal.ink }]}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
          </SceneCard>
        </View>
      ) : null}

      {/* اختيار لون المجلد — إشارة ملوّنة يختارها المستخدم */}
      <Modal visible={!!colorFolder} transparent animationType="fade" onRequestClose={() => setColorFolder(null)}>
        <Pressable style={styles.colorMask} onPress={() => setColorFolder(null)}>
          <Pressable
            style={[styles.colorCard, { backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: shadowTint }]}
            onPress={() => {}}
          >
            <Text style={[styles.colorTitle, { color: pal.ink, textAlign: dir.textAlign }]}>
              {t("library.folder.colorTitle", { name: colorFolder?.name ?? "" })}
            </Text>
            <View style={styles.colorGrid}>
              {FOLDER_COLORS.map((c) => {
                const on = colorFolder?.color === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => pickFolderColor(c)}
                    style={[styles.colorSwatch, { backgroundColor: c }, on && { borderColor: pal.ink }]}
                  >
                    {on ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {coach.overlay}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  // يتداخل المحتوى قليلًا مع أسفل المشهد ليعطي عمقًا
  header: { paddingHorizontal: 16, marginTop: -16, paddingBottom: 8, gap: 12 },

  wordsCard: { alignItems: "center", gap: 12, padding: 14, borderRadius: 26 },
  wordsIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  wordsTitle: { fontSize: 15, fontWeight: "900" },
  wordsSub: { fontSize: 12, marginTop: 2, fontWeight: "600" },

  searchBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  filterRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  fChip: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fChipTxt: { fontWeight: "800", fontSize: 13 },

  sortBtn: {
    marginRight: "auto",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sortTxt: { fontWeight: "800", fontSize: 13 },

  folderRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 2, paddingBottom: 4 },
  folderChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  folderChipTxt: { fontSize: 13, fontWeight: "800" },
  // إشارة ملوّنة على شكل «كعب كتاب» (شريط عمودي) — مميّزة عن دوائر ألوان أبل
  folderDot: { width: 4, height: 15, borderRadius: 2 },
  folderAdd: { backgroundColor: "transparent", borderStyle: "dashed" },

  bookCardWrap: { flex: 1 },
  bookCard: { flex: 1, padding: 10, borderRadius: 26 },

  coverShadow: {
    height: 190,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cover: { flex: 1, overflow: "hidden" },
  coverImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  coverPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  spine: { position: "absolute", top: 0, bottom: 0, width: 12 },
  activeBadge: {
    position: "absolute",
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  activeBadgeText: { fontWeight: "900", fontSize: 11 },
  folderBadge: {
    position: "absolute",
    bottom: 10,
    alignItems: "center",
    gap: 4,
    maxWidth: "75%",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  folderBadgeTxt: { color: "#fff", fontSize: 10, fontWeight: "900" },

  progTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 10, marginHorizontal: 2 },
  progFill: { height: 5, borderRadius: 3 },

  bookTitle: { fontWeight: "900", fontSize: 15, lineHeight: 22, marginTop: 8, paddingHorizontal: 2 },
  meta: { paddingHorizontal: 2, paddingTop: 4, paddingBottom: 2, gap: 2 },
  metaTxt: { fontSize: 12, fontWeight: "600" },

  colorMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  colorCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 16,
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  colorTitle: { fontSize: 17, fontWeight: "900" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center" },
  colorSwatch: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "transparent" },

  undoBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 100,
    padding: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    gap: 12,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  undoTxt: { flex: 1, fontWeight: "700" },

  solidBtn: { alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16 },
  solidBtnTxt: { fontWeight: "900", fontSize: 14 },

  modalMask: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modal: { gap: 14, borderRadius: 28 },
  modalTitle: { fontWeight: "900", fontSize: 17 },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    fontSize: 15,
  },
});
