import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlassCard } from "../../components/brand/glass-card";
import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Gradients, Palette } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";

type Book = {
  id: string;
  title: string;
  pdf_path: string;
  is_archived: boolean;
  archived_at: string | null;
};

export default function ArchiveScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const [rows, setRows] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();

    const ch = supabase
      .channel("vsf-archive")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "books" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("books")
      .select("id,title,pdf_path,is_archived,archived_at")
      .eq("is_archived", true)
      .order("archived_at", { ascending: false });

    if (error) {
      Alert.alert("Error", error.message);
      setRows([]);
    } else {
      setRows((data || []) as Book[]);
    }

    setLoading(false);
  }

  async function restore(book: Book) {
    const { error } = await supabase
      .from("books")
      .update({ is_archived: false, archived_at: null })
      .eq("id", book.id);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("✅", t("explore.alert.restored"));
      load();
    }
  }

  async function deleteForever(book: Book) {
    Alert.alert(t("explore.alert.deleteTitle"), t("explore.alert.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("explore.alert.deleteConfirm"),
        style: "destructive",
        onPress: async () => {
          try {
            // 1) حذف ملف الـ PDF من Storage
            const { error: sErr } = await supabase.storage
              .from("pdfs")
              .remove([book.pdf_path]);
            if (sErr) throw sErr;

            // 2) حذف سجل الكتاب من جدول books
            const { error: bErr } = await supabase
              .from("books")
              .delete()
              .eq("id", book.id);
            if (bErr) throw bErr;

            Alert.alert("✅", t("explore.alert.deleted"));
            load();
          } catch (e: any) {
            Alert.alert("Error", e?.message ?? String(e));
          }
        },
      },
    ]);
  }

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader
        icon="file-tray-full"
        title={t("explore.header.title")}
        subtitle={t("explore.header.subtitle")}
        color={Palette.neonPink}
      />

      <FlatList
        data={rows}
        refreshing={loading}
        onRefresh={load}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <Pressable onLongPress={() => deleteForever(item)}>
            <GlassCard contentStyle={styles.cardRow} glow={Palette.neonPink}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { textAlign: dir.textAlign }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.meta, { textAlign: dir.textAlign }]}>
                {item.archived_at
                  ? t("explore.archivedOn", { date: item.archived_at.slice(0, 10) })
                  : "—"}
              </Text>
              <Text style={[styles.hint, { textAlign: dir.textAlign }]} numberOfLines={1}>
                {t("explore.longPressHint")}
              </Text>
            </View>

            <GradientButton
              title={t("explore.restore")}
              icon="arrow-undo"
              colors={Gradients.success}
              onPress={() => restore(item)}
            />
            </GlassCard>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Text style={{ color: "#9fb3c8", textAlign: dir.textAlign }}>
              {t("explore.empty")}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", textAlign: "right" },
  sub: { color: "#9fb3c8", textAlign: "right", marginTop: 6 },

  cardRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  title: { color: "#fff", fontWeight: "900", textAlign: "right" },
  meta: { color: "#c9d4e2", textAlign: "right", marginTop: 6, fontSize: 12 },
  hint: {
    color: "rgba(201,212,226,0.55)",
    textAlign: "right",
    marginTop: 6,
    fontSize: 11,
  },

  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#2ecc71",
  },
  btnTxt: { color: "#0b1220", fontWeight: "900" },
});
