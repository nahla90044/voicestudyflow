// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

import { useI18n } from "../../lib/i18n";

export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        // نخفي هيدر التبويبات لأن كل شاشة تعرض عنوانها الخاص (نتجنّب الهيدر المزدوج والنطّ)
        headerShown: false,

        tabBarStyle: {
          backgroundColor: "#0b1220",
          borderTopColor: "rgba(255,255,255,0.12)",
        },
        tabBarActiveTintColor: "#4f8cff",
        tabBarInactiveTintColor: "#9fb3c8",

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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" color={color} size={size} />
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

      <Tabs.Screen
        name="activity"
        options={{
          title: t("tabs.activity"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" color={color} size={size} />
          ),
        }}
      />

      {/* مخفية من الشريط — تُفتح من القائمة الجانبية */}
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
