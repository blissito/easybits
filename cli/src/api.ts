// Llamadas a la API que el SDK todavía no envuelve (config de agentes con máquina:
// prompt, archivos, skills, MCP, reinicio, try). Mismo contrato de errores que el SDK
// (EasybitsError con status y cuerpo) para que toCliError y el reintento del 401 sirvan igual.
import { EasybitsError, resolveBaseUrl } from "@easybits.cloud/sdk";
import type { Ctx } from "./types.js";
import { resolveCredential } from "./client.js";

export async function api<T>(
  ctx: Ctx,
  method: string,
  path: string,
  body?: unknown,
  opts: { raw?: boolean } = {},
): Promise<T> {
  const token = await resolveCredential(ctx);
  const base = (await resolveBaseUrl()).replace(/\/$/, "");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (opts.raw) {
      // Bytes crudos (PUT de archivos): sin JSON de por medio.
      payload = body as BodyInit;
      headers["Content-Type"] = "application/octet-stream";
    } else {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
  }
  const res = await fetch(`${base}/api/v2${path}`, { method, headers, body: payload });
  const text = await res.text();
  if (!res.ok) throw new EasybitsError(res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/** Codifica cada segmento de una ruta relativa (`docs/mi archivo.md`) para la URL. */
export const encodePath = (p: string) =>
  p
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
