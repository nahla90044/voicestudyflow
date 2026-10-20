// app/notes.tsx
// دفتر ملاحظات الكتاب المستقل (من «الأدوات»): يُفتح فوق صفحة الكتاب، منفصل عن ملاحظات القراءة،
// والإغلاق يرجع لنفس المكان بالضبط. إن كان صوت الكتاب يعمل يبقى زر إيقافه/تشغيله ظاهرًا.
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { ErrorBoundary } from "../components/brand/error-boundary";
import { NotesPad } from "../components/reader/notes-pad";
import { getPlayer, pause, resume, subscribePlayer } from "../lib/player";

export default function NotebookScreen() {
  const { book_id, book_title } = useLocalSearchParams<{ book_id?: string; book_title?: string }>();
  const bookId = typeof book_id === "string" ? book_id : "";
  const [player, setPlayer] = useState(getPlayer());
  useEffect(() => subscribePlayer(setPlayer), []);
  // من رابط مباشر قد لا يكون خلفها شيء: نرجع لصفحة الكتاب بدل أن يعلق الزر
  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/book/[id]", params: { id: bookId } }));
  if (!bookId) return null;
  return (
    <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
      <ErrorBoundary where="notebook" onBack={close}>
        <NotesPad
          bookId={`${bookId}:notebook`}
          bookTitle={typeof book_title === "string" ? book_title : ""}
          speaking={!!player?.playing}
          onTogglePlay={player ? () => (player.playing ? pause() : resume()) : undefined}
          onClose={close}
        />
      </ErrorBoundary>
    </View>
  );
}
