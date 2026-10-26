// components/brand/slides/cinematic.tsx
// شكل سينمائي «ضوءٌ على المعنى»: كل مشهد لقطة في ليل نجمي — خلفية بطبقات عميقة تتحرك ببطء ويتبدّل لون سُدُمها
// بمعنى المشهد، ونص يظهر كلمةً كلمة مع الراوي، وكلمة مفتاحية تتوهج، وسؤال الفهم لحظة صمت تنزل فيها أشرطة السينما،
// وينتهي الفيديو بفجر عند «أسئلة الوحدة».
// النموذج: docs/slides-design/٣-سينمائي-متحرك.html — وملاحظات التنفيذ في docs/slides-design/notes-for-implementation.json.
// التنفيذ مقسّم في المجلد cinematic/:
// - kit.tsx: الألوان والتوهّج والحركة والكلمات والتخطيط.
// - chrome.tsx: الخلفية الدائمة والترويسة والترجمة والانتقالات.
// - scenes-a/b/c.tsx: القوالب الخمسة عشر بأدوارها.
// قواعد الملف: يستورد فقط من ./shared و lib/slideThemeCore و lib/slideFonts والمكتبات المثبتة، والمحتوى من ctx.m وحده.
import React from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { type SlideCtx, type SlideThemeModule, useTrigger } from "./shared";
import { CinemaBackdrop, CinemaCaption, CinemaHeader, CinemaTransition } from "./cinematic/chrome";
import { EO, useRun } from "./cinematic/kit";
import { CardsScene, CoverScene, GroupsScene, ListScene } from "./cinematic/scenes-a";
import { CompareScene, DefineScene, StatScene, TreeScene } from "./cinematic/scenes-b";
import { CheckScene, QIntroScene, SealScene, SummaryScene } from "./cinematic/scenes-c";

/** محتوى القالب (كل قالب من الخمسة عشر له رسمه) */
function Body({ ctx }: { ctx: SlideCtx }) {
  const { m } = ctx;
  if (m.template === "qIntro" || m.role === "qIntro") return <QIntroScene ctx={ctx} />;
  if (m.template === "check") return <CheckScene ctx={ctx} />;
  switch (m.template) {
    case "cover":
      return <CoverScene ctx={ctx} />;
    case "list":
    case "steps":
      return <ListScene ctx={ctx} />;
    case "cards":
      return <CardsScene ctx={ctx} />;
    case "groups":
      return <GroupsScene ctx={ctx} />;
    case "define":
      return <DefineScene ctx={ctx} />;
    case "tree":
      return <TreeScene ctx={ctx} />;
    case "compare":
      return <CompareScene ctx={ctx} />;
    case "stat":
    case "range":
      return <StatScene ctx={ctx} />;
    case "quote":
    case "seal":
      return <SealScene ctx={ctx} />;
    case "summary":
      return <SummaryScene ctx={ctx} />;
    default:
      return <ListScene ctx={ctx} />;
  }
}

/**
 * غلاف المشهد: دخول (شفافية ٠ وتكبير ١٫٠٣٥ ← ١، أو دفع بالعمق من ‎.8 قبل التفرّع والمجموعات)،
 * ثم تكبير بطيء (Ken Burns) طوال المشهد — ‎٢٫٥٪ فقط حتى لا يدخل المحتوى مربع الزاوية ولا منطقة الترجمة،
 * ولا شيء في السؤال (أشرطته ثابتة).
 */
function CinemaScene({ ctx }: { ctx: SlideCtx }) {
  const { m } = ctx;
  const depth = m.template === "tree" || m.template === "groups";
  const still = m.template === "check";
  const enter = useTrigger(ctx.sv, 0, depth ? 720 : 650, EO);
  const kb = useRun(18000);
  const amp = still ? 0 : 0.025;
  const st = useAnimatedStyle(() => {
    const e = Math.min(1, enter.value);
    const s0 = depth ? 0.8 + 0.2 * e : 1.035 - 0.035 * e;
    return { opacity: e, transform: [{ scale: s0 * (1 + amp * kb.value) }] };
  }, [depth, amp]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]} pointerEvents="none">
      <Body ctx={ctx} />
    </Animated.View>
  );
}

export const cinematic: SlideThemeModule = {
  id: "cinematic",
  Scene: CinemaScene,
  Backdrop: CinemaBackdrop,
  Header: CinemaHeader,
  Caption: CinemaCaption,
  Transition: CinemaTransition,
};
