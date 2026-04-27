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
};

export const ORCHESTRATION_FEE_MXN = 3000;

export const CAPABILITIES: Capability[] = [
  {
    id: "voice",
    label: "Voz (escucha y habla)",
    shortLabel: "Voz",
    emoji: "🎙",
    question: "¿Quieres que tu agente hable y entienda voz?",
    description:
      "Audios de WhatsApp, llamadas, podcasts. Voces naturales en español MX vía ElevenLabs.",
    vendor: "ElevenLabs",
    basePriceMxn: 3000,
    bgClass: "bg-brand-grass",
    isAddon: false,
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
  },
  {
    id: "whatsapp",
    label: "Vive en WhatsApp",
    shortLabel: "WhatsApp",
    emoji: "💬",
    question: "¿Tu agente atiende clientes por WhatsApp?",
    description:
      "Conexión a WhatsApp Business vía Baileys. Setup técnico y onboarding incluidos.",
    vendor: "Baileys",
    basePriceMxn: 1700,
    bgClass: "bg-brand-yellow",
    isAddon: false,
  },
  {
    id: "memory",
    label: "Memoria + Storage",
    shortLabel: "Memoria",
    emoji: "🧠",
    question: "¿Recuerda preferencias del cliente y guarda archivos?",
    description:
      "DB persistente + storage S3. Conversaciones, PDFs, fotos, contratos al alcance del agente.",
    vendor: "EasyBits",
    basePriceMxn: 1000,
    bgClass: "bg-brand-aqua",
    isAddon: false,
  },
  {
    id: "site",
    label: "Sitio + Formularios",
    shortLabel: "Sitio web",
    emoji: "🌐",
    question: "¿Publica una landing y captura leads automáticamente?",
    description:
      "Landing personalizada, formularios conectados a DB, dominio y SSL incluidos.",
    vendor: "EasyBits",
    basePriceMxn: 900,
    bgClass: "bg-lime",
    isAddon: false,
  },
  {
    id: "video",
    label: "Generación de video",
    shortLabel: "Video",
    emoji: "🎬",
    question: "¿Necesitas videos cortos generados por AI?",
    description:
      "Reels, demos, anuncios cortos. Add-on opcional, consumo alto.",
    vendor: "Runway",
    basePriceMxn: 2700,
    bgClass: "bg-rose",
    isAddon: true,
  },
  {
    id: "research",
    label: "Investigación web",
    shortLabel: "Investigación",
    emoji: "🔎",
    question: "¿Investiga competencia, monitorea precios o scrapea web?",
    description:
      "Búsqueda profunda, scraping respetuoso, monitoreo de precios. Add-on opcional.",
    vendor: "Brightdata",
    basePriceMxn: 6100,
    bgClass: "bg-sky",
    isAddon: true,
  },
];

export const getCapabilityById = (id: string): Capability | undefined =>
  CAPABILITIES.find((c) => c.id === id);
