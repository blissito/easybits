export type CapabilityCap = {
  // Cantidad incluida en la mensualidad. e.g. "500" para imágenes, "150,000" caracteres para voz.
  included: string;
  // Unidad. e.g. "imágenes/mes", "caracteres/mes", "segundos/mes", "páginas/mes".
  unit: string;
  // Precio del exceso, ya formateado. e.g. "$8 MXN c/u", "$0.08 MXN/char".
  overage: string;
};

// Tier opcional por capability con consumo variable. Si existe, el card muestra
// 2 opciones (Básico / Pro) en vez de yes/no. Cada tier tiene su propio precio
// y cap. Sin tiers = capability binaria, usa basePriceMxn.
export type Tier = {
  id: string; // "basic" | "pro" | "scale"
  label: string;
  priceMxn: number;
  cap: CapabilityCap;
  // Frase humana que traduce el cap a un caso real. Ej. "~15 audios cortos al mes".
  humanLine?: string;
};

// Tier id por defecto cuando una capability binaria está incluida.
export const DEFAULT_TIER_ID = "default";

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
  // Solo capabilities con consumo variable real (voz, imágenes, video, scraping).
  cap?: CapabilityCap;
  // 2 tiers (Básico / Pro). Cuando existe, el card pregunta tier en vez de yes/no.
  tiers?: Tier[];
};

// Setup único — escala según cuántas capacidades selecciona el cliente.
// Más capacidades = más vendors a configurar = más trabajo de armado.
// $170K MXN es el techo (~$10K USD), aplica al cliente full bundle.
// Se cobra junto con la primera mensualidad vía Stripe (line item one-time).
// Validamos fit por WhatsApp antes de cobrar — si no encajamos, no hay deal.
// Una vez iniciado el armado, setup no reembolsable.
export const SETUP_TIERS_MXN = {
  minimal: 59500, // 0-2 capacidades — un solo caso de uso (~$3.5K USD)
  basic: 85000, // 3-5 capacidades — SMB con flow concreto (~$5K USD)
  pro: 119000, // 6-8 capacidades — multi-canal, varias herramientas (~$7K USD)
  full: 170000, // 9+ capacidades — agente full (~$10K USD)
} as const;

// Constantes legacy (techo del rango). Se mantienen para referencia / fallback.
export const SETUP_FEE_MXN = SETUP_TIERS_MXN.full;
export const SETUP_FEE_USD = 10000;

// Mensualidad base — soporte humano + monitoreo continuo. Setup técnico y branding
// ahora viven en el SETUP_FEE_MXN, no aquí.
export const ORCHESTRATION_FEE_MXN = 3000;

