// Plantillas de partida de las web apps (ver app/lib/siteTemplates.ts). Cada una es una
// página React con Tailwind 4 que usa SÓLO los tokens del tema (bg-primary, text-on-surface…)
// y trae su propia paleta en eb-theme.css: el botón «Tema» la cambia sin tocar el código.
// La página es la misma en TanStack y React Router; cambia sólo el archivo de ruta.
import type { SiteStackId } from "~/lib/siteStacks";
import { TEMPLATE_STACKS, type SiteTemplateKey } from "~/lib/siteTemplates";
import { themeCssTw4, type ThemeColors } from "~/lib/siteTheme";
import { stackThemeFiles } from "./index";
import { AGENTE_PAGE, AGENTE_TANSTACK } from "./agente";

/** Dónde viven las plantillas dentro de la caja dorada (rootfs, como el starter). */
export const TEMPLATES_DIR = "/opt/eb-templates";

/** `files`: archivos extra por stack (relativos a /app), escritos al final: ganan sobre la ruta generada. */
type Template = { title: string; colors: ThemeColors; page: string; files?: Partial<Record<SiteStackId, Record<string, string>>> };

const palette = (c: Record<string, string>): ThemeColors => c;

const TEMPLATES: Record<SiteTemplateKey, Template> = {
  consultorio: {
    title: "Clínica Sonríe",
    colors: palette({
      primary: "#1fa37a", "primary-light": "#cfeee2", "primary-dark": "#12644b", secondary: "#12302b", accent: "#1fa37a",
      surface: "#ffffff", "surface-alt": "#eef7f3", "on-primary": "#ffffff", "on-secondary": "#ffffff", "on-accent": "#ffffff",
      "on-surface": "#12302b", "on-surface-muted": "#5d7470",
    }),
    page: `const SERVICES = [
  { name: "Limpieza", price: "desde $650 MXN" },
  { name: "Ortodoncia", price: "desde $1,200 MXN al mes" },
  { name: "Blanqueamiento", price: "desde $2,900 MXN" },
];

export function Page() {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <nav data-eb-id="nav" className="flex items-center gap-6 px-6 md:px-10 py-5 text-sm">
        <b className="mr-auto text-lg">Clínica Sonríe</b>
        <a href="#servicios" className="hidden md:inline">Servicios</a>
        <a href="#ubicacion" className="hidden md:inline">Ubicación</a>
        <a href="https://wa.me/520000000000" className="rounded-full bg-accent text-on-accent px-5 py-2.5 font-bold">Agenda por WhatsApp</a>
      </nav>
      <section data-eb-id="hero" className="grid md:grid-cols-2 gap-8 items-center px-6 md:px-10 py-14">
        <div>
          <h1 data-eb-id="hero-title" className="text-4xl md:text-5xl font-bold leading-tight tracking-tight">Tu sonrisa en buenas manos, cerca de casa</h1>
          <p data-eb-id="hero-sub" className="mt-4 text-on-surface-muted">Citas el mismo día · estacionamiento · pagos a meses</p>
          <a href="https://wa.me/520000000000" className="mt-6 inline-block rounded-full bg-primary text-on-primary px-6 py-3 font-bold">Agenda tu cita</a>
        </div>
        <div data-eb-id="hero-art" className="h-60 rounded-3xl bg-primary-light grid place-items-center text-8xl">🦷</div>
      </section>
      <section id="servicios" data-eb-id="services" className="px-6 md:px-10 pb-14">
        <h2 className="text-2xl font-bold mb-5">Servicios</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {SERVICES.map((s) => (
            <div key={s.name} className="rounded-2xl bg-surface-alt p-6">
              <p className="font-bold">{s.name}</p>
              <p className="text-sm text-on-surface-muted">{s.price}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="ubicacion" data-eb-id="location" className="px-6 md:px-10 pb-14">
        <div className="rounded-2xl bg-surface-alt p-6 flex flex-wrap gap-4 justify-between items-center">
          <div>
            <p className="font-bold">Lunes a sábado · 9:00 a 20:00</p>
            <p className="text-sm text-on-surface-muted">Av. Reforma 123, Puebla</p>
          </div>
          <a href="https://maps.google.com" className="rounded-full bg-accent text-on-accent px-5 py-2.5 font-bold">Cómo llegar</a>
        </div>
      </section>
      <footer data-eb-id="footer" className="px-6 md:px-10 py-8 text-sm text-on-surface-muted">Clínica Sonríe · Ced. Prof. 1234567</footer>
    </main>
  );
}
`,
  },
  despacho: {
    title: "Rivera & Asociados",
    colors: palette({
      primary: "#0f3d5e", "primary-light": "#dfe8ef", "primary-dark": "#0a2a41", secondary: "#0f1f2e", accent: "#0f3d5e",
      surface: "#ffffff", "surface-alt": "#f1f5f8", "on-primary": "#ffffff", "on-secondary": "#ffffff", "on-accent": "#ffffff",
      "on-surface": "#0f1f2e", "on-surface-muted": "#5c6b78",
    }),
    page: `const SERVICES = ["Contabilidad mensual", "Nómina e IMSS", "Declaraciones anuales"];
const STATS = [
  { value: "320", label: "clientes" },
  { value: "98%", label: "renuevan" },
  { value: "24 h", label: "respuesta" },
];

export function Page() {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <nav data-eb-id="nav" className="flex items-center gap-6 px-6 md:px-10 py-5 text-sm">
        <b className="mr-auto text-lg">Rivera &amp; Asociados</b>
        <a href="#servicios" className="hidden md:inline">Servicios</a>
        <a href="#contacto" className="rounded-full bg-accent text-on-accent px-5 py-2.5 font-bold">Agenda una llamada</a>
      </nav>
      <section data-eb-id="hero" className="grid md:grid-cols-[1.2fr_1fr] gap-8 items-center px-6 md:px-10 py-14">
        <div>
          <p className="text-xs font-bold tracking-widest text-on-surface-muted">CONTADORES PÚBLICOS</p>
          <h1 data-eb-id="hero-title" className="mt-3 text-4xl md:text-5xl font-bold leading-tight tracking-tight">Tus impuestos al día, sin sustos con el SAT</h1>
          <a href="#contacto" className="mt-6 inline-block rounded-full bg-primary text-on-primary px-6 py-3 font-bold">Diagnóstico gratis</a>
        </div>
        <div data-eb-id="hero-art" className="h-56 rounded-3xl bg-primary-light grid place-items-center text-primary">
          <p className="text-6xl font-extrabold">+18 <span className="text-base font-semibold">años</span></p>
        </div>
      </section>
      <section id="servicios" data-eb-id="services" className="px-6 md:px-10 pb-14">
        <h2 className="text-2xl font-bold mb-5">Servicios</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {SERVICES.map((s) => (
            <div key={s} className="rounded-2xl bg-surface-alt p-6">
              <p className="font-bold">{s}</p>
              <p className="text-sm text-on-surface-muted">Para personas físicas y empresas.</p>
            </div>
          ))}
        </div>
      </section>
      <section data-eb-id="stats" className="px-6 md:px-10 pb-14">
        <div className="rounded-2xl bg-surface-alt p-6 flex justify-around text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold">{s.value}</p>
              <p className="text-on-surface-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>
      <footer id="contacto" data-eb-id="footer" className="px-6 md:px-10 py-8 text-sm text-on-surface-muted">Rivera &amp; Asociados · Guadalajara, Jal.</footer>
    </main>
  );
}
`,
  },
  portafolio: {
    title: "Lucía Ortega Fotografía",
    colors: palette({
      primary: "#1d1a16", "primary-light": "#c9a98a", "primary-dark": "#8a6a52", secondary: "#8a6a52", accent: "#1d1a16",
      surface: "#f6f1ea", "surface-alt": "#ebe3d8", "on-primary": "#f6f1ea", "on-secondary": "#ffffff", "on-accent": "#f6f1ea",
      "on-surface": "#1d1a16", "on-surface-muted": "#7a7066",
    }),
    page: `const PHOTOS = ["bg-primary-light", "bg-primary-dark", "bg-surface-alt", "bg-secondary", "bg-primary-light", "bg-primary-dark"];
const PACKAGES = [
  { name: "Esencial", price: "$12,900" },
  { name: "Completo", price: "$18,500" },
  { name: "Destino", price: "$29,000" },
];

export function Page() {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <nav data-eb-id="nav" className="flex items-center gap-6 px-6 md:px-10 py-5 text-sm">
        <b className="mr-auto text-lg font-serif italic">Lucía Ortega</b>
        <a href="#galeria" className="hidden md:inline">Galería</a>
        <a href="#paquetes" className="hidden md:inline">Paquetes</a>
        <a href="#contacto" className="rounded-full bg-accent text-on-accent px-5 py-2.5 font-bold">Agenda</a>
      </nav>
      <section data-eb-id="hero" className="mx-6 md:mx-10 h-72 rounded-3xl bg-gradient-to-br from-primary-light to-primary-dark flex items-end p-8">
        <h1 data-eb-id="hero-title" className="max-w-xl font-serif text-4xl md:text-5xl text-white leading-tight">Historias de boda contadas con luz natural</h1>
      </section>
      <section id="galeria" data-eb-id="gallery" className="px-6 md:px-10 py-14">
        <h2 className="font-serif text-2xl mb-5">Galería</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {PHOTOS.map((c, i) => (
            <div key={i} className={"h-32 rounded-2xl " + c} />
          ))}
        </div>
      </section>
      <section id="paquetes" data-eb-id="packages" className="px-6 md:px-10 pb-14">
        <h2 className="font-serif text-2xl mb-5">Paquetes</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {PACKAGES.map((p) => (
            <div key={p.name} className="rounded-2xl bg-surface-alt p-6">
              <p className="text-on-surface-muted">{p.name}</p>
              <p className="text-2xl font-bold">{p.price}</p>
              <p className="text-sm text-on-surface-muted">MXN · cobertura y álbum</p>
            </div>
          ))}
        </div>
      </section>
      <footer id="contacto" data-eb-id="footer" className="px-6 md:px-10 py-8 text-sm text-on-surface-muted">© Lucía Ortega Fotografía · CDMX</footer>
    </main>
  );
}
`,
  },
  lanzamiento: {
    title: "Alcancía",
    colors: palette({
      primary: "#c4f25a", "primary-light": "#2a2550", "primary-dark": "#1b1830", secondary: "#2a2550", accent: "#c4f25a",
      surface: "#0d0b1a", "surface-alt": "#1b1830", "on-primary": "#0d0b1a", "on-secondary": "#f3f1ff", "on-accent": "#0d0b1a",
      "on-surface": "#f3f1ff", "on-surface-muted": "#a19cc0",
    }),
    page: `const BENEFITS = [
  { title: "Automático", text: "Conecta tu banco y listo." },
  { title: "Claro", text: "Una gráfica, no cuarenta." },
  { title: "Privado", text: "Tus datos son tuyos." },
];

export function Page() {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <nav data-eb-id="nav" className="flex items-center gap-6 px-6 md:px-10 py-5 text-sm">
        <b className="mr-auto text-lg">Alcancía</b>
        <a href="#como" className="hidden md:inline">Cómo funciona</a>
        <a href="#lista" className="rounded-full bg-accent text-on-accent px-5 py-2.5 font-bold">Únete</a>
      </nav>
      <section id="lista" data-eb-id="hero" className="px-6 md:px-10 pt-20 pb-14 text-center">
        <p className="text-xs font-bold text-primary">LISTA DE ESPERA ABIERTA</p>
        <h1 data-eb-id="hero-title" className="mx-auto mt-3 max-w-2xl text-4xl md:text-6xl font-bold leading-tight tracking-tight">Tus finanzas, en orden sin abrir Excel</h1>
        <form className="mx-auto mt-8 flex max-w-md gap-2 rounded-full bg-surface-alt p-1.5" onSubmit={(e) => e.preventDefault()}>
          <input type="email" required placeholder="tu@correo.com" className="min-w-0 flex-1 bg-transparent px-4 outline-none" />
          <button className="rounded-full bg-primary text-on-primary px-5 py-2.5 font-bold">Quiero acceso</button>
        </form>
      </section>
      <section id="como" data-eb-id="benefits" className="px-6 md:px-10 pb-14 grid md:grid-cols-3 gap-4">
        {BENEFITS.map((b) => (
          <div key={b.title} className="rounded-2xl bg-surface-alt p-6">
            <p className="font-bold text-primary">{b.title}</p>
            <p className="text-sm text-on-surface-muted">{b.text}</p>
          </div>
        ))}
      </section>
      <footer data-eb-id="footer" className="px-6 md:px-10 py-8 text-sm text-on-surface-muted">Alcancía · Hecho en México</footer>
    </main>
  );
}
`,
  },
  agente: {
    title: "Atlas",
    colors: palette({
      primary: "#6d4aff", "primary-light": "#ece7ff", "primary-dark": "#4b2fd1", secondary: "#1d1640", accent: "#6d4aff",
      surface: "#ffffff", "surface-alt": "#f5f3ff", "on-primary": "#ffffff", "on-secondary": "#ffffff", "on-accent": "#ffffff",
      "on-surface": "#1d1640", "on-surface-muted": "#6b6787",
    }),
    page: AGENTE_PAGE,
    files: {
      tanstack: AGENTE_TANSTACK,
    },
  },
};

