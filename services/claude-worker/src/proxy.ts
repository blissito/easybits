// Credential fallback proxy — ported (focused) from nanoclaw's credential-proxy.ts.
//
// The claude subprocess is pointed at this proxy via ANTHROPIC_BASE_URL. It
// forwards every request to api.anthropic.com verbatim (the CLI's own OAuth
// header rides along). If a /v1/messages POST comes back 429 (rate limited) or
// 529 (overloaded) AND an API key is configured, it retries the SAME request
// with x-api-key + a fallback model — transparently, before the worker sees an
// error. This is what gives OAuth Max graceful degradation under the 5h cap.
//
// Differences vs nanoclaw: no vault / group endpoints / usage logging. On
// success we PIPE the upstream response through (preserving streaming) instead
// of buffering — we only buffer-and-discard on a 429/529 to drive the retry.
import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse, type OutgoingHttpHeaders } from 'http';
import { request as httpsRequest } from 'https';

// Only this Sonnet accepts the SDK's adaptive thinking (verified in nanoclaw).
const FALLBACK_MODEL = process.env.CLAUDE_WORKER_FALLBACK_MODEL || 'claude-sonnet-4-6';
// Upstream is api.anthropic.com over TLS in prod. Overridable (host[:port] +
// insecure flag) purely so the 429-retry path can be tested against a fake.
const UPSTREAM_HOST = process.env.CLAUDE_WORKER_UPSTREAM_HOST || 'api.anthropic.com';
const UPSTREAM_PORT = Number(process.env.CLAUDE_WORKER_UPSTREAM_PORT || 443);
const UPSTREAM_INSECURE = process.env.CLAUDE_WORKER_UPSTREAM_INSECURE === '1';
const makeUpstreamRequest = UPSTREAM_INSECURE ? httpRequest : httpsRequest;

function log(msg: string): void {
  console.error(`[claude-worker:proxy] ${msg}`);
}

function swapModelInBody(body: Buffer): Buffer {
  try {
    const parsed = JSON.parse(body.toString());
    if (parsed && typeof parsed === 'object' && 'model' in parsed) {
      parsed.model = FALLBACK_MODEL;
      return Buffer.from(JSON.stringify(parsed));
    }
  } catch {
    /* not JSON — forward verbatim */
  }
  return body;
}

function upstreamOpts(req: IncomingMessage, headers: OutgoingHttpHeaders) {
  return {
    hostname: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    path: req.url,
    method: req.method,
    headers,
  };
}

/**
 * Start the fallback proxy. Returns the listening Server.
 * @param port    localhost port to listen on
 * @param apiKey  ANTHROPIC_API_KEY used for the 429/529 retry (required — the
 *                caller only starts the proxy when a key exists)
 */
export function startFallbackProxy(port: number, apiKey: string): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);

        const baseHeaders: OutgoingHttpHeaders = {
          ...req.headers,
          host: UPSTREAM_HOST,
        };
        delete baseHeaders['connection'];
        delete baseHeaders['keep-alive'];
        delete baseHeaders['transfer-encoding'];
        if (body.length) baseHeaders['content-length'] = body.length;

        const isMessages = req.url?.includes('/v1/messages') && req.method === 'POST';

        const onError = (err: unknown) => {
          log(`upstream error: ${err instanceof Error ? err.message : String(err)}`);
          if (!res.headersSent) res.writeHead(502);
          res.end('Bad Gateway');
        };

        const upstream = makeUpstreamRequest(upstreamOpts(req, { ...baseHeaders }), (upRes) => {
          const status = upRes.statusCode ?? 0;

          // Retry only a rate-limited / overloaded messages call.
          if (isMessages && (status === 429 || status === 529)) {
            upRes.resume(); // drain + discard
            upRes.on('end', () => {
              log(`${status} on OAuth → retry with API key + ${FALLBACK_MODEL}`);
              const fallbackBody = swapModelInBody(body);
              const fbHeaders: OutgoingHttpHeaders = { ...baseHeaders };
              delete fbHeaders['authorization'];
              delete fbHeaders['x-api-key'];
              fbHeaders['x-api-key'] = apiKey;
              fbHeaders['content-length'] = fallbackBody.length;
              const retry = makeUpstreamRequest(upstreamOpts(req, fbHeaders), (retryRes) => {
                res.writeHead(retryRes.statusCode ?? 502, retryRes.headers);
                retryRes.pipe(res);
              });
              retry.on('error', onError);
              retry.write(fallbackBody);
              retry.end();
            });
            return;
          }

          // Success / non-retryable — stream straight through.
          res.writeHead(status, upRes.headers);
          upRes.pipe(res);
        });

        upstream.on('error', onError);
        if (body.length) upstream.write(body);
        upstream.end();
      });
    });

    server.listen(port, '127.0.0.1', () => {
      log(`listening on 127.0.0.1:${port} (fallback model ${FALLBACK_MODEL})`);
      resolve(server);
    });
  });
}
