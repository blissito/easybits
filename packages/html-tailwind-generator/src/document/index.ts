// Headless document canvas editor.
//
// Pair the pure primitives with the headless hook, supply your own persistence + chrome:
//
//   import "@easybits.cloud/html-tailwind-generator/document.css";
//   import { DocumentCanvas, DocumentActionBar, useDocumentEditor }
//     from "@easybits.cloud/html-tailwind-generator/document";
//
//   const ed = useDocumentEditor({ initialSections, theme, customColors, format, onPersist });
//   return (<>
//     <DocumentCanvas {...ed.canvasProps} />
//     <DocumentActionBar {...ed.actionBarProps} />
//   </>);

export { DocumentCanvas, type DocumentCanvasHandle } from "./DocumentCanvas";
export { DocumentActionBar } from "./DocumentActionBar";
export { useDocumentEditor, type UseDocumentEditorOptions } from "./useDocumentEditor";
export type { Section3, IframeMessage } from "../types";
