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

const FIXTURES: { label: string; mover: boolean; incoming: string; reply: string }[] = [
  {
    label: "comprobante en imagen (caso Iván, 27-jul-2026) — el agente ya lo verbalizó",
    mover: true,
    incoming: "",
    reply:
      "Listo, pago confirmado ✅\n\nTransferencia de $2,425.00 MXN del 27 de julio — queda registrado. El equipo de facturación genera tu complemento de pago este mes, Iván 👌",
  },
  {
    label: "transferencia reportada en texto",
    mover: true,
    incoming: "ya te hice la transferencia de 1500",
    reply: "¡Gracias! Confirmo la recepción de tu transferencia por $1,500.00 MXN. Preparamos tu pedido.",
  },
  {
    label: "tarjeta vía link de MercadoPago",
    mover: true,
    incoming: "listo, ya pagué con la tarjeta en el link",
    reply: "Perfecto, veo el pago aplicado. Tu pedido entra a preparación hoy mismo.",
  },
  {
    label: "contra entrega SIN confirmar — sólo está preguntando",
    mover: false,
    incoming: "y si les pago cuando llegue?",
    reply: "Claro, manejamos pago contra entrega. ¿Te confirmo el pedido para mandarlo en la ruta del miércoles?",
  },
  {
    label: "contra entrega CONFIRMADO — no hay dinero aún pero compromete ruta",
    mover: true,
    incoming: "sí confírmalo, les pago en efectivo cuando llegue",
    reply: "Listo Iván, pedido confirmado para la ruta del miércoles. Pago en efectivo a la entrega.",
  },
  {
    label: "sólo pregunta precio",
    mover: false,
    incoming: "cuánto sale la bobina TR180?",
    reply: "La bobina FAPSA TR180 está en $1,450.00 MXN con IVA incluido. ¿Te armo la cotización?",
  },
  {
    label: "promete pagar después — el error clásico de un regex",
    mover: false,
    incoming: "ahorita en la tarde te deposito",
    reply: "Perfecto, quedo al pendiente del comprobante. Te dejo la CLABE de nuevo.",
  },
  {
    label: "saludo irrelevante",
    mover: false,
    incoming: "buenos días",
    reply: "¡Buen día! ¿En qué te puedo ayudar?",
  },
];

let fallas = 0;
for (const f of FIXTURES) {
  const r = await extractPaymentSignal(f.incoming, f.reply);
  const ok = r?.mover === f.mover;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗ FALLA"} [espera mover=${f.mover}] ${f.label}\n    → ${JSON.stringify(r)}`);
}
console.log(fallas === 0 ? `\n${FIXTURES.length}/${FIXTURES.length} OK` : `\n${fallas} fallas de ${FIXTURES.length}`);
process.exit(fallas === 0 ? 0 : 1);
