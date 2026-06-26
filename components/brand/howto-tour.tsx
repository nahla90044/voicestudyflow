// components/brand/howto-tour.tsx
// جولة تعريفية بخطوات مصوّرة تشرح أهم ميزات التطبيق.
// تُستخدم أول مرة تلقائيًا، ويمكن إعادتها من صفحة المساعدة.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Gradients, Palette, Radius, Spacing } from "../../constants/design";

type Step = { emoji: string; title: string; body: string };

// صياغة محايدة (للجميع) بأسلوب الأسماء بدل الأفعال المؤنّثة/المذكّرة
const STEPS: Step[] = [
  {
    emoji: "📚",
    title: "المكتبة",
    body: "كل الكتب هنا. الضغط على الكتاب يفتحه للقراءة مباشرة. والضغط المطوّل على الكتاب يفتح قائمة الخيارات: نقل لمجلد، المنهج الدراسي، إعادة تسمية، أرشفة، وحذف.",
  },
  {
    emoji: "👆",
    title: "الضغط المطوّل",
    body: "في المكتبة، الضغط المطوّل على أي كتاب يكشف إجراءات إضافية مهمة (المجلدات والمنهج والأرشفة). جرّبه لاكتشاف المزيد.",
  },
  {
    emoji: "📋",
    title: "المنهج الدراسي",
    body: "لكل كتاب منهج بوحدات وقائمة متابعة، مع اختبار وخريطة ذهنية وملخّص صوتي لكل وحدة. يُفتح من قائمة الضغط المطوّل على الكتاب.",
  },
  {
    emoji: "🎧",
    title: "القراءة الصوتية",
    body: "قارئ بصوت طبيعي يقرأ ويشرح. التحكّم بالسرعة، والتنقّل بين المقاطع، والاستئناف من نفس الموضع.",
  },
  {
    emoji: "🗣️",
    title: "النطق والترجمة",
    body: "نطق دقيق بالتشكيل، وترجمة فورية، وأصوات بعدة لغات — حسب الحاجة.",
  },
  {
    emoji: "🛠️",
    title: "أدوات الذكاء",
    body: "تلخيص الصفحة، الأسئلة، بطاقات المراجعة، الخريطة الذهنية، والعرض التقديمي — كلها بضغطة.",
  },
];

export function HowToTour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  function close() {
    setStep(0);
    onClose();
  }
  function next() {
    if (isLast) close();
    else setStep((p) => p + 1);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.mask}>
        <View style={styles.card}>
          <Pressable onPress={close} style={styles.skip} hitSlop={8}>
            <Text style={styles.skipTxt}>تخطّي</Text>
          </Pressable>

          <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emojiWrap}>
            <Text style={styles.emoji}>{s.emoji}</Text>
          </LinearGradient>

          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.body}>{s.body}</Text>

          {/* نقاط التقدّم */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>

          <Pressable onPress={next} style={styles.nextBtn}>
            <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextGrad}>
              <Text style={styles.nextTxt}>{isLast ? "يلّا نبدأ ✨" : "التالي"}</Text>
              {!isLast && <Ionicons name="chevron-back" size={18} color="#fff" />}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.66)", alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Palette.bgElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.xl,
    alignItems: "center",
  },
  skip: { position: "absolute", top: 14, left: 14, padding: 6 },
  skipTxt: { color: Palette.textDim, fontSize: 13, fontWeight: "700" },
  emojiWrap: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", marginTop: 8 },
  emoji: { fontSize: 40 },
  title: { color: Palette.text, fontSize: 22, fontWeight: "900", marginTop: 18, textAlign: "center" },
  body: { color: Palette.textMuted, fontSize: 15, lineHeight: 26, textAlign: "center", marginTop: 10 },
  dots: { flexDirection: "row", gap: 7, marginTop: 22 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.border },
  dotOn: { width: 20, backgroundColor: Palette.neonViolet },
  nextBtn: { alignSelf: "stretch", marginTop: 22, borderRadius: Radius.lg, overflow: "hidden" },
  nextGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 15 },
  nextTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
