// components/reader/notes-pad.tsx
// «صفحة الملاحظات» فوق القارئ (مثل Notability): ورق مسطّر يُكتب عليه بلوحة المفاتيح وبالقلم (والإصبع) معًا،
// صفحات متعددة لكل كتاب، حفظ تلقائي، وطباعة PDF. القارئ يبقى يعمل تحتها فالاستماع لا يتوقف،
// ومعها زر تشغيل/إيقاف للقراءة الصوتية.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDir, useI18n } from "../../lib/i18n";
import type { InkTool, Stroke } from "../../lib/ink";
import { exportNotesPdf, loadNotes, newNotePage, newSticky, newTable, saveNotes, STICKY_COLORS, type NotePage, type NoteTable, type Sticky } from "../../lib/notes";
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
  /** بلا صوت جارٍ (مثل دفتر الملاحظات المستقل) لا يظهر زر التشغيل */
  onTogglePlay?: () => void;
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
  const [savedFlash, setSavedFlash] = useState(false);
  const [contentH, setContentH] = useState(0); // طول الورقة الفعلي (يطول مع الجداول والنص)
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
    Alert.alert(t("notes.delete"), t("notes.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () =>
          setPages((ps) => {
            if (!ps) return ps;
            const next = ps.filter((_, i) => i !== idx);
            setIdx((i) => Math.max(0, Math.min(i, next.length - 1)));
            return next.length ? next : [newNotePage()];
          }),
      },
    ]);
  }

  function clearPage() {
    Alert.alert(t("notes.clear"), t("notes.clearBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("notes.clear"), style: "destructive", onPress: () => update({ text: "", strokes: [], tables: [], stickies: [] }) },
    ]);
  }

  function saveNow() {
    if (!pages) return;
    void saveNotes(bookId, pages).then(() => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1400);
    });
  }

  // الجداول
  const tables = page?.tables ?? [];
  const setTables = (ts: NoteTable[]) => update({ tables: ts });
  const editCell = (ti: number, r: number, c: number, v: string) =>
    setTables(tables.map((tb, i) => (i === ti ? { ...tb, cells: tb.cells.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)) } : tb)));
  const addRow = (ti: number) => setTables(tables.map((tb, i) => (i === ti ? { ...tb, cells: [...tb.cells, tb.cells[0].map(() => "")] } : tb)));
  const addCol = (ti: number) => setTables(tables.map((tb, i) => (i === ti && tb.cells[0].length < 6 ? { ...tb, cells: tb.cells.map((row) => [...row, ""]) } : tb)));
  const delRow = (ti: number) => setTables(tables.map((tb, i) => (i === ti && tb.cells.length > 1 ? { ...tb, cells: tb.cells.slice(0, -1) } : tb)));
  const delTable = (ti: number) => setTables(tables.filter((_, i) => i !== ti));

  // الملاحظات اللاصقة
  const stickies = page?.stickies ?? [];
  const setStickies = (ss: Sticky[]) => update({ stickies: ss });
  function addSticky() {
    const color = STICKY_COLORS[stickies.length % STICKY_COLORS.length];
    setStickies([...stickies, newSticky(0.08 + (stickies.length % 4) * 0.05, 0.1 + (stickies.length % 4) * 0.06, color)]);
    setMode("type");
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
        {onTogglePlay ? (
        <Pressable onPress={onTogglePlay} style={[styles.iconBtn, styles.play]} accessibilityLabel={speaking ? t("dock.pause") : t("dock.play")}>
          <Ionicons name={speaking ? "pause" : "play"} size={18} color="#141B2D" />
        </Pressable>
        ) : null}
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

      {/* إدراج وحفظ */}
      <View style={[styles.bar2, { flexDirection: dir.row }]}>
        <Pressable onPress={() => setTables([...tables, newTable()])} style={[styles.chip, { flexDirection: dir.row }]}>
          <Ionicons name="grid-outline" size={15} color="#F3F4F8" />
          <Text style={styles.chipTxt}>{t("notes.table")}</Text>
        </Pressable>
        <Pressable onPress={addSticky} style={[styles.chip, { flexDirection: dir.row }]}>
          <Ionicons name="document-outline" size={15} color="#FFF3A3" />
          <Text style={styles.chipTxt}>{t("notes.sticky")}</Text>
        </Pressable>
        <Pressable onPress={clearPage} style={[styles.chip, { flexDirection: dir.row }]}>
          <Ionicons name="refresh-outline" size={15} color="#F3F4F8" />
          <Text style={styles.chipTxt}>{t("notes.clear")}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={saveNow} style={[styles.chip, styles.saveChip, { flexDirection: dir.row }]}>
          <Ionicons name={savedFlash ? "checkmark-circle" : "save-outline"} size={15} color="#141B2D" />
          <Text style={[styles.chipTxt, { color: "#141B2D" }]}>{savedFlash ? t("notes.saved") : t("notes.save")}</Text>
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
              pen: t("notes.pen"),
              ruler: t("notes.ruler"),
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
            <View style={[styles.paper, { width: paperW, minHeight: paperH }]} onLayout={(e) => setContentH(e.nativeEvent.layout.height)}>
              {/* السطور */}
              {Array.from({ length: Math.floor(Math.max(paperH, contentH) / LINE) }, (_, i) => (
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
                style={[styles.text, { textAlign: dir.textAlign, writingDirection: dir.isRTL ? "rtl" : "ltr", minHeight: tables.length ? LINE * 4 : paperH - 16 }]}
                textAlignVertical="top"
              />
              {/* الجداول */}
              {tables.map((tb, ti) => (
                <View key={tb.id} style={styles.tableWrap}>
                  <View style={styles.table}>
                    {tb.cells.map((row, r) => (
                      <View key={r} style={[styles.tr, { flexDirection: dir.row }, r === 0 && styles.trHead]}>
                        {row.map((cell, c) => (
                          <TextInput
                            key={c}
                            value={cell}
                            editable={mode === "type"}
                            onChangeText={(v) => editCell(ti, r, c, v)}
                            multiline
                            style={[styles.td, r === 0 && styles.th, { textAlign: dir.textAlign }]}
                            placeholder={r === 0 ? t("notes.colHead") : ""}
                            placeholderTextColor="#B5B2C4"
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                  {mode === "type" ? (
                    <View style={[styles.tableBar, { flexDirection: dir.row }]}>
                      <Pressable onPress={() => addRow(ti)} style={styles.tChip}><Text style={styles.tChipTxt}>{t("notes.addRow")}</Text></Pressable>
                      <Pressable onPress={() => addCol(ti)} style={styles.tChip}><Text style={styles.tChipTxt}>{t("notes.addCol")}</Text></Pressable>
                      <Pressable onPress={() => delRow(ti)} style={styles.tChip}><Text style={styles.tChipTxt}>{t("notes.delRow")}</Text></Pressable>
                      <Pressable onPress={() => delTable(ti)} style={styles.tChip}><Ionicons name="trash-outline" size={14} color="#B4233C" /></Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
              {/* متابعة الكتابة في صفحة جديدة */}
              {mode === "type" ? (
                <Pressable onPress={addPage} style={[styles.nextPage, { flexDirection: dir.row }]}>
                  <Ionicons name="add-circle-outline" size={18} color="#5B6B8C" />
                  <Text style={styles.nextPageTxt}>{t("notes.continue")}</Text>
                </Pressable>
              ) : null}
              <InkLayer
                strokes={page.strokes}
                onChange={setStrokes}
                active={mode === "pen"}
                tool={tool}
                color={color}
                imgW={paperW}
                offsetX={0}
                width={paperW}
                height={Math.max(paperH, contentH)}
                allowFinger
              />
              {stickies.map((st) => (
                <StickyNote
                  key={st.id}
                  st={st}
                  paperW={paperW}
                  paperH={Math.max(paperH, contentH)}
                  editable={mode === "type"}
                  placeholder={t("notes.stickyPh")}
                  onChange={(n) => setStickies(stickies.map((x) => (x.id === st.id ? n : x)))}
                  onDelete={() => setStickies(stickies.filter((x) => x.id !== st.id))}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

/** ملاحظة لاصقة: تُسحب من شريطها، وتُكتب فيها، ويتغير لونها، وتُحذف */
function StickyNote({
  st,
  paperW,
  paperH,
  editable,
  placeholder,
  onChange,
  onDelete,
}: {
  st: Sticky;
  paperW: number;
  paperH: number;
  editable: boolean;
  placeholder: string;
  onChange: (s: Sticky) => void;
  onDelete: () => void;
}) {
  const W = 170;
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const cur = useRef(st);
  cur.current = st;
  const clampPos = (x: number, y: number) => ({
    x: Math.min(Math.max(0, x), Math.max(0, paperW - W)),
    y: Math.min(Math.max(0, y), Math.max(0, paperH - 120)),
  });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => setDrag(clampPos(cur.current.x * paperW + g.dx, cur.current.y * paperW + g.dy)),
      onPanResponderRelease: (_e, g) => {
        const p = clampPos(cur.current.x * paperW + g.dx, cur.current.y * paperW + g.dy);
        setDrag(null);
        onChange({ ...cur.current, x: p.x / paperW, y: p.y / paperW });
      },
      onPanResponderTerminate: () => setDrag(null),
    })
  ).current;
  const left = drag ? drag.x : st.x * paperW;
  const top = drag ? drag.y : st.y * paperW;
  const nextColor = STICKY_COLORS[(STICKY_COLORS.indexOf(st.color as (typeof STICKY_COLORS)[number]) + 1) % STICKY_COLORS.length];
  return (
    <View style={[styles.sticky, { left, top, width: W, backgroundColor: st.color }]}>
      <View {...pan.panHandlers} style={styles.stickyHead}>
        <Ionicons name="move" size={14} color="#6B6880" />
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => onChange({ ...st, color: nextColor })} hitSlop={6}>
          <Ionicons name="color-palette-outline" size={15} color="#6B6880" />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={6}>
          <Ionicons name="close" size={16} color="#6B6880" />
        </Pressable>
      </View>
      <TextInput
        value={st.text}
        onChangeText={(text) => onChange({ ...st, text })}
        editable={editable}
        multiline
        placeholder={placeholder}
        placeholderTextColor="#8E8AA6"
        style={styles.stickyTxt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  chipTxt: { color: "#F3F4F8", fontSize: 12.5, fontWeight: "700" },
  saveChip: { backgroundColor: "#6CF3C5" },
  tableWrap: { marginHorizontal: 18, marginTop: 6, marginBottom: 10 },
  table: { borderWidth: 1, borderColor: "#B9C2D6", borderRadius: 6, overflow: "hidden", backgroundColor: "#FFFFFF" },
  tr: { borderTopWidth: 1, borderColor: "#D5DBE8" },
  trHead: { borderTopWidth: 0, backgroundColor: "#EEF2FA" },
  td: { flex: 1, minHeight: 40, paddingHorizontal: 8, paddingVertical: 6, fontSize: 15, color: "#24263A", borderLeftWidth: 1, borderColor: "#D5DBE8" },
  th: { fontWeight: "800" },
  tableBar: { gap: 6, marginTop: 6, flexWrap: "wrap" },
  tChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#EEF2FA" },
  tChipTxt: { color: "#3B4A6B", fontSize: 12, fontWeight: "700" },
  nextPage: { alignSelf: "center", alignItems: "center", gap: 6, marginVertical: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#EEF2FA" },
  nextPageTxt: { color: "#5B6B8C", fontSize: 13, fontWeight: "700" },
  sticky: { position: "absolute", minHeight: 120, borderRadius: 6, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  stickyHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 6 },
  stickyTxt: { minHeight: 80, paddingHorizontal: 10, paddingBottom: 10, fontSize: 14.5, color: "#24263A", textAlignVertical: "top" },
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
