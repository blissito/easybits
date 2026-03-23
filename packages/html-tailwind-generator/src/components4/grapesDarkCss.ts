/** GrapesJS dark theme CSS — injected at runtime to avoid CSS bundling */
export const GRAPES_DARK_CSS = `
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
