import type { LandingBlock } from "./blockTypes";
import { getThemeVars } from "../landingCatalog";
import type { CustomColors } from "../buildLandingHtml";
import { buildChartScript } from "./charts";
import { renderDiagramSvg } from "./diagrams";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hexLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function renderBlock(block: LandingBlock): string {
  const c = block.content;
  switch (block.type) {
    case "hero": {
      const headline = esc(c.headline || "");
      const subtitle = esc(c.subtitle || "");
      const ctaText = esc(c.ctaText || "");
      const ctaUrl = esc(c.ctaUrl || "#");
      const imageUrl = c.imageUrl || "";
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="relative overflow-hidden">
  <div class="max-w-7xl mx-auto px-6 py-24 lg:py-32 flex flex-col lg:flex-row items-center gap-12">
    <div class="flex-1 text-center lg:text-left">
      <h1 class="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight">${headline}</h1>
      ${subtitle ? `<p class="mt-6 text-xl opacity-80 max-w-xl">${subtitle}</p>` : ""}
      ${ctaText ? `<div class="mt-10"><a href="${ctaUrl}" style="background:var(--landing-accent);color:var(--landing-accent-text)" class="inline-block px-8 py-4 rounded-lg text-lg font-bold shadow-lg hover:opacity-90 transition">${ctaText}</a></div>` : ""}
    </div>
    ${imageUrl ? `<div class="flex-1"><img src="${esc(imageUrl)}" alt="" class="w-full max-w-lg mx-auto rounded-2xl shadow-2xl" /></div>` : ""}
  </div>
</section>`;
    }
    case "text": {
      const title = esc(c.title || "");
      const body = c.body || "";
      const isHtml = body.startsWith("<");
      const bodyHtml = isHtml ? body : body.split("\n").map((p: string) => `<p>${esc(p)}</p>`).join("");
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-3xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold mb-6">${title}</h2>` : ""}
    <div class="text-lg leading-relaxed opacity-80 space-y-4">${bodyHtml}</div>
  </div>
</section>`;
    }
    case "imageText": {
      const title = esc(c.title || "");
      const body = c.body || "";
      const isHtml = body.startsWith("<");
      const bodyHtml = isHtml ? body : `<p>${esc(body)}</p>`;
      const imageUrl = esc(c.imageUrl || "");
      const imgLeft = c.imagePosition === "left";
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6 flex flex-col ${imgLeft ? "lg:flex-row" : "lg:flex-row-reverse"} items-center gap-12">
    <div class="flex-1">
      <img src="${imageUrl}" alt="" class="w-full rounded-2xl shadow-xl" />
    </div>
    <div class="flex-1">
      ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold mb-4">${title}</h2>` : ""}
      <div class="text-lg opacity-80 leading-relaxed">${bodyHtml}</div>
    </div>
  </div>
</section>`;
    }
    case "cta": {
      const headline = esc(c.headline || "");
      const subtitle = esc(c.subtitle || "");
      const ctaText = esc(c.ctaText || "");
      const ctaUrl = esc(c.ctaUrl || "#");
      return `<section style="background:var(--landing-accent);color:var(--landing-accent-text)" class="py-20">
  <div class="max-w-4xl mx-auto px-6 text-center">
    <h2 class="text-3xl lg:text-4xl font-extrabold">${headline}</h2>
    ${subtitle ? `<p class="mt-4 text-lg opacity-80 max-w-xl mx-auto">${subtitle}</p>` : ""}
    ${ctaText ? `<div class="mt-10"><a href="${ctaUrl}" class="inline-block px-8 py-4 rounded-lg text-lg font-bold shadow-lg hover:opacity-90 transition" style="background:var(--landing-bg);color:var(--landing-accent)">${ctaText}</a></div>` : ""}
  </div>
</section>`;
    }
    case "footer": {
      const companyName = esc(c.companyName || "Company");
      const links: { label: string; url?: string }[] = c.links || [];
      return `<footer style="background:var(--landing-text);color:var(--landing-bg)" class="py-12">
  <div class="max-w-7xl mx-auto px-6">
    <div class="flex flex-col md:flex-row items-center justify-between gap-6">
      <p class="font-bold text-lg">${companyName}</p>
      ${links.length ? `<nav class="flex flex-wrap gap-6 text-sm opacity-70">${links.map((l) => `<a href="${esc(l.url || "#")}" class="hover:opacity-100 transition">${esc(l.label)}</a>`).join("")}</nav>` : ""}
    </div>
    <div class="mt-8 pt-6 border-t border-white/10 text-center text-sm opacity-50">
      &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>
  </div>
</footer>`;
    }

    // --- NEW BLOCKS ---

    case "features": {
      const title = esc(c.title || "");
      const subtitle = esc(c.subtitle || "");
      const items: { icon?: string; title?: string; desc?: string }[] = c.items || [];
      const cols = c.columns || 3;
      const variant = c.variant || "cards";
      const colClass = cols === 2 ? "md:grid-cols-2" : cols === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3";
      const cardStyle = variant === "bordered"
        ? "border:2px solid var(--landing-accent);border-radius:16px;padding:24px"
        : variant === "minimal"
        ? "padding:24px"
        : "background:rgba(128,128,128,0.06);border-radius:16px;padding:24px";
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-4">${title}</h2>` : ""}
    ${subtitle ? `<p class="text-lg opacity-70 text-center mb-12 max-w-2xl mx-auto">${subtitle}</p>` : ""}
    <div class="grid ${colClass} gap-8">
      ${items.map((item) => `<div style="${cardStyle}">
        ${(variant === "cards-icon" || variant === "cards") && item.icon ? `<div class="text-3xl mb-3">${item.icon}</div>` : ""}
        ${item.title ? `<h3 class="text-xl font-bold mb-2">${esc(item.title)}</h3>` : ""}
        ${item.desc ? `<p class="opacity-70">${esc(item.desc)}</p>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>`;
    }

    case "callout": {
      const type = c.type || "info";
      const title = esc(c.title || "");
      const body = esc(c.body || "");
      const colors: Record<string, { bg: string; border: string; icon: string }> = {
        info: { bg: "rgba(59,130,246,0.08)", border: "#3b82f6", icon: "ℹ️" },
        warning: { bg: "rgba(245,158,11,0.08)", border: "#f59e0b", icon: "⚠️" },
        success: { bg: "rgba(16,185,129,0.08)", border: "#10b981", icon: "✅" },
        question: { bg: "rgba(139,92,246,0.08)", border: "#8b5cf6", icon: "❓" },
      };
      const s = colors[type] || colors.info;
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-12">
  <div class="max-w-3xl mx-auto px-6">
    <div style="background:${s.bg};border-left:4px solid ${s.border};border-radius:12px;padding:24px" class="flex gap-4 items-start">
      <span class="text-2xl flex-shrink-0">${s.icon}</span>
      <div>
        ${title ? `<h3 class="font-bold text-lg mb-1">${title}</h3>` : ""}
        ${body ? `<p class="opacity-80">${body}</p>` : ""}
      </div>
    </div>
  </div>
</section>`;
    }

    case "video": {
      const title = esc(c.title || "");
      const desc = esc(c.description || "");
      const videoUrl = c.videoUrl || "";
      let embedHtml = "";
      const ytMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
      const vimeoMatch = videoUrl.match(/vimeo\.com\/(\d+)/);
      if (ytMatch) {
        embedHtml = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" class="w-full aspect-video rounded-2xl" frameborder="0" allowfullscreen></iframe>`;
      } else if (vimeoMatch) {
        embedHtml = `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" class="w-full aspect-video rounded-2xl" frameborder="0" allowfullscreen></iframe>`;
      } else if (videoUrl) {
        embedHtml = `<video src="${esc(videoUrl)}" controls class="w-full rounded-2xl"></video>`;
      }
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-4xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-8">${title}</h2>` : ""}
    ${embedHtml ? `<div class="shadow-2xl rounded-2xl overflow-hidden">${embedHtml}</div>` : ""}
    ${desc ? `<p class="mt-6 text-center text-lg opacity-70">${desc}</p>` : ""}
  </div>
</section>`;
    }

    case "testimonials": {
      const title = esc(c.title || "");
      const items: { quote?: string; author?: string; role?: string; avatarUrl?: string }[] = c.items || [];
      const variant = c.variant || "cards";
      if (variant === "quote-large" && items.length > 0) {
        const item = items[0];
        return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-4xl mx-auto px-6 text-center">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold mb-12">${title}</h2>` : ""}
    <blockquote class="text-2xl lg:text-3xl font-medium italic opacity-90 leading-relaxed">"${esc(item.quote || "")}"</blockquote>
    <div class="mt-8 flex items-center justify-center gap-4">
      ${item.avatarUrl ? `<img src="${esc(item.avatarUrl)}" alt="" class="w-14 h-14 rounded-full object-cover"/>` : `<div class="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold" style="background:var(--landing-accent);color:var(--landing-accent-text)">${(item.author || "?")[0]}</div>`}
      <div class="text-left">
        <p class="font-bold">${esc(item.author || "")}</p>
        <p class="text-sm opacity-60">${esc(item.role || "")}</p>
      </div>
    </div>
  </div>
</section>`;
      }
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="grid md:grid-cols-${Math.min(items.length, 3)} gap-8">
      ${items.map((item) => `<div style="background:rgba(128,128,128,0.06);border-radius:16px;padding:24px">
        <p class="text-lg italic opacity-90 mb-6">"${esc(item.quote || "")}"</p>
        <div class="flex items-center gap-3">
          ${item.avatarUrl ? `<img src="${esc(item.avatarUrl)}" alt="" class="w-10 h-10 rounded-full object-cover"/>` : `<div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style="background:var(--landing-accent);color:var(--landing-accent-text)">${(item.author || "?")[0]}</div>`}
          <div>
            <p class="font-bold text-sm">${esc(item.author || "")}</p>
            <p class="text-xs opacity-60">${esc(item.role || "")}</p>
          </div>
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>`;
    }

    case "logoCloud": {
      const title = esc(c.title || "");
      const logos: { imageUrl?: string; alt?: string; url?: string }[] = c.logos || [];
      const variant = c.variant || "row";
      const layout = variant === "grid" ? "grid grid-cols-2 md:grid-cols-4 gap-8" : "flex flex-wrap items-center justify-center gap-8 md:gap-12";
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-16">
  <div class="max-w-5xl mx-auto px-6">
    ${title ? `<p class="text-center text-sm font-bold uppercase tracking-wider opacity-50 mb-8">${title}</p>` : ""}
    <div class="${layout}">
      ${logos.map((l) => {
        const img = `<img src="${esc(l.imageUrl || "")}" alt="${esc(l.alt || "")}" class="h-8 md:h-10 object-contain opacity-60 hover:opacity-100 transition"/>`;
        return l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${img}</a>` : img;
      }).join("")}
    </div>
  </div>
