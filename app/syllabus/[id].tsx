// app/syllabus/[id].tsx
// شاشة «المنهج الدراسي» الكاملة. المحتوى نفسه في components/syllabus/syllabus-view (وهو أول تبويب في صفحة الكتاب).
import { useLocalSearchParams } from "expo-router";
import React from "react";

import { SyllabusView } from "../../components/syllabus/syllabus-view";

export default function SyllabusScreen() {
  const { id, title, pdf_path, select } = useLocalSearchParams<{ id?: string; title?: string; pdf_path?: string; select?: string }>();
  return (
    <SyllabusView
      bookId={typeof id === "string" ? id : ""}
      title={typeof title === "string" ? title : undefined}
      pdfPath={typeof pdf_path === "string" ? pdf_path : ""}
      startSelect={select === "1"}
    />
  );
}
