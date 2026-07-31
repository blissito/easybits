// Movimiento AUTOMÁTICO de la etapa del tablero (Formmy) según lo que pasó en el turno:
// el cliente pagó (avanzar) o el cliente desistió (cancelar).
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
// Este archivo es el schema de PERCEPCIÓN. El de EFECTO (mover la tarjeta) vive en
// `formmyOrderActions.ts`, sin vocabulario de ventas, para que otras superficies lo reusen.
//
// Nota sobre el comprobante en imagen: el agente ya hizo visión sobre él y verbalizó el
// monto en su respuesta ("Transferencia de $2,425.00 MXN del 27 de julio"), así que el
// extractor lee ESO y no necesita visión propia.
import { generateObject } from "ai";
import { z } from "zod";
import { db } from "~/.server/db";
import { getAiModel, resolveModelLocal } from "~/.server/aiModels";
import { getSecretValue } from "~/.server/core/secretOperations";
import { setOrderStage, closeOrder, setContact, resolveConversationId } from "./formmyOrderActions";
import type { WabaOrg } from "./waba.server";

// Formas de pago que reconocemos → etiqueta de la columna del tablero. Los labels son
// los del tenant, así que `org.paymentStages` los puede sobreescribir sin tocar código.
export const DEFAULT_PAYMENT_STAGES: Record<string, string> = {
  transferencia: "Pago con transferencia",
  tarjeta: "Pago con tarjeta",
  contra_entrega: "Pago a contra entrega",
};

// Columnas que no dependen de la forma de pago. Mismo patrón de override por tenant.
export const DEFAULT_CANCEL_STAGE = "Cancelado";
export const DEFAULT_INVOICE_STAGE = "En espera de facturación";
export const DEFAULT_CLOSED_STAGE = "Cerrado";
export const DEFAULT_HUMAN_STAGE = "Requiere atención humana";

// Un "gracias por tu pago" minutos después no debe re-disparar. Pero una orden nueva
// días después sí. No podemos distinguirlas leyendo (el SDK de Formmy no expone lectura
// de órdenes), así que la ventana hace de proxy.
export const STAGE_REFIRE_MS = 24 * 60 * 60 * 1000;

export type PaymentSignal = {
  accion: "avanzar" | "facturar" | "entregar" | "escalar" | "cancelar" | "ninguna";
  forma: "transferencia" | "tarjeta" | "contra_entrega" | "desconocida";
  monto: number | null;
  contacto: ContactSignal;
};

// Datos del lead que aparecieron EN ESTE TURNO. Van en la misma pasada del extractor (una
// sola llamada al modelo, no dos) porque se leen del mismo texto.
//
// Por qué existe: `set_contact` es una tool suelta, y el modelo no llama tools sueltas —
// mismo diagnóstico que la etapa del tablero. Evidencia en prod: 10 de 12 órdenes reales
// traen dirección (la pone `quote.mjs`, que SÍ se ejecuta), pero sólo 2 de 80
// conversaciones tienen `datosCliente`, y ninguna tiene email/RFC/razón social. Sin RFC no
// se puede facturar, que es justo una de las columnas del tablero.
export type ContactSignal = {
  email: string | null;
  rfc: string | null;
  razonSocial: string | null;
  direccion: {
    direccion: string | null;
    cp: string | null;
    ciudad: string | null;
  } | null;
};

