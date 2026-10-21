// lib/cardLook.ts
// هوية كل نوع بطاقة: لون الشريط العلوي، والأيقونة، ومفتاح اسمه — مشتركة بين شاشات البطاقات.
import type { Ionicons } from "@expo/vector-icons";

import type { Card } from "./flashcards";

type Look = { color: string; icon: keyof typeof Ionicons.glyphMap; label: string };

const LOOKS: Record<NonNullable<Card["kind"]>, Look> = {
  words: { color: "#0EA5E9", icon: "text-outline", label: "cards.type.words" },
  definitions: { color: "#2563EB", icon: "book-outline", label: "cards.type.definitions" },
  qa: { color: "#7C3AED", icon: "help-circle-outline", label: "cards.type.qa" },
  compare: { color: "#D97706", icon: "git-compare-outline", label: "cards.type.compare" },
  tf: { color: "#15803D", icon: "checkmark-done-outline", label: "cards.type.tf" },
  fill: { color: "#DB2777", icon: "create-outline", label: "cards.type.fill" },
  mcq: { color: "#9333EA", icon: "list-outline", label: "cards.type.mcq" },
};

export function cardLook(kind: Card["kind"]): Look {
  return LOOKS[kind ?? "qa"] ?? LOOKS.qa;
}
