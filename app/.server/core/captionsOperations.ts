/**
 * Captions service client — proxies to the easybits-captions Fly app
 * (services/captions). The service is not exposed publicly: communication
 * goes through Fly internal networking with a shared INTERNAL_API_KEY.
 *
 * Job model: POST /render returns { jobId } immediately. Render runs in
 * background; clients poll GET /jobs/:id until status is "done" | "error".
 */

const REQUEST_TIMEOUT_MS = 30 * 1000;

export type CaptionsTemplate = "mrbeast" | "hormozi";
export type CaptionsPosition = "top" | "center" | "bottom";

export interface GenerateCaptionsInput {
  videoUrl: string;
  template?: CaptionsTemplate;
  position?: CaptionsPosition;
}

export type CaptionsJobStatus = "pending" | "running" | "done" | "error";

export interface CaptionsJobResult {
  outputUrl: string;
  durationSec: number;
  wordCount: number;
  captionGroups: number;
  width: number;
  height: number;
  template: CaptionsTemplate;
}

export interface EnqueueCaptionsResult {
  jobId: string;
  status: CaptionsJobStatus;
}

export interface CaptionsJobState {
  jobId: string;
  status: CaptionsJobStatus;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  elapsedMs: number;
  result?: CaptionsJobResult;
  error?: string;
  logs: string[];
}

function getServiceConfig() {
  const url = process.env.CAPTIONS_SERVICE_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url) throw new Error("CAPTIONS_SERVICE_URL missing");
  if (!key) throw new Error("INTERNAL_API_KEY missing");
  return { url: url.replace(/\/+$/, ""), key };
}

async function callService<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const { url, key } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        "x-internal-key": key,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
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
    return body as T;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`captions service timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function enqueueCaptions(
  input: GenerateCaptionsInput,
): Promise<EnqueueCaptionsResult> {
  const body = await callService<{ ok: true; jobId: string; status: CaptionsJobStatus }>(
    "/render",
    {
      method: "POST",
      body: {
        videoUrl: input.videoUrl,
        template: input.template,
        position: input.position,
      },
    },
  );
  return { jobId: body.jobId, status: body.status };
}

export async function getCaptionsJob(jobId: string): Promise<CaptionsJobState> {
  const body = await callService<
    { ok: true } & Omit<CaptionsJobState, "jobId"> & { jobId: string }
  >(`/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
  return {
    jobId: body.jobId,
    status: body.status,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
    finishedAt: body.finishedAt,
    elapsedMs: body.elapsedMs,
    result: body.result,
    error: body.error,
    logs: body.logs ?? [],
  };
}
