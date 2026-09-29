import { EasybitsError } from "@easybits.cloud/sdk";
import { serverText, t } from "./i18n.js";

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
    usage ? `${t("Usage", "Uso")}: ${usage}` : t("Run: easybits --help", "Corre: easybits --help"),
    "usage",
  );
}

export function notLoggedIn(): CliError {
  return new CliError(
    t("Not logged in.", "No has iniciado sesión."),
    EXIT.AUTH,
    t("Run: easybits login   (or: easybits login - < key-file, or set EASYBITS_API_KEY)", "Corre: easybits login   (o: easybits login - < archivo-con-la-key, o define EASYBITS_API_KEY)"),
    "not_logged_in",
  );
}

/** Saca el mensaje legible del cuerpo de error de la API (JSON o texto). */
function apiMessage(body: string): { message: string; kind?: string } {
  try {
    const j = JSON.parse(body);
    // Forma { error: "SandboxBusy", message: "…" }: el código y el texto, los dos.
    if (typeof j.error === "string" && typeof j.message === "string") return { message: `${j.error}: ${serverText(j.message)}`, kind: j.error };
    if (typeof j.code === "string" && typeof j.error === "string") return { message: `${j.code}: ${serverText(j.error)}`, kind: j.code };
    const msg = j.message ?? j.error ?? j.detail;
    if (typeof msg === "string") return { message: serverText(msg) };
    if (msg) return { message: JSON.stringify(msg) };
  } catch {}
  return { message: serverText(body.trim()) || t("empty response", "respuesta vacía") };
}

// Qué hacer ante cada error con nombre (los documenta /docs: sandboxes y databases).
const KIND_HINTS = (): Record<string, string> => ({
  SandboxBusy: t("A snapshot or fork is running on this sandbox. Wait a few minutes and retry (easybits sb get <id> shows `activity`).", "Hay un snapshot o fork en curso en este sandbox. Espera unos minutos y reintenta (easybits sb get <id> enseña `activity`)."),
  SandboxUnreachable: t("The sandbox is not answering inside. Wait and retry; if it persists, destroy it.", "El sandbox no contesta por dentro. Espera y reintenta; si sigue, destrúyelo."),
  SandboxHostTimeout: t("The operation may still be running. Check `easybits sb get <id>` and retry in a few minutes.", "La operación puede seguir en curso. Revisa `easybits sb get <id>` y reintenta en unos minutos."),
  SandboxHostError: t("The sandbox host failed. Retry; if it persists, contact support.", "Falló el host de sandboxes. Reintenta; si sigue, contacta a soporte."),
  SQL_ERROR: t("Fix the SQL statement.", "Corrige la sentencia SQL."),
  DATABASE_STORAGE_MISSING: t("This database has no storage; its data is unavailable. Delete it (easybits db rm <db> --yes) and create a new one.", "Esta base no tiene almacenamiento; sus datos no están disponibles. Bórrala (easybits db rm <db> --yes) y crea otra."),
  DATABASE_BACKEND_ERROR: t("The database backend failed. Retry in a moment.", "Falló el backend de la base. Reintenta en un momento."),
});

/** Convierte cualquier error en un CliError con código de salida y pista. */
export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  if (err instanceof EasybitsError) {
    const { message, kind } = apiMessage(err.body);
    if (err.status === 401) {
      return new CliError(
        `${t("Credentials rejected", "Credenciales rechazadas")} (401): ${message}`,
        EXIT.AUTH,
        t("Run: easybits login   (or pass a valid API key from https://www.easybits.cloud/dash/developer)", "Corre: easybits login   (o pasa una API key válida de https://www.easybits.cloud/dash/developer)"),
        "unauthorized",
        401,
      );
    }
    const hint =
      (kind && KIND_HINTS()[kind]) ??
      (err.status === 403
        ? t("Your key may lack the scope for this action (READ/WRITE/DELETE).", "Tu key quizá no tiene el permiso para esto (READ/WRITE/DELETE).")
        : err.status === 404
          ? t("Check the id. List what you have with the matching `ls` command.", "Revisa el id. Enlista lo que tienes con el `ls` que corresponda.")
          : err.status === 402
            ? t("Plan limit reached. See: easybits usage", "Llegaste al límite de tu plan. Mira: easybits usage")
            : undefined);
    return new CliError(`${t("API error", "Error de la API")} ${err.status}: ${message}`, EXIT.API, hint, "api_error", err.status);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new CliError(message, EXIT.API);
}
