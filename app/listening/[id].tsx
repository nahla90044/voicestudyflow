// app/listening/[id].tsx
// وجهة الضغط على بطاقة القراءة (الجزيرة العائمة/شاشة القفل): تفتح الكتاب المسموع.
// إن كان القارئ مفتوحًا لنفس الكتاب نرجع إليه (لا نفتح قارئًا ثانيًا يقرأ بالتوازي).
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { Palette } from "../../constants/design";
import { getUserId } from "../../lib/auth";
import { getOpenReaderBook } from "../../lib/readingCard";
import { supabase } from "../../lib/supabase";

export default function ListeningRedirect() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    let on = true;
    (async () => {
      if (id && getOpenReaderBook() === id && router.canGoBack()) return router.back();
      try {
        const uid = await getUserId();
        const { data } = await supabase.from("books").select("id,title,pdf_path").eq("id", id).eq("user_id", uid).maybeSingle();
        if (!on) return;
        if (data) router.replace({ pathname: "/reader/[id]", params: { id: data.id, title: data.title, pdf_path: data.pdf_path } });
        else router.replace("/");
      } catch {
        if (on) router.replace("/");
      }
    })();
    return () => {
      on = false;
    };
  }, [id, router]);

  return (
    <View style={{ flex: 1, backgroundColor: Palette.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={Palette.text} />
    </View>
  );
}
