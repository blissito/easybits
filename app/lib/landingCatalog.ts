// Landing page section catalog — each template is a pure function: (props) => HTML string
// Tailwind CSS is loaded via CDN in the final page

export interface LandingSection {
  id: string;
  type: SectionType;
  order: number;
  props: Record<string, any>;
  html?: string; // cached rendered HTML
}

export type SectionType =
  | "hero"
  | "logoCloud"
  | "features"
  | "howItWorks"
  | "testimonials"
  | "pricing"
  | "stats"
  | "faq"
  | "cta"
  | "footer";

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  logoCloud: "Logo Cloud",
  features: "Características",
  howItWorks: "Cómo funciona",
  testimonials: "Testimonios",
  pricing: "Precios",
  stats: "Estadísticas",
  faq: "Preguntas frecuentes",
  cta: "Call to Action",
  footer: "Footer",
};

export const LANDING_THEMES = [
  { id: "modern", name: "Modern", bg: "#ffffff", accent: "#6366f1", text: "#111827" },
  { id: "dark", name: "Dark", bg: "#0f172a", accent: "#38bdf8", text: "#f1f5f9" },
  { id: "brutalist", name: "Brutalist", bg: "#ffffff", accent: "#000000", text: "#000000" },
  { id: "minimal", name: "Minimal", bg: "#fafafa", accent: "#18181b", text: "#27272a" },
  { id: "colorful", name: "Colorful", bg: "#fdf4ff", accent: "#d946ef", text: "#1e1b4b" },
] as const;

export type LandingThemeId = (typeof LANDING_THEMES)[number]["id"];

export function getThemeVars(themeId: string) {
  return LANDING_THEMES.find((t) => t.id === themeId) ?? LANDING_THEMES[0];
}

// ── Section renderers ──

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSection(section: LandingSection, _theme?: string): string {
  const renderer = RENDERERS[section.type];
  if (!renderer) return `<!-- unknown section type: ${section.type} -->`;
  return renderer(section.props);
}

type Renderer = (props: Record<string, any>) => string;

