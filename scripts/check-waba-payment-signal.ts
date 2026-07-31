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

import { hasContactData } from "../app/.server/integrations/whatsapp/wabaOrderStage";
import type { PaymentSignal } from "../app/.server/integrations/whatsapp/wabaOrderStage";

const FIXTURES: {
  label: string;
  accion: PaymentSignal["accion"];
  incoming: string;
  reply: string;
  /** Sólo en los fixtures que prueban extracción de datos del lead. */
  contacto?: Partial<PaymentSignal["contacto"]>;
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
  // --- Facturación
  {
    label: "pide factura y da datos fiscales",
    accion: "facturar",
    incoming: "me puedes facturar? RFC XAXX010101000, razón social Totequim SA de CV",
    reply: "Claro, ya registré tus datos fiscales. La factura sale este mes.",
    contacto: { rfc: "XAXX010101000", razonSocial: "Totequim SA de CV" },
  },
  {
    label: "sólo pregunta si facturan — NO mueve",
    accion: "ninguna",
    incoming: "oigan, ustedes facturan?",
    reply: "Sí, facturamos. Cuando hagas tu pedido me pasas tu RFC y razón social.",
  },
  // --- Entrega. El caso trampa es la PREGUNTA "¿ya me llegó?" vs el acuse "ya me llegó".
  {
    label: "confirma que recibió el pedido",
    accion: "entregar",
    incoming: "ya me llegó todo completo, gracias!",
    reply: "¡Excelente! Qué bueno que llegó bien. Cualquier cosa aquí andamos 👌",
  },
  {
    label: "PREGUNTA si ya llegó — NO es entrega",
    accion: "ninguna",
    incoming: "oye ya me llegó?",
    reply: "Déjame checo la guía... va en camino, debe llegar mañana por la mañana.",
  },
  {
    label: "va en camino — promesa, no entrega",
    accion: "ninguna",
    incoming: "cuándo llega mi pedido?",
    reply: "Sale hoy en la ruta, te llega mañana antes de las 2pm.",
  },
  // --- Escalamiento
  {
    label: "pide hablar con un humano",
    accion: "escalar",
    incoming: "me puedes comunicar con una persona? esto no me está sirviendo",
    reply: "Claro, ahorita le paso tu caso a un asesor para que te contacte.",
  },
  {
    label: "reclamo serio: producto dañado",
    accion: "escalar",
    incoming: "me llegó la bobina rota y ya pagué, esto es un robo",
    reply: "Lamento mucho eso. Voy a escalarlo con el encargado ahora mismo para reponerte la pieza.",
  },
  {
    label: "pregunta difícil que el bot igual respondió — NO escala",
    accion: "ninguna",
    incoming: "cuál es la diferencia entre la TR180 y la TR140?",
    reply: "La TR180 es más ancha (180mm vs 140mm) y aguanta más tensión. Para uso rudo te recomiendo la TR180.",
  },
  // --- Datos del lead. El riesgo aquí NO es no extraer, es INVENTAR: un RFC confabulado
  // se factura mal. Todos los fixtures de arriba sin `contacto` verifican lo contrario
  // (que no aparezcan datos donde el turno no traía ninguno).
  {
    label: "da domicilio de entrega desglosado",
    accion: "ninguna",
    incoming: "mándalo a Av. Juárez 210, CP 42000, Pachuca",
    reply: "Anotado: Av. Juárez 210, CP 42000, Pachuca. Sale en la ruta del jueves.",
    contacto: { direccion: { direccion: "Av. Juárez 210", cp: "42000", ciudad: "Pachuca" } },
  },
  {
    label: "da correo suelto, sin nada más",
    accion: "ninguna",
    incoming: "mi correo es compras@totequim.mx por si necesitas mandarme algo",
    reply: "Perfecto, lo guardo.",
    contacto: { email: "compras@totequim.mx", rfc: null, razonSocial: null },
  },
  {
    label: "habla de una dirección que NO es suya — no debe guardarla",
    accion: "ninguna",
    incoming: "su sucursal de Pachuca centro está en Matamoros 100 verdad?",
    reply: "Esa es nuestra matriz, sí. ¿Te queda cómodo pasar por ahí o prefieres envío?",
    contacto: { direccion: null },
  },
  {
    label: "corrige el CP que había dado antes — gana el nuevo",
    accion: "ninguna",
    incoming: "perdón, el CP no es 42000, es 42080",
    reply: "Corregido, CP 42080.",
    contacto: { direccion: { direccion: null, cp: "42080", ciudad: null } },
  },
];

let fallas = 0;
for (const f of FIXTURES) {
  const r = await extractPaymentSignal(f.incoming, f.reply);
  let ok = r?.accion === f.accion;
  let detalle = "";
  // `contacto` sólo se revisa en los fixtures que lo declaran. En los demás basta con que
  // no invente: si el turno no traía datos, hasContactData debe ser false.
  if (ok && f.contacto !== undefined) {
    const got = r!.contacto;
    for (const [k, want] of Object.entries(f.contacto)) {
      const mine = (got as any)?.[k] ?? null;
      const igual =
        want === null
          ? mine === null
          : k === "direccion"
            ? JSON.stringify(mine) === JSON.stringify(want)
            : String(mine ?? "") === String(want);
      if (!igual) {
        ok = false;
        detalle += ` [${k}: esperaba ${JSON.stringify(want)}, llegó ${JSON.stringify(mine)}]`;
      }
    }
  } else if (ok && f.contacto === undefined && hasContactData(r?.contacto)) {
    ok = false;
    detalle = " [inventó datos de contacto donde no había]";
  }
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗ FALLA"} [espera accion=${f.accion}]${detalle} ${f.label}\n    → ${JSON.stringify(r)}`);
}
console.log(fallas === 0 ? `\n${FIXTURES.length}/${FIXTURES.length} OK` : `\n${fallas} fallas de ${FIXTURES.length}`);
process.exit(fallas === 0 ? 0 : 1);
