import { useEffect, useRef, useCallback, useState } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";

interface CodeEditorProps {
  code: string;
  label: string;
  scrollToText?: string;
  onSave: (code: string) => void;
  onClose: () => void;
}

function formatHtml(html: string): string {
  let result = html.replace(/>\s*</g, ">\n<");
  const lines = result.split("\n");
  const output: string[] = [];
  let indent = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isClosing = /^<\//.test(line);
    const isSelfClosing =
      /\/>$/.test(line) ||
      /^<(img|br|hr|input|meta|link|col|area|base|embed|source|track|wbr)\b/i.test(line);
    const hasInlineClose = /^<[^/][^>]*>.*<\//.test(line);
    if (isClosing) indent = Math.max(0, indent - 1);
    output.push("  ".repeat(indent) + line);
    if (!isClosing && !isSelfClosing && !hasInlineClose && /^<[a-zA-Z]/.test(line)) {
      indent++;
    }
  }
  return output.join("\n");
}

// TODO: revisar que el scroll-to-code funcione bien en todos los casos (tags partidos, atributos largos, etc.)
function scrollToTarget(view: EditorView, target?: string) {
  if (!target) return;
  const docText = view.state.doc.toString();
  const normalized = target.replace(/"/g, "'");
  let idx = docText.indexOf(normalized);
  if (idx === -1) idx = docText.indexOf(target);

  // If exact match fails, extract tag+class and search line by line
  if (idx === -1) {
    const tagMatch = target.match(/^<(\w+)/);
    const classMatch = target.match(/class=["']([^"']*?)["']/);
    if (tagMatch) {
      const searchTag = tagMatch[0];
      const searchClass = classMatch ? classMatch[1].split(" ")[0] : null;
      for (let i = 1; i <= view.state.doc.lines; i++) {
        const line = view.state.doc.line(i);
        if (line.text.includes(searchTag) && (!searchClass || line.text.includes(searchClass))) {
          idx = line.from;
          break;
        }
      }
    }
  }

  if (idx !== -1) {
    const line = view.state.doc.lineAt(idx);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
  }
}

export function CodeEditor({ code, label, scrollToText, onSave, onClose }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [stats, setStats] = useState({ lines: 0, kb: "0.0" });

  const onSaveRef = useRef(onSave);
  const onCloseRef = useRef(onClose);
  onSaveRef.current = onSave;
  onCloseRef.current = onClose;

  const updateStats = useCallback((doc: { length: number; lines: number }) => {
    setStats({ lines: doc.lines, kb: (doc.length / 1024).toFixed(1) });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const initialDoc = code.includes("\n") ? code : formatHtml(code);

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        closeBrackets(),
        foldGutter(),
        highlightSelectionMatches(),
        html(),
        oneDark,
        history(),
        EditorView.lineWrapping,
        keymap.of([
          { key: "Mod-s", run: (v) => { onSaveRef.current(v.state.doc.toString()); return true; } },
          { key: "Escape", run: () => { onCloseRef.current(); return true; } },
          indentWithTab,
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...foldKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            updateStats(update.state.doc);
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace" },
          ".cm-content": { padding: "8px 0" },
          ".cm-gutters": { borderRight: "1px solid #21262d" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    updateStats(view.state.doc);
    scrollToTarget(view, scrollToText);
    view.focus();

    return () => { view.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-scroll when scrollToText changes while editor is already open
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !scrollToText) return;
    scrollToTarget(view, scrollToText);
  }, [scrollToText]);

  function handleFormat() {
    const view = viewRef.current;
    if (!view) return;
    const formatted = formatHtml(view.state.doc.toString());
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted },
    });
  }

  function handleSave() {
    const view = viewRef.current;
    if (!view) return;
    onSave(view.state.doc.toString());
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-orange-600/20 text-orange-400 text-[10px] font-mono font-bold uppercase tracking-wider">
            HTML
          </span>
          <span className="text-sm font-bold text-gray-300">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFormat}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Formatear
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            Guardar
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Editor */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-800 text-[10px] text-gray-500 font-mono shrink-0">
        <span>{stats.lines} lineas</span>
        <span>Tab = indentar &middot; Cmd+S = guardar &middot; Esc = cerrar</span>
        <span>{stats.kb} KB</span>
      </div>
    </div>
  );
}
