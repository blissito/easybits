/**
 * Valida el extractor de señal de pago (superficie WABA) contra conversaciones reales.
 *
 *   npx tsx scripts/check-waba-payment-signal.ts
 *
 * Correr SIEMPRE que se toque `PROMPT_HEADER` o el schema en wabaOrderStage.ts — es la
 * única red que atrapa una regresión de precisión. No vive en vitest a propósito:
 * `test/setup.ts` reemplaza `process.env` entero, así que ahí no habría API key ni
 * forma de gatear la corrida.
 *
 * Requiere ANTHROPIC_API_KEY (ya está en .env).
 */
import { extractPaymentSignal } from "../app/.server/integrations/whatsapp/wabaOrderStage";

import type { PaymentSignal } from "../app/.server/integrations/whatsapp/wabaOrderStage";

const FIXTURES: {
  label: string;
  accion: PaymentSignal["accion"];
  incoming: string;
  reply: string;
}[] = [
  {
    label: "comprobante en imagen (caso Iván, 27-jul-2026) — el agente ya lo verbalizó",
    accion: "avanzar",
    incoming: "",
    reply:
      "Listo, pago confirmado ✅\n\nTransferencia de $2,425.00 MXN del 27 de julio — queda registrado. El equipo de facturación genera tu complemento de pago este mes, Iván 👌",
  },
  {
    label: "transferencia reportada en texto",
    accion: "avanzar",
    incoming: "ya te hice la transferencia de 1500",
    reply: "¡Gracias! Confirmo la recepción de tu transferencia por $1,500.00 MXN. Preparamos tu pedido.",
  },
  {
    label: "tarjeta vía link de MercadoPago",
    accion: "avanzar",
    incoming: "listo, ya pagué con la tarjeta en el link",
    reply: "Perfecto, veo el pago aplicado. Tu pedido entra a preparación hoy mismo.",
  },
  {
    label: "contra entrega SIN confirmar — sólo está preguntando",
    accion: "ninguna",
    incoming: "y si les pago cuando llegue?",
    reply: "Claro, manejamos pago contra entrega. ¿Te confirmo el pedido para mandarlo en la ruta del miércoles?",
  },
  {
    label: "contra entrega CONFIRMADO — no hay dinero aún pero compromete ruta",
    accion: "avanzar",
    incoming: "sí confírmalo, les pago en efectivo cuando llegue",
    reply: "Listo Iván, pedido confirmado para la ruta del miércoles. Pago en efectivo a la entrega.",
  },
  {
    label: "sólo pregunta precio",
    accion: "ninguna",
    incoming: "cuánto sale la bobina TR180?",
    reply: "La bobina FAPSA TR180 está en $1,450.00 MXN con IVA incluido. ¿Te armo la cotización?",
  },
  {
    label: "promete pagar después — el error clásico de un regex",
    accion: "ninguna",
    incoming: "ahorita en la tarde te deposito",
    reply: "Perfecto, quedo al pendiente del comprobante. Te dejo la CLABE de nuevo.",
  },
  {
    label: "saludo irrelevante",
    accion: "ninguna",
    incoming: "buenos días",
    reply: "¡Buen día! ¿En qué te puedo ayudar?",
  },
  // --- Cancelación. Los tres primeros deben mover; los dos últimos son los que protegen
  // contra el falso positivo, que es el caro: mata una venta todavía viva.
  {
    label: "cancelación explícita",
    accion: "cancelar",
    incoming: "oye mejor cancela mi pedido, ya no lo voy a necesitar",
    reply: "Entendido, cancelo tu pedido. Cualquier cosa aquí seguimos 👌",
  },
  {
    label: "se fue con otro proveedor",
    accion: "cancelar",
    incoming: "gracias pero ya lo conseguí con otro proveedor más barato",
    reply: "Sin problema, gracias por avisar. Cancelo la cotización.",
  },
  {
    label: "el asistente confirma la cancelación",
    accion: "cancelar",
    incoming: "ya no",
    reply: "Listo, tu pedido 260726-008 queda cancelado. Si lo retomas me dices y lo levanto de nuevo.",
  },
  {
    label: "lo voy a pensar — NO es cancelación",
    accion: "ninguna",
    incoming: "déjame lo pienso y te aviso",
    reply: "Claro, tómate tu tiempo. La cotización te la respeto esta semana.",
  },
  {
    label: "se queja del precio — NO es cancelación",
    accion: "ninguna",
    incoming: "uy está muy caro, no manches",
    reply: "Te entiendo. Si quieres te armo una opción con la bobina TR140, sale más accesible.",
  },
];

let fallas = 0;
for (const f of FIXTURES) {
  const r = await extractPaymentSignal(f.incoming, f.reply);
  const ok = r?.accion === f.accion;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗ FALLA"} [espera accion=${f.accion}] ${f.label}\n    → ${JSON.stringify(r)}`);
}
console.log(fallas === 0 ? `\n${FIXTURES.length}/${FIXTURES.length} OK` : `\n${fallas} fallas de ${FIXTURES.length}`);
process.exit(fallas === 0 ? 0 : 1);
