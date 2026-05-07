import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { downloadToTmp } from "./download.js";
import { normalize } from "./normalize.js";
import { transcribe } from "./transcribe.js";
import { enrich } from "./enrich.js";
import { uploadPublic } from "./storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

export type Template = "mrbeast" | "hormozi";

export type RenderRequest = {
  videoUrl: string;
  template?: Template;
  signal?: AbortSignal;
};

export type RenderResult = {
  outputUrl: string;
  durationSec: number;
  wordCount: number;
  captionGroups: number;
  width: number;
  height: number;
  template: Template;
};

export async function runPipeline(
  req: RenderRequest,
  log: (m: string) => void = () => {},
): Promise<RenderResult> {
  const template: Template = req.template ?? "mrbeast";
  const jobId = randomUUID();
  const workDir = join("/tmp/captions", jobId);
  const publicDir = join(workDir, "public");
  mkdirSync(publicDir, { recursive: true });

  try {
    log(`[1/5] downloading ${req.videoUrl}`);
    const downloadedPath = await downloadToTmp(req.videoUrl, workDir, req.signal);
    if (req.signal?.aborted) throw new Error("aborted");

    log(`[2/5] normalizing`);
    const normalized = await normalize(downloadedPath, workDir, log);
    if (req.signal?.aborted) throw new Error("aborted");

    log(`[3/5] transcribing`);
    const transcript = await transcribe(normalized.path, workDir, log);
    if (req.signal?.aborted) throw new Error("aborted");

    log(`[4/5] enriching`);
    const captions = await enrich(transcript, log);
    if (req.signal?.aborted) throw new Error("aborted");

    log(`[5/5] rendering (${normalized.width}x${normalized.height}, ${template})`);
    // Remotion's staticFile() reads from a publicDir; copy the normalized video
    // into a known relative location so the composition can reference it.
    copyFileSync(normalized.path, join(publicDir, "input.mp4"));

    const props = {
      videoSrc: "input.mp4",
      durationInSeconds: Math.ceil(normalized.durationSec) + 1,
      width: normalized.width,
      height: normalized.height,
      template,
      captions,
      broll: [],
    };
    const propsPath = join(workDir, "props.json");
    writeFileSync(propsPath, JSON.stringify(props));

    const outputPath = join(workDir, "output.mp4");
    execSync(
      `npx --no-install remotion render src/index.ts MrBeastShort "${outputPath}" --props="${propsPath}" --public-dir="${publicDir}" --log=error --concurrency=2`,
      { stdio: ["ignore", "ignore", "inherit"], cwd: PROJECT_ROOT },
    );

    log(`  → uploading to Tigris`);
    const key = `mcp/captions/${jobId}.mp4`;
    const outputUrl = await uploadPublic(outputPath, key, "video/mp4");
    log(`  ✓ ${outputUrl}`);

    return {
      outputUrl,
      durationSec: normalized.durationSec,
      wordCount: transcript.words.length,
      captionGroups: captions.length,
      width: normalized.width,
      height: normalized.height,
      template,
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* swallow cleanup errors */
    }
  }
}
