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

export type SetOrderStageResult =
  | { moved: true }
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
  args: { integrationId: string; sender: string; estatus: string; ordenId?: string }
): Promise<SetOrderStageResult> {
  const { integrationId, sender, estatus, ordenId } = args;

  const conv = await formmySdk(key, "conversations.resolveByPhone", { integrationId, phone: sender });
  const conversationId = conv.data?.conversationId;
  if (!conversationId) {
    console.error(`[formmy] resolveByPhone sin conversationId para ${sender} (status ${conv.status})`);
    return { moved: false, reason: "no-conversation" };
  }

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
  return { moved: true };
}