// Ojo con la semántica de "avanzar": NO es "hubo pago". Contra entrega es justamente el
// caso donde todavía no hay dinero pero la tarjeta SÍ debe moverse, porque un pedido
// confirmado ya compromete una ruta de reparto. Conflacionar ambas cosas en un booleano
// "pago" hacía que contra-entrega nunca disparara.
const PaymentSignalSchema = z.object({
  accion: z
    .enum(["avanzar", "facturar", "entregar", "escalar", "cancelar", "ninguna"])
    .describe(
      'A qué columna del tablero debe irse la orden por lo que pasó en ESTE turno. "avanzar" = pago hecho o pedido contra entrega confirmado. "facturar" = pide factura. "entregar" = ya recibió el pedido. "escalar" = necesita un humano. "cancelar" = desistió. "ninguna" = nada de lo anterior.'
    ),
  forma: z
    .enum(["transferencia", "tarjeta", "contra_entrega", "desconocida"])
    .describe('Cómo se pagó o se pagará. Sólo importa cuando accion="avanzar".'),
  monto: z.number().nullable().describe("Monto en MXN si aparece; null si no se menciona."),
  contacto: z
    .object({
      email: z.string().nullable().describe("Correo del cliente si lo dio en este turno."),
      rfc: z.string().nullable().describe("RFC mexicano si lo dio, p.ej. 'XAXX010101000'."),
      razonSocial: z.string().nullable().describe("Razón social para facturar si la dio."),
      direccion: z
        .object({
          direccion: z.string().nullable().describe("Calle y número."),
          cp: z.string().nullable().describe("Código postal."),
          ciudad: z.string().nullable().describe("Ciudad o municipio."),
        })
        .nullable()
        .describe("Domicilio de entrega si lo dio en este turno; null si no."),
    })
    .describe("Datos del cliente que aparecieron EN ESTE TURNO. null en lo que no aparezca."),
});

const PROMPT_HEADER = `Eres un extractor. Lee el intercambio de WhatsApp entre un cliente y el asistente de ventas, y decide si la orden debe cambiar de columna en el tablero de ventas.

"accion" = "avanzar" cuando:
- El pago YA ocurrió: el cliente dice que transfirió/pagó, mandó comprobante, o el asistente confirma haberlo recibido.
- O el cliente CONFIRMÓ EXPLÍCITAMENTE un pedido contra entrega (aún no paga, pero ya compromete una ruta de reparto).
- Si debe avanzar pero no distingues la forma, usa forma="desconocida".

"accion" = "facturar" cuando:
- El cliente PIDE factura, o entrega sus datos fiscales (RFC, razón social, uso de CFDI) para que se la hagan.
- NO cuando sólo pregunta "¿facturan?" sin pedirla, ni cuando el asistente menciona la factura por su cuenta.

"accion" = "entregar" SÓLO cuando el pedido YA LLEGÓ:
- El cliente confirma que lo recibió: "ya me llegó", "lo recibí", "llegó completo", o acusa recibo tras la entrega.
- O el asistente confirma la entrega ya ocurrida.
- NUNCA por: "¿ya me llegó?" (eso es una PREGUNTA), "¿cuándo llega?", "sale hoy", "va en camino", promesas de entrega o fechas futuras. Eso es "ninguna".

"accion" = "escalar" cuando el turno necesita a una persona:
- El cliente PIDE hablar con un humano/asesor/encargado, o el asistente ofrece pasarlo con alguien.
- O hay un reclamo serio: producto dañado, cobro incorrecto, pedido que no llegó, amenaza de queja.
- NO por una pregunta difícil que el asistente igual respondió.

"accion" = "cancelar" SÓLO cuando:
- El cliente desiste EXPLÍCITAMENTE: "cancélalo", "ya no lo quiero", "mejor ya no", "conseguí con otro proveedor".
- O el asistente confirma la cancelación del pedido.
- NUNCA por: "lo voy a pensar", "está caro", "déjame ver", posponer la compra o silencio. Eso es "ninguna".

"accion" = "ninguna" en todo lo demás: cotizar, preguntar precios, pedir la cuenta, considerar la compra, o prometer pagar después ("ahorita te deposito").

Si en un mismo turno aplican varias, gana la más avanzada en este orden: cancelar > escalar > entregar > facturar > avanzar.

Ante la duda, accion="ninguna". Un falso negativo se corrige a mano; un falso positivo mueve la tarjeta de un cliente que no ha pagado, da por entregado lo que no llegó, o mata una venta viva.

Aparte de la acción, extrae en "contacto" los datos del cliente que aparezcan EN ESTE TURNO (correo, RFC, razón social, domicilio de entrega). Reglas:
- Copia el dato TAL CUAL lo escribió el cliente. No lo inventes, no lo completes, no lo corrijas.
- null en cada campo que no aparezca en este turno. Es lo normal: la mayoría de los turnos no traen ninguno.
- La dirección sólo si es un domicilio de ENTREGA o fiscal que el cliente está dando. No una sucursal tuya, ni un lugar del que sólo se habla.
- Si el cliente corrige un dato que ya había dado, extrae el NUEVO.`;

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

