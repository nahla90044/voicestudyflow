// components/brand/word-sheet.tsx
// بطاقة الكلمة: تُحفظ في «كلماتي» فورًا، ويجهّز الذكاء المعنى في السياق، ونوع الكلمة،
// والاستخدام، والمرادفات، والأضداد، وجملًا مثالية. مع استماع وتحويل لبطاقة مراجعة.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { Radius } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene, type ScenePalette } from "../../lib/scene";
import { speakText, stopSpeaking } from "../../lib/voice";
import { lookupWord, removeWord, wordsToCards, type SavedWord, type WordInfo } from "../../lib/words";
import { PressableScale } from "./motion";

type Props = { word: SavedWord | null; onClose: () => void; onRemoved?: () => void };

type Tint = { bg: string; fg: string };
/** ألوان دلالية هادئة تُقرأ على المشهد الفاتح والداكن: المرادفات خضراء، الأضداد خوخية، الحذف أحمر */
function tints(pal: ScenePalette): { syn: Tint; ant: Tint; danger: Tint } {
  return pal.dark
    ? {
        syn: { bg: "rgba(108,243,197,0.14)", fg: "#7FE8C4" },
        ant: { bg: "rgba(255,179,138,0.16)", fg: "#FFBE9A" },
        danger: { bg: "rgba(255,107,129,0.12)", fg: "#FF8A9B" },
      }
    : {
        syn: { bg: "#E2F2E6", fg: "#22683A" },
        ant: { bg: "#FCE9DC", fg: "#A2501E" },
        danger: { bg: "#FBE7E7", fg: "#B4332F" },
      };
}

