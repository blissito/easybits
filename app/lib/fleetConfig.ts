/**
 * Cliente tipado de la configuración de un FleetAgent.
 *
 * ⚠️ ESTE ES EL ÚNICO SITIO donde se escriben los nombres literales de los campos que
 * espera el `action` (`app/routes/dash/fleet-agents.tsx`). Existe por dos fallos reales
 * que costaron horas:
 *
 *   · El segmentado de modo de un número WABA mandaba `groupId` ("waba:<id>") donde el
 *     servidor espera `integrationId` pelado → 404 que nadie pinta: botones muertos.
 *   · Las acciones de caja mandan `sandboxId`, y en `capacity.machines` ese valor NO es
 *     `m.id` (que es el Agent.id) sino `m.sandboxId`, mientras que en `extraMachines`
 *     el `id` YA es el sandboxId.
 *
 * Con esto, equivocarse pasa a ser un error de compilación en vez de un botón que no
 * hace nada. La UI se puede rehacer entera sin volver a tocar estos nombres.
 */

/** `submit` de un `useFetcher()` de React Router. */
export type FleetSubmit = (fields: Record<string, string>, opts: { method: "post"; action: string }) => void;

export type CapLevel = "off" | string;
export type WabaMode = "off" | "all" | "only";
export type PauseDuration = "permanent" | "30min" | "2h";
export type BoxOp = "suspend" | "resume" | "destroy";

/**
 * @param submit  el `submit` del fetcher de la página
 * @param fleetAgentId  agente sobre el que se actúa
 * @param route  ruta que expone el action (por defecto el panel de la flota)
 */
export function fleetConfig(submit: FleetSubmit, fleetAgentId: string, route = "/dash/flota") {
  const post = (fields: Record<string, string>) =>
    submit({ ...fields, fleetAgentId }, { method: "post", action: route });
  const bool = (on: boolean) => (on ? "1" : "0");

  return {
    // ── Agente ─────────────────────────────────────────────────────────────
    rename: (name: string) => post({ intent: "rename", name }),
    remove: () => post({ intent: "delete" }),
    setModel: (model: string) => post({ intent: "set-model", model }),
    setEngine: (engine: string) => post({ intent: "set-engine", engine }),
    setAgentPrompt: (systemPrompt: string) => post({ intent: "set-agent-prompt", systemPrompt }),

    // ── WhatsApp (Baileys) ─────────────────────────────────────────────────
    connect: (phone?: string) => post(phone ? { intent: "connect", phone } : { intent: "connect" }),
    disconnect: () => post({ intent: "disconnect" }),
    toggleGroup: (groupId: string, on: boolean) => post({ intent: "toggle-group", groupId, on: bool(on) }),
    setMainGroup: (groupId: string) => post({ intent: "set-main", groupId }),
    /** Número compartido (antepone "Nombre:") vs línea dedicada. */
    setOwnNumber: (on: boolean) => post({ intent: "toggle-own-number", on: bool(on) }),

    // ── WhatsApp Business ──────────────────────────────────────────────────
    // ⚠️ `integrationId` PELADO, no el `waba:<id>` que usa la config.
    setWabaName: (integrationId: string, name: string) => post({ intent: "set-waba-identity", integrationId, name }),
    setWabaMode: (integrationId: string, mode: WabaMode) => post({ intent: "set-waba-mode", integrationId, mode }),
    wabaPause: (integrationId: string, sender: string, duration: PauseDuration) =>
      post({ intent: "waba-pause", integrationId, sender, duration }),
    wabaResume: (integrationId: string, sender: string) => post({ intent: "waba-resume", integrationId, sender }),
    wabaSetAdmin: (integrationId: string, sender: string, on: boolean) =>
      post({ intent: "waba-set-admin", integrationId, sender, on: bool(on) }),
    wabaAllowSender: (integrationId: string, sender: string, on: boolean) =>
      post({ intent: "toggle-waba-sender", integrationId, sender, on: bool(on) }),
    wabaRequestReply: (integrationId: string, sender: string, directive?: string) =>
      post({ intent: "waba-request-reply", integrationId, sender, ...(directive ? { directive } : {}) }),
    wabaClear: (integrationId: string, sender: string) => post({ intent: "waba-clear", integrationId, sender }),

    // ── Canales ────────────────────────────────────────────────────────────
    showChannel: (kind: string, visible: boolean) => post({ intent: "toggle-channel", kind, visible: bool(visible) }),
    setChannelPrompt: (groupId: string, systemPrompt: string) => post({ intent: "set-group-prompt", groupId, systemPrompt }),
    setVoice: (groupId: string, voiceId: string) => post({ intent: "set-voice", groupId, voiceId }),

    // ── Capacidades por canal (groupId "*" = default del agente) ───────────
    toggleCapability: (groupId: string, mcp: string, on: boolean) =>
      post({ intent: "toggle-group-mcp", groupId, mcp, on: bool(on) }),
    /** Devuelve el canal al default del agente: BORRA su lista (vaciarla no es lo mismo). */
    inheritCapabilities: (groupId: string) => post({ intent: "inherit-group-mcps", groupId }),
    toggleBuiltin: (groupId: string, name: string, on: boolean) =>
      post({ intent: "toggle-group-builtin", groupId, name, on: bool(on) }),
    setCapLevel: (groupId: string, cap: string, level: CapLevel) =>
      post({ intent: "set-cap-level", groupId, cap, level }),

    // ── Herramientas ───────────────────────────────────────────────────────
    /** `buckets` viaja como UN string CSV, no como campos repetidos. */
    setToolBuckets: (groupId: string, buckets: string[]) =>
      post({ intent: "set-group-toolgroup", groupId, buckets: buckets.join(","), inherit: "0" }),
    inheritToolBuckets: (groupId: string) =>
      post({ intent: "set-group-toolgroup", groupId, buckets: "", inherit: "1" }),
    /** `on` = permitir; false = denegar esa tool en el canal. */
    allowTool: (groupId: string, tool: string, on: boolean) =>
      post({ intent: "set-tool-deny", groupId, tool, on: bool(on) }),
    allowDatabase: (groupId: string, namespace: string, on: boolean) =>
      post({ intent: "set-db-allow", groupId, namespace, on: bool(on) }),
    toggleAsset: (groupId: string, fileId: string, on: boolean) =>
      post({ intent: "toggle-group-asset", groupId, fileId, on: bool(on) }),

    // ── Conectores y credenciales ──────────────────────────────────────────
    setSecret: (name: string, value: string) => post({ intent: "set-secret", name, value }),
    removeMcp: (name: string) => post({ intent: "remove-mcp", name }),

    // ── Skills ─────────────────────────────────────────────────────────────
    toggleSkill: (skillId: string, on: boolean) => post({ intent: "toggle-skill", skillId, on: bool(on) }),
    deleteSkill: (skillId: string) => post({ intent: "delete-skill", skillId }),
    copySkill: (skillId: string, targetId: string) => post({ intent: "copy-skill", skillId, targetId }),

    // ── Tokens con scope ───────────────────────────────────────────────────
    revokeToken: (tokenId: string) => post({ intent: "token-revoke", tokenId }),

    // ── Cajas ──────────────────────────────────────────────────────────────
    // ⚠️ Sólo `sandboxId` (el handler va ANTES del gate de fleetAgentId), y ese id
    // sale de `machine.sandboxId`, NO de `machine.id`.
    box: (sandboxId: string, op: BoxOp) =>
      submit({ intent: `box-${op}`, sandboxId }, { method: "post", action: route }),
  };
}

export type FleetConfigClient = ReturnType<typeof fleetConfig>;
