// app/listening/[id].tsx
// وجهة الضغط على بطاقة القراءة (الجزيرة العائمة/شاشة القفل): تفتح الكتاب المسموع.
// إن كان القارئ مفتوحًا لنفس الكتاب نرجع إليه (لا نفتح قارئًا ثانيًا يقرأ بالتوازي).
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator } from "react-native";

import { SceneScreen } from "../../components/brand/scene-screen";
import { getUserId } from "../../lib/auth";
import { getOpenReaderBook } from "../../lib/readingCard";
import { useScene } from "../../lib/scene";
import { supabase } from "../../lib/supabase";

export default function ListeningRedirect() {
  const router = useRouter();
  const { pal } = useScene();
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
    <SceneScreen style={{ alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={pal.accent} />
    </SceneScreen>
  );
}
