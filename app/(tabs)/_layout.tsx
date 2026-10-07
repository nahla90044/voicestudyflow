// app/(tabs)/_layout.tsx
// تصميم 2.0: أربع وجهات فقط + زر «بحث وأوامر» في المنتصف (الشريط في study-tab-bar).
// الشاشات الأخرى (الخطة، إضافة كتاب، المزيد، الأرشيف) باقية كمسارات، وتُفتح من
// «بحث وأوامر» أو من الشاشات نفسها — لم تعد تزاحم الشريط.
import { Tabs } from "expo-router";
import React from "react";

import { StudyTabBar } from "../../components/brand/study-tab-bar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <StudyTabBar {...props} />}
      screenOptions={{
        // كل شاشة تعرض عنوانها الخاص (نتجنّب الهيدر المزدوج)
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="flashcards" />
      <Tabs.Screen name="activity" />

      {/* مسارات بلا زر في الشريط */}
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="add-book" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
