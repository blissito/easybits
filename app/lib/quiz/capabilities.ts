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
  // Roadmap: la capability se muestra como "próximamente" en la pill list
  // del summary pero NO aparece como paso del stepper, NO se puede seleccionar
  // y NO suma al setup. Sirve como signaling de roadmap al usuario.
  comingSoon?: boolean;
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
  // Capabilities `voice` (ElevenLabs) y `images` (Fal/OpenAI) eliminadas del cotizador.
  // Se mueven al modelo de créditos: voice.elevenlabs.tts y image.fal.generate
  // (ver app/.server/services/registry.ts). El cliente las consume comprando
  // packs (`GENERATION_PACKS` en plans.ts) o usando los créditos incluidos
  // en su plan mensual.
  //
  // Orden importante: las capacidades más "wow"/diferenciadoras van primero
  // para enganchar; las de infraestructura/canal secundario al final
  // (webchat cierra el flujo).
  {
    id: "whatsapp",
    label: "Vive en WhatsApp",
    shortLabel: "Atiende por WhatsApp",
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
    id: "voice",
    label: "Voz (habla y escucha)",
    shortLabel: "Habla y escucha",
    emoji: "🎙",
    question: "¿Quieres que tu agente hable y entienda voz?",
    description:
      "Las mejores voces mexicanas del mercado, indistinguibles de humanas. Tu agente manda notas de voz por WhatsApp, escucha audios entrantes y los transcribe — el flow de voz queda armado en el setup; cada minuto generado consume créditos.",
    vendor: "ElevenLabs",
    basePriceMxn: 2000,
    bgClass: "bg-brand-yellow",
    isAddon: false,
    includes: [
      "Voces mexicanas que pasan por humanas, no IA",
      "Audios y notas de voz en WhatsApp",
      "Transcripción de audios entrantes",
    ],
  },
  {
    id: "memory",
    label: "Memoria + Storage",
    shortLabel: "Recuerda y guarda",
    emoji: "🧠",
    question: "Tu agente recuerda todo y guarda lo que necesites en su propia nube.",
    description:
      "Base sin la cual nada funciona. DB persistente + storage S3 para conversaciones, PDFs, fotos, contratos.",
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
    id: "quotes",
    label: "Cotizaciones automáticas",
    shortLabel: "Cotiza",
    emoji: "🧾",
    question: "¿Quieres que el agente genere cotizaciones PDF desde tu Catálogo?",
    description:
      "Cotizaciones con tu inventario, precios e IVA. El agente las arma, manda y da seguimiento; incluyen link cliqueable de pago.",
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
    shortLabel: "Cobra",
    emoji: "💳",
    question: "¿Quieres que el agente genere links de pago con Mercado Pago?",
    description:
      "El agente genera links instantáneos con precios exactos. Tu cliente paga con tarjeta, OXXO, transferencia o saldo MP. Tú recibes el dinero sin perseguir cobros.",
    vendor: "Mercado Pago",
    basePriceMxn: 1800,
    bgClass: "bg-lime",
    isAddon: false,
    includes: [
      "Link de pago y código QR generados por el agente",
      "Cobra con tarjeta, OXXO, SPEI o saldo MP",
      "Notificación automática cuando el cliente paga",
    ],
  },
  {
    id: "documents",
    label: "Documentos (PDF, DOCX, XLSX)",
    shortLabel: "Genera PDF, DOCX y XLSX",
    emoji: "📄",
    question: "¿Tu agente genera documentos en PDF, Word y Excel?",
    description:
      "Contratos, fichas técnicas, propuestas, manuales, reportes en hojas de cálculo — generados por el agente con tu branding y listos para mandar.",
    vendor: "EasyBits",
    basePriceMxn: 1400,
    bgClass: "bg-linen",
    isAddon: false,
    includes: [
      "Plantillas PDF, DOCX y XLSX con tu branding",
      "Generación bajo demanda por el agente",
      "Versionado y archivo automático",
    ],
  },
  {
    id: "slackteams",
    label: "Slack o Teams (canal interno)",
    shortLabel: "Atiende en Slack/Teams",
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
      "Human-in-the-loop: tu equipo aprueba/edita respuestas antes de mandar (disponible en Slack y Teams)",
    ],
  },
  {
    id: "gworkspace",
    label: "Google Workspace",
    shortLabel: "Usa Google Workspace",
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
    id: "figma",
    label: "Figma (handoff y assets)",
    shortLabel: "Lee tus archivos de Figma",
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
    id: "removebg",
    label: "Quitar fondo de imágenes",
    shortLabel: "Quita el fondo a fotos",
    emoji: "✂️",
    question: "¿Tu agente quita el fondo de fotos de producto, retratos o assets?",
    description:
      "Procesa imágenes y devuelve PNG transparente listo para catálogo, ecommerce o composición.",
    vendor: "Modelo IA de Easybits",
    basePriceMxn: 1500,
    bgClass: "bg-linen",
    isAddon: false,
    includes: [
      "Quita fondo y devuelve PNG con transparencia",
      "Volumen ilimitado — sin contador por imagen, sin créditos",
      "Acepta JPG/PNG, optimizado para fotos de producto y retratos",
    ],
  },
  {
    id: "domain",
    label: "Tu propio dominio",
    shortLabel: "Usa tu dominio",
    emoji: "🌍",
    question: "¿Vas a usar tu propio dominio (negocio.com)?",
    description:
      "Conectamos tus landings, páginas y dashboards al dominio que ya tienes. SSL automático, configuración DNS guiada, branding consistente.",
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
    id: "site",
    label: "Páginas Web",
    shortLabel: "Codea páginas web",
    emoji: "🌐",
    question: "Tu agente codea y publica páginas web en tu propio dominio.",
    description:
      "No te damos una landing — te damos miles. Una por campaña, producto, cliente o evento. Con formularios que capturan leads en automático.\n\nPublica dashboards instantáneos y compártelos con tus clientes.",
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
    id: "webchat",
    label: "Web chat en tu sitio",
    shortLabel: "Vive en tu sitio web",
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
  // Capabilities `video` (Runway) y `research` (Brightdata) eliminadas del
  // cotizador. Se mueven al modelo de créditos: video.fal.avatar y
  // research.brightdata.{scrape,search} en app/.server/services/registry.ts.
  // Consumibles via packs o créditos del plan mensual.
  //
  // Babysit del agente NO es una capability. Viene incluido en cualquier
  // setup pagado — no es opcional, no se cotiza aparte. La constante
  // BABYSIT_MONTHLY_MXN en pricing.ts queda como referencia interna pero ya
  // no se cobra al cliente.

  // ──────────────────────────────────────────────────────────────────
  // PRÓXIMAMENTE — caps que aparecen en la lista "+ Agregar más" como
  // signaling de roadmap. NO seleccionables, NO entran al stepper, NO
  // suman al setup. Cuando estén listas, basta quitarles `comingSoon`.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "voicecall",
    label: "Llamadas de voz",
    shortLabel: "Llama por voz",
    emoji: "📞",
    question: "¿Tu agente hace llamadas de voz salientes?",
    description:
      "El agente llama a tus clientes con voz clonada (Twilio + ElevenLabs). Ideal para confirmaciones, recordatorios y outbound calificado.",
    vendor: "Twilio · ElevenLabs",
    basePriceMxn: 0,
    bgClass: "bg-rose",
    isAddon: false,
    includes: [
      "Llamadas salientes con voz clonada",
      "Confirmaciones, recordatorios, follow-ups",
      "Logs y transcripciones automáticas",
    ],
    comingSoon: true,
  },
  {
    id: "videocall",
    label: "Videollamadas con avatar",
    shortLabel: "Videollama con avatar",
    emoji: "🎥",
    question: "¿Tu agente atiende videollamadas con avatar realista?",
    description:
      "El agente entra a videollamadas con un avatar foto-realista que habla con tu voz clonada. Atiende leads, demos o entrevistas mientras tú haces otra cosa.",
    vendor: "HeyGen · Synthesia",
    basePriceMxn: 0,
    bgClass: "bg-rose",
    isAddon: false,
    includes: [
      "Avatar realista con tu voz clonada",
      "Demos, entrevistas y onboarding 24/7",
      "Grabación + transcripción automática",
    ],
    comingSoon: true,
  },
  {
    id: "computeruse",
    label: "Operador de pantalla",
    shortLabel: "Opera tu compu",
    emoji: "🖥️",
    question: "¿Tu agente opera apps directamente desde una pantalla, sin API?",
    description:
      "Cuando una herramienta no tiene API, el agente la usa como humano: ve la pantalla, mueve el mouse y teclea. Funciona en cualquier app web o de escritorio (sistemas legacy, ERPs viejos, panels internos).",
    vendor: "Claude Computer Use",
    basePriceMxn: 0,
    bgClass: "bg-maya",
    isAddon: false,
    includes: [
      "Opera apps sin API por visión + mouse/teclado",
      "Sirve para sistemas legacy, ERPs viejos, panels internos",
      "Logs y screenshots de cada acción",
    ],
    comingSoon: true,
  },
  {
    id: "designs",
    label: "Presentaciones + diseños (sin Canva)",
    shortLabel: "Diseña con AI",
    emoji: "🎨",
    question: "¿Tu agente arma presentaciones y posts con tu brand kit?",
    description:
      "Sustituye a Canva: el agente genera presentaciones, posts y materiales con tu marca usando créditos. Sin templates rígidos, sin licencias Enterprise, sin OAuth — todo dentro de Easybits.",
    vendor: "Easybits",
    basePriceMxn: 0,
    bgClass: "bg-brand-yellow",
    isAddon: false,
    includes: [
      "Presentaciones, posts y carruseles con tu brand kit",
      "Cobra en créditos del plan — sin renta extra",
      "Edita y exporta a PDF/PNG/PPTX",
    ],
    comingSoon: true,
  },
  {
    id: "blender",
    label: "Blender (3D y video)",
    shortLabel: "Renderiza 3D",
    emoji: "🎬",
    question: "¿Tu agente arma escenas 3D y renders en Blender?",
    description:
      "El agente compone, anima y renderiza escenas 3D para producto, ads o explainers — sin que tú toques Blender.",
    vendor: "Blender · Easybits",
    basePriceMxn: 0,
    bgClass: "bg-brand-pink",
    isAddon: false,
    includes: [
      "Composición y animación de escenas",
      "Renders MP4/PNG de producto",
      "Pipeline orquestado por el agente",
    ],
    comingSoon: true,
  },
];

export const getCapabilityById = (id: string): Capability | undefined =>
  CAPABILITIES.find((c) => c.id === id);
