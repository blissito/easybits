import { PassThrough } from "node:stream";

import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter, isRouteErrorResponse } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { handleSubdomainWebsite } from "~/.server/subdomainWebsite";

// Process-level safety net (covers BOTH `react-router dev` and prod `server.mjs`):
// a single unhandled rejection — e.g. a Mongo "write conflict" from concurrent
// fleetAgent.update during a Baileys reconnect — must never take the server down. The
// dev server runs Vite (no server.mjs), so this module is the shared early-load
// point that protects local dev too. Targeted fixes still belong at the source.
declare global { var __ebProcessGuards: boolean | undefined; }
if (!globalThis.__ebProcessGuards) {
  globalThis.__ebProcessGuards = true;
  process.on("unhandledRejection", (reason) =>
    console.error("[unhandledRejection]", reason instanceof Error ? reason.stack : reason)
  );
  process.on("uncaughtException", (err) =>
    console.error("[uncaughtException]", err instanceof Error ? err.stack : err)
  );
}

export const streamTimeout = 5_000;

// Override del errorHandler DEFAULT de React Router, que hace `console.error(stack)`
// en TODO modo salvo `test` → cada 404 de scanner logueaba el stack completo de "No
// route matches URL" + symbolication de source-map (fs.existsSync por frame) → 600-1200ms
// bajo flood (contribuyó al outage 2026-07-09). Silenciamos 404s y requests abortadas;
// los errores reales SÍ se loguean. El fast-path de server.mjs corta la mayoría antes,
// esto cubre lo que se escape.
export function handleError(error: unknown, { request }: { request: Request }) {
  if (request.signal.aborted) return;
  if (isRouteErrorResponse(error) && error.status === 404) return;
  console.error(error);
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext
) {
  // Intercept subdomain website requests before React rendering
  const subdomainResponse = await handleSubdomainWebsite(request);
  if (subdomainResponse) return subdomainResponse;

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");

    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, streamTimeout + 1000);
  });
}
