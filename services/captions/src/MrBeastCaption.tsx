import { AbsoluteFill, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Bangers";
import type { Caption } from "./types";

const { fontFamily } = loadFont();

const KEYWORD_COLOR = "#FFEB3B";
const DEFAULT_COLOR = "#FFFFFF";
const STROKE_COLOR = "#000000";

export const MrBeastCaption: React.FC<{
  caption: Caption;
  timeInSeconds: number;
}> = ({ caption, timeInSeconds }) => {
  const { fps, height } = useVideoConfig();

  const baseFontSize = Math.round(height * 0.078);
  const keywordFontSize = Math.round(height * 0.092);
  const strokeWidth = Math.max(10, Math.round(height * 0.011));
  const paddingBottom = Math.round(height * 0.13);
  const gap = Math.round(height * 0.014);
  const shadowOffset = Math.max(3, Math.round(height * 0.0035));

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap,
          maxWidth: "85%",
          fontFamily,
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          WebkitFontSmoothing: "antialiased",
          textRendering: "geometricPrecision",
        }}
      >
        {caption.words.map((word, i) => {
          const elapsedFrames = Math.max(0, (timeInSeconds - word.start) * fps);
          const isFuture = timeInSeconds < word.start;
          const isActive = timeInSeconds >= word.start && timeInSeconds <= word.end;

          // Spring with overshoot: 0.6 → 1.25 → settles 1.05
          const enter = spring({
            frame: elapsedFrames,
            fps,
            config: { damping: 12, stiffness: 200, mass: 0.6 },
            from: 0,
            to: 1,
          });
          const scale = isFuture
            ? 0
            : interpolate(enter, [0, 0.6, 1], [0.6, 1.25, word.isKeyword ? 1.12 : 1.05]);
          const translateY = isFuture
            ? height * 0.04
            : interpolate(enter, [0, 1], [height * 0.04, 0]);

          // INSTANT color switch (karaoke), no blend
          const color = isActive || timeInSeconds > word.end
            ? word.isKeyword ? KEYWORD_COLOR : DEFAULT_COLOR
            : DEFAULT_COLOR;

          return (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: Math.round(gap * 0.5),
                fontSize: word.isKeyword ? keywordFontSize : baseFontSize,
                color,
                WebkitTextStroke: `${strokeWidth}px ${STROKE_COLOR}`,
                paintOrder: "stroke fill",
                filter: `drop-shadow(0 ${shadowOffset}px 0 rgba(0,0,0,0.45))`,
                transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
                transformOrigin: "center bottom",
                lineHeight: 1,
                willChange: "transform, color",
              }}
            >
              {word.text}
              {word.emoji && (
                <span
                  style={{
                    WebkitTextStroke: 0,
                    paintOrder: "normal",
                    filter: "none",
                    fontSize: "0.85em",
                  }}
                >
                  {word.emoji}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
