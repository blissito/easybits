/**
 * Captions service client — proxies to the easybits-captions Fly app
 * (services/captions). The service is not exposed publicly: communication
 * goes through Fly internal networking with a shared INTERNAL_API_KEY.
 */

const REQUEST_TIMEOUT_MS = 6 * 60 * 1000; // 1 min more than the service's own timeout

export type CaptionsTemplate = "mrbeast" | "hormozi";

export interface GenerateCaptionsInput {
  videoUrl: string;
  template?: CaptionsTemplate;
}

export interface GenerateCaptionsResult {
  outputUrl: string;
  durationSec: number;
  wordCount: number;
  captionGroups: number;
  width: number;
  height: number;
  template: CaptionsTemplate;
}

export async function generateCaptions(
  input: GenerateCaptionsInput,
): Promise<GenerateCaptionsResult> {
  const url = process.env.CAPTIONS_SERVICE_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url) throw new Error("CAPTIONS_SERVICE_URL missing");
  if (!key) throw new Error("INTERNAL_API_KEY missing");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-key": key,
      },
      body: JSON.stringify({
        videoUrl: input.videoUrl,
        template: input.template,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(
        `captions service returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`,
      );
    }

    if (!res.ok || body?.ok === false) {
      throw new Error(
        body?.error ?? `captions service failed with status ${res.status}`,
      );
    }

    return {
      outputUrl: body.outputUrl,
      durationSec: body.durationSec,
      wordCount: body.wordCount,
      captionGroups: body.captionGroups,
      width: body.width,
      height: body.height,
      template: body.template,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`captions service timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
