import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import type { Editor } from "grapesjs";
import { LANDING_BLOCKS } from "./blocks";
import { buildSingleThemeCss, buildCustomTheme, LANDING_THEMES } from "../themes";
import TailwindClassEditor from "./TailwindClassEditor";
import ImageSrcEditor from "./ImageSrcEditor";
import { GRAPES_DARK_CSS } from "./grapesDarkCss";

/** Inject GrapesJS dark theme CSS once at runtime */
let darkCssInjected = false;
function injectDarkCss() {
  if (darkCssInjected || typeof document === "undefined") return;
  darkCssInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-grapes-dark", "");
  style.textContent = GRAPES_DARK_CSS;
  document.head.appendChild(style);
}

/** Flatten brand kit colors: keep string entries and convert extras array to named colors */
function flattenColors(colors: Record<string, any> | undefined): Record<string, string> | undefined {
  if (!colors) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) {
    if (typeof v === "string") {
      out[k] = v;
    } else if (k === "extras" && Array.isArray(v)) {
      v.forEach((extra: { name?: string; hex?: string }, i: number) => {
        if (extra?.hex) {
          out[extra.name || `extra-${i + 1}`] = extra.hex;
        }
      });
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export interface AiAction {
  type: "refine-element";
  componentId: string;
  html: string;
  sectionHtml?: string;
  sectionComponentId?: string;
  isSection?: boolean;
}

export interface GrapesEditorHandle {
  getEditor: () => Editor | null;
  getHtml: () => string;
  setHtml: (html: string) => void;
  /** Replace a component's HTML by its GrapesJS ID */
  replaceComponent: (componentId: string, newHtml: string) => void;
  /** Toggle preview mode, returns new state */
  togglePreview: () => boolean;
  /** Toggle sw-visibility (component border guides), returns new state */
  toggleSwVisibility: () => boolean;
  /** Scroll the canvas iframe to a section by data-section-id. Falls back to iframe DOM query if the component model lost the attribute. */
  scrollToSection: (sectionId: string) => void;
  /** Scroll the canvas to the N-th content section (skips __grapes_css__ style). Index-based is robust even when GrapesJS strips data-* attributes during parse. */
  scrollToIndex: (index: number) => void;
  /** Set canvas zoom level (percentage, e.g. 50 = 50%) */
  setZoom: (value: number) => void;
  /** Get current canvas zoom level */
  getZoom: () => number;
}

interface BrandKitItem {
  id: string;
  name: string;
  colors: Record<string, string>;
  fonts?: { heading?: string; body?: string } | null;
  mood?: string | null;
  logoUrl?: string | null;
  isDefault?: boolean;
}

interface Props {
  initialHtml: string;
  theme?: string;
  customColors?: Record<string, string>;
  brandKits?: BrandKitItem[];
  onChange?: (html: string) => void;
  onAiAction?: (action: AiAction) => void;
  onThemeChange?: (themeId: string, customColors?: Record<string, string>, brandKitId?: string) => void;
  onBrandKitChange?: (brandKit: BrandKitItem | null) => void;
  /** Persisted brand kit ID — restored from metadata on load */
  initialBrandKitId?: string;
  /** Hide specific panel tabs (e.g. ["blocks"] for documents) */
  hiddenTabs?: PanelId[];
  /** Extra CSS injected into the canvas iframe (e.g. document page sizing) */
  canvasStyles?: string;
  /** Set to false to hide device switcher (always single viewport) */
  devices?: false;
  /** Which side to render the panel sidebar — default "left" */
  panelSide?: "left" | "right";
  /** Override default blocks (LANDING_BLOCKS). Pass custom blocks for different editors (e.g. presentations). */
  blocks?: { id: string; label: string; category: string; content: string | object; media?: string }[];
  /** Called when the most visible section changes due to canvas scroll */
  onVisibleSectionChange?: (sectionId: string) => void;
}

const PANEL_TABS = [
  { id: "blocks", label: "Bloques", icon: "⊞" },
  { id: "layers", label: "Capas", icon: "☰" },
  { id: "styles", label: "Estilos", icon: "◑" },
  { id: "themes", label: "Temas", icon: "◈" },
] as const;

export type PanelId = (typeof PANEL_TABS)[number]["id"];

const GrapesEditor = forwardRef<GrapesEditorHandle, Props>(
  ({ initialHtml, theme = "minimal", customColors: rawCustomColors, brandKits, onChange, onAiAction, onThemeChange, onBrandKitChange, initialBrandKitId, hiddenTabs = [], canvasStyles, devices, panelSide = "left", blocks: customBlocks, onVisibleSectionChange }, ref) => {
    // Inject dark CSS on first render
    useEffect(() => { injectDarkCss(); }, []);

    // Strip non-string entries (e.g. extras array from brand kits)
    const customColors = flattenColors(rawCustomColors);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const blocksRef = useRef<HTMLDivElement>(null);
    const layersRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onAiActionRef = useRef(onAiAction);
    onAiActionRef.current = onAiAction;
    const onVisibleSectionChangeRef = useRef(onVisibleSectionChange);
    onVisibleSectionChangeRef.current = onVisibleSectionChange;
    const onThemeChangeRef = useRef(onThemeChange);
    onThemeChangeRef.current = onThemeChange;
    const onBrandKitChangeRef = useRef(onBrandKitChange);
    onBrandKitChangeRef.current = onBrandKitChange;
    const themeRef = useRef(theme);
    themeRef.current = theme;
    const customColorsRef = useRef(customColors);
    customColorsRef.current = customColors;
    const [activeBrandKitId, setActiveBrandKitId] = useState<string | null>(initialBrandKitId || null);
    const visibleTabs = PANEL_TABS.filter((t) => !hiddenTabs.includes(t.id));
    const [activePanel, setActivePanel] = useState<PanelId>(() =>
      visibleTabs.find((t) => t.id === "styles")?.id ?? visibleTabs[0]?.id ?? "styles"
    );
    const [ready, setReady] = useState(false);
    const [themeVersion, setThemeVersion] = useState(0);

    useImperativeHandle(ref, () => ({
      getEditor: () => editorRef.current,
      getHtml: () => {
        const ed = editorRef.current;
        if (!ed) return "";
        const html = ed.getHtml();
        const css = ed.getCss();
        return css ? `<style>${css}</style>\n${html}` : html;
      },
      setHtml: (html: string) => editorRef.current?.setComponents(html),
      togglePreview: () => {
        const ed = editorRef.current;
        if (!ed) return false;
        const cmd = ed.Commands;
        if (cmd.isActive("preview")) {
          cmd.stop("preview");
          if (!cmd.isActive("sw-visibility")) cmd.run("sw-visibility");
          return false;
        } else {
          if (cmd.isActive("sw-visibility")) cmd.stop("sw-visibility");
          ed.select();
          cmd.run("preview");
          return true;
        }
      },
      toggleSwVisibility: () => {
        const ed = editorRef.current;
        if (!ed) return false;
        const cmd = ed.Commands;
        if (cmd.isActive("sw-visibility")) {
          cmd.stop("sw-visibility");
          return false;
        } else {
          cmd.run("sw-visibility");
          return true;
        }
      },
      scrollToSection: (sectionId: string) => {
        const ed = editorRef.current;
        if (!ed) return;
        const wrapper = ed.DomComponents.getWrapper();
        if (!wrapper) return;
        const comps = wrapper.components().models || [];

        // (a) Try the GrapesJS model. This is the fast path when attributes were preserved.
        const target = comps.find((c: any) => c.getAttributes()["data-section-id"] === sectionId);
        if (target) {
          ed.select(target);
          (ed.Canvas as any).scrollTo?.(target, { behavior: "smooth", block: "start", force: true });
          return;
        }

        // (b) GrapesJS sometimes discards custom `data-*` attributes from the model
        // while keeping them on the rendered DOM. Scroll via the iframe element directly —
        // Canvas.scrollTo accepts an HTMLElement too.
        const doc = ed.Canvas.getDocument();
        const el = doc?.querySelector(`[data-section-id="${sectionId}"]`) as HTMLElement | null;
        if (el) {
          (ed.Canvas as any).scrollTo?.(el, { behavior: "smooth", block: "start", force: true });
          return;
        }

        console.warn("[scrollToSection] Section not found:", sectionId, "Model attrs:", comps.map((c: any) => c.getAttributes()["data-section-id"]), "DOM has [data-section-id]?", !!doc?.querySelector("[data-section-id]"));
      },

      scrollToIndex: (index: number) => {
        const ed = editorRef.current;
        if (!ed) return;
        const wrapper = ed.DomComponents.getWrapper();
        if (!wrapper) return;
        const comps = wrapper.components().models || [];
        // Skip head-like tags that importers (splitIntoPages) prepend per page:
        // <link>, <style>, <script>, <meta>, <title>, <base>. Without this filter,
        // `contentComps[N]` can land on a zero-height <link> instead of the target
        // <section>, which makes every click scroll to the same place.
        const HEAD_TAGS = new Set(["style", "script", "link", "meta", "title", "base"]);
        const contentComps = comps.filter((c: any) => {
          const tag = (c.get("tagName") || "").toLowerCase();
          return tag && !HEAD_TAGS.has(tag);
        });
        const target = contentComps[index];
        if (!target) return;
        ed.select(target);
        const el = target.getEl() as HTMLElement | undefined;
        if (index === 0) {
          ed.Canvas.getDocument()?.documentElement?.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      replaceComponent: (componentId: string, newHtml: string) => {
        const ed = editorRef.current;
        if (!ed) return;
        function findById(parent: any): any {
          if (parent.getId() === componentId) return parent;
          for (const child of parent.components().models || []) {
            const found = findById(child);
            if (found) return found;
          }
          return null;
        }
        const wrapper = ed.DomComponents.getWrapper();
        if (!wrapper) return;
        const comp = findById(wrapper);
        if (comp) {
          comp.replaceWith(newHtml);
        } else {
          console.warn("[replaceComponent] Component not found:", componentId);
        }
      },
      setZoom: (value: number) => {
        editorRef.current?.Canvas.setZoom(value);
      },
      getZoom: () => {
        return editorRef.current?.Canvas.getZoom() ?? 100;
      },
    }));

    function getThemeCss() {
      try {
        const cc = customColorsRef.current;
        if (cc && Object.keys(cc).length) {
          if (!cc["on-primary"] && cc.primary) {
            const full = buildCustomTheme(cc as any);
            const vars = Object.entries(full.colors)
              .map(([k, v]) => `  --color-${k}: ${v};`)
              .join("\n");
            return `:root {\n${vars}\n}`;
          }
          const vars = Object.entries(cc)
            .map(([k, v]) => `  --color-${k}: ${v};`)
            .join("\n");
          return `:root {\n${vars}\n}`;
        }
        return buildSingleThemeCss(themeRef.current).css || "";
      } catch {
        return "";
      }
    }

    function findSectionAncestor(comp: any): any {
      let current = comp;
      while (current) {
        if (current.get("tagName") === "section") return current;
        current = current.parent();
      }
      return null;
    }

    useEffect(() => {
      if (!editorContainerRef.current || editorRef.current) return;
      let mounted = true;

      (async () => {
        const grapesjs = (await import("grapesjs")).default;
        if (!mounted || !editorContainerRef.current) return;

        // Inject grapesjs base CSS
        if (!document.querySelector('link[href*="grapes.min.css"]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/grapesjs/dist/css/grapes.min.css";
          document.head.appendChild(link);
        }

        const initialThemeCss = getThemeCss();
        const COLORS_MAP: Record<string, string> = {
          primary: "--color-primary", "primary-light": "--color-primary-light", "primary-dark": "--color-primary-dark",
          secondary: "--color-secondary", accent: "--color-accent",
          surface: "--color-surface", "surface-alt": "--color-surface-alt",
          "on-primary": "--color-on-primary", "on-secondary": "--color-on-secondary", "on-accent": "--color-on-accent",
          "on-surface": "--color-on-surface", "on-surface-muted": "--color-on-surface-muted",
        };
        const fallbackRules: string[] = [];
        for (const [name, cssVar] of Object.entries(COLORS_MAP)) {
          fallbackRules.push(`.bg-${name} { background-color: var(${cssVar}) !important }`);
          fallbackRules.push(`.text-${name} { color: var(${cssVar}) !important }`);
          fallbackRules.push(`.border-${name} { border-color: var(${cssVar}) !important }`);
          fallbackRules.push(`.from-${name} { --tw-gradient-from: var(${cssVar}) }`);
          fallbackRules.push(`.to-${name} { --tw-gradient-to: var(${cssVar}) }`);
          fallbackRules.push(`.hover\\:bg-${name}:hover { background-color: var(${cssVar}) !important }`);
          fallbackRules.push(`.hover\\:text-${name}:hover { color: var(${cssVar}) !important }`);
        }

        const editor = grapesjs.init({
          container: editorContainerRef.current,
          height: "100%",
          width: "auto",
          fromElement: false,
          storageManager: false,
          panels: { defaults: [] },
          canvas: {
            scripts: [
              `data:text/javascript,window.tailwind=${encodeURIComponent(JSON.stringify({config:{
                theme: { extend: { colors: {
                  primary: "var(--color-primary)",
                  "primary-light": "var(--color-primary-light)",
                  "primary-dark": "var(--color-primary-dark)",
                  secondary: "var(--color-secondary)",
                  accent: "var(--color-accent)",
                  surface: "var(--color-surface)",
                  "surface-alt": "var(--color-surface-alt)",
                  "on-primary": "var(--color-on-primary)",
                  "on-secondary": "var(--color-on-secondary)",
                  "on-accent": "var(--color-on-accent)",
                  "on-surface": "var(--color-on-surface)",
                  "on-surface-muted": "var(--color-on-surface-muted)",
                }}}}
              }))}`,
              "https://cdn.tailwindcss.com",
            ],
            styles: [
              `data:text/css,${encodeURIComponent(initialThemeCss + "\n" + fallbackRules.join("\n") + (canvasStyles ? "\n" + canvasStyles : ""))}`,
            ],
          },
          deviceManager: devices === false ? false as any : {
            devices: [
              { name: "Desktop", width: "" },
              { name: "Tablet", width: "768px" },
              { name: "Mobile", width: "375px" },
            ],
          },
          styleManager: false as any,
          layerManager: {
            appendTo: layersRef.current!,
          },
          blockManager: hiddenTabs.includes("blocks") ? false as any : {
            appendTo: blocksRef.current!,
            blocks: (customBlocks || LANDING_BLOCKS).map((b) => ({
              id: b.id,
              label: b.label,
              category: b.category,
              content: b.content,
              media: b.media,
            })),
          },
          allowScripts: 1,
        } as any);

        // ─── AI Commands ────────────────────────────────
        editor.Commands.add("ai-open-menu", {
          run(ed: Editor) {
            const selected = ed.getSelected();
            if (!selected) return;
            const section = findSectionAncestor(selected);
            const isSection = selected.get("tagName") === "section";
            onAiActionRef.current?.({
              type: "refine-element",
              componentId: selected.getId(),
              html: selected.toHTML(),
              sectionHtml: section ? section.toHTML() : undefined,
              sectionComponentId: section ? section.getId() : undefined,
              isSection,
            } as any);
          },
        });

        // ─── Switch to Styles tab on selection ───
        editor.on("component:selected", () => {
          setActivePanel("styles");
        });
        editor.on("component:deselected", () => {
          // Stay on current panel
        });

        // ─── Inject AI buttons into component toolbar on selection ───
        editor.on("component:selected", (component: any) => {
          const toolbar = component.get("toolbar") || [];
          const hasAi = toolbar.some((t: any) => t.id === "ai-refine");
          if (hasAi) return;

          const aiButtons: any[] = [
            {
              id: "ai-menu",
              label: `<svg title="AI" width="14" height="14" viewBox="0 0 24 24" fill="#9870ED" style="vertical-align:middle;cursor:pointer"><path d="M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74z"/><path d="M19 2l.75 2.25L22 5l-2.25.75L19 8l-.75-2.25L16 5l2.25-.75z" opacity=".7"/><path d="M5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5z" opacity=".5"/></svg>`,
              command: "ai-open-menu",
            },
          ];

          component.set("toolbar", [...toolbar, ...aiButtons]);
        });

        // ─── Theme + extras in iframe ────────────────────
        editor.on("canvas:frame:load", ({ window: fw }: { window: Window }) => {
          const doc = fw.document;

          const style = doc.createElement("style");
          style.id = "easybits-theme";
          style.textContent = getThemeCss();
          doc.head.appendChild(style);

          const shimmerStyle = doc.createElement("style");
          shimmerStyle.textContent = `
            .easybits-refining { position: relative; overflow: hidden; }
            .easybits-refining::after {
              content: '';
              position: absolute;
              inset: 0;
              background: linear-gradient(90deg, transparent 0%, rgba(152,112,237,0.08) 50%, transparent 100%);
              animation: easybits-shimmer 1.5s infinite;
              pointer-events: none;
              z-index: 9999;
            }
            @keyframes easybits-shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `;
          doc.head.appendChild(shimmerStyle);

          const swStyle = doc.createElement("style");
          swStyle.textContent = `
            .gjs-dashed *[data-gjs-type] {
              outline: 1px dashed rgba(152,112,237,0.35) !important;
              outline-offset: -1px;
            }
            .gjs-dashed *[data-gjs-type]:hover {
              outline-color: rgba(152,112,237,0.7) !important;
            }
          `;
          doc.head.appendChild(swStyle);

          if (canvasStyles) {
            const extraStyle = doc.createElement("style");
            extraStyle.id = "easybits-canvas-styles";
            extraStyle.textContent = canvasStyles;
            doc.head.appendChild(extraStyle);
          }

          doc.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key !== " ") return;
            const el = e.target as HTMLElement;
            if (!el?.isContentEditable) return;
            const tag = el.tagName?.toLowerCase();
            if (tag === "a" || tag === "button" || el.closest("a") || el.closest("button")) {
              e.preventDefault();
              doc.execCommand("insertText", false, " ");
            }
          });

          if (!doc.getElementById("easybits-semantic-fallback")) {
            const fallback = doc.createElement("style");
            fallback.id = "easybits-semantic-fallback";
            const rules: string[] = [];
            for (const [name, cssVar] of Object.entries(COLORS_MAP)) {
              rules.push(`.bg-${name} { background-color: var(${cssVar}) !important }`);
              rules.push(`.text-${name} { color: var(${cssVar}) !important }`);
              rules.push(`.border-${name} { border-color: var(${cssVar}) !important }`);
              rules.push(`.from-${name} { --tw-gradient-from: var(${cssVar}) }`);
              rules.push(`.to-${name} { --tw-gradient-to: var(${cssVar}) }`);
              rules.push(`.hover\\:bg-${name}:hover { background-color: var(${cssVar}) !important }`);
              rules.push(`.hover\\:text-${name}:hover { color: var(${cssVar}) !important }`);
            }
            fallback.textContent = rules.join("\n");
            doc.head.appendChild(fallback);
          }

          const applyTwConfig = () => {
            if ((fw as any).tailwind) {
              (fw as any).tailwind.config = {
                theme: { extend: { colors: Object.fromEntries(
                  Object.keys(COLORS_MAP).map(name => [name, `var(${COLORS_MAP[name]})`])
                )}}
              };
            }
          };
          applyTwConfig();
          const twScript = doc.querySelector('script[src*="tailwindcss"]');
          if (twScript) {
            twScript.addEventListener("load", () => {
              applyTwConfig();
              doc.body.style.display = "none";
              doc.body.offsetHeight;
              doc.body.style.display = "";
            });
          }

          // Scroll-spy
          {
            let scrollRaf = 0;
            const onScroll = () => {
              cancelAnimationFrame(scrollRaf);
              scrollRaf = requestAnimationFrame(() => {
                if (!onVisibleSectionChangeRef.current) return;
                const sectionEls = doc.querySelectorAll("[data-section-id]");
                if (!sectionEls.length) return;
                const viewH = fw.innerHeight;
                let bestId = "";
                let bestVisible = 0;
                sectionEls.forEach((el) => {
                  const rect = el.getBoundingClientRect();
                  const top = Math.max(0, rect.top);
                  const bottom = Math.min(viewH, rect.bottom);
                  const visible = Math.max(0, bottom - top);
                  if (visible > bestVisible) {
                    bestVisible = visible;
                    bestId = el.getAttribute("data-section-id") || "";
                  }
                });
                if (bestId) onVisibleSectionChangeRef.current(bestId);
              });
            };
            fw.addEventListener("scroll", onScroll, { passive: true });
          }
        });

        if (initialHtml) editor.setComponents(initialHtml);

        // ─── Name layers based on content ───
        function nameLayers() {
          const wrapper = editor.DomComponents.getWrapper();
          if (!wrapper) return;
          wrapper.components().forEach((comp: any, i: number) => {
            if (comp.get("custom-name")) return;
            const tag = (comp.get("tagName") || "").toLowerCase();
            if (tag !== "section") return;
            const html = comp.toHTML().toLowerCase();
            let name = `Section ${i + 1}`;
            if (html.includes("hero") || (i === 0 && html.includes("<h1"))) name = "Hero";
            else if (html.includes("pricing") || html.includes("precio") || html.includes("inversión")) name = "Pricing";
            else if (html.includes("testimonial") || html.includes("dicen") || html.includes("quote")) name = "Testimonials";
            else if (html.includes("faq") || html.includes("pregunt") || html.includes("<details")) name = "FAQ";
            else if (html.includes("footer") || html.includes("©") || html.includes("derechos")) name = "Footer";
            else if (html.includes("feature") || html.includes("palanca") || html.includes("servicio")) name = "Features";
            else if (html.includes("stat") || html.includes("número") || html.includes("+%")) name = "Stats";
            else if (html.includes("team") || html.includes("equipo")) name = "Team";
            else if (html.includes("cta") || html.includes("listo") || html.includes("empez")) name = "CTA";
            else if (html.includes("newsletter") || html.includes("suscri") || html.includes("email")) name = "Newsletter";
            else if (html.includes("proceso") || html.includes("step") || html.includes("cómo func")) name = "Process";
            else if (html.includes("problema") || html.includes("pain")) name = "Problem";
            else if (html.includes("logo") || html.includes("trusted") || html.includes("brand")) name = "Logo Cloud";
            comp.set("custom-name", name);
          });
        }
        editor.on("load", nameLayers);
        editor.on("component:add", () => setTimeout(nameLayers, 200));

        let userHasInteracted = false;
        const interactionEvents = [
          "canvas:drop", "block:drag:stop", "component:drag:end",
          "component:input", "undo", "redo",
        ];
        const markInteracted = () => { userHasInteracted = true; };
        interactionEvents.forEach((evt) => editor.on(evt, markInteracted));
        editor.on("sidebar:change", markInteracted);

        const notify = () => {
          if (!userHasInteracted) return;
          const html = editor.getHtml();
          if (!html || !html.trim()) return;
          const css = editor.getCss();
          const fullHtml = css ? `<style>${css}</style>\n${html}` : html;
          onChangeRef.current?.(fullHtml);
        };

        [
          "component:update", "component:add", "component:remove",
          "component:drag:end", "component:input", "canvas:drop",
          "block:drag:stop", "undo", "redo",
        ].forEach((evt) => editor.on(evt, notify));

        // Collapse all block categories except CTA
        try {
          const bm = editor.BlockManager;
          const cats = bm.getCategories?.();
          if (cats && cats.forEach) {
            cats.forEach((cat: any) => {
              try {
                const name = (typeof cat.get === "function" ? cat.get("id") || cat.get("label") : cat.id || cat.label) || "";
                if (name !== "CTA") {
                  if (typeof cat.set === "function") cat.set("open", false);
                }
              } catch { /* skip */ }
            });
          }
        } catch { /* skip */ }

        editorRef.current = editor;
        editor.on("load", () => {
          setReady(true);
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            try {
              const active = editor.Commands?.getActive();
              if (!active) { clearInterval(interval); return; }
              for (const cmd of Object.keys(active)) {
                if (cmd === "show-offset") {
                  editor.stopCommand(cmd);
                }
              }
            } catch {}
            if (attempts >= 30) clearInterval(interval);
          }, 100);
          if (editor.Commands.isActive("sw-visibility")) {
            editor.Commands.stop("sw-visibility");
          }
        });
      })().catch((err) => {
        console.error("GrapesJS init failed:", err);
      });

      return () => {
        mounted = false;
        editorRef.current?.destroy();
        editorRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Update theme CSS dynamically
    useEffect(() => {
      const ed = editorRef.current;
      if (!ed) return;
      const doc = ed.Canvas.getDocument();
      if (!doc) return;

      const old = doc.getElementById("easybits-theme");
      if (old) old.remove();
      const style = doc.createElement("style");
      style.id = "easybits-theme";
      style.textContent = getThemeCss();
      doc.head.appendChild(style);

      const oldFallback = doc.getElementById("easybits-semantic-fallback");
      if (oldFallback) {
        const content = oldFallback.textContent;
        oldFallback.remove();
        const fb = doc.createElement("style");
        fb.id = "easybits-semantic-fallback";
        fb.textContent = content;
        doc.head.appendChild(fb);
      }

      setTimeout(() => setThemeVersion((v) => v + 1), 100);
    }, [theme, customColors]);

    const sidebarBorder = panelSide === "right" ? "border-l" : "border-r";

    const sidebar = (
        <div className={`w-80 shrink-0 flex flex-col bg-black ${sidebarBorder} border-gray-700 overflow-hidden`}>
          <div className="flex border-b border-gray-700">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                  activePanel === tab.id
                    ? "bg-gray-800 text-white border-b-2 border-brand-500"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                }`}
                title={tab.label}
              >
                <span className="block text-base mb-0.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {!hiddenTabs.includes("blocks") && <div
            ref={blocksRef}
            className={`flex-1 overflow-auto p-2 ${activePanel === "blocks" ? "" : "hidden"}`}
          />}
          <div
            ref={layersRef}
            className={`flex-1 overflow-auto ${activePanel === "layers" ? "" : "hidden"}`}
          />
          <div className={`flex-1 overflow-auto ${activePanel === "styles" ? "" : "hidden"}`}>
            {ready && <ImageSrcEditor editor={editorRef.current} />}
            {ready && <TailwindClassEditor
              editor={editorRef.current}
              themeVersion={themeVersion}
              themeColors={(() => {
                if (customColors && Object.keys(customColors).length) return customColors;
                const t = LANDING_THEMES.find((t) => t.id === theme);
                return t?.colors || {};
              })()}
            />}
          </div>
          <div className={`flex-1 overflow-auto p-3 ${activePanel === "themes" ? "" : "hidden"}`}>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">Temas</p>
            <div className="grid grid-cols-2 gap-2">
              {LANDING_THEMES.map((t) => {
                const isActive = theme === t.id;
                const displayColors = isActive && customColors && Object.keys(customColors).length
                  ? { ...t.colors, ...customColors }
                  : t.colors;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      onThemeChangeRef.current?.(t.id);
                      setActiveBrandKitId(null);
                      onBrandKitChangeRef.current?.(null);
                    }}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all ${
                      isActive
                        ? "border-brand-500 bg-brand-500/10"
                        : "border-gray-700 hover:border-gray-500"
                    }`}
                  >
                    <div className="flex gap-1">
                      <div className="w-5 h-5 rounded-full border border-gray-600" style={{ background: displayColors.primary }} title="Primary" />
                      <div className="w-5 h-5 rounded-full border border-gray-600" style={{ background: displayColors.surface }} title="Surface" />
                      <div className="w-5 h-5 rounded-full border border-gray-600" style={{ background: displayColors.accent }} title="Accent" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-300">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {(() => {
              const active = LANDING_THEMES.find((t) => t.id === theme);
              const baseColors: Record<string, string> = active?.colors ? { ...active.colors } : {};
              const currentColors: Record<string, string> = customColors && Object.keys(customColors).length
                ? { ...baseColors, ...customColors }
                : baseColors;
              if (!Object.keys(currentColors).length) return null;
              const COLOR_LABELS: Record<string, string> = {
                primary: "Primary", "primary-light": "Primary Light", "primary-dark": "Primary Dark",
                secondary: "Secondary", accent: "Accent", surface: "Surface",
                "surface-alt": "Surface Alt", "on-surface": "On Surface",
                "on-surface-muted": "On Surface Muted", "on-primary": "On Primary",
                "on-secondary": "On Secondary", "on-accent": "On Accent",
              };
              return (
                <div className="mt-3 space-y-1">
                  {Object.entries(currentColors).map(([key, hex]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 w-full px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors group text-left cursor-pointer"
                    >
                      <input
                        type="color"
                        value={hex}
                        onChange={(e) => {
                          const updated = { ...currentColors, [key]: e.target.value };
                          onThemeChangeRef.current?.(themeRef.current, updated);
                        }}
                        className="w-4 h-4 rounded border border-gray-600 shrink-0 cursor-pointer p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded"
                      />
                      <span className="text-[10px] text-gray-400 flex-1 truncate">{COLOR_LABELS[key] || key}</span>
                      <code className="text-[10px] text-gray-500 group-hover:text-gray-300 font-mono">{hex}</code>
                    </label>
                  ))}
                </div>
              );
            })()}

            {brandKits && brandKits.length > 0 && (
              <>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-5 mb-3">Brand Kits</p>
                <div className="grid grid-cols-2 gap-2">
                  {brandKits.map((bk) => {
                    const bkBase = flattenColors(bk.colors as Record<string, any>) || {};
                    const displayColors = activeBrandKitId === bk.id && customColors && Object.keys(customColors).length
                      ? { ...bkBase, ...customColors }
                      : bkBase;
                    return (
                      <button
                        key={bk.id}
                        onClick={() => {
                          onThemeChangeRef.current?.("custom", bkBase, bk.id);
                          setActiveBrandKitId(bk.id);
                          onBrandKitChangeRef.current?.(bk);
                        }}
                        className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all ${
                          activeBrandKitId === bk.id
                            ? "border-brand-500 bg-brand-500/10"
                            : "border-gray-700 hover:border-gray-500"
                        }`}
                      >
                        <div className="flex gap-1">
                          {["primary", "surface", "accent"].map((key) => (
                            <div
                              key={key}
                              className="w-5 h-5 rounded-full border border-gray-600"
                              style={{ background: displayColors[key] || "#888" }}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-bold text-gray-300 truncate max-w-full">{bk.name}</span>
                      </button>
                    );
                  })}
                </div>
                {activeBrandKitId && (() => {
                  const bk = brandKits?.find((b) => b.id === activeBrandKitId);
                  if (!bk) return null;
                  const baseColors = flattenColors(bk.colors as Record<string, any>) || {};
                  const colors = customColors && Object.keys(customColors).length
                    ? { ...baseColors, ...customColors }
                    : baseColors;
                  return (
                    <div className="mt-3 space-y-1">
                      {Object.entries(colors).map(([key, hex]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 w-full px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors group text-left cursor-pointer"
                        >
                          <input
                            type="color"
                            value={hex}
                            onChange={(e) => {
                              const updated = { ...colors, [key]: e.target.value };
                              onThemeChangeRef.current?.("custom", updated, activeBrandKitId || undefined);
                            }}
                            className="w-4 h-4 rounded border border-gray-600 shrink-0 cursor-pointer p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded"
                          />
                          <span className="text-[10px] text-gray-400 flex-1 truncate">{key}</span>
                          <code className="text-[10px] text-gray-500 group-hover:text-gray-300 font-mono">{hex}</code>
                        </label>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
    );

    const canvas = <div ref={editorContainerRef} className="flex-1 h-full bg-black" />;

    return (
      <div className="flex h-full w-full relative">
        {panelSide === "right" ? <>{canvas}{sidebar}</> : <>{sidebar}{canvas}</>}

        {/* Glass overlay while GrapesJS loads */}
        <div
          className={`absolute inset-0 z-50 pointer-events-none bg-gray-950/40 backdrop-blur-[2px] transition-all duration-500 ${
            ready ? "opacity-0 invisible" : "opacity-100"
          }`}
        />
      </div>
    );
  }
);

GrapesEditor.displayName = "GrapesEditor";
export default GrapesEditor;
