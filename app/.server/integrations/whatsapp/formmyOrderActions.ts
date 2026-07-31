// Acción de EFECTO sobre las órdenes de Formmy: mover la tarjeta de columna.
//
// Vive aparte del extractor a propósito. La señal que el modelo REPORTA (pago, cancelación)
// y el efecto que el código EJECUTA son dos schemas distintos: aquí no hay vocabulario de
// ventas, sólo una etiqueta ya resuelta. Así el skill de cotización o un botón del dash
// pueden mover una orden sin duplicar el transporte del SDK.
const FORMMY_SDK_URL = `${(process.env.FORMMY_API_URL || "https://www.formmy.app").replace(/\/$/, "")}/api/v2/sdk`;

type SdkParams = Record<string, string>;

/** POST al SDK de Formmy. Espejo de `formmyPost` en la skill de Cotización (quote.mjs). */
export async function formmySdk(
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

/**
 * JID (integración + teléfono) → conversación de Formmy. Es el paso previo de TODO lo demás:
 * el worker sólo conoce el número, no el `conversationId`. Crea la conversación si no existe.
 */
export async function resolveConversationId(
  key: string,
  integrationId: string,
  sender: string
): Promise<string | null> {
  const conv = await formmySdk(key, "conversations.resolveByPhone", { integrationId, phone: sender });
  const id = conv.data?.conversationId as string | undefined;
  if (!id) {
    console.error(`[formmy] resolveByPhone sin conversationId para ${sender} (status ${conv.status})`);
    return null;
  }
  return id;
}

export type SetOrderStageResult =
  | { moved: true; ordenId: string | null; conversationId: string }
  | { moved: false; reason: "no-conversation" | "no-orders" | "error" };

/**
 * Mueve una orden de la conversación a una columna del tablero.
 *
 * Sin `ordenId` mueve la MÁS RECIENTE, que es lo correcto para un extractor automático:
 * no sabe de qué orden habla el cliente. `ordenId` (de `conversations.orders`) existe para
 * quien sí lo sabe — el skill de cotización, que acaba de crear la orden, o el dash.
 * Formmy valida que la orden pertenezca a esta conversación; una ajena responde 404.
 */
export async function setOrderStage(
  key: string,
  args: {
    integrationId: string;
    sender: string;
    estatus: string;
    ordenId?: string;
    /** Si el caller ya la resolvió (p.ej. para guardar contacto en el mismo turno). */
    conversationId?: string | null;
  }
): Promise<SetOrderStageResult> {
  const { integrationId, sender, estatus, ordenId } = args;

  const conversationId =
    args.conversationId || (await resolveConversationId(key, integrationId, sender));
  if (!conversationId) return { moved: false, reason: "no-conversation" };

  const move = await formmySdk(
    key,
    "conversations.setOrderStatus",
    { conversationId },
    ordenId ? { estatus, ordenId } : { estatus }
  );
  // Sin órdenes en la conversación = no hay nada que mover. Es el caso normal de un cliente
  // que paga algo cotizado fuera del sistema; no es un error. De paso hace de "lectura",
  // que es lo único parecido a leer que ofrece el SDK.
  if (move.status === 404 || move.data?.code === "NO_ORDERS") {
    return { moved: false, reason: "no-orders" };
  }
  if (!move.ok) {
    console.error(`[formmy] setOrderStatus falló (${move.status}):`, JSON.stringify(move.data).slice(0, 200));
    return { moved: false, reason: "error" };
  }
  // El id de la orden que REALMENTE se movió. Sin esto, cerrar el ciclo de vida exigiría
  // un segundo "la más reciente", que puede ya no ser la misma si entró otra orden entre
  // las dos llamadas.
  return {
    moved: true,
    ordenId: (move.data?.orden?.id as string) ?? null,
    conversationId,
  };
}

/**
 * Guarda datos del lead en su ficha (`datosCliente`), merge parcial: sólo lo que mandes.
 *
 * Dos cosas que resuelve el código y NO el modelo:
 *
 * 1. **`id` estable de la dirección.** `setConversationDatos` sólo hace update-in-place si
 *    le llega un `id` que ya existe; sin él AÑADE una entrada nueva. Como el cliente repite
 *    su domicilio a lo largo de la conversación, sin esto su ficha acumularía la misma
 *    dirección N veces. El id se deriva del contenido normalizado → repetirla la actualiza.
 * 2. **`mapsUrl`.** Estaba `null` en el 100% de las direcciones guardadas. Es una URL
 *    derivable de los campos; pedírsela al modelo sólo invita a que la invente.
 */
export async function setContact(
  key: string,
  args: {
    conversationId: string;
    email?: string | null;
    rfc?: string | null;
    razonSocial?: string | null;
    direccion?: { direccion?: string | null; cp?: string | null; ciudad?: string | null } | null;
  }
): Promise<boolean> {
  const { conversationId, email, rfc, razonSocial, direccion } = args;
  const body: Record<string, unknown> = {};
  if (email) body.email = email;
  if (rfc) body.rfc = rfc;
  if (razonSocial) body.razonSocial = razonSocial;

  const partes = addressParts(direccion);
  if (partes.length) {
    const full = partes.join(", ");
    body.direccion = {
      id: addressIdFor(direccion),
      label: "Entrega",
      direccion: direccion?.direccion || null,
      cp: direccion?.cp || null,
      ciudad: direccion?.ciudad || null,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`,
    };
  }

  if (!Object.keys(body).length) return false;

  const res = await formmySdk(key, "conversations.setContact", { conversationId }, body);
  if (!res.ok) {
    console.error(`[formmy] setContact falló (${res.status}):`, JSON.stringify(res.data).slice(0, 200));
  }
  return res.ok;
}

type AddressLike = { direccion?: string | null; cp?: string | null; ciudad?: string | null } | null | undefined;

const addressParts = (d: AddressLike): string[] =>
  [d?.direccion, d?.cp, d?.ciudad].filter(Boolean) as string[];

/**
 * Hash corto y estable del domicilio normalizado → mismo domicilio, mismo id, así que
 * repetirlo actualiza la entrada en vez de añadir una copia. Ignora acentos, mayúsculas y
 * puntuación: "Av. Juárez 210" y "AV JUAREZ 210" son la misma dirección para un humano.
 */
export function addressIdFor(d: AddressLike): string {
  const norm = addressParts(d)
    .join(", ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos: "México" y "Mexico" son la misma dirección
    .replace(/[^a-z0-9]/g, "");
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (Math.imul(31, h) + norm.charCodeAt(i)) | 0;
  return `dir_${(h >>> 0).toString(36)}`;
}

/**
 * Cierra el ciclo de vida de una orden (`status`), eje distinto de la columna del tablero
 * (`estatus`). Una orden cancelada o entregada que se queda ABIERTA sigue contando en el
 * valor de la columna.
 */
export async function closeOrder(
  key: string,
  args: { conversationId: string; ordenId?: string | null; status?: "CERRADA" | "ARCHIVADA" }
): Promise<boolean> {
  const { conversationId, ordenId, status = "CERRADA" } = args;
  const res = await formmySdk(
    key,
    "conversations.updateOrder",
    { conversationId },
    ordenId ? { status, ordenId } : { status }
  );
  if (!res.ok) {
    console.error(`[formmy] updateOrder(status) falló (${res.status}):`, JSON.stringify(res.data).slice(0, 200));
  }
  return res.ok;
}
