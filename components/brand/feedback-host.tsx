// components/brand/feedback-host.tsx
// بطاقات التطبيق المميزة (بدل نوافذ النظام):
//  • احتفال: عند اكتمال رفع كتاب أو ملخص أو فيديو — شارة متدرّجة وإيموجي متطايرة.
//  • تحذير: أي نافذة فيها زر «مدمّر» (حذف/مسح/خروج) تظهر بطاقة تحذير حمراء واضحة،
//    وتُوجَّه إليها تلقائيًا من Alert.alert (انظر app/_layout.tsx) فتشمل كل مواضع الحذف.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, type AlertButton } from "react-native";

import { useDir } from "../../lib/i18n";
import { useScene } from "../../lib/scene";

type Btn = { text: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };
type Card =
  | { kind: "success"; emoji: string; title: string; subtitle?: string; body?: string; tip?: string; primary: Btn; secondary?: Btn }
  | { kind: "danger"; title: string; body?: string; buttons: Btn[] };

let push: ((c: Card) => void) | null = null;
// تنبيه النظام الأصلي (قبل تعديله في app/_layout): بديل حين يتعذّر عرض البطاقة فوق نافذة مفتوحة
let nativeAlert: ((title: string, msg?: string, buttons?: AlertButton[]) => void) | null = null;
export function setNativeAlert(fn: (title: string, msg?: string, buttons?: AlertButton[]) => void): void {
  nativeAlert = fn;
}
const pending: Card[] = [];

function show(c: Card) {
  if (push) push(c);
  else pending.push(c);
}

/** بطاقة احتفال (نجاح) */
export function celebrate(c: Omit<Extract<Card, { kind: "success" }>, "kind">): void {
  show({ kind: "success", ...c });
}

/** بطاقة تحذير لنافذة فيها زر مدمّر؛ تُستدعى من Alert.alert المعدّلة */
export function dangerAlert(title: string, body: string | undefined, buttons: AlertButton[]): void {
  show({
    kind: "danger",
    title,
    body,
    buttons: buttons.map((b) => ({ text: String(b.text ?? ""), style: b.style ?? "default", onPress: b.onPress ? () => b.onPress!() : undefined })),
  });
}

/** هل تُعرض النافذة كبطاقة تحذير؟ زر مدمّر وثلاثة أزرار على الأكثر (القوائم الطويلة تبقى قائمة النظام) */
export function isDangerAlert(buttons?: AlertButton[]): boolean {
  return !!buttons && buttons.length <= 3 && buttons.some((b) => b.style === "destructive");
}

const DELETE_RE = /حذف|مسح|إزالة|delete|remove|clear|erase/i;
const FLOATERS = ["🎉", "✨", "⭐️", "🌱", "🎊", "💫"];

export function FeedbackHost() {
  const [queue, setQueue] = useState<Card[]>([]);
  useEffect(() => {
    push = (c) => setQueue((q) => [...q, c]);
    if (pending.length) setQueue((q) => [...q, ...pending.splice(0)]);
    return () => {
      push = null;
    };
  }, []);
  const card = queue[0] ?? null;
  // نغلق البطاقة أولًا ثم ننفّذ الزر بعد اكتمال الإغلاق (قد يفتح الزر بطاقة أخرى أو ينتقل لشاشة)
  const pendingFn = useRef<(() => void) | null>(null);
  const runPending = () => {
    const fn = pendingFn.current;
    pendingFn.current = null;
    if (fn) fn();
  };
  const close = (fn?: () => void) => {
    pendingFn.current = fn ?? null;
    setQueue((q) => q.slice(1));
    setTimeout(runPending, 600); // احتياط إن لم يصل حدث انتهاء الإغلاق
  };
  // البطاقة لم تظهر (نافذة أخرى مفتوحة يرفض iOS العرض فوقها) → تنبيه النظام بدلها، ولا يعلق الطابور
  const fallback = (c: Card) => {
    setQueue((q) => (q[0] === c ? q.slice(1) : q));
    if (c.kind === "danger" && nativeAlert) {
      nativeAlert(c.title, c.body, c.buttons.map((b) => ({ text: b.text, style: b.style, onPress: b.onPress })));
    }
  };
  return <CardView card={card} onClose={close} onDismissed={runPending} onNotShown={fallback} />;
}

