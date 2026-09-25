import { EasybitsError } from "@easybits.cloud/sdk";

// Códigos de salida del CLI. Son contrato con los agentes que lo usan: no cambiarlos.
export const EXIT = { OK: 0, API: 1, USAGE: 2, AUTH: 3 } as const;

export class CliError extends Error {
  constructor(
    message: string,
    public exitCode: number = EXIT.API,
    public hint?: string,
    public code: string = "error",
    public status?: number,
  ) {
    super(message);
  }
}

export function usageError(message: string, usage?: string): CliError {
  return new CliError(
    message,
    EXIT.USAGE,
    usage ? `Usage: ${usage}` : "Run: easybits --help",
    "usage",
  );
}

export function notLoggedIn(): CliError {
  return new CliError(
    "Not logged in.",
    EXIT.AUTH,
    "Run: easybits login   (or: easybits login <api-key>, or set EASYBITS_API_KEY)",
    "not_logged_in",
  );
}

/** Saca el mensaje legible del cuerpo de error de la API (JSON o texto). */
function apiMessage(body: string): { message: string; kind?: string } {
  try {
    const j = JSON.parse(body);
    // Forma { error: "SandboxBusy", message: "…" }: el código y el texto, los dos.
    if (typeof j.error === "string" && typeof j.message === "string") return { message: `${j.error}: ${j.message}`, kind: j.error };
    if (typeof j.code === "string" && typeof j.error === "string") return { message: `${j.code}: ${j.error}`, kind: j.code };
    const msg = j.message ?? j.error ?? j.detail;
    if (typeof msg === "string") return { message: msg };
    if (msg) return { message: JSON.stringify(msg) };
  } catch {}
  return { message: body.trim() || "empty response" };
}

// Qué hacer ante cada error con nombre (los documenta /docs: sandboxes y databases).
const KIND_HINTS: Record<string, string> = {
  SandboxBusy: "A snapshot or fork is running on this sandbox. Wait a few minutes and retry (easybits sb get <id> shows `activity`).",
  SandboxUnreachable: "The sandbox is not answering inside. Wait and retry; if it persists, destroy it.",
  SandboxHostTimeout: "The operation may still be running. Check `easybits sb get <id>` and retry in a few minutes.",
  SandboxHostError: "The sandbox host failed. Retry; if it persists, contact support.",
  SQL_ERROR: "Fix the SQL statement.",
  DATABASE_STORAGE_MISSING: "This database has no storage; its data is unavailable. Delete it (easybits db rm) and create a new one.",
  DATABASE_BACKEND_ERROR: "The database backend failed. Retry in a moment.",
};

/** Convierte cualquier error en un CliError con código de salida y pista. */
export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  if (err instanceof EasybitsError) {
    const { message, kind } = apiMessage(err.body);
    if (err.status === 401) {
      return new CliError(
        `Credentials rejected (401): ${message}`,
        EXIT.AUTH,
        "Run: easybits login   (or pass a valid API key from https://www.easybits.cloud/dash/developer)",
        "unauthorized",
        401,
      );
    }
    const hint =
      (kind && KIND_HINTS[kind]) ??
      (err.status === 403
        ? "Your key may lack the scope for this action (READ/WRITE/DELETE)."
        : err.status === 404
          ? "Check the id. List what you have with the matching `ls` command."
          : err.status === 402
            ? "Plan limit reached. See: easybits usage"
            : undefined);
    return new CliError(`API error ${err.status}: ${message}`, EXIT.API, hint, "api_error", err.status);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new CliError(message, EXIT.API);
}