/** Ruta de la página y del componente de cada stack con plantillas. */
const LAYOUT: Record<string, { page: string; route: (title: string) => [string, string] }> = {
  tanstack: {
    page: "src/components/Page.tsx",
    route: (title) => [
      "src/routes/index.tsx",
      `import { createFileRoute } from "@tanstack/react-router";
import { Page } from "../components/Page";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: ${JSON.stringify(title)} }] }),
  component: Page,
});
`,
    ],
  },
  "react-router": {
    page: "app/components/Page.tsx",
    route: (title) => [
      "app/routes/home.tsx",
      `import type { Route } from "./+types/home";
import { Page } from "../components/Page";

export function meta({}: Route.MetaArgs) {
  return [{ title: ${JSON.stringify(title)} }];
}

export default function Home() {
  return <Page />;
}
`,
    ],
  },
};

/** Archivos (relativos a /app) que la plantilla escribe encima del starter del stack. */
export function templateFiles(stack: SiteStackId, key: SiteTemplateKey): Record<string, string> {
  const layout = LAYOUT[stack];
  const theme = stackThemeFiles(stack);
  if (!layout || !TEMPLATE_STACKS.includes(stack)) return {};
  const t = TEMPLATES[key];
  // Una plantilla de varios archivos sólo existe en los stacks para los que se escribió.
  if (t.files && !t.files[stack]) return {};
  const [routePath, routeSrc] = layout.route(t.title);
  return {
    [layout.page]: t.page,
    [routePath]: routeSrc,
    ...(theme ? { [theme.theme]: themeCssTw4(t.colors) } : {}),
    ...(t.files?.[stack] ?? {}),
  };
}

/** Todas las plantillas del stack (lo que se hornea en la caja dorada). */
export function allTemplateFiles(stack: SiteStackId): Record<SiteTemplateKey, Record<string, string>> | null {
  if (!TEMPLATE_STACKS.includes(stack)) return null;
  return Object.fromEntries(
    (Object.keys(TEMPLATES) as SiteTemplateKey[]).map((k) => [k, templateFiles(stack, k)])
  ) as Record<SiteTemplateKey, Record<string, string>>;
}
