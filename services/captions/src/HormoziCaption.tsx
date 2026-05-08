import { AbsoluteFill, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadEmojiFont } from "@remotion/google-fonts/NotoColorEmoji";
import type { Caption, CaptionPosition } from "./types";

const { fontFamily } = loadFont("normal", { weights: ["900"] });
const { fontFamily: emojiFontFamily } = loadEmojiFont();
const fontStack = `${fontFamily}, ${emojiFontFamily}`;

const KEYWORD_COLOR = "#FFD600";
const DEFAULT_COLOR = "#FFFFFF";
const STROKE_COLOR = "#000000";

export const HormoziCaption: React.FC<{
  caption: Caption;
  timeInSeconds: number;
  position?: CaptionPosition;
}> = ({ caption, timeInSeconds, position = "bottom" }) => {
  const { fps, height } = useVideoConfig();

  const baseFontSize = Math.round(height * 0.055);
  const strokeWidth = Math.max(3, Math.round(height * 0.004));
  const padBlock = Math.round(height * 0.12);
  const gap = Math.round(height * 0.008);

  const positionStyles =
    position === "top"
      ? { justifyContent: "flex-start", paddingTop: padBlock }
      : position === "center"
        ? { justifyContent: "center" }
        : { justifyContent: "flex-end", paddingBottom: padBlock };

  return (
    <AbsoluteFill
      style={{
        ...positionStyles,
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap,
          maxWidth: "82%",
        }}
      >
        {caption.words.map((word, i) => {
          const isActive = timeInSeconds >= word.start && timeInSeconds <= word.end;
          const wordEnteredFrames = Math.max(0, (timeInSeconds - word.start) * fps);
          const opacity = isActive
            ? 1
            : timeInSeconds < word.start
              ? 0.35
              : 0.55;

          const scale = isActive
            ? spring({
                frame: wordEnteredFrames,
                fps,
                config: { damping: 18, stiffness: 220, mass: 0.4 },
                from: 0.92,
                to: 1,
              })
            : 1;

          const color = word.isKeyword && isActive ? KEYWORD_COLOR : DEFAULT_COLOR;

          return (
            <span
              key={i}
              style={{
                fontFamily: fontStack,
                fontWeight: 900,
                fontSize: baseFontSize,
                color,
                opacity,
                WebkitTextStroke: `${strokeWidth}px ${STROKE_COLOR}`,
                transform: `scale(${scale})`,
                transformOrigin: "center",
                lineHeight: 1.1,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
