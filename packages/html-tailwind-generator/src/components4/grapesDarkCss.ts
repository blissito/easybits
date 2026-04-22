/** GrapesJS theme CSS — injected at runtime to avoid CSS bundling. */

export type EditorVariant = "classic" | "denik";

/** Classic dark theme — original EasyBits editor look (dark sidebar, black canvas, hierarchical block grid). */
export const GRAPES_DARK_CSS_CLASSIC = `
/* Dark theme for GrapesJS editor — matches EasyBits dark sidebar */

/* Main editor background */
.gjs-one-bg { background-color: #111827 !important; }
.gjs-two-color { color: #e5e7eb !important; }
.gjs-three-bg { background-color: #1f2937 !important; }
.gjs-four-color, .gjs-four-color-h:hover { color: #9ca3af !important; }

/* Editor chrome */
.gjs-editor { background-color: #000000 !important; }

/* Block manager */
.gjs-blocks-cs { background-color: #111827 !important; }
.gjs-block { background-color: #1f2937 !important; color: #e5e7eb !important; border: 1px solid #374151 !important; border-radius: 8px !important; }
.gjs-block:hover { border-color: #9870ED !important; }
.gjs-block-label { color: #d1d5db !important; }
.gjs-block svg { fill: #9ca3af !important; }

/* Block categories */
.gjs-block-categories { background-color: #111827 !important; }
.gjs-block-category { background-color: #111827 !important; border-bottom: 1px solid #1f2937 !important; }
.gjs-block-category .gjs-title { background-color: #111827 !important; color: #e5e7eb !important; border-bottom: 1px solid #1f2937 !important; }
.gjs-block-category .gjs-title:hover { background-color: #1f2937 !important; }
.gjs-block-category .gjs-caret-icon { color: #9ca3af !important; }

/* Layer manager */
.gjs-layers { background-color: #111827 !important; }
.gjs-layer { background-color: #111827 !important; color: #e5e7eb !important; }
.gjs-layer:hover { background-color: #1f2937 !important; }
.gjs-layer-title { color: #e5e7eb !important; }
.gjs-layer-title-inn { background-color: transparent !important; }
.gjs-layer.gjs-selected .gjs-layer-title { background-color: rgba(152, 112, 237, 0.15) !important; }
.gjs-layer-name { color: #e5e7eb !important; }
.gjs-layer-vis { color: #9ca3af !important; }
.gjs-layer-caret { color: #9ca3af !important; }

/* Style manager */
.gjs-sm-sectors { background-color: #111827 !important; }
.gjs-sm-sector { background-color: #111827 !important; border-bottom: 1px solid #1f2937 !important; }
.gjs-sm-sector .gjs-sm-sector-title { background-color: #111827 !important; color: #e5e7eb !important; border-bottom: 1px solid #1f2937 !important; }
.gjs-sm-sector .gjs-sm-sector-title:hover { background-color: #1f2937 !important; }
.gjs-sm-sector .gjs-sm-properties { background-color: #111827 !important; }
.gjs-sm-label { color: #9ca3af !important; }
.gjs-field { background-color: #1f2937 !important; border: 1px solid #374151 !important; color: #e5e7eb !important; }
.gjs-field input, .gjs-field select, .gjs-field textarea { color: #e5e7eb !important; background-color: transparent !important; }
.gjs-field .gjs-input-holder { color: #e5e7eb !important; }
.gjs-field-arrows { color: #9ca3af !important; }
.gjs-sm-composite { background-color: #111827 !important; }
.gjs-sm-stack #gjs-sm-add { color: #9ca3af !important; }

/* Trait manager */
.gjs-trt-traits { background-color: #111827 !important; }
.gjs-trt-trait { color: #e5e7eb !important; }

/* Panels */
.gjs-pn-panel { background-color: #111827 !important; }
.gjs-pn-btn { color: #9ca3af !important; }
.gjs-pn-btn:hover { color: #e5e7eb !important; }
.gjs-pn-btn.gjs-pn-active { color: #9870ED !important; }

/* Canvas — full width, no padding */
.gjs-cv-canvas { background-color: #000000 !important; }
.gjs-frame-wrapper { padding: 0 !important; }
.gjs-frame { width: 100% !important; left: 0 !important; }

/* Toolbar on selected component */
.gjs-toolbar { background-color: #9870ED !important; }
.gjs-toolbar-item { color: white !important; }

/* Selection highlight */
.gjs-selected { outline: 2px solid #9870ED !important; outline-offset: -2px; }
.gjs-highlighter { outline: 2px solid #9870ED !important; }

/* Scrollbars */
.gjs-editor ::-webkit-scrollbar { width: 6px; }
.gjs-editor ::-webkit-scrollbar-track { background: #111827; }
.gjs-editor ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
.gjs-editor ::-webkit-scrollbar-thumb:hover { background: #4b5563; }

/* Hide native GrapesJS panel buttons (preview eye, etc.) but keep panel system functional */
.gjs-pn-btn {
  display: none !important;
}
/* The panels container that holds the buttons row */
.gjs-pn-commands,
.gjs-pn-options,
.gjs-pn-views {
  height: 0 !important;
  overflow: hidden !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
}

/* Rich text editor */
.gjs-rte-toolbar { background-color: #1f2937 !important; border: 1px solid #374151 !important; }
.gjs-rte-actionbar { background-color: #1f2937 !important; }
.gjs-rte-action { color: #e5e7eb !important; }
`;