/** Etiqueta de columna para la señal del turno, con override por tenant. */
export function stageLabelFor(signal: PaymentSignal, org?: WabaOrg): string | null {
  switch (signal.accion) {
    case "cancelar":
      return org?.cancelStage || DEFAULT_CANCEL_STAGE;
    case "facturar":
      return org?.invoiceStage || DEFAULT_INVOICE_STAGE;
    case "entregar":
      return org?.closedStage || DEFAULT_CLOSED_STAGE;
    case "escalar":
      return org?.humanStage || DEFAULT_HUMAN_STAGE;
    case "avanzar":
      // La forma de pago ES la columna; sin ella no sabemos a cuál de las tres ir.
      if (signal.forma === "desconocida") return null;
      return org?.paymentStages?.[signal.forma] || DEFAULT_PAYMENT_STAGES[signal.forma] || null;
    default:
      return null;
  }
}

// Acciones terminales: la orden deja de ser una venta viva y se le cierra el ciclo de
// vida, o se quedaría ABIERTA sumando al valor del tablero para siempre. "escalar" y
// "facturar" NO son terminales — la venta sigue en curso.
const TERMINAL: ReadonlySet<PaymentSignal["accion"]> = new Set(["cancelar", "entregar"]);

/** ¿El turno trajo algún dato del lead? La mayoría no trae ninguno. */
export function hasContactData(c: PaymentSignal["contacto"] | undefined): boolean {
  if (!c) return false;
  const d = c.direccion;
  return Boolean(c.email || c.rfc || c.razonSocial || d?.direccion || d?.cp || d?.ciudad);
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
    if (!signal) return;

    // La ficha del cliente se guarda ANTES y con independencia de la etapa: un turno donde
    // sólo dio su RFC no mueve ninguna columna, pero sí trae datos que hay que registrar.
    // Una sola resolución de conversación para las dos escrituras del turno.
    let conversationId: string | null = null;
    if (hasContactData(signal.contacto)) {
      conversationId = await resolveConversationId(key, integrationId, sender);
      if (conversationId) {
        await setContact(key, { conversationId, ...signal.contacto });
      }
    }

    if (signal.accion === "ninguna") return;

    const estatus = stageLabelFor(signal, org);
    if (!estatus) {
      console.log(`[waba] señal de avance para ${np} pero forma desconocida — sin mover etapa`);
      return;
    }

    if (!shouldFireStage(org?.orderStage?.[np], estatus)) {
      console.log(`[waba] etapa "${estatus}" ya aplicada a ${np} en las últimas 24h — omito`);
      return;
    }

    const move = await setOrderStage(key, { integrationId, sender, estatus, conversationId });
    if (!move.moved) {
      if (move.reason === "no-orders") {
        console.log(`[waba] señal de ${np} pero la conversación no tiene órdenes — no-op`);
      }
      return;
    }

    // Acción terminal (cancelada o entregada): además de mandarla a su columna, se le
    // cierra el ciclo de vida. Se cierra el id que REALMENTE se movió, no "la más
    // reciente" otra vez. Best-effort: si esto falla, la etapa ya quedó bien, que es lo
    // que se ve en el tablero.
    if (TERMINAL.has(signal.accion)) {
      await closeOrder(key, { conversationId: move.conversationId, ordenId: move.ordenId });
    }

    await recordOrderStage(fleetAgentId, integrationId, np, { estatus, at: new Date().toISOString() });
    console.log(`[waba] orden de ${np} movida a "${estatus}"${signal.monto ? ` ($${signal.monto})` : ""}`);
  } catch (e) {
    console.error("[waba] maybeMovePaymentStage falló:", e instanceof Error ? e.message : e);
  }
}
