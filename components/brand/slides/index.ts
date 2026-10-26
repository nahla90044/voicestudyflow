// components/brand/slides/index.ts
// سجل أشكال الشرائح: الشكل لكل مشهد من THEMES، وفي «منوّع» إطار مشترك واحد (MIXED_CHROME) حتى لا يبدو
// الفيديو مشتتًا: الخلفية الليلية الدائمة والترجمة والانتقال من السينمائي، والترويسة من المجلة —
// ولا يتغير بين المشاهد إلا قالب المحتوى (ويرسمه كل شكل مع ctx.bare = true).
import type { SlideTheme } from "../../../lib/slideThemeCore";
import { cinematic } from "./cinematic";
import { editorial } from "./editorial";
import type { SlideThemeModule } from "./shared";
import { visual } from "./visual";

export const THEMES: Record<SlideTheme, SlideThemeModule> = { editorial, visual, cinematic };

export type SlideChrome = Pick<SlideThemeModule, "Backdrop" | "Header" | "Caption" | "Transition">;

export const MIXED_CHROME: SlideChrome = {
  Backdrop: cinematic.Backdrop,
  Header: editorial.Header,
  Caption: cinematic.Caption,
  Transition: cinematic.Transition,
};

export * from "./shared";