/**
 * Denik variant overrides — applied on top of CLASSIC.
 *
 * Differences vs classic:
 * - Editor chrome: white instead of black.
 * - Block manager: flat horizontal list (icon-box + label) instead of hierarchical grid.
 *   Categories: "Básicos" first category always expanded (non-collapsible); other categories
 *   collapsible with colored cube icons.
 * - Canvas: white frame floating with 32px margin inside a white canvas.
 */
const DENIK_OVERRIDES = `
/* ═══ Denik variant overrides ═══ */

/* Editor chrome */
.gjs-editor { background-color: white !important; }

/* Block manager — flat list */
.gjs-blocks-cs { background: transparent !important; }
.gjs-block-categories { background: transparent !important; padding: 0 !important; }

/* All blocks: horizontal row — [icon-box] [label] */
.gjs-blocks-c .gjs-block.gjs-block {
  background: transparent !important;
  color: #e5e7eb !important;
  border: none !important;
  border-radius: 6px !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  text-align: left !important;
  gap: 10px !important;
  padding: 0 10px !important;
  margin: 0 !important;
  width: 100% !important;
  min-height: unset !important;
  height: 24px !important;
  box-shadow: none !important;
  cursor: grab !important;
}
.gjs-blocks-c .gjs-block.gjs-block:hover { background: rgba(255,255,255,0.06) !important; }

/* Icon box: 24x24 rounded square #2D2D2D — target BOTH class variants */
.gjs-block .gjs-block__media,
.gjs-block .gjs-block-media {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  max-width: 24px !important;
  min-height: 24px !important;
  max-height: 24px !important;
  line-height: 0 !important;
  background: #2D2D2D !important;
  border-radius: 5px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 4px !important;
  flex-shrink: 0 !important;
}
.gjs-block .gjs-block__media svg,
.gjs-block .gjs-block-media svg {
  width: 14px !important;
  height: 14px !important;
  display: block !important;
}
.gjs-block svg { fill: #9ca3af !important; stroke: #9ca3af !important; }

/* Label: 14px, left-aligned */
.gjs-blocks-c .gjs-block .gjs-block-label {
  color: #d1d5db !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  text-align: left !important;
  padding: 0 !important;
  width: auto !important;
  flex: 1 !important;
  line-height: 24px !important;
}

/* Blocks container: vertical single-column list */
.gjs-block-category:first-child .gjs-blocks-c { display: flex !important; gap: 12px !important; }
.gjs-blocks-c {
  flex-direction: column !important;
  flex-wrap: nowrap !important;
  gap: 8px !important;
  padding: 4px 0 !important;
  width: 100% !important;
}
/* Respect GrapesJS collapse: when inline style has display:none, honor it */
.gjs-blocks-c[style*="none"] { display: none !important; }

/* All categories: no border, transparent */
.gjs-block-category {
  background: transparent !important;
  border: none !important;
  border-bottom: none !important;
}

/* ─── Básicos (first category): NOT collapsible, always open, flat ─── */
.gjs-block-category:first-child .gjs-title {
  background: transparent !important;
  color: #9ca3af !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  padding: 14px 10px 6px !important;
  border: none !important;
  cursor: default !important;
  pointer-events: none !important;
}
.gjs-block-category:first-child .gjs-caret-icon { display: none !important; }
/* Force always open even if GrapesJS collapsed it */
.gjs-block-category:first-child .gjs-blocks-c { display: flex !important; }

/* ─── Secciones (all other categories): collapsible ─── */
.gjs-block-category:not(:first-child) .gjs-title {
  background: transparent !important;
  color: #e5e7eb !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  padding: 8px 10px !important;
  border: none !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  cursor: pointer !important;
}
.gjs-block-category:not(:first-child) .gjs-title:hover { background: rgba(255,255,255,0.04) !important; }
.gjs-block-category:not(:first-child) .gjs-caret-icon { color: #6b7280 !important; margin-left: auto !important; font-size: 12px !important; }

/* "Secciones" label above the section categories */
.gjs-block-category:nth-child(2)::before {
  content: 'Secciones';
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  padding: 18px 10px 6px;
}

/* Section category title icons: colored cubes (override the title text with an icon prefix) */
.gjs-block-category:not(:first-child) .gjs-title::before {
  content: '';
  display: inline-block;
  width: 24px;
  height: 24px;
  min-width: 24px;
  border-radius: 5px;
  background: #ec4899;
}
/* Per-category colors for the title icon */
.gjs-block-category:nth-child(2) .gjs-title::before { background: #f472b6; }
.gjs-block-category:nth-child(3) .gjs-title::before { background: #fb923c; }
.gjs-block-category:nth-child(4) .gjs-title::before { background: #f87171; }
.gjs-block-category:nth-child(5) .gjs-title::before { background: #facc15; }
.gjs-block-category:nth-child(6) .gjs-title::before { background: #4ade80; }
.gjs-block-category:nth-child(7) .gjs-title::before { background: #60a5fa; }
.gjs-block-category:nth-child(8) .gjs-title::before { background: #c084fc; }
.gjs-block-category:nth-child(9) .gjs-title::before { background: #a8a29e; }

/* Section title: [icon] [text] ... [arrow] */
.gjs-block-category:not(:first-child) .gjs-title { justify-content: flex-start !important; }
.gjs-block-category:not(:first-child) .gjs-caret-icon { order: 99 !important; margin-left: auto !important; }

/* Canvas — white floating frame with 32px margin */
.gjs-cv-canvas { background-color: white !important; width: 100% !important; height: 100% !important; top: 0 !important; left: 0 !important; }
.gjs-frame-wrapper { background: white !important; top: 32px !important; left: 32px !important; right: 32px !important; bottom: 32px !important; width: auto !important; height: auto !important; padding: 0 !important; }
.gjs-frame { left: 0 !important; }
`;

export const GRAPES_DARK_CSS_DENIK = GRAPES_DARK_CSS_CLASSIC + DENIK_OVERRIDES;

export function getGrapesCss(variant: EditorVariant = "classic"): string {
  return variant === "denik" ? GRAPES_DARK_CSS_DENIK : GRAPES_DARK_CSS_CLASSIC;
}