// Integraciones custom: precio MÍNIMO ("desde"), se cotiza tras discovery.
// El discovery es no reembolsable y se acredita al desarrollo si avanza en 30 días.
export const CUSTOM_INTEGRATIONS_FROM_MXN = 3000;
export const CUSTOM_INTEGRATIONS_DISCOVERY_MXN = 1500;
// Alias retrocompatible — algunos componentes/PDF pueden seguir importando este nombre.
export const CUSTOM_INTEGRATIONS_MXN = CUSTOM_INTEGRATIONS_FROM_MXN;

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
    basePriceMxn: 300,
    bgClass: "bg-brand-yellow",
    isAddon: false,
    includes: [
      "Voces mexicanas que pasan por humanas, no IA",
      "Audios y notas de voz en WhatsApp",
      "Transcripción de audios entrantes",
    ],
    cap: {
      included: "15,000",
      unit: "caracteres/mes",
      overage: "$0.08 MXN por carácter excedido",
    },
    tiers: [
      {
        id: "basic",
        label: "Básico",
        priceMxn: 300,
        humanLine: "~22 audios cortos al mes",
        cap: {
          included: "15,000",
          unit: "caracteres/mes",
          overage: "$0.08 MXN por carácter excedido",
        },
      },
      {
        id: "pro",
        label: "Pro",
        priceMxn: 1500,
        humanLine: "~115 audios o 1 cliente activo",
        cap: {
          included: "80,000",
          unit: "caracteres/mes",
          overage: "$0.06 MXN por carácter excedido",
        },
      },
      {
        id: "scale",
        label: "Scale",
        priceMxn: 4500,
        humanLine: "~360 audios o varios clientes",
        cap: {
          included: "250,000",
          unit: "caracteres/mes",
          overage: "$0.05 MXN por carácter excedido",
        },
      },
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
    basePriceMxn: 400,
    bgClass: "bg-brand-pink",
    isAddon: false,
    includes: [
      "Imágenes para producto y redes sociales",
      "Variaciones rápidas de un brief",
      "Edición y transformaciones básicas",
    ],
    cap: {
      included: "150",
      unit: "imágenes/mes",
      overage: "$6 MXN por imagen excedida",
    },
    tiers: [
      {
        id: "basic",
        label: "Básico",
        priceMxn: 400,
        humanLine: "~5 imágenes al día",
        cap: {
          included: "150",
          unit: "imágenes/mes",
          overage: "$6 MXN por imagen excedida",
        },
      },
      {
        id: "pro",
        label: "Pro",
        priceMxn: 1500,
        humanLine: "~20 al día — un negocio activo en redes",
        cap: {
          included: "600",
          unit: "imágenes/mes",
          overage: "$4 MXN por imagen excedida",
        },
      },
      {
        id: "scale",
        label: "Scale",
        priceMxn: 4500,
        humanLine: "~85 al día — varias campañas paralelas",
        cap: {
          included: "2,500",
          unit: "imágenes/mes",
          overage: "$3 MXN por imagen excedida",
        },
      },
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
    id: "canva",
    label: "Canva Enterprise (diseño con tu brand kit)",
    shortLabel: "Canva Enterprise",
    emoji: "🪄",
    question: "¿Quieres que el agente diseñe en Canva Enterprise con tus templates?",
    description:
      "Requiere plan Canva Enterprise (corporativo, no Free/Pro/Teams) — es el único que expone Autofill y Brand Templates por API. El agente entra a tu cuenta, usa tus templates y brand kit, arma posts, presentaciones y materiales — y exporta listo para mandar.",
    vendor: "Canva",
    basePriceMxn: 1500,
    bgClass: "bg-rose",
    isAddon: false,
    includes: [
      "Requiere plan Canva Enterprise (no funciona con Free/Pro/Teams)",
      "Conexión OAuth con tu cuenta de Canva Enterprise",
      "Usa tus templates y brand kit existentes",
      "Genera posts y presentaciones, exporta a PDF/PNG",
    ],
  },
  {
    id: "figma",
    label: "Figma (handoff y assets)",
    shortLabel: "Figma",
    emoji: "🧩",
    question: "¿Tu agente trabaja con archivos de Figma de tu equipo?",
    description:
      "Lee archivos de Figma, extrae componentes, copy, specs y exporta frames como imágenes. Útil para handoff dev, librerías de marca y auditorías.",
    vendor: "Figma",
    basePriceMxn: 900,
    bgClass: "bg-brand-red",
    isAddon: false,
    includes: [
      "Lee archivos y componentes de Figma",
      "Extrae copy, specs y design tokens",
      "Exporta frames como PNG/SVG bajo demanda",
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
    basePriceMxn: 400,
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
    basePriceMxn: 600,
    bgClass: "bg-brand-pink",
    isAddon: true,
    includes: [
      "Video corto generado (Runway Gen-3)",
      "Reels y demos para redes",
      "Renders por demanda",
    ],
    cap: {
      included: "20",
      unit: "segundos/mes",
      overage: "$150 MXN por segundo excedido",
    },
    tiers: [
      {
        id: "basic",
        label: "Básico",
        priceMxn: 600,
        humanLine: "2-3 reels cortos al mes",
        cap: {
          included: "20",
          unit: "segundos/mes",
          overage: "$150 MXN por segundo excedido",
        },
      },
      {
        id: "pro",
        label: "Pro",
        priceMxn: 2500,
        humanLine: "~6 reels o 3 demos",
        cap: {
          included: "90",
          unit: "segundos/mes",
          overage: "$120 MXN por segundo excedido",
        },
      },
      {
        id: "scale",
        label: "Scale",
        priceMxn: 7500,
        humanLine: "~20 reels o varias campañas",
        cap: {
          included: "300",
          unit: "segundos/mes",
          overage: "$90 MXN por segundo excedido",
        },
      },
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
    basePriceMxn: 1200,
    bgClass: "bg-brand-red",
    isAddon: true,
    includes: [
      "Scraping vía Brightdata residencial",
      "Monitoreo de precios de competencia",
      "Resúmenes y alertas configurables",
    ],
    cap: {
      included: "3,000",
      unit: "páginas/mes",
      overage: "$1.20 MXN por página excedida",
    },
    tiers: [
      {
        id: "basic",
        label: "Básico",
        priceMxn: 1200,
        humanLine: "~100 páginas/día — monitoreo ligero",
        cap: {
          included: "3,000",
          unit: "páginas/mes",
          overage: "$1.20 MXN por página excedida",
        },
      },
      {
        id: "pro",
        label: "Pro",
        priceMxn: 5000,
        humanLine: "~470/día — competencia activa",
        cap: {
          included: "14,000",
          unit: "páginas/mes",
          overage: "$0.90 MXN por página excedida",
        },
      },
      {
        id: "scale",
        label: "Scale",
        priceMxn: 15000,
        humanLine: "~1,600/día — análisis a escala",
        cap: {
          included: "50,000",
          unit: "páginas/mes",
          overage: "$0.90 MXN por página excedida",
        },
      },
    ],
  },
];

export const getCapabilityById = (id: string): Capability | undefined =>
  CAPABILITIES.find((c) => c.id === id);
