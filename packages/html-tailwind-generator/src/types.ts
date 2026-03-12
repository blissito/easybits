export interface Section3 {
  id: string;
  order: number;
  html: string;
  label: string;
  metadata?: {
    type?: string;
    dataBindings?: unknown[];
    scripts?: string[];
  };
}

export interface IframeMessage {
  type:
    | "element-selected"
    | "text-edited"
    | "element-deselected"
    | "ready"
    | "section-html-updated"
    | "undo"
    | "redo";

  sectionId?: string;
  tagName?: string;
  rect?: { top: number; left: number; width: number; height: number };
  text?: string;
  elementPath?: string;
  openTag?: string;
  newText?: string;
  isSectionRoot?: boolean;
  attrs?: Record<string, string>;
  className?: string;
  sectionHtml?: string;
}
