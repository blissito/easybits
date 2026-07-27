// Movimiento AUTOMÁTICO de la etapa del tablero (Formmy) cuando el cliente paga.
//
// Por qué existe: pedirle al modelo que EJECUTE el efecto (llamar `set_order_status`)
// falló 4 veces seguidas — cero llamadas `mcp__formmy__*` en el transcript, con la
// instrucción puesta como preámbulo, paso numerado, tabla de etiquetas y bloque LEYES.
// El registro de la orden SÍ es determinista porque vive dentro de `quote.mjs`, que se
// EJECUTA en el turno de la cotización; pero el pago llega turnos después, en un mensaje
// suelto, cuando ningún script corre.
//
// Así que aquí el modelo no ejecuta nada: sólo REPORTA un dato tipado y validado por
// schema, y el efecto lo aplica este código. Un modelo cumple mucho mejor "llena este
// JSON" que "acuérdate de llamar esta tool".
//
// Nota sobre el comprobante en imagen: el agente ya hizo visión sobre él y verbalizó el
// monto en su respuesta ("Transferencia de $2,425.00 MXN del 27 de julio"), así que el
// extractor lee ESO y no necesita visión propia.
import { generateObject } from "ai";
import { z } from "zod";
import { db } from "~/.server/db";
import { getAiModel, resolveModelLocal } from "~/.server/aiModels";
import { getSecretValue } from "~/.server/core/secretOperations";
import type { WabaOrg } from "./waba.server";

const FORMMY_SDK_URL = `${(process.env.FORMMY_API_URL || "https://www.formmy.app").replace(/\/$/, "")}/api/v2/sdk`;

// Formas de pago que reconocemos → etiqueta de la columna del tablero. Los labels son
// los del tenant, así que `org.paymentStages` los puede sobreescribir sin tocar código.
export const DEFAULT_PAYMENT_STAGES: Record<string, string> = {
  transferencia: "Pago con transferencia",
  tarjeta: "Pago con tarjeta",
  contra_entrega: "Pago a contra entrega",
};

// Un "gracias por tu pago" minutos después no debe re-disparar. Pero una orden nueva
// días después sí. No podemos distinguirlas leyendo (el SDK de Formmy no expone lectura
// de órdenes), así que la ventana hace de proxy.
export const STAGE_REFIRE_MS = 24 * 60 * 60 * 1000;

export type PaymentSignal = {
  mover: boolean;
  forma: "transferencia" | "tarjeta" | "contra_entrega" | "desconocida";
  monto: number | null;
};

// Ojo con la semántica de `mover`: NO es "hubo pago". Contra entrega es justamente el
// caso donde todavía no hay dinero pero la tarjeta SÍ debe moverse, porque un pedido
// confirmado ya compromete una ruta de reparto. Conflacionar ambas cosas en un booleano
// "pago" hacía que contra-entrega nunca disparara.
const PaymentSignalSchema = z.object({
  mover: z
    .boolean()
    .describe(
      "true si (a) el cliente reportó un pago YA HECHO o el asistente confirmó recibirlo, o (b) el cliente CONFIRMÓ EXPLÍCITAMENTE un pedido contra entrega. false si sólo se está cotizando, preguntando precios, o prometiendo pagar después."
    ),
  forma: z
    .enum(["transferencia", "tarjeta", "contra_entrega", "desconocida"])
    .describe("Cómo se pagó o se pagará."),
  monto: z.number().nullable().describe("Monto en MXN si aparece; null si no se menciona."),
});

const PROMPT_HEADER = `Eres un extractor. Lee el intercambio de WhatsApp entre un cliente y el asistente de ventas, y decide si la orden debe avanzar de columna en el tablero de ventas.

Reglas para "mover":
- true si el pago YA ocurrió: el cliente dice que transfirió/pagó, mandó comprobante, o el asistente confirma haberlo recibido.
- true TAMBIÉN si el cliente CONFIRMÓ EXPLÍCITAMENTE un pedido contra entrega (aún no paga, pero ya compromete una ruta de reparto).
- false si sólo pregunta precios, pide la cuenta, está considerando la compra, o promete pagar después ("ahorita te deposito").
- Si debe moverse pero no distingues la forma, usa forma="desconocida".
- Ante la duda, mover=false. Un falso negativo se corrige a mano; un falso positivo mueve la tarjeta de un cliente que no ha pagado ni confirmado.`;

