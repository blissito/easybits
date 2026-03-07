import type { BlockType } from "./blockTypes";

export const BLOCK_DEFAULTS: Record<BlockType, Record<string, any>> = {
  hero: {
    headline: "Tu producto increible",
    subtitle: "Una descripcion breve que explique el valor de tu producto o servicio.",
    ctaText: "Comenzar ahora",
    ctaUrl: "#",
    imageUrl: "",
  },
  text: {
    title: "Sobre nosotros",
    body: "Escribe aqui el contenido de tu seccion. Puedes hablar sobre tu empresa, tu mision, o cualquier informacion relevante para tus visitantes.",
  },
  imageText: {
    title: "Caracteristica principal",
    body: "Describe tu caracteristica mas importante aqui. Explica como beneficia a tus usuarios.",
    imageUrl: "https://placehold.co/600x400/e2e8f0/64748b?text=Imagen",
    imagePosition: "right",
  },
  cta: {
    headline: "Listo para empezar?",
    subtitle: "Unete a miles de usuarios satisfechos.",
    ctaText: "Empezar gratis",
    ctaUrl: "#",
  },
  footer: {
    companyName: "Mi Empresa",
    links: [
      { label: "Inicio", url: "#" },
      { label: "Contacto", url: "#" },
    ],
  },
  features: {
    title: "Nuestras caracteristicas",
    subtitle: "Todo lo que necesitas para tener exito.",
    variant: "cards",
    columns: 3,
    items: [
      { icon: "⚡", title: "Rapido", desc: "Rendimiento optimizado para velocidad maxima." },
      { icon: "🔒", title: "Seguro", desc: "Proteccion de datos de nivel empresarial." },
      { icon: "🎨", title: "Personalizable", desc: "Adapta todo a tu marca y necesidades." },
    ],
  },
  callout: {
    type: "info",
    title: "Nota importante",
    body: "Este es un mensaje destacado que quieres que tus visitantes vean.",
  },
  video: {
    title: "Mira como funciona",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    description: "",
  },
  testimonials: {
    title: "Lo que dicen nuestros clientes",
    variant: "cards",
    items: [
      { quote: "Increible producto, cambio nuestra forma de trabajar.", author: "Maria Garcia", role: "CEO, TechCorp", avatarUrl: "" },
      { quote: "El mejor servicio al cliente que he experimentado.", author: "Carlos Lopez", role: "CTO, StartupXYZ", avatarUrl: "" },
      { quote: "Simple, potente y confiable. Lo recomiendo.", author: "Ana Martinez", role: "Product Manager", avatarUrl: "" },
    ],
  },
  logoCloud: {
    title: "Empresas que confian en nosotros",
    variant: "row",
    logos: [
      { imageUrl: "https://placehold.co/120x40/e2e8f0/64748b?text=Logo+1", alt: "Logo 1", url: "#" },
      { imageUrl: "https://placehold.co/120x40/e2e8f0/64748b?text=Logo+2", alt: "Logo 2", url: "#" },
      { imageUrl: "https://placehold.co/120x40/e2e8f0/64748b?text=Logo+3", alt: "Logo 3", url: "#" },
      { imageUrl: "https://placehold.co/120x40/e2e8f0/64748b?text=Logo+4", alt: "Logo 4", url: "#" },
    ],
  },
  team: {
    title: "Nuestro equipo",
    variant: "grid",
    members: [
      { name: "Ana Garcia", role: "CEO", imageUrl: "https://placehold.co/200x200/e2e8f0/64748b?text=AG", bio: "" },
      { name: "Carlos Lopez", role: "CTO", imageUrl: "https://placehold.co/200x200/e2e8f0/64748b?text=CL", bio: "" },
      { name: "Maria Torres", role: "Designer", imageUrl: "https://placehold.co/200x200/e2e8f0/64748b?text=MT", bio: "" },
    ],
  },
  stats: {
    title: "Numeros que hablan",
    variant: "big-numbers",
    items: [
      { value: "10K+", label: "Usuarios", desc: "" },
      { value: "99.9%", label: "Uptime", desc: "" },
      { value: "50M+", label: "Archivos", desc: "" },
      { value: "24/7", label: "Soporte", desc: "" },
    ],
  },
  pricing: {
    title: "Planes y precios",
    variant: "cards",
    plans: [
      { name: "Gratis", price: "$0", period: "/mes", features: ["1GB storage", "100 archivos", "API basica"], ctaText: "Empezar gratis", highlighted: false },
      { name: "Pro", price: "$19", period: "/mes", features: ["50GB storage", "Archivos ilimitados", "API completa", "Soporte prioritario"], ctaText: "Elegir Pro", highlighted: true },
      { name: "Enterprise", price: "$99", period: "/mes", features: ["500GB storage", "Todo en Pro", "SSO", "SLA 99.99%"], ctaText: "Contactar", highlighted: false },
    ],
  },
  faq: {
    title: "Preguntas frecuentes",
    variant: "accordion",
    items: [
      { question: "Como empiezo?", answer: "Crea una cuenta gratuita y comienza a usar la plataforma en minutos." },
      { question: "Puedo cambiar de plan?", answer: "Si, puedes cambiar de plan en cualquier momento desde tu dashboard." },
      { question: "Ofrecen soporte tecnico?", answer: "Si, todos los planes incluyen soporte por email. Los planes Pro y Enterprise incluyen soporte prioritario." },
    ],
  },
  comparison: {
    title: "Comparacion",
    variant: "table",
    headers: ["Caracteristica", "Nosotros", "Competidor A", "Competidor B"],
    rows: [
      { label: "Precio", values: ["$19/mes", "$29/mes", "$39/mes"] },
      { label: "Storage", values: ["50GB", "20GB", "30GB"] },
      { label: "API", values: ["✓", "✓", "✗"] },
      { label: "Soporte 24/7", values: ["✓", "✗", "✗"] },
    ],
    highlightCol: 0,
  },
  chart: {
    title: "Metricas clave",
    chartType: "bar",
    labels: ["Ene", "Feb", "Mar", "Abr", "May", "Jun"],
    datasets: [
      { label: "Usuarios", data: [120, 190, 300, 500, 800, 1200], color: "" },
    ],
  },
  diagram: {
    title: "Nuestro proceso",
    diagramType: "funnel",
    items: [
      { label: "Visitantes", value: 1000 },
      { label: "Registros", value: 400 },
      { label: "Activos", value: 200 },
      { label: "Clientes", value: 80 },
    ],
  },
  timeline: {
    title: "Nuestra historia",
    variant: "vertical",
    events: [
      { date: "2023", title: "Fundacion", desc: "Comenzamos con una idea simple." },
      { date: "2024", title: "Lanzamiento", desc: "Lanzamos la primera version publica." },
      { date: "2025", title: "Crecimiento", desc: "Alcanzamos 10,000 usuarios." },
    ],
  },
  gallery: {
    title: "Galeria",
    variant: "grid",
    columns: 3,
    images: [
      { url: "https://placehold.co/400x300/e2e8f0/64748b?text=Foto+1", alt: "Foto 1", caption: "" },
      { url: "https://placehold.co/400x300/e2e8f0/64748b?text=Foto+2", alt: "Foto 2", caption: "" },
      { url: "https://placehold.co/400x300/e2e8f0/64748b?text=Foto+3", alt: "Foto 3", caption: "" },
    ],
  },
};