</section>`;
    }

    case "team": {
      const title = esc(c.title || "");
      const members: { name?: string; role?: string; imageUrl?: string; bio?: string }[] = c.members || [];
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="grid md:grid-cols-${Math.min(members.length, 4)} gap-8">
      ${members.map((m) => `<div class="text-center">
        ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="${esc(m.name || "")}" class="w-32 h-32 rounded-full object-cover mx-auto mb-4 shadow-lg"/>` : `<div class="w-32 h-32 rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-4" style="background:var(--landing-accent);color:var(--landing-accent-text)">${(m.name || "?")[0]}</div>`}
        <h3 class="font-bold text-lg">${esc(m.name || "")}</h3>
        <p class="text-sm opacity-60">${esc(m.role || "")}</p>
        ${m.bio ? `<p class="mt-2 text-sm opacity-70">${esc(m.bio)}</p>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>`;
    }

    case "stats": {
      const title = esc(c.title || "");
      const items: { value?: string; label?: string; desc?: string }[] = c.items || [];
      const variant = c.variant || "big-numbers";
      if (variant === "cards") {
        return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="grid md:grid-cols-${Math.min(items.length, 4)} gap-6">
      ${items.map((item) => `<div style="background:rgba(128,128,128,0.06);border-radius:16px;padding:24px" class="text-center">
        <p class="text-4xl font-extrabold" style="color:var(--landing-accent)">${esc(item.value || "0")}</p>
        <p class="font-bold mt-2">${esc(item.label || "")}</p>
        ${item.desc ? `<p class="text-sm opacity-60 mt-1">${esc(item.desc)}</p>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>`;
      }
      if (variant === "inline") {
        return `<section style="background:var(--landing-accent);color:var(--landing-accent-text)" class="py-16">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-2xl font-extrabold text-center mb-8">${title}</h2>` : ""}
    <div class="flex flex-wrap justify-center gap-12 md:gap-16">
      ${items.map((item) => `<div class="text-center">
        <p class="text-4xl font-extrabold">${esc(item.value || "0")}</p>
        <p class="text-sm mt-1 opacity-80">${esc(item.label || "")}</p>
      </div>`).join("")}
    </div>
  </div>