/** Extrae la señal de pago del turno. Devuelve null si el modelo falla (best-effort). */
export async function extractPaymentSignal(
  incomingText: string,
  reply: string
): Promise<PaymentSignal | null> {
  try {
    const model = resolveModelLocal(await getAiModel("wabaPaymentSignal"));
    const { object } = await generateObject({
      model,
      schema: PaymentSignalSchema,
      prompt: `${PROMPT_HEADER}

--- Mensaje del cliente ---
${incomingText || "(sin texto — probablemente mandó una imagen o audio)"}

--- Respuesta del asistente ---
${reply}`,
    });
    return object;
  } catch (e) {
    console.error("[waba] extractPaymentSignal falló:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** ¿Disparamos? Pura, para poder testearla sin red ni DB. */
export function shouldFireStage(
  prev: { estatus: string; at: string } | undefined,
  estatus: string,
  now = Date.now()
): boolean {
  if (!prev || prev.estatus !== estatus) return true;
  const at = Date.parse(prev.at || "");
  if (!at) return true;
  return now - at > STAGE_REFIRE_MS;
}

/** Etiqueta de columna para una forma de pago, con override por tenant. */
export function stageLabelFor(forma: PaymentSignal["forma"], org?: WabaOrg): string | null {
  if (forma === "desconocida") return null;
  return org?.paymentStages?.[forma] || DEFAULT_PAYMENT_STAGES[forma] || null;
}

type SdkParams = Record<string, string>;

/** POST al SDK de Formmy. Espejo de `formmyPost` en la skill de Cotización (quote.mjs). */
async function formmySdk(
  key: string,
  intent: string,
  params: SdkParams,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = new URL(FORMMY_SDK_URL);
  url.searchParams.set("intent", intent);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Secret-Key": key,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta no-JSON: data queda null */
  }
  return { ok: res.ok, status: res.status, data };
}

/** Escritura atómica de UNA ruta anidada del blob (mismo patrón que recordLastLocation). */
async function recordOrderStage(
  fleetAgentId: string,
  integrationId: string,
  np: string,
  value: { estatus: string; at: string }
): Promise<void> {
  const path = `wabaConfig.orgs.${integrationId}.orderStage.${np}`;
  await db.$runCommandRaw({
    update: "FleetAgent",
    updates: [{ q: { _id: { $oid: fleetAgentId } }, u: { $set: { [path]: value } } }],
  });
}

/**
 * Detecta el pago del turno y mueve la orden de columna. Fire-and-forget: se llama
 * DESPUÉS de entregar la respuesta, así que el cliente nunca espera por el CRM, y
 * cualquier fallo se traga (el turno ya fue exitoso desde el punto de vista del user).
 *
 * Gates, en orden de costo creciente: sin `FORMMY_SECRET_KEY` en el vault del owner no
 * hay CRM que mover (y ni siquiera se llama al modelo).
 */
export async function maybeMovePaymentStage(args: {
  fleetAgentId: string;
  ownerId: string;
  integrationId: string;
  sender: string;
  np: string;
  org: WabaOrg | undefined;
  incomingText: string;
  reply: string;
}): Promise<void> {
  const { fleetAgentId, ownerId, integrationId, sender, np, org, incomingText, reply } = args;
  try {
    if (!integrationId || !np || !reply.trim()) return;

    // Gate barato: el conector Formmy se configura guardando esta llave en el vault.
    // Ojo: NO sirve `wabaConfig.formmySecret` — ese es el token del gateway de WhatsApp
    // (/api/v1, Bearer) y el SDK (/api/v2/sdk, X-Secret-Key) lo rechaza con 401.
    const key = await getSecretValue(ownerId, "FORMMY_SECRET_KEY").catch(() => null);
    if (!key) return;

    const signal = await extractPaymentSignal(incomingText, reply);
    if (!signal?.mover) return;

    const estatus = stageLabelFor(signal.forma, org);
    if (!estatus) {
      console.log(`[waba] señal de avance para ${np} pero forma desconocida — sin mover etapa`);
      return;
    }

    if (!shouldFireStage(org?.orderStage?.[np], estatus)) {
      console.log(`[waba] etapa "${estatus}" ya aplicada a ${np} en las últimas 24h — omito`);
      return;
    }

    const conv = await formmySdk(key, "conversations.resolveByPhone", { integrationId, phone: sender });
    const conversationId = conv.data?.conversationId;
    if (!conversationId) {
      console.error(`[waba] resolveByPhone sin conversationId para ${np} (status ${conv.status})`);
      return;
    }

    const move = await formmySdk(key, "conversations.setOrderStatus", { conversationId }, { estatus });
    // Sin órdenes en la conversación = no hay nada que mover. Es el caso normal de un
    // cliente que paga algo cotizado fuera del sistema; no es un error.
    if (move.status === 404 || move.data?.code === "NO_ORDERS") {
      console.log(`[waba] ${np} reportó pago pero la conversación no tiene órdenes — no-op`);
      return;
    }
    if (!move.ok) {
      console.error(`[waba] setOrderStatus falló (${move.status}):`, JSON.stringify(move.data).slice(0, 200));
      return;
    }

    await recordOrderStage(fleetAgentId, integrationId, np, { estatus, at: new Date().toISOString() });
    console.log(`[waba] orden de ${np} movida a "${estatus}"${signal.monto ? ` ($${signal.monto})` : ""}`);
  } catch (e) {
    console.error("[waba] maybeMovePaymentStage falló:", e instanceof Error ? e.message : e);
  }
}
