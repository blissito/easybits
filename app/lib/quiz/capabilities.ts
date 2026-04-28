export type Capability = {
  id: string;
  label: string;
  shortLabel: string;
  question: string;
  description: string;
  vendor: string;
  emoji: string;
  basePriceMxn: number;
  bgClass: string;
  isAddon: boolean;
  includes: string[];
};

export const ORCHESTRATION_FEE_MXN = 3000;

// Custom integrations: not a regular capability — handled as a separate step.
// Estimated placeholder, refined in the discovery call.
export const CUSTOM_INTEGRATIONS_MXN = 3000;

export const CAPABILITIES: Capability[] = [
  {
    id: "voice",
    label: "Voz (escucha y habla)",
    shortLabel: "Voz",
    emoji: "🎙",
    question: "¿Quieres que tu agente hable y entienda voz?",
    description:
      "Las mejores voces mexicanas del mercado. Audios de WhatsApp, mensajes de voz, podcasts.",
    vendor: "ElevenLabs",
    basePriceMxn: 3000,
    bgClass: "bg-brand-yellow",
    isAddon: false,
    includes: [
      "Voces mexicanas que pasan por humanas, no IA",
      "Audios y notas de voz en WhatsApp",
      "Transcripción de audios entrantes",
    ],
  },
  {
    id: "images",
    label: "Generación de imágenes",
    shortLabel: "Imágenes",
    emoji: "🎨",
    question: "¿Tu agente debe generar imágenes?",
    description:
      "Productos, banners para redes, mockups, ilustraciones bajo demanda.",
    vendor: "Fal / OpenAI",
    basePriceMxn: 1200,
    bgClass: "bg-brand-pink",
    isAddon: false,
    includes: [
      "Imágenes para producto y redes sociales",
      "Variaciones rápidas de un brief",
      "Edición y transformaciones básicas",
    ],
  },
  {
    id: "whatsapp",
    label: "Vive en WhatsApp",
    shortLabel: "WhatsApp",
    emoji: "💬",
    question: "¿Tu agente atiende clientes por WhatsApp?",
    description:
      "El agente tiene su propio número de WhatsApp. Atiende 1:1 a tus clientes o vive dentro de tus grupos.",
    vendor: "WhatsApp Business",
    basePriceMxn: 1700,
    bgClass: "bg-lime",
    isAddon: false,
    includes: [
      "Número WhatsApp propio para el agente",
      "Conversaciones 1:1 con clientes",
      "Soporte para grupos de WhatsApp",
    ],
  },
  {
    id: "webchat",
    label: "Web chat en tu sitio",
    shortLabel: "Web chat",
    emoji: "💻",
    question: "¿Quieres un chat embebido en tu sitio para visitantes?",
    description:
      "Widget de chat en tu landing que atiende a quien visite el sitio. Captura leads en caliente.",
    vendor: "EasyBits",
    basePriceMxn: 1200,
    bgClass: "bg-rose",
    isAddon: false,
    includes: [
      "Widget de chat embebido en tu sitio",
      "Atiende visitantes en tiempo real",
      "Captura de leads conectada al CRM",
    ],
  },
  {
    id: "slackteams",
    label: "Slack o Teams (canal interno)",
    shortLabel: "Slack/Teams",
    emoji: "👥",
    question: "¿Tu equipo usa Slack o Teams y quiere preguntarle al agente ahí?",
    description:
      "El agente vive en tu workspace de Slack o Microsoft Teams. Tu equipo le pregunta sin salir de su tool.",
    vendor: "Slack / Teams",
    basePriceMxn: 1500,
    bgClass: "bg-linen",
    isAddon: false,
    includes: [
      "Bot en tu workspace de Slack o Teams",
      "Mentions, threads y DMs respondidos",
      "Acceso al contexto de tu negocio",
    ],
  },
  {
    id: "gworkspace",
    label: "Google Workspace",
    shortLabel: "Workspace",
    emoji: "📧",
    question: "¿Quieres que el agente trabaje con tu Google Workspace?",
    description:
      "Tu agente trabaja con Gmail, Calendar, Meet, Drive, Docs, Sheets, Forms, Slides y Tasks. Tu Workspace, su oficina.",
    vendor: "Google",
    basePriceMxn: 2400,
    bgClass: "bg-maya",
    isAddon: false,
    includes: [
      "Gmail + Calendar: lee, manda emails y agenda citas",
      "Drive + Docs + Sheets: busca y edita archivos",
      "Meet + Forms + Slides + Tasks: el paquete completo",
    ],
  },
  {
    id: "memory",
    label: "Memoria + Storage",
    shortLabel: "Memoria",
    emoji: "🧠",
    question: "¿Quieres que el agente recuerde y guarde todo?",
    description:
      "Base sin la cual nada funciona. DB persistente + storage S3 para conversaciones, PDFs, fotos, contratos. Incluido cuando armamos tu agente, sin costo extra.",
    vendor: "EasyBits",
    basePriceMxn: 0,
    bgClass: "bg-brand-pink",
    isAddon: false,
    includes: [
      "Base de datos persistente por cliente",
      "Storage S3 ilimitado (sujeto a tu plan)",
      "Memoria Redis-compatible (alta velocidad)",
    ],
  },
  {
    id: "site",
    label: "Landings ilimitadas",
    shortLabel: "Landings",
    emoji: "🌐",
    question: "¿Quieres publicar landings y sitios sin límite?",
    description:
      "No te damos una landing — te damos miles. Una por campaña, producto, cliente o evento. Con formularios que capturan leads en automático. Incluido cuando armamos tu agente, sin costo extra.",
    vendor: "EasyBits",
    basePriceMxn: 0,
    bgClass: "bg-brand-yellow",
    isAddon: false,
    includes: [
      "Miles de landings con dominio propio",
      "Formularios + captura de leads automática",
      "Editor visual + SSL + el agente las arma y publica",
    ],
  },
  {
    id: "domain",
    label: "Tu propio dominio",
    shortLabel: "Dominio",
    emoji: "🌍",
    question: "¿Vas a usar tu propio dominio (negocio.com)?",
    description:
      "Conectamos tus landings y portales al dominio que ya tienes. SSL automático, configuración DNS guiada, branding consistente.",
    vendor: "EasyBits",
    basePriceMxn: 900,
    bgClass: "bg-maya",
    isAddon: false,
    includes: [
      "SSL automático con renovación incluida",
      "DNS guiado paso a paso",
      "Tus landings en tunegocio.com (no .easybits.cloud)",
    ],
  },
  {
    id: "documents",
    label: "Documentos PDF",
    shortLabel: "Documentos",
    emoji: "📄",
    question: "¿Tu agente genera documentos PDF (contratos, fichas, materiales)?",
    description:
      "Contratos, fichas técnicas, propuestas, manuales — generados por el agente con tu branding.",
    vendor: "EasyBits",
    basePriceMxn: 1400,
    bgClass: "bg-linen",
    isAddon: false,
    includes: [
      "Plantillas PDF con tu branding",
      "Generación bajo demanda por el agente",
      "Versionado y archivo automático",
    ],
  },
  {
    id: "quotes",
    label: "Cotizaciones automáticas",
    shortLabel: "Cotizaciones",
    emoji: "🧾",
    question: "¿Quieres que el agente cotice a tus clientes en automático?",
    description:
      "Cotizaciones con tu inventario, precios e IVA. El agente las arma, manda y da seguimiento al cliente hasta que responde.",
    vendor: "EasyBits",
    basePriceMxn: 2800,
    bgClass: "bg-rose",
    isAddon: false,
    includes: [
      "Cotizaciones con tu inventario y precios",
      "Folio, IVA y branding incluido",
      "Seguimiento automático al cliente",
    ],
  },
  {
    id: "payments",
    label: "Cobro con Mercado Pago",
    shortLabel: "Cobro",
    emoji: "💳",
    question: "¿Quieres cobrar a tus clientes en línea con Mercado Pago?",
    description:
      "El agente genera link de pago de Mercado Pago. Tu cliente paga con tarjeta, OXXO, transferencia o saldo MP. Tú recibes el dinero sin perseguir cobros.",
    vendor: "Mercado Pago",
    basePriceMxn: 1800,
    bgClass: "bg-lime",
    isAddon: false,
    includes: [
      "Link de pago Mercado Pago generado por el agente",
      "Cobra con tarjeta, OXXO, SPEI o saldo MP",
      "Notificación automática cuando el cliente paga",
    ],
  },
  {
    id: "video",
    label: "Generación de video",
    shortLabel: "Video",
    emoji: "🎬",
    question: "¿Necesitas videos cortos generados por IA?",
    description:
      "Reels, demos, anuncios cortos. Add-on opcional, consumo alto.",
    vendor: "Runway",
    basePriceMxn: 2700,
    bgClass: "bg-brand-pink",
    isAddon: true,
    includes: [
      "Video corto generado (Runway Gen-3)",
      "Reels y demos para redes",
      "Renders por demanda",
    ],
  },
  {
    id: "research",
    label: "Investigación web",
    shortLabel: "Investigación",
    emoji: "🔎",
    question: "¿Investiga competencia, monitorea precios o scrapea web?",
    description:
      "Búsqueda profunda, scraping respetuoso, monitoreo de precios. La perla del bundle.",
    vendor: "Brightdata",
    basePriceMxn: 6100,
    bgClass: "bg-brand-red",
    isAddon: true,
    includes: [
      "Scraping vía Brightdata residencial",
      "Monitoreo de precios de competencia",
      "Resúmenes y alertas configurables",
    ],
  },
];

export const getCapabilityById = (id: string): Capability | undefined =>
  CAPABILITIES.find((c) => c.id === id);
