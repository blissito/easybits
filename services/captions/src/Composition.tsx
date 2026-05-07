import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { MrBeastCaption } from "./MrBeastCaption";
import { HormoziCaption } from "./HormoziCaption";
import type { RenderProps } from "./types";

export const MrBeastShort: React.FC<RenderProps> = ({
  videoSrc,
  captions,
  template,
  position,
  broll,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeInSeconds = frame / fps;

  const activeCaption = captions.find(
    (c) => timeInSeconds >= c.start && timeInSeconds <= c.end,
  );

  const activeBroll = broll.find(
    (b) => timeInSeconds >= b.start && timeInSeconds <= b.end,
  );

  const mainSrc = videoSrc.startsWith("http") ? videoSrc : staticFile(videoSrc);
  const brollSrc = activeBroll
    ? activeBroll.src.startsWith("http")
      ? activeBroll.src
      : staticFile(activeBroll.src)
    : null;

  const CaptionComponent = template === "hormozi" ? HormoziCaption : MrBeastCaption;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <OffthreadVideo src={mainSrc} muted={!!brollSrc} />
      {brollSrc && (
        <AbsoluteFill>
          <OffthreadVideo
            src={brollSrc}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      )}
      {activeCaption && (
        <CaptionComponent
          caption={activeCaption}
          timeInSeconds={timeInSeconds}
          position={position}
        />
      )}
    </AbsoluteFill>
  );
};