function CardView({
  card: current,
  onClose,
  onDismissed,
  onNotShown,
}: {
  card: Card | null;
  onClose: (fn?: () => void) => void;
  onDismissed: () => void;
  onNotShown: (c: Card) => void;
}) {
  // نُبقي محتوى آخر بطاقة أثناء تلاشي الإغلاق (وإلا تظهر لحظة كإطار أبيض فارغ)
  const last = useRef<Card | null>(current);
  if (current) last.current = current;
  const card = last.current;
  const visible = !!current;
  // تأكيد الظهور: إن لم تُعرض النافذة خلال لحظة → البديل
  const shownRef = useRef(false);
  const presentedRef = useRef(false); // النافذة معروضة الآن (بطاقة تالية في نفس النافذة لا تحتاج حدث ظهور جديد)
  useEffect(() => {
    if (!current) return;
    if (presentedRef.current) return;
    shownRef.current = false;
    const c = current;
    const id = setTimeout(() => {
      if (!shownRef.current) onNotShown(c);
    }, 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  const dir = useDir();
  const { pal } = useScene();
  const pop = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    const card = current;
    pop.setValue(0);
    Haptics.notificationAsync(card.kind === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    if (card.kind !== "success") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [current, pop, float]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const bob = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const danger = card?.kind === "danger";
  const red = pal.dark ? "#FF7A7A" : "#C0392B";
  const cancelBtn = danger ? card.buttons.find((b) => b.style === "cancel") : undefined;
  const dismiss = () => onClose(card?.kind === "danger" ? cancelBtn?.onPress : card?.secondary?.onPress);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      onShow={() => {
        shownRef.current = true;
        presentedRef.current = true;
      }}
      onDismiss={() => {
        presentedRef.current = false;
        onDismissed();
      }}
    >
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={[styles.card, { backgroundColor: pal.card, borderColor: danger ? red + "55" : pal.cardBorder, opacity: pop, transform: [{ scale }] }]}
        >
          {card?.kind === "success" ? (
            <>
              <View style={styles.floatRow} pointerEvents="none">
                {FLOATERS.map((e, i) => (
                  <Animated.Text
                    key={e}
                    style={[styles.floater, { transform: [{ translateY: i % 2 ? bob : Animated.multiply(bob, -1) }, { rotate: `${(i - 2.5) * 9}deg` }] }]}
                  >
                    {e}
                  </Animated.Text>
                ))}
              </View>
              <Animated.View style={{ transform: [{ translateY: bob }] }}>
                <LinearGradient colors={["#FFD27A", "#F59E5B", pal.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
                  <Text style={styles.badgeEmoji}>{card.emoji}</Text>
                </LinearGradient>
              </Animated.View>
              <Text style={[styles.title, { color: pal.ink }]}>{card.title}</Text>
              {!!card.subtitle && (
                <Text style={[styles.subtitle, { color: pal.accent }]} numberOfLines={2}>
                  {card.subtitle}
                </Text>
              )}
              {!!card.body && <Text style={[styles.body, { color: pal.dim }]}>{card.body}</Text>}
              {!!card.tip && (
                <View style={[styles.tip, { backgroundColor: pal.soft, flexDirection: dir.row }]}>
                  <Text style={styles.tipEmoji}>💡</Text>
                  <Text style={[styles.tipTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{card.tip}</Text>
                </View>
              )}
              <Pressable
                onPress={() => onClose(card.primary.onPress)}
                style={({ pressed }) => [styles.primary, { backgroundColor: pal.accent, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.primaryTxt, { color: pal.onAccent }]}>{card.primary.text}</Text>
              </Pressable>
              {card.secondary ? (
                <Pressable onPress={() => onClose(card.secondary!.onPress)} hitSlop={8} style={styles.secondary}>
                  <Text style={[styles.secondaryTxt, { color: pal.dim }]}>{card.secondary.text}</Text>
                </Pressable>
              ) : null}
            </>
          ) : card?.kind === "danger" ? (
            <>
              <View style={[styles.dangerBadge, { backgroundColor: red + "1F", borderColor: red + "40" }]}>
                <Ionicons name={card.buttons.some((b) => b.style === "destructive" && DELETE_RE.test(b.text)) ? "trash" : "warning"} size={38} color={red} />
              </View>
              <Text style={[styles.title, { color: pal.ink }]}>{card.title}</Text>
              {!!card.body && (
                <ScrollView style={{ maxHeight: 220, alignSelf: "stretch" }} contentContainerStyle={{ alignItems: "center" }}>
                  <Text style={[styles.body, { color: pal.dim }]}>{card.body}</Text>
                </ScrollView>
              )}
              <View style={{ alignSelf: "stretch", marginTop: 18, gap: 10 }}>
                {card.buttons
                  .filter((b) => b.style !== "cancel")
                  .map((b) => {
                    const destructive = b.style === "destructive";
                    return (
                      <Pressable
                        key={b.text}
                        onPress={() => onClose(b.onPress)}
                        style={({ pressed }) => [
                          styles.primary,
                          { marginTop: 0, opacity: pressed ? 0.85 : 1 },
                          destructive ? { backgroundColor: red } : { backgroundColor: pal.soft, borderWidth: StyleSheet.hairlineWidth, borderColor: pal.cardBorder },
                        ]}
                      >
                        <View style={{ flexDirection: dir.row, alignItems: "center", gap: 8 }}>
                          {destructive && DELETE_RE.test(b.text) && <Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
                          <Text style={[styles.primaryTxt, { color: destructive ? "#FFFFFF" : pal.ink }]}>{b.text}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                {cancelBtn ? (
                  <Pressable onPress={() => onClose(cancelBtn.onPress)} hitSlop={8} style={[styles.secondary, { alignSelf: "center" }]}>
                    <Text style={[styles.secondaryTxt, { color: pal.dim }]}>{cancelBtn.text}</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,20,12,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 32,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  floatRow: { position: "absolute", top: 14, left: 18, right: 18, flexDirection: "row", justifyContent: "space-between" },
  floater: { fontSize: 22 },
  badge: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", marginTop: 18, marginBottom: 16 },
  badgeEmoji: { fontSize: 50 },
  dangerBadge: { width: 84, height: 84, borderRadius: 42, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 22, fontWeight: "900", textAlign: "center" },
  subtitle: { fontSize: 16, fontWeight: "800", textAlign: "center", marginTop: 6 },
  body: { fontSize: 14.5, lineHeight: 23, textAlign: "center", marginTop: 8 },
  tip: { alignItems: "center", gap: 8, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginTop: 16, alignSelf: "stretch" },
  tipEmoji: { fontSize: 18 },
  tipTxt: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  primary: { alignSelf: "stretch", borderRadius: 999, paddingVertical: 15, alignItems: "center", marginTop: 18 },
  primaryTxt: { fontSize: 16, fontWeight: "900" },
  secondary: { paddingVertical: 12 },
  secondaryTxt: { fontSize: 14, fontWeight: "700" },
});
