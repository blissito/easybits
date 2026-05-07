export type Word = {
  text: string;
  start: number;
  end: number;
};

export type EnrichedWord = Word & {
  isKeyword?: boolean;
  emoji?: string;
  variant?: AnimationVariant;
};

export type AnimationVariant = "scale" | "pulse" | "color-cycle" | "slam";

export type Caption = {
  words: EnrichedWord[];
  start: number;
  end: number;
};

export type BrollClip = {
  src: string;
  start: number;
  end: number;
};

export type Template = "mrbeast" | "hormozi";

export type CaptionPosition = "top" | "center" | "bottom";

export type RenderProps = {
  videoSrc: string;
  durationInSeconds: number;
  width: number;
  height: number;
  template: Template;
  position: CaptionPosition;
  captions: Caption[];
  broll: BrollClip[];
};
