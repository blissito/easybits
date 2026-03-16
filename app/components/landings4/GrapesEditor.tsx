import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import "grapesjs/dist/css/grapes.min.css";
import type { Editor } from "grapesjs";
import { LANDING_BLOCKS } from "./blocks";
import { buildSingleThemeCss } from "@easybits.cloud/html-tailwind-generator";

export interface AiAction {
  type: "refine-element" | "refine-section" | "regenerate-section";
  componentId: string;
  html: string;
  /** The closest <section> parent's HTML (for section-level ops) */
  sectionHtml?: string;
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
        // Try to find the component
        const all = ed.DomComponents.getWrapper()?.find(`*`) || [];
        const comp = all.find((c: any) => c.getId() === componentId);
        if (comp) {
          comp.replaceWith(newHtml);
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
        editor.Commands.add("ai-refine-element", {
          run(ed: Editor) {
            const selected = ed.getSelected();
            if (!selected) return;
            onAiActionRef.current?.({
              type: "refine-element",
              componentId: selected.getId(),
              html: selected.toHTML(),
            });
          },
        });

        editor.Commands.add("ai-refine-section", {
          run(ed: Editor) {
            const selected = ed.getSelected();
            if (!selected) return;
            const section = findSectionAncestor(selected) || selected;
            onAiActionRef.current?.({
              type: "refine-section",
              componentId: section.getId(),
              html: section.toHTML(),
            });
          },
        });

        editor.Commands.add("ai-regenerate-section", {
          run(ed: Editor) {
            const selected = ed.getSelected();
            if (!selected) return;
            const section = findSectionAncestor(selected) || selected;
            onAiActionRef.current?.({
              type: "regenerate-section",
              componentId: section.getId(),
              html: section.toHTML(),
            });
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
              id: "ai-refine",
              label: `<span title="Refinar elemento" style="font-size:13px;padding:0 3px;cursor:pointer">✦</span>`,
              command: "ai-refine-element",
            },
          ];

          if (isSection) {
            aiButtons.push({
              id: "ai-regen",
              label: `<span title="Regenerar sección" style="font-size:13px;padding:0 3px;cursor:pointer">↻</span>`,
              command: "ai-regenerate-section",
            });
          } else {
            aiButtons.push({
              id: "ai-refine-section",
              label: `<span title="Refinar sección" style="font-size:13px;padding:0 3px;cursor:pointer">✧</span>`,
              command: "ai-refine-section",
            });
          }

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
        editor.on("block:category:update", (category: any) => {
          const name = category.get("id") || category.get("label") || "";
          if (name !== "Basic" && name !== "CTA") {
            category.set("open", false);
          }
        });
        // Also collapse already-rendered categories
        const bm = editor.BlockManager;
        (bm.getCategories?.() || []).forEach((cat: any) => {
          const name = cat.get("id") || cat.get("label") || "";
          if (name !== "Basic" && name !== "CTA") {
            cat.set("open", false);
          }
        });

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