</section>`;
      }
      // big-numbers (default)
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="grid md:grid-cols-${Math.min(items.length, 4)} gap-8 text-center">
      ${items.map((item) => `<div>
        <p class="text-5xl lg:text-6xl font-extrabold" style="color:var(--landing-accent)">${esc(item.value || "0")}</p>
        <p class="text-lg font-bold mt-3">${esc(item.label || "")}</p>
        ${item.desc ? `<p class="text-sm opacity-60 mt-1">${esc(item.desc)}</p>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>`;
    }

    case "pricing": {
      const title = esc(c.title || "");
      const plans: { name?: string; price?: string; period?: string; features?: string[]; ctaText?: string; highlighted?: boolean }[] = c.plans || [];
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="grid md:grid-cols-${Math.min(plans.length, 3)} gap-8 max-w-5xl mx-auto">
      ${plans.map((plan) => {
        const hl = plan.highlighted;
        const border = hl ? "border:2px solid var(--landing-accent)" : "border:2px solid rgba(128,128,128,0.15)";
        const scale = hl ? "transform:scale(1.05)" : "";
        return `<div style="${border};${scale};border-radius:20px;padding:32px" class="flex flex-col">
        ${hl ? `<span class="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full self-start mb-4" style="background:var(--landing-accent);color:var(--landing-accent-text)">Popular</span>` : ""}
        <h3 class="text-xl font-bold">${esc(plan.name || "")}</h3>
        <div class="mt-4 flex items-baseline gap-1">
          <span class="text-4xl font-extrabold" style="color:var(--landing-accent)">${esc(plan.price || "$0")}</span>
          <span class="text-sm opacity-60">${esc(plan.period || "")}</span>
        </div>
        <ul class="mt-6 space-y-3 flex-1">
          ${(plan.features || []).map((f) => `<li class="flex items-center gap-2 text-sm"><span style="color:var(--landing-accent)">✓</span> ${esc(f)}</li>`).join("")}
        </ul>
        ${plan.ctaText ? `<a href="#" class="mt-8 block text-center px-6 py-3 rounded-lg font-bold transition hover:opacity-90" style="${hl ? "background:var(--landing-accent);color:var(--landing-accent-text)" : "border:2px solid var(--landing-accent);color:var(--landing-accent)"}">${esc(plan.ctaText)}</a>` : ""}
      </div>`;
      }).join("")}
    </div>
  </div>
</section>`;
    }

    case "faq": {
      const title = esc(c.title || "");
      const items: { question?: string; answer?: string }[] = c.items || [];
      const variant = c.variant || "accordion";
      if (variant === "two-col") {
        return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
      ${items.map((item) => `<div>
        <h3 class="font-bold text-lg mb-2">${esc(item.question || "")}</h3>
        <p class="opacity-70">${esc(item.answer || "")}</p>
      </div>`).join("")}
    </div>
  </div>
</section>`;
      }
      // accordion
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-3xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="space-y-4">
      ${items.map((item, i) => `<details class="group" style="border:1px solid rgba(128,128,128,0.2);border-radius:12px;padding:0"${i === 0 ? " open" : ""}>
        <summary class="cursor-pointer px-6 py-4 font-bold flex items-center justify-between list-none">
          <span>${esc(item.question || "")}</span>
          <span class="text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        <div class="px-6 pb-4 opacity-70">${esc(item.answer || "")}</div>
      </details>`).join("")}
    </div>
  </div>
