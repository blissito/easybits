import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

export type NormalizedVideo = {
  path: string;
  width: number;
  height: number;
  durationSec: number;
  reEncoded: boolean;
};

type ProbeResult = {
  videoCodec: string;
  width: number;
  height: number;
  durationSec: number;
  container: string;
};

function probe(videoPath: string): ProbeResult {
  const json = execSync(
    `ffprobe -v error -print_format json -show_format -show_streams "${videoPath}"`,
    { encoding: "utf-8" },
  );
  const data = JSON.parse(json);
  const videoStream = (data.streams ?? []).find((s: any) => s.codec_type === "video");
  if (!videoStream) throw new Error("No video stream in input");

  return {
    videoCodec: videoStream.codec_name,
    width: Number(videoStream.width),
    height: Number(videoStream.height),
    durationSec: Number(data.format?.duration ?? videoStream.duration ?? 0),
    container: (data.format?.format_name ?? "").toLowerCase(),
  };
}

const evenize = (n: number) => (n % 2 === 0 ? n : n - 1);

export async function normalize(
  videoPath: string,
  workDir: string,
  log: (m: string) => void = () => {},
): Promise<NormalizedVideo> {
  const stem = basename(videoPath, extname(videoPath)).replace(/[^a-zA-Z0-9_-]/g, "_");
  const outPath = join(workDir, `${stem}.normalized.mp4`);

  const meta = probe(videoPath);
  const isH264 = meta.videoCodec === "h264";
  const isMp4 = meta.container.includes("mp4") || meta.container.includes("mov,mp4");
  const targetW = evenize(meta.width);
  const targetH = evenize(meta.height);
  const dimsEven = meta.width === targetW && meta.height === targetH;

  if (existsSync(outPath)) {
    const inMtime = statSync(videoPath).mtimeMs;
    const outMtime = statSync(outPath).mtimeMs;
    if (outMtime >= inMtime) {
      const cached = probe(outPath);
      log(`  ✓ cache hit (${cached.width}x${cached.height})`);
      return {
        path: outPath,
        width: evenize(cached.width),
        height: evenize(cached.height),
        durationSec: cached.durationSec,
        reEncoded: false,
      };
    }
  }

  if (isH264 && isMp4 && dimsEven) {
    log(`  → container-copy (already h264/mp4)`);
    execSync(
      `ffmpeg -y -i "${videoPath}" -c copy -movflags +faststart "${outPath}"`,
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  } else {
    log(`  → re-encoding ${meta.videoCodec}/${meta.container} → h264/mp4`);
    const scaleFilter = dimsEven ? "" : `-vf scale=${targetW}:${targetH}`;
    execSync(
      `ffmpeg -y -i "${videoPath}" ${scaleFilter} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${outPath}"`,
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  }

  // Probe OUTPUT (rotation already applied)
  const final = probe(outPath);
  return {
    path: outPath,
    width: evenize(final.width),
    height: evenize(final.height),
    durationSec: final.durationSec,
    reEncoded: !(isH264 && isMp4 && dimsEven),
  };
}
