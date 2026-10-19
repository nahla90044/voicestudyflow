// components/reader/toc-sheet.tsx
// فهرس الكتاب في القارئ: فصول الكتاب و/أو وحدات المنهج بحدود صفحاتها، والحالي مُبرز،
// وزرّا «السابق/التالي» للتنقل السريع بين الوحدات. الضغط على عنصر ينقل لأول صفحة فيه.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getBookToc, type BookToc, type TocItem } from "../../lib/bookToc";
import { useDir, useI18n } from "../../lib/i18n";

const BG = "#141B2D";
const INK = "#F3F4F8";
const DIM = "#9AA3B8";
const ACC = "#7C9CFF";

export function TocSheet({
  visible,
  pdfPath,
  page,
  total,
  pageLabel,
  onGo,
  onClose,
}: {
  visible: boolean;
  pdfPath: string;
  page: number;
  total: number;
  /** رقم الصفحة كما يُعرض (المطبوع في الكتاب إن عُرف) */
  pageLabel: (p: number) => string;
  onGo: (p: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const [toc, setToc] = useState<BookToc | null>(null);
  const [tab, setTab] = useState<"book" | "units">("book");
  const scroll = useRef<ScrollView>(null);
  const rowY = useRef(new Map<number, number>());

  useEffect(() => {
    if (!visible || !pdfPath) return;
    let on = true;
    getBookToc(pdfPath, total)
      .then((x) => {
        if (!on) return;
        setToc(x);
        if (!x.book.length && x.units.length) setTab("units");
      })
      .catch(() => on && setToc({ book: [], units: [] }));
    return () => {
      on = false;
    };
  }, [visible, pdfPath, total]);

  const list: TocItem[] = toc ? (tab === "book" ? toc.book : toc.units) : [];
  const curIdx = list.reduce((k, c, i) => (c.page <= page ? i : k), -1);
  const cur = curIdx >= 0 ? list[curIdx] : null;

  // الحالي ظاهر عند الفتح بلا تمرير يدوي
  useEffect(() => {
    if (!visible || curIdx < 0) return;
    const id = setTimeout(() => {
      const y = rowY.current.get(curIdx);
      if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 80), animated: false });
    }, 60);
    return () => clearTimeout(id);
  }, [visible, curIdx, tab, toc]);

  // ننتظر انتهاء إغلاق النافذة قبل الانتقال (تغيير الصفحة أثناء إغلاق النافذة كان يسبب اضطرابًا)
  const go = (p: number) => {
    onClose();
    setTimeout(() => onGo(p), 350);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} supportedOrientations={["portrait", "landscape"]}>
      <Pressable style={styles.mask} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.grip} />
        <View style={[styles.head, { flexDirection: dir.row }]}>
          <Text style={styles.title}>{t("toc.title")}</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t("common.close")}>
            <Ionicons name="close" size={22} color={DIM} />
          </Pressable>
        </View>

        {toc && toc.book.length && toc.units.length ? (
          <View style={[styles.tabs, { flexDirection: dir.row }]}>
            {(["book", "units"] as const).map((k) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
                <Text style={[styles.tabTxt, tab === k && styles.tabTxtOn]}>{t(k === "book" ? "toc.book" : "toc.units")}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* السابق / التالي: تنقل سريع بين الوحدات أو الفصول */}
        {list.length ? (
          <View style={[styles.navRow, { flexDirection: dir.row }]}>
            <Pressable
              disabled={curIdx <= 0}
              onPress={() => go(list[Math.max(0, curIdx - 1)].page)}
              style={[styles.navBtn, { flexDirection: dir.row, opacity: curIdx <= 0 ? 0.4 : 1 }]}
            >
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={16} color={INK} />
              <Text style={styles.navTxt}>{t("toc.prev")}</Text>
            </Pressable>
            <Pressable
              disabled={curIdx >= list.length - 1}
              onPress={() => go(list[Math.min(list.length - 1, curIdx + 1)].page)}
              style={[styles.navBtn, { flexDirection: dir.row, opacity: curIdx >= list.length - 1 ? 0.4 : 1 }]}
            >
              <Text style={styles.navTxt}>{t("toc.next")}</Text>
              <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={16} color={INK} />
            </Pressable>
          </View>
        ) : null}

        {!toc ? (
          <View style={styles.center}>
            <ActivityIndicator color={ACC} />
            <Text style={styles.dim}>{t("toc.loading")}</Text>
          </View>
        ) : !list.length ? (
          <View style={styles.center}>
            <Ionicons name="list-outline" size={30} color={DIM} />
            <Text style={styles.dim}>{t("toc.empty")}</Text>
          </View>
        ) : (
          <ScrollView ref={scroll} style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
            {list.map((c, i) => {
              const on = c === cur;
              return (
                <Pressable
                  key={`${c.page}-${i}`}
                  onLayout={(e) => rowY.current.set(i, e.nativeEvent.layout.y)}
                  onPress={() => go(c.page)}
                  style={[styles.row, { flexDirection: dir.row, marginStart: c.level * 14 }, on && styles.rowOn]}
                >
                  {on ? <View style={styles.dot} /> : null}
                  <Text style={[styles.rowTxt, c.level > 0 && styles.rowSub, { textAlign: dir.textAlign }]} numberOfLines={2}>
                    {c.title}
                  </Text>
                  <Text style={styles.pages}>
                    {c.to > c.page ? t("toc.range", { from: pageLabel(c.page), to: pageLabel(c.to) }) : t("toc.page", { p: pageLabel(c.page) })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  head: { alignItems: "center", justifyContent: "space-between" },
  title: { color: INK, fontSize: 18, fontWeight: "900" },
  tabs: { gap: 8 },
  tab: { flex: 1, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  tabOn: { backgroundColor: ACC },
  tabTxt: { color: DIM, fontSize: 14, fontWeight: "800" },
  tabTxtOn: { color: "#0B1020" },
  navRow: { gap: 8 },
  navBtn: { flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.08)" },
  navTxt: { color: INK, fontSize: 14, fontWeight: "800" },
  center: { alignItems: "center", gap: 10, paddingVertical: 28 },
  dim: { color: DIM, fontSize: 14, fontWeight: "600", textAlign: "center", lineHeight: 22, paddingHorizontal: 12 },
  row: { alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)" },
  rowOn: { backgroundColor: "rgba(124,156,255,0.18)", borderWidth: 1, borderColor: ACC },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACC },
  rowTxt: { flex: 1, color: INK, fontSize: 15, fontWeight: "800", lineHeight: 23 },
  rowSub: { fontSize: 14, fontWeight: "700", color: "#D5DAE6" },
  pages: { color: DIM, fontSize: 12.5, fontWeight: "700" },
});
