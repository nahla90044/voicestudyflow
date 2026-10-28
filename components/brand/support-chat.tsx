// components/brand/support-chat.tsx
// «اسأل عن التطبيق» أعلى «المساعدة» (قرار نهلة ٢٨ أكتوبر): إجابة فورية من دليل التطبيق، وتحت كل إجابة
// «تم الحل» أو «لم تُحلّ مشكلتي» (تُرسل للمالكة). الإجابة غير المؤكَّدة تعرض الإرسال مباشرة.
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Radius } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { askSupport, sendTicket } from "../../lib/support";
import { SceneCard } from "./scene-screen";

type Turn = { q: string; a: string; unsure: boolean; state: "idle" | "solved" | "sending" | "sent" | "limit" | "fail" };

export function SupportChat() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);

  async function ask() {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    try {
      const r = await askSupport(question);
      setTurns((ts) => [...ts, { q: question, a: r.answer, unsure: r.unsure, state: "idle" }]);
      setQ("");
    } catch {
      setTurns((ts) => [...ts, { q: question, a: t("support.err"), unsure: true, state: "idle" }]);
    } finally {
      setBusy(false);
    }
  }

  function mark(i: number, state: Turn["state"]) {
    setTurns((ts) => ts.map((x, k) => (k === i ? { ...x, state } : x)));
  }

  async function send(i: number) {
    const tn = turns[i];
    mark(i, "sending");
    const r = await sendTicket(tn.q, tn.a).catch(() => "fail" as const);
    mark(i, r === "ok" ? "sent" : r);
  }

  return (
    <SceneCard style={{ gap: 12, borderWidth: 1.5, borderColor: pal.accent }}>
      <View style={{ flexDirection: dir.row, gap: 10, alignItems: "center" }}>
        <Ionicons name="chatbubbles" size={20} color={pal.accent} />
        <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign, flex: 1 }]}>{t("support.title")}</Text>
      </View>
      <Text style={[styles.hint, { color: pal.dim, textAlign: dir.textAlign }]}>{t("support.hint")}</Text>

      {turns.map((tn, i) => (
        <View key={i} style={{ gap: 8 }}>
          <View style={[styles.q, { backgroundColor: pal.soft, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]}>
            <Text style={[styles.qTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{tn.q}</Text>
          </View>
          <Text style={[styles.a, { color: pal.ink, textAlign: dir.textAlign }]}>{tn.a}</Text>
          {tn.state === "idle" ? (
            <View style={{ flexDirection: dir.row, gap: 8, flexWrap: "wrap" }}>
              {!tn.unsure ? (
                <Pressable onPress={() => mark(i, "solved")} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: pal.soft }]}>
                  <Text style={[styles.chipTxt, { color: pal.ink }]}>✓ {t("support.solved")}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => void send(i)} style={[styles.chip, { borderColor: pal.accent, backgroundColor: tn.unsure ? pal.accent : pal.soft }]}>
                <Text style={[styles.chipTxt, { color: tn.unsure ? pal.onAccent : pal.accent }]}>{tn.unsure ? t("support.sendTeam") : t("support.notSolved")}</Text>
              </Pressable>
            </View>
          ) : tn.state === "sending" ? (
            <ActivityIndicator color={pal.accent} style={{ alignSelf: dir.isRTL ? "flex-end" : "flex-start" }} />
          ) : (
            <Text style={[styles.done, { color: tn.state === "fail" ? "#B42318" : "#15803D", textAlign: dir.textAlign }]}>
              {t(tn.state === "solved" ? "support.thanks" : tn.state === "sent" ? "support.sent" : tn.state === "limit" ? "support.limit" : "support.sendFail")}
            </Text>
          )}
        </View>
      ))}

      <View style={[styles.inputRow, { flexDirection: dir.row, borderColor: pal.cardBorder, backgroundColor: pal.soft }]}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("support.placeholder")}
          placeholderTextColor={pal.dim}
          style={[styles.input, { color: pal.ink, textAlign: dir.textAlign }]}
          multiline
          maxLength={500}
          editable={!busy}
          onSubmitEditing={() => void ask()}
        />
        <Pressable onPress={() => void ask()} disabled={busy || !q.trim()} style={[styles.send, { backgroundColor: q.trim() ? pal.accent : pal.cardBorder }]} accessibilityLabel={t("support.ask")}>
          {busy ? <ActivityIndicator color={pal.onAccent} /> : <Ionicons name={dir.isRTL ? "arrow-back" : "arrow-forward"} size={20} color={pal.onAccent} />}
        </Pressable>
      </View>
    </SceneCard>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16.5, fontWeight: "900" },
  hint: { fontSize: 13, lineHeight: 20, marginTop: -4 },
  q: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "88%" },
  qTxt: { fontSize: 14, fontWeight: "700", lineHeight: 21 },
  a: { fontSize: 14.5, lineHeight: 24 },
  chip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 14, height: 36, alignItems: "center", justifyContent: "center" },
  chipTxt: { fontSize: 13.5, fontWeight: "800" },
  done: { fontSize: 13.5, fontWeight: "700", lineHeight: 21 },
  inputRow: { borderWidth: 1, borderRadius: 18, alignItems: "flex-end", gap: 8, padding: 6 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, fontSize: 15, paddingHorizontal: 8, paddingTop: 10 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
