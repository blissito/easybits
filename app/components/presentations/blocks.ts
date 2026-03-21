/**
 * Presentation-specific blocks for GrapesJS editor.
 * Each block is a full slide (960x540) using Tailwind + semantic colors.
 * These slides get wrapped in reveal.js <section> tags on deploy.
 */
export const PRESENTATION_BLOCKS = [
  // ─── Slide Layouts ──────────────────────────────────
  {
    id: "slide-title",
    label: "Title Slide",
    category: "Slides",
    content: `<section data-section-id="" class="flex flex-col items-center justify-center text-center bg-surface p-16">
  <h1 class="text-6xl font-black text-on-surface leading-tight">Your Title</h1>
  <p class="text-2xl text-on-surface-muted mt-4">Subtitle or tagline</p>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 10h8"/><path d="M10 14h4"/></svg>`,
  },
  {
    id: "slide-title-body",
    label: "Title + Body",
    category: "Slides",
    content: `<section data-section-id="" class="flex flex-col bg-surface p-16">
  <h2 class="text-4xl font-bold text-on-surface mb-6">Section Title</h2>
  <ul class="space-y-3 text-xl text-on-surface-muted">
    <li class="flex items-start gap-3"><span class="text-primary font-bold">-</span> First point goes here</li>
    <li class="flex items-start gap-3"><span class="text-primary font-bold">-</span> Second key insight</li>
    <li class="flex items-start gap-3"><span class="text-primary font-bold">-</span> Third important detail</li>
  </ul>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h6"/><path d="M8 16h4"/></svg>`,
  },
  {
    id: "slide-two-col",
    label: "Two Columns",
    category: "Slides",
    content: `<section data-section-id="" class="flex bg-surface p-16 gap-12">
  <div class="flex-1 flex flex-col justify-center">
    <h2 class="text-4xl font-bold text-on-surface mb-4">Left Side</h2>
    <p class="text-lg text-on-surface-muted">Explain your point with supporting text on this side of the slide.</p>
  </div>
  <div class="flex-1 flex flex-col justify-center">
    <h2 class="text-4xl font-bold text-on-surface mb-4">Right Side</h2>
    <p class="text-lg text-on-surface-muted">Compare, contrast, or provide additional information here.</p>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M12 3v18"/></svg>`,
  },
  {
    id: "slide-image-text",
    label: "Image + Text",
    category: "Slides",
    content: `<section data-section-id="" class="flex bg-surface p-16 gap-12">
  <div class="flex-1 flex items-center justify-center bg-surface-alt rounded-2xl overflow-hidden">
    <img src="https://placehold.co/400x280/1a1a2e/eee?text=Image" alt="" class="w-full h-full object-cover" />
  </div>
  <div class="flex-1 flex flex-col justify-center">
    <h2 class="text-4xl font-bold text-on-surface mb-4">Visual Point</h2>
    <p class="text-lg text-on-surface-muted">Describe what the image shows or support it with key details.</p>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><rect x="4" y="5" width="8" height="8" rx="1"/><path d="M14 8h6"/><path d="M14 12h4"/></svg>`,
  },
  {
    id: "slide-cards",
    label: "Cards Grid",
    category: "Slides",
    content: `<section data-section-id="" class="flex flex-col bg-surface p-16">
  <h2 class="text-4xl font-bold text-on-surface mb-8 text-center">Key Features</h2>
  <div class="grid grid-cols-3 gap-6 flex-1">
    <div class="bg-surface-alt rounded-2xl p-6 flex flex-col">
      <span class="text-3xl mb-3">⚡</span>
      <h3 class="text-xl font-bold text-on-surface mb-2">Feature One</h3>
      <p class="text-sm text-on-surface-muted">Brief description of this feature and why it matters.</p>
    </div>
    <div class="bg-surface-alt rounded-2xl p-6 flex flex-col">
      <span class="text-3xl mb-3">🎯</span>
      <h3 class="text-xl font-bold text-on-surface mb-2">Feature Two</h3>
      <p class="text-sm text-on-surface-muted">Brief description of this feature and why it matters.</p>
    </div>
    <div class="bg-surface-alt rounded-2xl p-6 flex flex-col">
      <span class="text-3xl mb-3">🚀</span>
      <h3 class="text-xl font-bold text-on-surface mb-2">Feature Three</h3>
      <p class="text-sm text-on-surface-muted">Brief description of this feature and why it matters.</p>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="6" height="8" rx="1"/><rect x="9" y="3" width="6" height="8" rx="1"/><rect x="16" y="3" width="6" height="8" rx="1"/></svg>`,
  },
  {
    id: "slide-stats",
    label: "Stats / KPIs",
    category: "Slides",
    content: `<section data-section-id="" class="flex flex-col items-center justify-center bg-surface p-16">
  <h2 class="text-4xl font-bold text-on-surface mb-12 text-center">By the Numbers</h2>
  <div class="grid grid-cols-3 gap-16">
    <div class="text-center">
      <div class="text-6xl font-black text-primary">40+</div>
      <div class="text-lg text-on-surface-muted mt-2">Tools</div>
    </div>
    <div class="text-center">
      <div class="text-6xl font-black text-primary">1M+</div>
      <div class="text-lg text-on-surface-muted mt-2">Files Managed</div>
    </div>
    <div class="text-center">
      <div class="text-6xl font-black text-primary">99.9%</div>
      <div class="text-lg text-on-surface-muted mt-2">Uptime</div>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>`,
  },
  {
    id: "slide-quote",
    label: "Quote",
    category: "Slides",
    content: `<section data-section-id="" class="flex flex-col items-center justify-center bg-surface p-20">
  <div class="text-8xl text-primary opacity-30 leading-none mb-4">"</div>
  <blockquote class="text-3xl font-light text-on-surface text-center max-w-2xl leading-relaxed">
    The best way to predict the future is to invent it.
  </blockquote>
  <cite class="text-lg text-on-surface-muted mt-6 not-italic">— Alan Kay</cite>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 .001 0 1.003 1 1.003z"/></svg>`,
  },
  {
    id: "slide-timeline",
    label: "Timeline",
    category: "Slides",
    content: `<section data-section-id="" class="flex flex-col bg-surface p-16">
  <h2 class="text-4xl font-bold text-on-surface mb-8 text-center">Process</h2>
  <div class="flex items-start justify-between flex-1 gap-4">
    <div class="flex-1 text-center">
      <div class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center text-xl font-bold mx-auto">1</div>
      <h3 class="text-lg font-bold text-on-surface mt-3">Step One</h3>
      <p class="text-sm text-on-surface-muted mt-1">Description</p>
    </div>
    <div class="flex-1 text-center">
      <div class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center text-xl font-bold mx-auto">2</div>
      <h3 class="text-lg font-bold text-on-surface mt-3">Step Two</h3>
      <p class="text-sm text-on-surface-muted mt-1">Description</p>
    </div>
    <div class="flex-1 text-center">
      <div class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center text-xl font-bold mx-auto">3</div>
      <h3 class="text-lg font-bold text-on-surface mt-3">Step Three</h3>
      <p class="text-sm text-on-surface-muted mt-1">Description</p>
    </div>
    <div class="flex-1 text-center">
      <div class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center text-xl font-bold mx-auto">4</div>
      <h3 class="text-lg font-bold text-on-surface mt-3">Step Four</h3>
      <p class="text-sm text-on-surface-muted mt-1">Description</p>
    </div>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="12" r="2"/><path d="M6 12h4"/><path d="M14 12h4"/></svg>`,
  },
  {
    id: "slide-code",
    label: "Code Block",
    category: "Slides",
    content: `<section data-section-id="" class="flex flex-col bg-surface p-16">
  <h2 class="text-4xl font-bold text-on-surface mb-6">Code Example</h2>
  <div class="flex-1 bg-gray-900 rounded-2xl p-8 font-mono text-sm text-green-400 overflow-hidden">
    <pre><code>// Connect your agent
npx @easybits.cloud/mcp

// Upload a file
const file = await eb.uploadFile({
  name: "report.pdf",
  contentType: "application/pdf"
});

console.log(file.url);</code></pre>
  </div>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  },
  {
    id: "slide-blank",
    label: "Blank Slide",
    category: "Slides",
    content: `<section data-section-id="" class="flex flex-col items-center justify-center bg-surface p-16">
  <p class="text-on-surface-muted">Start from scratch</p>
</section>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`,
  },
  // ─── Elements (add inside slides) ──────────────────
  {
    id: "pres-text",
    label: "Text",
    category: "Elements",
    content: `<p class="text-lg text-on-surface">Edit this text.</p>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>`,
  },
  {
    id: "pres-heading",
    label: "Heading",
    category: "Elements",
    content: `<h2 class="text-4xl font-bold text-on-surface">Heading</h2>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M4 4v16"/><path d="M20 4v16"/></svg>`,
  },
  {
    id: "pres-image",
    label: "Image",
    category: "Elements",
    content: { type: "image" },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
  },
];
