// @vitest-environment jsdom
//
// SPIKE (throwaway) — de-risk del "broker" server-side del plan editor real-time.
// Prueba: un peer server-side puede (1) crear un editor BlockNote headless con la
// MISMA schema del cliente, (2) escribir bloques al Y.XmlFragment "document-store",
// (3) que ese update viaje por el wire Yjs y (4) materialice estructura BlockNote
// correcta en un segundo Y.Doc (simula el editor del usuario). Sin red/box/browser.
import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { BlockNoteEditor, BlockNoteSchema } from "@blocknote/core";
import { blocksToYDoc, yDocToBlocks, yXmlFragmentToBlocks, blocksToYXmlFragment } from "@blocknote/core/yjs";
import { withMultiColumn } from "@blocknote/xl-multi-column";

const FRAG = "document-store";
const schema = withMultiColumn(BlockNoteSchema.create());

function headlessEditor() {
  // Editor headless (sin montar en DOM) — solo para prestar su schema a las utils Yjs.
  return BlockNoteEditor.create({ schema } as any);
}

describe("spike: broker server-side escribe al Y.Doc BlockNote", () => {
  it("un bloque escrito server-side materializa en el cliente (round-trip por wire)", () => {
    const editor = headlessEditor();

    // 1) Doc inicial (como si el usuario ya tuviera contenido).
    const ydocServer = blocksToYDoc(
      editor,
      [{ type: "paragraph", content: "Cláusula PRIMERA — texto original del abogado." }] as any,
      FRAG,
    );

    // 2) Simula el editor del usuario: aplica el estado inicial a un segundo Y.Doc.
    const ydocClient = new Y.Doc();
    Y.applyUpdate(ydocClient, Y.encodeStateAsUpdate(ydocServer));

    // 3) El "agente" edita server-side: lee bloques actuales, agrega uno, reescribe
    //    el MISMO fragment (preservando lo previo).
    const frag = ydocServer.getXmlFragment(FRAG);
    const current = yXmlFragmentToBlocks(editor, frag);
    const next = [
      ...current,
      { type: "paragraph", content: "Cláusula SEGUNDA — insertada por el agente." },
    ] as any;
    blocksToYXmlFragment(editor, next, frag);

    // 4) El update viaja al cliente.
    Y.applyUpdate(ydocClient, Y.encodeStateAsUpdate(ydocServer));

    const clientBlocks = yDocToBlocks(editor, ydocClient, FRAG);
    const texts = clientBlocks
      .map((b: any) => (Array.isArray(b.content) ? b.content.map((c: any) => c.text).join("") : ""))
      .filter(Boolean);

    // El bloque original SOBREVIVE y el del agente APARECE en el cliente.
    expect(texts.some((t) => t.includes("Cláusula PRIMERA"))).toBe(true);
    expect(texts.some((t) => t.includes("Cláusula SEGUNDA — insertada por el agente"))).toBe(true);
  });
});