const RENDERERS: Record<SectionType, Renderer> = {
  hero: (p) => {
    const headline = esc(p.headline || "Your Product");
    const subtitle = esc(p.subtitle || "");
    const ctaText = esc(p.ctaText || "Get Started");
    const ctaUrl = esc(p.ctaUrl || "#");
    const imageUrl = p.imageUrl || "";
    return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="relative overflow-hidden">
  <div class="max-w-7xl mx-auto px-6 py-24 lg:py-32 flex flex-col lg:flex-row items-center gap-12">
    <div class="flex-1 text-center lg:text-left">
      <h1 class="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight">${headline}</h1>
      ${subtitle ? `<p class="mt-6 text-xl opacity-80 max-w-xl">${subtitle}</p>` : ""}
      <div class="mt-10">
        <a href="${ctaUrl}" style="background:var(--landing-accent);color:var(--landing-accent-text)" class="inline-block px-8 py-4 rounded-lg text-lg font-bold shadow-lg hover:opacity-90 transition">${ctaText}</a>
      </div>
    </div>
    ${imageUrl ? `<div class="flex-1"><img src="${esc(imageUrl)}" alt="" class="w-full max-w-lg mx-auto rounded-2xl shadow-2xl" /></div>` : ""}
  </div>
</section>`;
  },

  logoCloud: (p) => {
    const title = esc(p.title || "Trusted by leading companies");
    const logos: { name: string; url?: string }[] = p.logos || [];
    return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-16">
  <div class="max-w-7xl mx-auto px-6 text-center">
    <p class="text-sm font-semibold uppercase tracking-widest opacity-50">${title}</p>
    <div class="mt-8 flex flex-wrap justify-center items-center gap-x-12 gap-y-6">
      ${logos.map((l) => l.url ? `<img src="${esc(l.url)}" alt="${esc(l.name)}" class="h-8 opacity-60 hover:opacity-100 transition" />` : `<span class="text-lg font-bold opacity-40">${esc(l.name)}</span>`).join("\n      ")}
    </div>
  </div>
</section>`;
  },

  features: (p) => {
    const title = esc(p.title || "Features");
    const subtitle = esc(p.subtitle || "");
    const items: { title: string; description: string; icon?: string }[] = p.items || [];
    return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center max-w-2xl mx-auto mb-16">
      <h2 class="text-3xl lg:text-4xl font-extrabold">${title}</h2>
      ${subtitle ? `<p class="mt-4 text-lg opacity-70">${subtitle}</p>` : ""}
    </div>
    <div class="grid md:grid-cols-2 lg:grid-cols-${Math.min(items.length, 4)} gap-8">
      ${items.map((f) => `<div class="p-6 rounded-2xl border" style="border-color:color-mix(in srgb,var(--landing-accent) 12%,transparent)">
        ${f.icon ? `<div class="text-4xl mb-4">${f.icon}</div>` : `<div class="w-12 h-12 rounded-xl mb-4 flex items-center justify-center" style="background:color-mix(in srgb,var(--landing-accent) 8%,transparent);color:var(--landing-accent)"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></div>`}
        <h3 class="text-xl font-bold mb-2">${esc(f.title)}</h3>
        <p class="opacity-70">${esc(f.description)}</p>
      </div>`).join("\n      ")}
    </div>
  </div>
</section>`;
  },

  howItWorks: (p) => {
    const title = esc(p.title || "How It Works");
    const steps: { title: string; description: string }[] = p.steps || [];
    return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    <h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-16">${title}</h2>
    <div class="grid md:grid-cols-${Math.min(steps.length, 4)} gap-8">
      ${steps.map((s, i) => `<div class="text-center">
        <div class="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-black" style="background:var(--landing-accent);color:var(--landing-accent-text)">${i + 1}</div>
        <h3 class="text-xl font-bold mb-2">${esc(s.title)}</h3>
        <p class="opacity-70">${esc(s.description)}</p>
      </div>`).join("\n      ")}
    </div>
  </div>
</section>`;
  },

  testimonials: (p) => {
    const title = esc(p.title || "What Our Customers Say");
    const items: { quote: string; author: string; role?: string; avatar?: string }[] = p.items || [];
    return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    <h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-16">${title}</h2>
    <div class="grid md:grid-cols-${Math.min(items.length, 3)} gap-8">
      ${items.map((item) => `<div class="p-8 rounded-2xl border" style="border-color:color-mix(in srgb,var(--landing-accent) 12%,transparent)">
        <p class="text-lg italic opacity-80 mb-6">"${esc(item.quote)}"</p>
        <div class="flex items-center gap-3">
          ${item.avatar ? `<img src="${esc(item.avatar)}" alt="" class="w-10 h-10 rounded-full object-cover" />` : `<div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style="background:color-mix(in srgb,var(--landing-accent) 8%,transparent);color:var(--landing-accent)">${esc(item.author[0] || "?")}</div>`}
          <div>
            <p class="font-bold">${esc(item.author)}</p>
            ${item.role ? `<p class="text-sm opacity-60">${esc(item.role)}</p>` : ""}
          </div>
        </div>
      </div>`).join("\n      ")}
    </div>
  </div>
</section>`;
  },

  pricing: (p) => {
    const title = esc(p.title || "Pricing");
    const subtitle = esc(p.subtitle || "");
    const tiers: { name: string; price: string; period?: string; features: string[]; cta?: string; highlighted?: boolean }[] = p.tiers || [];
    return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center max-w-2xl mx-auto mb-16">
      <h2 class="text-3xl lg:text-4xl font-extrabold">${title}</h2>
      ${subtitle ? `<p class="mt-4 text-lg opacity-70">${subtitle}</p>` : ""}
    </div>
    <div class="grid md:grid-cols-${Math.min(tiers.length, 3)} gap-8 max-w-5xl mx-auto">
      ${tiers.map((tier) => `<div class="p-8 rounded-2xl border-2 ${tier.highlighted ? "shadow-xl scale-105" : ""}" style="border-color:${tier.highlighted ? "var(--landing-accent)" : "color-mix(in srgb,var(--landing-accent) 19%,transparent)"}">
        <h3 class="text-xl font-bold mb-2">${esc(tier.name)}</h3>
        <div class="mb-6"><span class="text-4xl font-black">${esc(tier.price)}</span>${tier.period ? `<span class="opacity-60 ml-1">/${esc(tier.period)}</span>` : ""}</div>
        <ul class="space-y-3 mb-8">${tier.features.map((f) => `<li class="flex items-center gap-2"><svg class="w-5 h-5 shrink-0" style="color:var(--landing-accent)" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>${esc(f)}</li>`).join("")}</ul>
        <a href="#" class="block text-center py-3 rounded-lg font-bold transition ${tier.highlighted ? "hover:opacity-90" : "hover:opacity-80"}" style="${tier.highlighted ? "background:var(--landing-accent);color:var(--landing-accent-text)" : "border:2px solid var(--landing-accent);color:var(--landing-accent)"}">${esc(tier.cta || "Get Started")}</a>
      </div>`).join("\n      ")}
    </div>
  </div>
</section>`;
  },

  stats: (p) => {
    const title = esc(p.title || "");
    const items: { value: string; label: string }[] = p.items || [];
    return `<section style="background:var(--landing-accent);color:var(--landing-accent-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-16">${title}</h2>` : ""}
    <div class="grid grid-cols-2 lg:grid-cols-${Math.min(items.length, 4)} gap-8 text-center">
      ${items.map((s) => `<div>
        <div class="text-4xl lg:text-5xl font-black">${esc(s.value)}</div>
        <p class="mt-2 text-sm font-semibold uppercase tracking-wider opacity-80">${esc(s.label)}</p>
      </div>`).join("\n      ")}
    </div>
  </div>
</section>`;
  },

  faq: (p) => {
    const title = esc(p.title || "Frequently Asked Questions");
    const items: { question: string; answer: string }[] = p.items || [];
    return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-3xl mx-auto px-6">
    <h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-16">${title}</h2>
    <div class="space-y-4">
      ${items.map((faq) => `<details class="group rounded-xl border p-6 cursor-pointer" style="border-color:color-mix(in srgb,var(--landing-accent) 12%,transparent)">
        <summary class="font-bold text-lg flex items-center justify-between list-none">
          ${esc(faq.question)}
          <svg class="w-5 h-5 shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </summary>
        <p class="mt-4 opacity-70">${esc(faq.answer)}</p>
      </details>`).join("\n      ")}
    </div>
  </div>
</section>`;
  },

  cta: (p) => {
    const headline = esc(p.headline || "Ready to get started?");
    const subtitle = esc(p.subtitle || "");
    const ctaText = esc(p.ctaText || "Start Now");
    const ctaUrl = esc(p.ctaUrl || "#");
    return `<section style="background:var(--landing-accent);color:var(--landing-accent-text)" class="py-20">
  <div class="max-w-4xl mx-auto px-6 text-center">
    <h2 class="text-3xl lg:text-4xl font-extrabold">${headline}</h2>
    ${subtitle ? `<p class="mt-4 text-lg opacity-80 max-w-xl mx-auto">${subtitle}</p>` : ""}
    <div class="mt-10">
      <a href="${ctaUrl}" class="inline-block px-8 py-4 rounded-lg text-lg font-bold shadow-lg hover:opacity-90 transition" style="background:var(--landing-bg);color:var(--landing-accent)">${ctaText}</a>
    </div>
  </div>
</section>`;
  },

  footer: (p) => {
    const companyName = esc(p.companyName || "Company");
    const links: { label: string; url?: string }[] = p.links || [];
    const socials: { platform: string; url: string }[] = p.socials || [];
    return `<footer style="background:var(--landing-text);color:var(--landing-bg)" class="py-12">
  <div class="max-w-7xl mx-auto px-6">
    <div class="flex flex-col md:flex-row items-center justify-between gap-6">
      <p class="font-bold text-lg">${companyName}</p>
      ${links.length ? `<nav class="flex flex-wrap gap-6 text-sm opacity-70">${links.map((l) => `<a href="${esc(l.url || "#")}" class="hover:opacity-100 transition">${esc(l.label)}</a>`).join("")}</nav>` : ""}
      ${socials.length ? `<div class="flex gap-4">${socials.map((s) => `<a href="${esc(s.url)}" class="opacity-60 hover:opacity-100 transition text-sm">${esc(s.platform)}</a>`).join("")}</div>` : ""}
    </div>
    <div class="mt-8 pt-6 border-t border-white/10 text-center text-sm opacity-50">
      &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>
  </div>
</footer>`;
  },
};
