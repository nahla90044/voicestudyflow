// components/reader/notes-pad.tsx
// «صفحة الملاحظات» فوق القارئ (مثل Notability): ورق مسطّر يُكتب عليه بلوحة المفاتيح وبالقلم (والإصبع) معًا،
// صفحات متعددة لكل كتاب، حفظ تلقائي، وطباعة PDF. القارئ يبقى يعمل تحتها فالاستماع لا يتوقف،
// ومعها زر تشغيل/إيقاف للقراءة الصوتية.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDir, useI18n } from "../../lib/i18n";
import type { InkTool, Stroke } from "../../lib/ink";
import { exportNotesPdf, loadNotes, newNotePage, saveNotes, type NotePage } from "../../lib/notes";
import { InkLayer, InkToolbar, INK_COLORS } from "./ink-layer";

const LINE = 34; // ارتفاع السطر
const ASPECT = 1.35; // نسبة طول الورقة لعرضها
const PAPER = "#FFFDF8";

export function NotesPad({
  bookId,
  bookTitle,
  speaking,
  onTogglePlay,
  onClose,
}: {
  bookId: string;
  bookTitle: string;
  speaking: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const { width: sw } = useWindowDimensions();
  const [pages, setPages] = useState<NotePage[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"type" | "pen">("type");
  const [tool, setTool] = useState<InkTool>("pen");
  const [color, setColor] = useState<string>(INK_COLORS[0]);
  const [printing, setPrinting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paperW = Math.min(sw - 24, 820);
  const paperH = Math.round(paperW * ASPECT);

  useEffect(() => {
    let on = true;
    loadNotes(bookId).then((p) => on && setPages(p));
    return () => {
      on = false;
    };
  }, [bookId]);

  // حفظ تلقائي بعد كل تعديل (بتأخير بسيط) وعند الإغلاق
  const latest = useRef<NotePage[] | null>(null);
  latest.current = pages;
  useEffect(() => {
    if (!pages) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNotes(bookId, pages), 500);
  }, [pages, bookId]);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latest.current) void saveNotes(bookId, latest.current);
    },
    [bookId]
  );

  const page = pages?.[Math.min(idx, (pages?.length ?? 1) - 1)];

  function update(patch: Partial<NotePage>) {
    setPages((ps) => (ps ? ps.map((p, i) => (i === idx ? { ...p, ...patch, updatedAt: Date.now() } : p)) : ps));
  }
  const setStrokes = (s: Stroke[]) => update({ strokes: s });

  function addPage() {
    setPages((ps) => {
      const next = [...(ps ?? []), newNotePage()];
      setIdx(next.length - 1);
      return next;
    });
  }

  function removePage() {
    setPages((ps) => {
      if (!ps) return ps;
      const next = ps.filter((_, i) => i !== idx);
      setIdx((i) => Math.max(0, Math.min(i, next.length - 1)));
      return next.length ? next : [newNotePage()];
    });
  }

  async function print() {
    if (!pages || printing) return;
    setPrinting(true);
    try {
      await exportNotesPdf(pages, { title: t("notes.title"), bookTitle, rtl: lang === "ar", aspect: ASPECT });
    } catch {
      // الإلغاء أو فشل المشاركة لا يؤثر
    } finally {
      setPrinting(false);
    }
  }

  const total = pages?.length ?? 1;

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { paddingTop: insets.top }]}>
      {/* الشريط العلوي */}
      <View style={[styles.bar, { flexDirection: dir.row }]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn} accessibilityLabel={t("common.close")}>
          <Ionicons name="chevron-down" size={22} color="#F3F4F8" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {t("notes.title")}
        </Text>
        {/* الاستماع مستمر: تشغيل/إيقاف من هنا */}
        <Pressable onPress={onTogglePlay} style={[styles.iconBtn, styles.play]} accessibilityLabel={speaking ? t("dock.pause") : t("dock.play")}>
          <Ionicons name={speaking ? "pause" : "play"} size={18} color="#141B2D" />
        </Pressable>
        <Pressable onPress={() => void print()} hitSlop={8} style={styles.iconBtn} accessibilityLabel={t("notes.print")}>
          {printing ? <ActivityIndicator color="#F3F4F8" /> : <Ionicons name="print-outline" size={20} color="#F3F4F8" />}
        </Pressable>
      </View>

      {/* الوضع والصفحات */}
      <View style={[styles.bar2, { flexDirection: dir.row }]}>
        <View style={[styles.seg, { flexDirection: dir.row }]}>
          {(["type", "pen"] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segBtn, mode === m && styles.segOn]}>
              <Ionicons name={m === "type" ? "text-outline" : "pencil-outline"} size={15} color={mode === m ? "#141B2D" : "#C9CEDB"} />
              <Text style={[styles.segTxt, mode === m && styles.segTxtOn]}>{t(m === "type" ? "notes.type" : "notes.pen")}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <Pressable disabled={idx <= 0} onPress={() => setIdx((i) => Math.max(0, i - 1))} hitSlop={8} style={[styles.iconBtn, idx <= 0 && { opacity: 0.35 }]}>
          <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={18} color="#F3F4F8" />
        </Pressable>
        <Text style={styles.pageNo}>{t("notes.pageOf", { n: idx + 1, total })}</Text>
        <Pressable disabled={idx >= total - 1} onPress={() => setIdx((i) => Math.min(total - 1, i + 1))} hitSlop={8} style={[styles.iconBtn, idx >= total - 1 && { opacity: 0.35 }]}>
          <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color="#F3F4F8" />
        </Pressable>
        <Pressable onPress={addPage} hitSlop={8} style={styles.iconBtn} accessibilityLabel={t("notes.add")}>
          <Ionicons name="add" size={22} color="#F3F4F8" />
        </Pressable>
        <Pressable onPress={removePage} hitSlop={8} style={styles.iconBtn} accessibilityLabel={t("notes.delete")}>
          <Ionicons name="trash-outline" size={18} color="#C9CEDB" />
        </Pressable>
      </View>

      {mode === "pen" ? (
        <View style={styles.toolbarWrap}>
          <InkToolbar
            tool={tool}
            color={color}
            onTool={setTool}
            onColor={setColor}
            onUndo={() => page && setStrokes(page.strokes.slice(0, -1))}
            onClear={() => setStrokes([])}
            onDone={() => setMode("type")}
            labels={{
              marker: t("reader.ink.marker"),
              eraser: t("reader.ink.eraser"),
              undo: t("reader.ink.undo"),
              clear: t("reader.ink.clear"),
              clearConfirm: t("reader.ink.clearConfirm"),
              cancel: t("common.cancel"),
              done: t("reader.ink.done"),
            }}
          />
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {!page ? (
          <ActivityIndicator color="#F3F4F8" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            key={page.id}
            scrollEnabled={mode === "type"}
            contentContainerStyle={{ alignItems: "center", paddingVertical: 12, paddingBottom: insets.bottom + 30 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.paper, { width: paperW, height: paperH }]}>
              {/* السطور */}
              {Array.from({ length: Math.floor(paperH / LINE) }, (_, i) => (
                <View key={i} pointerEvents="none" style={[styles.line, { top: (i + 1) * LINE + 8 }]} />
              ))}
              <TextInput
                value={page.text}
                onChangeText={(text) => update({ text })}
                multiline
                editable={mode === "type"}
                scrollEnabled={false}
                placeholder={t("notes.placeholder")}
                placeholderTextColor="#B5B2C4"
                style={[styles.text, { textAlign: dir.textAlign, writingDirection: dir.isRTL ? "rtl" : "ltr", minHeight: paperH - 16 }]}
                textAlignVertical="top"
              />
              <InkLayer
                strokes={page.strokes}
                onChange={setStrokes}
                active={mode === "pen"}
                tool={tool}
                color={color}
                imgW={paperW}
                offsetX={0}
                width={paperW}
                height={paperH}
                allowFinger
              />
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#0E1224", zIndex: 75, elevation: 75 },
  bar: { alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  bar2: { alignItems: "center", gap: 6, paddingHorizontal: 12, paddingBottom: 6 },
  title: { flex: 1, color: "#F3F4F8", fontSize: 17, fontWeight: "800", textAlign: "center" },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.07)" },
  play: { backgroundColor: "#F6D38B" },
  seg: { gap: 4, padding: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)" },
  segBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  segOn: { backgroundColor: "#F6D38B" },
  segTxt: { color: "#C9CEDB", fontSize: 13, fontWeight: "700" },
  segTxtOn: { color: "#141B2D" },
  pageNo: { color: "#C9CEDB", fontSize: 13, fontWeight: "700", minWidth: 54, textAlign: "center" },
  toolbarWrap: { alignItems: "center", paddingBottom: 4 },
  paper: { backgroundColor: PAPER, borderRadius: 14, overflow: "hidden" },
  line: { position: "absolute", left: 18, right: 18, height: StyleSheet.hairlineWidth * 2, backgroundColor: "#DCE2EE" },
  text: { color: "#24263A", fontSize: 18, lineHeight: LINE, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 12 },
});
