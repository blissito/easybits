// Export de la sesión de WhatsApp personal (Baileys) de un FleetAgent para migrarla a
// Ghosty Studio (gs). Lógica PURA: recibe lo que ya se leyó de la DB y arma la respuesta.
// No toca el socket, no hace logout, no toca cajas.
//
// Formato de salida compatible con `POST /api/v2/agents/:id/wa/import` de gs y con
// `scripts/importar-baileys.mts`: `{ authCreds, authKeys, phone, groups: { "<jid>@g.us": "nombre" } }`.
// authCreds/authKeys se pasan TAL CUAL (BufferJSON serializado, como vive en Mongo).
// `groups` es el mapa `{ jid: nombre }` que espera gs (sólo los encendidos); el detalle
// de todos los grupos conocidos va en `groupDetails`.

export type BaileysHealth = "alive" | "stale" | "logged_out" | "never_paired";

// Un «connected» sin un solo mensaje entrante de grupo en este tiempo ya no se cree.
// El estado en `baileys` sólo cambia al conectar/caer: si el proceso murió sin cerrar,
// se queda en «connected» para siempre (así se ocultó el WhatsApp de tania-0 del
// 15-jul al 29-sep).
export const STALE_AFTER_MS = 7 * 24 * 60 * 60_000;

export type BaileysExportInput = {
  id: string;
  name: string;
  baileys: unknown;
  authCreds: unknown;
  authKeys: unknown;
  enabledGroups: string[];
  mainGroupJid: string | null;
  seenGroups: unknown;
  /** createdAt del último mensaje ENTRANTE de un grupo de WhatsApp (`FleetAgentMessage`). */
  lastInboundAt: Date | null;
};

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Número (sólo dígitos) desde `creds.me.id` (`5215…:12@s.whatsapp.net`). */
export function phoneOfCreds(creds: unknown): string | null {
  const id = asObj(asObj(creds).me).id;
  if (typeof id !== "string") return null;
  const digits = id.split(/[:@]/)[0]?.replace(/\D/g, "");
  return digits || null;
}

/** Cuántas llaves de señal hay en total (`{ [tipo]: { [id]: valor } }`). */
export function countKeys(authKeys: unknown): number {
  let n = 0;
  for (const bucket of Object.values(asObj(authKeys))) n += Object.keys(asObj(bucket)).length;
  return n;
}

/**
 * Criterio de `health` (en este orden):
 *  - sin authCreds:
 *      · `baileys` dice que alguna vez hubo sesión (reason logged_out/relink, o un teléfono
 *        guardado) → `logged_out`. Baileys BORRA las creds al recibir loggedOut.
 *      · si no → `never_paired`.
 *  - con authCreds pero sin `registered` + `me.id` → `never_paired` (el pareo no terminó).
 *  - status `failed` con reason `logged_out` → `logged_out`.
 *  - status `connected` y actividad reciente (último mensaje entrante de grupo, o si nunca
 *    hubo mensajes, la hora de conexión) dentro de STALE_AFTER_MS → `alive`.
 *  - todo lo demás (connected sin actividad, failed por max_reconnect, disconnected,
 *    connecting eterno) → `stale`: las credenciales existen pero nadie prueba que sirvan.
 */
export function decideHealth(
  input: Pick<BaileysExportInput, "baileys" | "authCreds" | "lastInboundAt">,
  now = Date.now(),
): BaileysHealth {
  const b = asObj(input.baileys);
  const status = typeof b.status === "string" ? b.status : null;
  const reason = typeof b.reason === "string" ? b.reason : null;
  if (!input.authCreds) {
    if (reason === "logged_out" || reason === "relink" || typeof b.phone === "string") return "logged_out";
    return "never_paired";
  }
  const creds = asObj(input.authCreds);
  if (creds.registered !== true && !phoneOfCreds(creds)) return "never_paired";
  if (status === "failed" && reason === "logged_out") return "logged_out";
  if (status === "connected") {
    const at = typeof b.at === "string" ? Date.parse(b.at) : NaN;
    const last = input.lastInboundAt?.getTime() ?? (Number.isFinite(at) ? at : 0);
    if (last && now - last < STALE_AFTER_MS) return "alive";
  }
  return "stale";
}

export function buildBaileysExport(input: BaileysExportInput, opts: { dryRun: boolean }, now = Date.now()) {
  const b = asObj(input.baileys);
  const creds = input.authCreds ? asObj(input.authCreds) : null;
  const phone = phoneOfCreds(creds) ?? (typeof b.phone === "string" ? b.phone.replace(/\D/g, "") || null : null);

  // Grupos = los encendidos + el main + los descubiertos por actividad (`seenGroups`).
  // Sólo DB: nunca `groupFetchAllParticipating` (eso es tocar el socket).
  const seen = asObj(input.seenGroups);
  const enabled = new Set(input.enabledGroups);
  const jids = new Set<string>([...input.enabledGroups, ...Object.keys(seen)]);
  if (input.mainGroupJid) jids.add(input.mainGroupJid);
  const groupDetails = [...jids]
    .filter((jid) => jid.endsWith("@g.us"))
    .map((jid) => {
      const subject = seen[jid];
      return {
        jid,
        name: typeof subject === "string" && subject !== jid ? subject : null,
        enabled: enabled.has(jid),
        main: input.mainGroupJid === jid,
      };
    })
    .sort((x, y) => Number(y.enabled) - Number(x.enabled) || (x.name ?? x.jid).localeCompare(y.name ?? y.jid));

  // Para gs: sólo los que CONTESTABA aquí. gs mete cada entrada con nombre como encendida
  // y rol `equipo`; los apagados no se mandan (entrarían encendidos).
  // `groups` es ESTE mapa (no el detalle) para que la respuesta entre tal cual a gs.
  const groups: Record<string, string> = {};
  for (const g of groupDetails) if (g.enabled) groups[g.jid] = g.name ?? g.jid;

  const lastError =
    b.status === "failed" || typeof b.reason === "string" ? ((b.reason as string | undefined) ?? String(b.status)) : null;
  const base = {
    agentId: input.id,
    name: input.name,
    phone,
    health: decideHealth(input, now),
    status: {
      connection: typeof b.status === "string" ? b.status : null,
      connectionAt: typeof b.at === "string" ? b.at : null,
      lastSeenAt: input.lastInboundAt ? input.lastInboundAt.toISOString() : null,
      lastError,
    },
    registered: creds?.registered === true,
    hasCreds: !!creds,
    keyCount: countKeys(input.authKeys),
    groups,
    groupDetails,
  };
  if (opts.dryRun) return base;
  return { ...base, authCreds: input.authCreds, authKeys: input.authKeys };
}