</section>`;
    }

    case "comparison": {
      const title = esc(c.title || "");
      const headers: string[] = c.headers || [];
      const rows: { label?: string; values?: string[] }[] = c.rows || [];
      const hlCol = typeof c.highlightCol === "number" ? c.highlightCol : -1;
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-5xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="overflow-x-auto">
      <table class="w-full text-left" style="border-collapse:separate;border-spacing:0">
        <thead>
          <tr>
            ${headers.map((h, i) => `<th class="px-4 py-3 font-bold text-sm uppercase tracking-wider ${i === 0 ? "text-left" : "text-center"}" style="${i - 1 === hlCol ? "color:var(--landing-accent)" : "opacity:0.7"}">${esc(h)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr style="border-top:1px solid rgba(128,128,128,0.15)">
            <td class="px-4 py-3 font-bold">${esc(row.label || "")}</td>
            ${(row.values || []).map((v, i) => `<td class="px-4 py-3 text-center" style="${i === hlCol ? "font-weight:bold;color:var(--landing-accent)" : ""}">${esc(v)}</td>`).join("")}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>
</section>`;
    }

    case "chart": {
      const title = esc(c.title || "");
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-4xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div style="background:rgba(128,128,128,0.04);border-radius:16px;padding:24px">
      ${buildChartScript(block.id, c.chartType || "bar", c.labels || [], c.datasets || [])}
    </div>
  </div>
</section>`;
    }

    case "diagram": {
      const title = esc(c.title || "");
      const svg = renderDiagramSvg(c.diagramType || "funnel", c.items || []);
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-4xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="max-w-2xl mx-auto">${svg}</div>
  </div>
</section>`;
    }

    case "timeline": {
      const title = esc(c.title || "");
      const events: { date?: string; title?: string; desc?: string }[] = c.events || [];
      const variant = c.variant || "vertical";
      if (variant === "horizontal") {
        return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="flex overflow-x-auto gap-8 pb-4">
      ${events.map((ev) => `<div class="flex-shrink-0 w-56 text-center">
        <div class="w-4 h-4 rounded-full mx-auto mb-3" style="background:var(--landing-accent)"></div>
        <p class="text-sm font-bold opacity-60">${esc(ev.date || "")}</p>
        <h3 class="font-bold mt-1">${esc(ev.title || "")}</h3>
        ${ev.desc ? `<p class="text-sm opacity-70 mt-1">${esc(ev.desc)}</p>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>`;
      }
      if (variant === "steps") {
        return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-3xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="space-y-0">
      ${events.map((ev, i) => `<div class="flex gap-6">
        <div class="flex flex-col items-center">
          <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style="background:var(--landing-accent);color:var(--landing-accent-text)">${i + 1}</div>
          ${i < events.length - 1 ? '<div class="w-0.5 flex-1 mt-2" style="background:var(--landing-accent);opacity:0.3"></div>' : ""}
        </div>
        <div class="pb-10">
          <p class="text-xs font-bold opacity-50 uppercase">${esc(ev.date || "")}</p>
          <h3 class="font-bold text-lg">${esc(ev.title || "")}</h3>
          ${ev.desc ? `<p class="opacity-70 mt-1">${esc(ev.desc)}</p>` : ""}
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>`;
      }
      // vertical (default)
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-3xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="space-y-0">
      ${events.map((ev, i) => `<div class="flex gap-6">
        <div class="flex flex-col items-center">
          <div class="w-4 h-4 rounded-full flex-shrink-0 mt-1" style="background:var(--landing-accent)"></div>
          ${i < events.length - 1 ? '<div class="w-0.5 flex-1 mt-2" style="background:var(--landing-accent);opacity:0.3"></div>' : ""}
        </div>
        <div class="pb-10">
          <p class="text-xs font-bold opacity-50 uppercase">${esc(ev.date || "")}</p>
          <h3 class="font-bold text-lg">${esc(ev.title || "")}</h3>
          ${ev.desc ? `<p class="opacity-70 mt-1">${esc(ev.desc)}</p>` : ""}
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>`;
    }

    case "gallery": {
      const title = esc(c.title || "");
      const images: { url?: string; alt?: string; caption?: string }[] = c.images || [];
      const cols = c.columns || 3;
      const colClass = cols === 2 ? "md:grid-cols-2" : cols === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3";
      return `<section style="background:var(--landing-bg);color:var(--landing-text)" class="py-20">
  <div class="max-w-7xl mx-auto px-6">
    ${title ? `<h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-12">${title}</h2>` : ""}
    <div class="grid ${colClass} gap-4">
      ${images.map((img) => `<div>
        <img src="${esc(img.url || "")}" alt="${esc(img.alt || "")}" class="w-full rounded-xl object-cover aspect-[4/3]"/>
        ${img.caption ? `<p class="text-sm opacity-60 mt-2 text-center">${esc(img.caption)}</p>` : ""}
      </div>`).join("")}
    </div>
  </div>
</section>`;
    }

    default:
      return `<!-- unknown block type: ${block.type} -->`;
  }
}

export function buildLandingHtml2(
  blocks: LandingBlock[],
  theme: string,
  customColors?: CustomColors | null,
): string {
  const t = customColors ?? getThemeVars(theme);
  const accentLum = hexLuminance(t.accent);
  const accentText = accentLum > 0.4 ? "#000000" : "#ffffff";

  const hasChart = blocks.some((b) => b.type === "chart");

  const body = blocks
    .sort((a, b) => a.order - b.order)
    .map((b) => `<div id="block-${b.id}">${renderBlock(b)}</div>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Landing Page</title>
<script src="https://cdn.tailwindcss.com"></script>
${hasChart ? `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` : ""}
<style>
  :root{--landing-bg:${t.bg};--landing-accent:${t.accent};--landing-text:${t.text};--landing-accent-text:${accentText}}
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{font-family:system-ui,-apple-system,sans-serif;background:var(--landing-bg);color:var(--landing-text)}
  details summary::-webkit-details-marker{display:none}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
