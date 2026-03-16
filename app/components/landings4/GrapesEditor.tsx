import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import "grapesjs/dist/css/grapes.min.css";
import type { Editor } from "grapesjs";
import { LANDING_BLOCKS } from "./blocks";
import { buildSingleThemeCss } from "@easybits.cloud/html-tailwind-generator";

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
}

interface Props {
  initialHtml: string;
  theme?: string;
  customColors?: Record<string, string>;
  onChange?: (html: string) => void;
  onAiAction?: (action: AiAction) => void;
}

const PANEL_TABS = [
  { id: "blocks", label: "Bloques", icon: "⊞" },
  { id: "layers", label: "Capas", icon: "☰" },
  { id: "styles", label: "Estilos", icon: "◑" },
] as const;

type PanelId = (typeof PANEL_TABS)[number]["id"];

const GrapesEditor = forwardRef<GrapesEditorHandle, Props>(
  ({ initialHtml, theme = "minimal", customColors, onChange, onAiAction }, ref) => {
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const blocksRef = useRef<HTMLDivElement>(null);
    const layersRef = useRef<HTMLDivElement>(null);
    const stylesRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onAiActionRef = useRef(onAiAction);
    onAiActionRef.current = onAiAction;
    const [activePanel, setActivePanel] = useState<PanelId>("blocks");

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
      replaceComponent: (componentId: string, newHtml: string) => {
        const ed = editorRef.current;
        if (!ed) return;
        // Search all components recursively for matching ID
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
    }));

    function getThemeCss() {
      try {
        return buildSingleThemeCss(theme).css || "";
      } catch {
        return "";
      }
    }

    /** Find the closest <section> ancestor (or self) of a component */
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

        const editor = grapesjs.init({
          container: editorContainerRef.current,
          height: "100%",
          width: "auto",
          fromElement: false,
          storageManager: false,
          panels: { defaults: [] },
          canvas: {
            scripts: ["https://cdn.tailwindcss.com"],
          },
          deviceManager: {
            devices: [
              { name: "Desktop", width: "" },
              { name: "Tablet", width: "768px" },
              { name: "Mobile", width: "375px" },
            ],
          },
          styleManager: {
            appendTo: stylesRef.current!,
            sectors: [
              {
                name: "Layout",
                open: false,
                properties: [
                  { type: "select", property: "display", options: [
                    { id: "block", label: "Block" },
                    { id: "flex", label: "Flex" },
                    { id: "grid", label: "Grid" },
                    { id: "none", label: "None" },
                  ]},
                  { type: "select", property: "flex-direction", options: [
                    { id: "row", label: "Row" },
                    { id: "column", label: "Column" },
                  ]},
                  { type: "select", property: "justify-content", options: [
                    { id: "flex-start", label: "Start" },
                    { id: "center", label: "Center" },
                    { id: "flex-end", label: "End" },
                    { id: "space-between", label: "Between" },
                  ]},
                  { type: "select", property: "align-items", options: [
                    { id: "flex-start", label: "Start" },
                    { id: "center", label: "Center" },
                    { id: "flex-end", label: "End" },
                    { id: "stretch", label: "Stretch" },
                  ]},
                  "padding", "margin", "width", "max-width", "min-height",
                ],
              },
              {
                name: "Typography",
                open: false,
                properties: [
                  "font-family", "font-size", "font-weight",
                  "line-height", "color", "text-align",
                ],
              },
              {
                name: "Decoration",
                open: true,
                properties: [
                  "background-color", "border-radius",
                  "border", "box-shadow", "opacity",
                ],
              },
            ],
          },
          layerManager: {
            appendTo: layersRef.current!,
          },
          blockManager: {
            appendTo: blocksRef.current!,
            blocks: LANDING_BLOCKS.map((b) => ({
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
          setActivePanel("blocks");
        });

        // ─── Inject AI buttons into component toolbar on selection ───
        editor.on("component:selected", (component: any) => {
          const toolbar = component.get("toolbar") || [];
          const hasAi = toolbar.some((t: any) => t.id === "ai-refine");
          if (hasAi) return;

          const isSection = component.get("tagName") === "section";
          const aiButtons: any[] = [
            {
              id: "ai-menu",
              label: `<svg title="AI" width="14" height="14" viewBox="0 0 24 24" fill="#9870ED" style="vertical-align:middle;cursor:pointer"><path d="M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74z"/><path d="M19 2l.75 2.25L22 5l-2.25.75L19 8l-.75-2.25L16 5l2.25-.75z" opacity=".7"/><path d="M5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5z" opacity=".5"/></svg>`,
              command: "ai-open-menu",
            },
          ];

          component.set("toolbar", [...toolbar, ...aiButtons]);
        });

        // ─── Theme + Tailwind config ────────────────────
        editor.on("canvas:frame:load", ({ window: fw }: { window: Window }) => {
          const doc = fw.document;
          const style = doc.createElement("style");
          style.id = "easybits-theme";
          style.textContent = getThemeCss();
          doc.head.appendChild(style);

          if ((fw as any).tailwind) {
            (fw as any).tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    primary: "var(--color-primary)",
                    secondary: "var(--color-secondary)",
                    accent: "var(--color-accent)",
                    surface: "var(--color-surface)",
                    "on-primary": "var(--color-on-primary)",
                    "on-secondary": "var(--color-on-secondary)",
                    "on-accent": "var(--color-on-accent)",
                    "on-surface": "var(--color-on-surface)",
                  },
                },
              },
            };
          }
        });

        if (initialHtml) editor.setComponents(initialHtml);

        // ─── Name layers based on content ───
        function nameLayers() {
          const wrapper = editor.DomComponents.getWrapper();
          if (!wrapper) return;
          wrapper.components().forEach((comp: any, i: number) => {
            if (comp.get("custom-name")) return; // already named by user
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
        // Also re-name after generation loads new content
        editor.on("component:add", () => setTimeout(nameLayers, 200));

        // Only start listening after user's first real interaction.
        // This prevents saving empty HTML during initial setComponents() which
        // fires component:add/remove events.
        let userHasInteracted = false;

        // These events indicate real user interaction (not programmatic):
        const interactionEvents = [
          "canvas:drop",
          "block:drag:stop",
          "component:drag:end",
          "component:input",
          "style:property:update",
          "undo",
          "redo",
        ];

        const markInteracted = () => { userHasInteracted = true; };
        interactionEvents.forEach((evt) => editor.on(evt, markInteracted));

        const notify = () => {
          if (!userHasInteracted) return;
          const html = editor.getHtml();
          if (!html || !html.trim()) return;
          const css = editor.getCss();
          const fullHtml = css ? `<style>${css}</style>\n${html}` : html;
          onChangeRef.current?.(fullHtml);
        };

        // Listen to all change events for auto-save
        [
          "component:update",
          "component:add",
          "component:remove",
          "component:drag:end",
          "component:input",
          "canvas:drop",
          "block:drag:stop",
          "undo",
          "redo",
          "style:property:update",
        ].forEach((evt) => editor.on(evt, notify));

        // Collapse all block categories except Basic and CTA
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
      const el = doc.getElementById("easybits-theme");
      if (el) el.textContent = getThemeCss();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme, customColors]);

    return (
      <div className="flex h-full w-full">
        {/* Left sidebar: tabs + panel content */}
        <div className="w-80 shrink-0 flex flex-col bg-gray-900 border-r border-gray-700 overflow-hidden">
          {/* Tab buttons */}
          <div className="flex border-b border-gray-700">
            {PANEL_TABS.map((tab) => (
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

          {/* Panel containers — all mounted, visibility toggled */}
          <div
            ref={blocksRef}
            className={`flex-1 overflow-auto p-2 ${activePanel === "blocks" ? "" : "hidden"}`}
          />
          <div
            ref={layersRef}
            className={`flex-1 overflow-auto ${activePanel === "layers" ? "" : "hidden"}`}
          />
          <div
            ref={stylesRef}
            className={`flex-1 overflow-auto ${activePanel === "styles" ? "" : "hidden"}`}
          />
        </div>

        {/* Canvas */}
        <div ref={editorContainerRef} className="flex-1 h-full" />
      </div>
    );
  }
);

GrapesEditor.displayName = "GrapesEditor";
export default GrapesEditor;
