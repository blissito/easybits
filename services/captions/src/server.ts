// Load local .env when not in production (Fly injects secrets natively).
if (process.env.NODE_ENV !== "production") {
  const { config } = await import("dotenv");
  config();
}

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { runPipeline } from "./pipeline.js";

const app = new Hono();

const RenderBody = z.object({
  videoUrl: z.string().url(),
  template: z.enum(["mrbeast", "hormozi"]).optional(),
  position: z.enum(["top", "center", "bottom"]).optional(),
});

const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const JOB_TTL_MS = 60 * 60 * 1000;

type JobStatus = "pending" | "running" | "done" | "error";
type Job = {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  result?: any;
  error?: string;
  logs: string[];
  controller: AbortController;
};

const jobs = new Map<string, Job>();

function gcJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of jobs) {
    if (j.finishedAt && j.finishedAt < cutoff) jobs.delete(id);
  }
}
setInterval(gcJobs, 5 * 60 * 1000).unref?.();

function requireInternalKey(provided: string | undefined) {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) return { ok: false, status: 500, error: "server misconfigured (no INTERNAL_API_KEY)" };
  if (provided !== internalKey) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true };
}

app.get("/health", (c) => c.json({ ok: true }));

app.post("/render", async (c) => {
  const auth = requireInternalKey(c.req.header("x-internal-key"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status as 401 | 500);

  let body: z.infer<typeof RenderBody>;
  try {
    body = RenderBody.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: `invalid body: ${(e as Error).message}` }, 400);
  }

  const id = randomUUID();
  const controller = new AbortController();
  const job: Job = {
    id,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    logs: [],
    controller,
  };
  jobs.set(id, job);

  const log = (m: string) => {
    job.logs.push(m);
    job.updatedAt = Date.now();
    console.error(`[${id}] ${m}`);
  };

  const timer = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);

  (async () => {
    job.status = "running";
    job.updatedAt = Date.now();
    try {
      const result = await runPipeline(
        {
          videoUrl: body.videoUrl,
          template: body.template,
          position: body.position,
          signal: controller.signal,
        },
        log,
      );
      job.result = result;
      job.status = "done";
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[${id}] failed:`, message);
      job.error = message;
      job.status = "error";
    } finally {
      clearTimeout(timer);
      job.finishedAt = Date.now();
      job.updatedAt = job.finishedAt;
    }
  })();

  return c.json({ ok: true, jobId: id, status: job.status }, 202);
});

app.get("/jobs/:id", (c) => {
  const auth = requireInternalKey(c.req.header("x-internal-key"));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status as 401 | 500);

  const job = jobs.get(c.req.param("id"));
  if (!job) return c.json({ error: "job not found" }, 404);

  return c.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    elapsedMs: (job.finishedAt ?? Date.now()) - job.createdAt,
    result: job.result,
    error: job.error,
    logs: job.logs.slice(-20),
  });
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.error(`[easybits-captions] listening on :${info.port}`);
});
