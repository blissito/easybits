// Load local .env when not in production (Fly injects secrets natively).
if (process.env.NODE_ENV !== "production") {
  const { config } = await import("dotenv");
  config();
}

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { runPipeline } from "./pipeline.js";

const app = new Hono();

const RenderBody = z.object({
  videoUrl: z.string().url(),
  template: z.enum(["mrbeast", "hormozi"]).optional(),
});

const JOB_TIMEOUT_MS = 5 * 60 * 1000;

app.get("/health", (c) => c.json({ ok: true }));

app.post("/render", async (c) => {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) {
    return c.json({ error: "server misconfigured (no INTERNAL_API_KEY)" }, 500);
  }
  const provided = c.req.header("x-internal-key");
  if (provided !== internalKey) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let body: z.infer<typeof RenderBody>;
  try {
    body = RenderBody.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: `invalid body: ${(e as Error).message}` }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);

  const logs: string[] = [];
  const log = (m: string) => {
    logs.push(m);
    console.error(m);
  };

  try {
    const result = await runPipeline(
      { videoUrl: body.videoUrl, template: body.template, signal: controller.signal },
      log,
    );
    return c.json({ ok: true, ...result, logs });
  } catch (err) {
    const message = (err as Error).message;
    console.error("[render] failed:", message);
    const status = message === "aborted" ? 504 : 500;
    return c.json({ ok: false, error: message, logs }, status);
  } finally {
    clearTimeout(timer);
  }
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.error(`[easybits-captions] listening on :${info.port}`);
});
