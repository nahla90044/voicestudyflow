// components/brand/word-sheet.tsx
// بطاقة الكلمة: تُحفظ في «كلماتي» فورًا، ويجهّز الذكاء المعنى في السياق، ونوع الكلمة،
// والاستخدام، والمرادفات، والأضداد، وجملًا مثالية. مع استماع وتحويل لبطاقة مراجعة.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Palette, Radius } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { speakText, stopSpeaking } from "../../lib/voice";
import { lookupWord, removeWord, wordsToCards, type SavedWord, type WordInfo } from "../../lib/words";
import { PressableScale } from "./motion";

type Props = { word: SavedWord | null; onClose: () => void; onRemoved?: () => void };

function VerbForm({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.vf}>
      <Text style={styles.vfLabel}>{label}</Text>
      <Text style={styles.vfValue}>{value}</Text>
    </View>
  );
}

export function WordSheet({ word, onClose, onRemoved }: Props) {
  const { t } = useI18n();
  const dir = useDir();
  const [info, setInfo] = useState<WordInfo | null>(word?.info ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [carded, setCarded] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (!word) return;
    setInfo(word.info ?? null);
    setFailed(false);
    setCarded(false);
    setRemoved(false);
    if (word.info) return;
    let on = true;
    setLoading(true);
    lookupWord(word)
      .then((i) => {
        if (!on) return;
        setInfo(i);
        if (!i) setFailed(true);
      })
      .catch(() => on && setFailed(true))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [word]);

  useEffect(() => () => void stopSpeaking(), []);

  if (!word) return null;
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ gap: 6 }}>
      <Text style={[styles.secTitle, { textAlign: dir.textAlign }]}>{title}</Text>
      {children}
    </View>
  );
  const Chips = ({ items, color }: { items: string[]; color: string }) => (
    <View style={[styles.chips, { flexDirection: dir.row }]}>
      {items.map((s) => (
        <View key={s} style={[styles.chip, { backgroundColor: color + "22" }]}>
          <Text style={[styles.chipTxt, { color }]}>{s}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <View style={[styles.head, { flexDirection: dir.row }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.word, { textAlign: dir.textAlign }]} selectable>
                {word.word}
              </Text>
              <Text style={[styles.saved, { textAlign: dir.textAlign }]}>
                {removed ? t("words.removed") : t("words.savedTo")}
                {info?.pos ? ` · ${info.pos}` : ""}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                setLoading(true);
                setFailed(false);
                const i = await lookupWord(word, true).catch(() => null);
                setInfo(i);
                setFailed(!i);
                setLoading(false);
              }}
              disabled={loading}
              style={styles.round}
              hitSlop={6}
              accessibilityLabel={t("glossary.regenerate")}
            >
              <Ionicons name="refresh" size={17} color={Palette.text} />
            </Pressable>
            <Pressable onPress={() => speakText(word.word)} style={styles.round} hitSlop={6} accessibilityLabel={t("glossary.listen")}>
              <Ionicons name="volume-medium" size={18} color="#5ED9FF" />
            </Pressable>
            <Pressable onPress={onClose} style={styles.round} hitSlop={6} accessibilityLabel={t("common.close")}>
              <Ionicons name="close" size={18} color={Palette.text} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 14, paddingBottom: 6 }}>
            {!!word.context && (
              <Text style={[styles.context, { textAlign: dir.textAlign }]} numberOfLines={3}>
                «{word.context}»
              </Text>
            )}
            {loading ? (
              <View style={[styles.loading, { flexDirection: dir.row }]}>
                <ActivityIndicator color={Palette.neonViolet} />
                <Text style={styles.dim}>{t("words.loading")}</Text>
              </View>
            ) : failed || !info ? (
              <Text style={styles.dim}>{t("words.failed")}</Text>
            ) : (
              <>
                <Section title={t("words.meaning")}>
                  <Text style={[styles.body, { textAlign: dir.textAlign }]}>{info.meaning}</Text>
                </Section>
                {!!info.usage && (
                  <Section title={t("words.usage")}>
                    <Text style={[styles.body, { textAlign: dir.textAlign }]}>{info.usage}</Text>
                  </Section>
                )}
                {info.verb && (
                  <Section title={t("words.verb")}>
                    <View style={[styles.verbRow, { flexDirection: dir.row }]}>
                      <VerbForm label={t("words.infinitive")} value={info.verb.infinitive} />
                      {!!info.verb.noun && <VerbForm label={t("words.noun")} value={info.verb.noun} />}
                      {!!info.verb.participle && <VerbForm label={t("words.participle")} value={info.verb.participle} />}
                    </View>
                    {info.verb.tenses.map((tn) => (
                      <View key={tn.name} style={styles.tense}>
                        <Text style={[styles.tenseName, { textAlign: dir.textAlign }]}>{tn.name}</Text>
                        <View style={styles.forms}>
                          {tn.forms.map((f) => (
                            <Text key={f} style={styles.form}>
                              {f}
                            </Text>
                          ))}
                        </View>
                        {!!tn.example && (
                          <Pressable onPress={() => speakText(tn.example!)} style={[styles.example, { flexDirection: dir.row }]}>
                            <Ionicons name="play-circle" size={15} color="#B9AFFF" />
                            <Text style={[styles.exampleTxt, { textAlign: dir.textAlign, fontSize: 13 }]}>{tn.example}</Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </Section>
                )}
                {info.synonyms.length > 0 && (
                  <Section title={t("words.synonyms")}>
                    <Chips items={info.synonyms} color="#6CF3C5" />
                  </Section>
                )}
                {info.antonyms.length > 0 && (
                  <Section title={t("words.antonyms")}>
                    <Chips items={info.antonyms} color="#FFB38A" />
                  </Section>
                )}
                {info.examples.length > 0 && (
                  <Section title={t("words.examples")}>
                    {info.examples.map((e) => (
                      <Pressable key={e} onPress={() => speakText(e)} style={[styles.example, { flexDirection: dir.row }]}>
                        <Ionicons name="play-circle" size={16} color="#B9AFFF" />
                        <Text style={[styles.exampleTxt, { textAlign: dir.textAlign }]}>{e}</Text>
                      </Pressable>
                    ))}
                  </Section>
                )}
              </>
            )}
          </ScrollView>

          <View style={[styles.actions, { flexDirection: dir.row }]}>
            <PressableScale
              onPress={async () => {
                if (!info || carded) return;
                await wordsToCards([{ ...word, info }]);
                setCarded(true);
              }}
              disabled={!info}
              style={[styles.btn, styles.btnMain, !info && { opacity: 0.5 }]}
            >
              <Ionicons name={carded ? "checkmark" : "albums"} size={16} color="#07080D" />
              <Text style={styles.btnMainTxt}>{carded ? t("glossary.saved") : t("words.toCard")}</Text>
            </PressableScale>
            <PressableScale
              onPress={async () => {
                await removeWord(word.key);
                setRemoved(true);
                onRemoved?.();
              }}
              disabled={removed}
              style={[styles.btn, removed && { opacity: 0.5 }]}
            >
              <Ionicons name="trash-outline" size={16} color="#FF6B81" />
              <Text style={[styles.btnTxt, { color: "#FF6B81" }]}>{t("words.remove")}</Text>
            </PressableScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#10121B",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    paddingBottom: 34,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  head: { alignItems: "center", gap: 8 },
  word: { color: "#D9D3FF", fontSize: 26, fontWeight: "800" },
  saved: { color: "#6CF3C5", fontSize: 12, fontWeight: "600", marginTop: 2 },
  round: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  context: { color: "#8E95AB", fontSize: 13.5, lineHeight: 22, fontStyle: "italic" },
  loading: { alignItems: "center", gap: 10, paddingVertical: 20, justifyContent: "center" },
  dim: { color: Palette.textDim, fontSize: 14, textAlign: "center" },
  secTitle: { color: "#8E95AB", fontSize: 12, fontWeight: "700" },
  body: { color: Palette.text, fontSize: 15, lineHeight: 25 },
  chips: { flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: Radius.pill },
  chipTxt: { fontSize: 13.5, fontWeight: "700" },
  example: { alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  exampleTxt: { flex: 1, color: "#C4C9D8", fontSize: 14, lineHeight: 23 },
  actions: { gap: 8 },
  verbRow: { flexWrap: "wrap", gap: 8 },
  vf: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(124,108,255,0.14)", gap: 2 },
  vfLabel: { color: "#8E95AB", fontSize: 11, fontWeight: "700" },
  vfValue: { color: "#D9D3FF", fontSize: 15, fontWeight: "800" },
  tense: { padding: 12, gap: 8, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)" },
  tenseName: { color: "#6CF3C5", fontSize: 13.5, fontWeight: "800" },
  forms: { flexDirection: "row", flexWrap: "wrap", gap: 6, direction: "ltr" },
  form: { width: "48%", color: Palette.text, fontSize: 13.5, writingDirection: "auto" },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  btnMain: { backgroundColor: "#F3F4F8" },
  btnTxt: { color: Palette.text, fontSize: 14, fontWeight: "700" },
  btnMainTxt: { color: "#07080D", fontSize: 14, fontWeight: "800" },
});
