/**
 * Runway client wrapper — low-level building blocks for video generation.
 *
 * The pipeline is composed by videoOperations.ts. This file keeps the
 * Runway-specific types + model selection + error handling in one place so
 * the rest of the app never imports from `@runwayml/sdk` directly.
 *
 * Conservación de personaje: `generateStillWithReferences` usa Gen-4 Image con
 * `referenceImages: [{ uri, tag }]`. El prompt debe contener `@tag` para que
 * el modelo inyecte esa identidad. Ejemplo:
 *   refs: [{ uri: "...", tag: "maria" }]
 *   prompt: "@maria standing in a rainy Tokyo street, neon reflections"
 */
import RunwayML, { TaskFailedError } from "@runwayml/sdk";
import type { ImageToVideoCreateParams } from "@runwayml/sdk/resources/image-to-video";
import type { TextToImageCreateParams } from "@runwayml/sdk/resources/text-to-image";

export type VideoModel = "gen4.5" | "gen4_turbo";

export type VideoAspectRatio =
  | "1280:720"   // 16:9 landscape
  | "720:1280"   // 9:16 portrait (WhatsApp / social)
  | "960:960"    // 1:1 square
  | "1104:832"   // 4:3
  | "832:1104"   // 3:4
  | "1584:672";  // ultrawide

export type ImageAspectRatio =
  | "1920:1080"
  | "1080:1920"
  | "1024:1024"
  | "1280:720"
  | "720:1280"
  | "720:720";

export interface ReferenceImage {
  uri: string;
  /** Sanitized @tag — used inside the prompt to reference this image. */
  tag?: string;
}

export interface RunwayTaskHandle {
  id: string;
}

export interface RunwayStillResult {
  taskId: string;
  url: string;
}

export interface RunwayVideoResult {
  taskId: string;
  url: string;
}

let _client: RunwayML | null = null;
function getClient(): RunwayML {
  if (_client) return _client;
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error("RUNWAY_API_KEY missing in env");
  _client = new RunwayML({ apiKey });
  return _client;
}

/** Map a desired output ratio to the matching Gen-4 Image ratio. */
export function imageRatioFor(videoRatio: VideoAspectRatio): ImageAspectRatio {
  switch (videoRatio) {
    case "1280:720": return "1280:720";
    case "720:1280": return "720:1280";
    case "960:960": return "720:720";
    case "1104:832": return "1280:720";
    case "832:1104": return "720:1280";
    case "1584:672": return "1920:1080";
  }
}

/**
 * Generate a still image. If `references` are provided, Gen-4 Image uses them
 * to preserve identity/location/style — the prompt should include `@tag` for
 * each reference.
 */
export async function generateStill(opts: {
  prompt: string;
  ratio: ImageAspectRatio;
  references?: ReferenceImage[];
  seed?: number;
}): Promise<RunwayStillResult> {
  const client = getClient();
  const refs = (opts.references ?? []).slice(0, 3);

  const body: TextToImageCreateParams = {
    model: "gen4_image",
    promptText: opts.prompt,
    ratio: opts.ratio,
    ...(refs.length
      ? {
          referenceImages: refs.map((r) => ({
            uri: r.uri,
            ...(r.tag ? { tag: r.tag } : {}),
          })),
        }
      : {}),
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
  };

  const task = await client.textToImage.create(body).waitForTaskOutput();
  const url = task.output?.[0];
  if (!url) throw new Error("Runway text_to_image returned no output");
  return { taskId: task.id, url };
}

/**
 * Animate a still image into a short video clip. Returns a Runway-hosted URL
 * that expires in 24–48h — callers MUST copy it to their own storage.
 */
export async function animateImage(opts: {
  promptImage: string;
  promptText: string;
  ratio: VideoAspectRatio;
  duration?: number;
  model?: VideoModel;
  seed?: number;
}): Promise<RunwayVideoResult> {
  const client = getClient();
  const model: VideoModel = opts.model ?? "gen4.5";
  const duration = Math.max(2, Math.min(10, opts.duration ?? 5));

  const body = (
    model === "gen4_turbo"
      ? {
          model: "gen4_turbo" as const,
          promptImage: opts.promptImage,
          promptText: opts.promptText,
          ratio: opts.ratio,
          duration,
          ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        }
      : {
          model: "gen4.5" as const,
          promptImage: opts.promptImage,
          promptText: opts.promptText,
          ratio: opts.ratio,
          duration,
          ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        }
  ) as ImageToVideoCreateParams;

  const task = await client.imageToVideo.create(body).waitForTaskOutput();
  const url = task.output?.[0];
  if (!url) throw new Error("Runway image_to_video returned no output");
  return { taskId: task.id, url };
}

/** Sanitize a user-provided name into a valid `@tag` for Gen-4 Image. */
export function toRunwayTag(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || "ref";
}

export { TaskFailedError };
