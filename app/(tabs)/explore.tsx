import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppDrawer } from "../../components/brand/app-drawer";
import { SceneBanner, SceneCard, SceneScreen } from "../../components/brand/scene-screen";
import { Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
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
  const { pal } = useScene();
  const [rows, setRows] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  // نُعيد التحميل في كل مرة تُفتح فيها الشاشة (هذا تبويب يبقى محمّلًا، فلا نكتفي
  // بالتحميل مرة واحدة) — فيظهر أي كتاب أرشفتِه فورًا عند فتح الأرشيف.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  // تحديث لحظي إضافي إن كان Realtime مفعّلًا (لا نعتمد عليه وحده)
  useEffect(() => {
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
    <SceneScreen>
      <SceneBanner
        title={t("explore.header.title")}
        subtitle={t("explore.header.subtitle")}
        height={150}
        left={<AppDrawer tint={pal.dark ? "#FFFFFF" : pal.ink} light={!pal.dark} />}
      />

      <FlatList
        data={rows}
        refreshing={loading}
        onRefresh={load}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingTop: 6, gap: 12, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <Pressable onLongPress={() => deleteForever(item)}>
            <SceneCard style={[styles.cardRow, { flexDirection: dir.row }]}>
            <View style={[styles.icon, { backgroundColor: pal.soft }]}>
              <Ionicons name="file-tray-full-outline" size={20} color={pal.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.meta, { color: pal.dim, textAlign: dir.textAlign }]}>
                {item.archived_at
                  ? t("explore.archivedOn", { date: item.archived_at.slice(0, 10) })
                  : "—"}
              </Text>
              <Text style={[styles.hint, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                {t("explore.longPressHint")}
              </Text>
            </View>

            <Pressable
              onPress={() => restore(item)}
              style={[styles.btn, { flexDirection: dir.row, backgroundColor: pal.accent }]}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-undo" size={16} color={pal.onAccent} />
              <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("explore.restore")}</Text>
            </Pressable>
            </SceneCard>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Text style={{ color: pal.dim, textAlign: dir.textAlign, fontWeight: "600" }}>
              {t("explore.empty")}
            </Text>
          </View>
        }
      />
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  cardRow: {
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "900", fontSize: 15 },
  meta: { marginTop: 4, fontSize: 12, fontWeight: "600" },
  hint: { marginTop: 4, fontSize: 11, opacity: 0.8 },
  btn: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  btnTxt: { fontWeight: "900", fontSize: 14 },
});
