// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

export default function TabsLayout() {
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
          title: "الرئيسية",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="library"
        options={{
          title: "المكتبة",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="calendar"
        options={{
          title: "الخطة",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="add-book"
        options={{
          title: "إضافة",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="more"
        options={{
          title: "المزيد",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "الأرشيف",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="file-tray" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