function VerbForm({ label, value, pal }: { label: string; value: string; pal: ScenePalette }) {
  return (
    <View style={[styles.vf, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
      <Text style={[styles.vfLabel, { color: pal.dim }]}>{label}</Text>
      <Text style={[styles.vfValue, { color: pal.ink }]}>{value}</Text>
    </View>
  );
}

export function WordSheet({ word, onClose, onRemoved }: Props) {
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  const dir = useDir();
  const { pal } = useScene();
  const tint = tints(pal);
  const roundBg = pal.dark ? "rgba(255,255,255,0.08)" : pal.soft;
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
      <Text style={[styles.secTitle, { color: pal.dim, textAlign: dir.textAlign }]}>{title}</Text>
      {children}
    </View>
  );
  const Chips = ({ items, tone }: { items: string[]; tone: Tint }) => (
    <View style={[styles.chips, { flexDirection: dir.row }]}>
      {items.map((s) => (
        <View key={s} style={[styles.chip, { backgroundColor: tone.bg }]}>
          <Text style={[styles.chipTxt, { color: tone.fg }]}>{s}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* الخلفية للإغلاق منفصلة عن النافذة: كانت النافذة داخل عنصر يلتقط اللمس فيمنع تمرير المعنى */}
      <View style={[styles.mask, { backgroundColor: pal.dark ? "rgba(0,0,0,0.6)" : "rgba(31,53,39,0.35)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("common.close")} />
        <View style={[styles.sheet, { backgroundColor: pal.card, borderColor: pal.cardBorder, maxHeight: winH * 0.88 }]}>
          <View style={[styles.grip, { backgroundColor: pal.track }]} />
          <View style={[styles.head, { flexDirection: dir.row }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.word, { color: pal.ink, textAlign: dir.textAlign }]} selectable>
                {word.word}
              </Text>
              <Text style={[styles.saved, { color: removed ? pal.dim : pal.accent, textAlign: dir.textAlign }]}>
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
              style={[styles.round, { backgroundColor: roundBg }]}
              hitSlop={6}
              accessibilityLabel={t("glossary.regenerate")}
            >
              <Ionicons name="refresh" size={17} color={pal.ink} />
            </Pressable>
            <Pressable onPress={() => speakText(word.word)} style={[styles.round, { backgroundColor: roundBg }]} hitSlop={6} accessibilityLabel={t("glossary.listen")}>
              <Ionicons name="volume-medium" size={18} color={pal.accent} />
            </Pressable>
            <Pressable onPress={onClose} style={[styles.round, { backgroundColor: roundBg }]} hitSlop={6} accessibilityLabel={t("common.close")}>
              <Ionicons name="close" size={18} color={pal.ink} />
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0, maxHeight: winH * 0.62 }} contentContainerStyle={{ gap: 14, paddingBottom: 6 }} showsVerticalScrollIndicator>
            {!!word.context && (
              <Text style={[styles.context, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={3}>
                «{word.context}»
              </Text>
            )}
            {loading ? (
              <View style={[styles.loading, { flexDirection: dir.row }]}>
                <ActivityIndicator color={pal.accent} />
                <Text style={[styles.dim, { color: pal.dim }]}>{t("words.loading")}</Text>
              </View>
            ) : failed || !info ? (
              <Text style={[styles.dim, { color: pal.dim }]}>{t("words.failed")}</Text>
            ) : (
              <>
                <Section title={t("words.meaning")}>
                  <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>{info.meaning}</Text>
                </Section>
                {!!info.usage && (
                  <Section title={t("words.usage")}>
                    <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>{info.usage}</Text>
                  </Section>
                )}
                {info.verb && (
                  <Section title={t("words.verb")}>
                    <View style={[styles.verbRow, { flexDirection: dir.row }]}>
                      <VerbForm pal={pal} label={t("words.infinitive")} value={info.verb.infinitive} />
                      {!!info.verb.noun && <VerbForm pal={pal} label={t("words.noun")} value={info.verb.noun} />}
                      {!!info.verb.participle && <VerbForm pal={pal} label={t("words.participle")} value={info.verb.participle} />}
                    </View>
                    {info.verb.tenses.map((tn) => (
                      <View key={tn.name} style={[styles.tense, { backgroundColor: pal.dark ? "rgba(255,255,255,0.04)" : pal.bg, borderColor: pal.cardBorder }]}>
                        <Text style={[styles.tenseName, { color: pal.accent, textAlign: dir.textAlign }]}>{tn.name}</Text>
                        <View style={styles.forms}>
                          {tn.forms.map((f) => (
                            <Text key={f} style={[styles.form, { color: pal.ink }]}>
                              {f}
                            </Text>
                          ))}
                        </View>
                        {!!tn.example && (
                          <Pressable onPress={() => speakText(tn.example!)} style={[styles.example, { flexDirection: dir.row }]}>
                            <Ionicons name="play-circle" size={15} color={pal.accent} />
                            <Text style={[styles.exampleTxt, { color: pal.ink, textAlign: dir.textAlign, fontSize: 13 }]}>{tn.example}</Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </Section>
                )}
                {info.synonyms.length > 0 && (
                  <Section title={t("words.synonyms")}>
                    <Chips items={info.synonyms} tone={tint.syn} />
                  </Section>
                )}
                {info.antonyms.length > 0 && (
                  <Section title={t("words.antonyms")}>
                    <Chips items={info.antonyms} tone={tint.ant} />
                  </Section>
                )}
                {info.examples.length > 0 && (
                  <Section title={t("words.examples")}>
                    {info.examples.map((e) => (
                      <Pressable key={e} onPress={() => speakText(e)} style={[styles.example, { flexDirection: dir.row }]}>
                        <Ionicons name="play-circle" size={16} color={pal.accent} />
                        <Text style={[styles.exampleTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{e}</Text>
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
              style={[styles.btn, { backgroundColor: pal.accent }, !info && { opacity: 0.5 }]}
            >
              <Ionicons name={carded ? "checkmark" : "albums"} size={16} color={pal.onAccent} />
              <Text style={[styles.btnMainTxt, { color: pal.onAccent }]}>{carded ? t("glossary.saved") : t("words.toCard")}</Text>
            </PressableScale>
            <PressableScale
              onPress={async () => {
                await removeWord(word.key);
                setRemoved(true);
                onRemoved?.();
              }}
              disabled={removed}
              style={[styles.btn, { backgroundColor: tint.danger.bg }, removed && { opacity: 0.5 }]}
            >
              <Ionicons name="trash-outline" size={16} color={tint.danger.fg} />
              <Text style={[styles.btnTxt, { color: tint.danger.fg }]}>{t("words.remove")}</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    paddingBottom: 34,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3 },
  head: { alignItems: "center", gap: 8 },
  word: { fontSize: 26, fontWeight: "900" },
  saved: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  context: { fontSize: 13.5, lineHeight: 22, fontStyle: "italic" },
  loading: { alignItems: "center", gap: 10, paddingVertical: 20, justifyContent: "center" },
  dim: { fontSize: 14, textAlign: "center" },
  secTitle: { fontSize: 12, fontWeight: "800" },
  body: { fontSize: 15, lineHeight: 25 },
  chips: { flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill },
  chipTxt: { fontSize: 13.5, fontWeight: "700" },
  example: { alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  exampleTxt: { flex: 1, fontSize: 14, lineHeight: 23, opacity: 0.9 },
  actions: { gap: 8 },
  verbRow: { flexWrap: "wrap", gap: 8 },
  vf: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, gap: 2, borderWidth: StyleSheet.hairlineWidth },
  vfLabel: { fontSize: 11, fontWeight: "700" },
  vfValue: { fontSize: 15, fontWeight: "900" },
  tense: { padding: 12, gap: 8, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  tenseName: { fontSize: 13.5, fontWeight: "900" },
  forms: { flexDirection: "row", flexWrap: "wrap", gap: 6, direction: "ltr" },
  form: { width: "48%", fontSize: 13.5, writingDirection: "auto" },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnTxt: { fontSize: 14, fontWeight: "800" },
  btnMainTxt: { fontSize: 14, fontWeight: "900" },
});
