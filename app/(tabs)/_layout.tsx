// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

import { useI18n } from "../../lib/i18n";
import { useTheme } from "../../lib/themeContext";

export default function TabsLayout() {
  const { t } = useI18n();
  const { theme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        // نخفي هيدر التبويبات لأن كل شاشة تعرض عنوانها الخاص (نتجنّب الهيدر المزدوج والنطّ)
        headerShown: false,

        // شريط بلون خلفية الثيم الحالي (بدل لون ثابت) ليندمج مع كل ثيم
        tabBarStyle: {
          backgroundColor: theme.bg[1],
          borderTopColor: "rgba(255,255,255,0.10)",
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: "#8aa0b8",
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "700" },

        tabBarHideOnKeyboard: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="library"
        options={{
          title: t("tabs.library"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="calendar"
        options={{
          title: t("tabs.plan"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="add-book"
        options={{
          title: t("tabs.add"),
          // زر الإضافة بارز في منتصف الشريط
          tabBarIcon: ({ focused }) => (
            <LinearGradient
              colors={[theme.glow3, theme.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.addBtn, { shadowColor: theme.accent, opacity: focused ? 1 : 0.92 }]}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </LinearGradient>
          ),
        }}
      />

      <Tabs.Screen
        name="flashcards"
        options={{
          title: t("tabs.cards"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums" color={color} size={size} />
          ),
        }}
      />

      {/* النشاط صار داخل الرئيسية (بطاقة اليوم + الأرقام) — نخفيه من الشريط لتخفيفه */}
      <Tabs.Screen name="activity" options={{ href: null }} />

      {/* مخفية من الشريط — تُفتح من القائمة الجانبية */}
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginTop: -14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
