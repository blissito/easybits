import { Composition, getInputProps } from "remotion";
import { MrBeastShort } from "./Composition";
import type { RenderProps } from "./types";

const FPS = 30;

const defaultProps: RenderProps = {
  videoSrc: "input.mp4",
  durationInSeconds: 30,
  width: 1080,
  height: 1920,
  template: "mrbeast",
  captions: [],
  broll: [],
};

export const RemotionRoot: React.FC = () => {
  const props = getInputProps() as Partial<RenderProps>;
  const merged: RenderProps = { ...defaultProps, ...props };

  return (
    <Composition
      id="MrBeastShort"
      component={MrBeastShort}
      durationInFrames={Math.ceil(merged.durationInSeconds * FPS)}
      fps={FPS}
      width={merged.width}
      height={merged.height}
      defaultProps={merged}
    />
  );
};
