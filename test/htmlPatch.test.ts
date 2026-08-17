import { describe, it, expect } from "vitest";
import {
  applyPatches,
  stampIds,
  indexNodes,
} from "../packages/html-tailwind-generator/src/htmlPatch";

const DOC = `<section data-id="hero" class="py-20">
  <h1 data-id="t" class="text-4xl">Hola</h1>
  <ul data-id="list"><li data-id="a">uno</li><li data-id="b">dos</li></ul>
  <img data-id="pic" src="x.png"/>
</section>`;

describe("stampIds", () => {
  it("es idempotente: sembrar dos veces da el mismo documento", () => {
    const once = stampIds("<div><p>a</p><p>b</p></div>").html;
    const twice = stampIds(once).html;
    expect(twice).toBe(once);
  });

  it("respeta los ids existentes y solo añade los que faltan", () => {
    const { html, added } = stampIds('<div data-id="keep"><span>x</span></div>');
    expect(html).toContain('data-id="keep"');
    expect(added).toBe(1);
  });

  it("no rompe un tag auto-cerrado (el atributo iría después de la barra)", () => {
    const { html } = stampIds("<div><br/></div>");
    expect(html).toContain("<br data-id=");
    expect(html).not.toContain("<br/ data-id");
  });

  it("sobrevive a un atributo que contiene '>' (donde una regex se rompe)", () => {
    const svg = `<div><svg><path d="M0 0 L5 5 > z"/></svg></div>`;
    const { html } = stampIds(svg);
    expect(html).toContain('d="M0 0 L5 5 > z"');
    expect(indexNodes(html).every((n) => n.dataId)).toBe(true);
  });
});

describe("applyPatches", () => {
  it("replace deja BYTE-IDÉNTICO todo lo que no es el nodo", () => {
    const r = applyPatches(DOC, [{ nodeId: "t", html: `<h1 class="text-6xl">Adiós</h1>` }]);
    expect(r.applied).toEqual(["t"]);
    // lo de alrededor sobrevive tal cual
    expect(r.html).toContain('<section data-id="hero" class="py-20">');
    expect(r.html).toContain('<li data-id="a">uno</li>');
    expect(r.html).toContain("Adiós");
    expect(r.html).not.toContain("Hola");
    // y el id de la cabecera manda aunque el fragmento no lo trajera
    expect(r.html).toContain('data-id="t"');
  });

  it("remove quita el nodo y sus hermanos ni se enteran", () => {
    const r = applyPatches(DOC, [{ nodeId: "a", op: "remove" }]);
    expect(r.applied).toEqual(["a"]);
    expect(r.html).not.toContain("uno");
    expect(r.html).toContain('<li data-id="b">dos</li>');
  });

  it("insert append cuelga DENTRO del ancla, sin reescribir el padre", () => {
    const r = applyPatches(DOC, [
      { nodeId: "list", op: "insert", pos: "append", html: "<li>tres</li>" },
    ]);
    expect(r.applied).toEqual(["list"]);
    expect(r.html).toContain("<li>tres</li></ul>");
    expect(r.html).toContain('<li data-id="a">uno</li>');
  });

  it.each([
    ["prepend", "<ul data-id=\"list\"><li>cero</li>"],
    ["before", "<li>cero</li><ul data-id=\"list\">"],
  ] as const)("insert %s coloca donde toca", (pos, expected) => {
    const r = applyPatches(DOC, [{ nodeId: "list", op: "insert", pos, html: "<li>cero</li>" }]);
    expect(r.html).toContain(expected);
  });

  it("los nodos insertados NO heredan data-id (la dirección la pone la plataforma)", () => {
    const r = applyPatches(DOC, [
      { nodeId: "list", op: "insert", html: '<li data-id="robado">tres</li>' },
    ]);
    expect(r.html).not.toContain('data-id="robado"');
  });

  it("replace por VARIOS hermanos es legítimo", () => {
    const r = applyPatches(DOC, [{ nodeId: "a", html: "<li>x</li><li>y</li>" }]);
    expect(r.applied).toEqual(["a"]);
    expect(r.html).toContain("<li>y</li>");
  });

  it("aplica varios patches, incluso sobre un nodo y su ancestro", () => {
    const r = applyPatches(DOC, [
      { nodeId: "a", html: "<li>UNO</li>" },
      { nodeId: "list", op: "insert", html: "<li>tres</li>" },
    ]);
    expect(r.applied).toEqual(["a", "list"]);
    expect(r.html).toContain("UNO");
    expect(r.html).toContain("<li>tres</li></ul>");
  });

  it.each([
    ["missing", { nodeId: "no-existe", html: "<p>x</p>" }],
    ["unparseable", { nodeId: "t", html: "solo prosa del modelo" }],
    ["empty", { nodeId: "t", html: "   " }],
    ["void", { nodeId: "pic", op: "insert" as const, html: "<span>x</span>" }],
  ])("reporta %s en vez de fallar en silencio", (reason, patch) => {
    const r = applyPatches(DOC, [patch as any]);
    expect(r.applied).toEqual([]);
    expect(r.failed).toEqual([{ nodeId: patch.nodeId, reason }]);
    expect(r.html).toBe(DOC); // documento intacto
  });

  it("dos nodos con el mismo id abortan (editar el equivocado es peor que no editar)", () => {
    const dup = '<div><p data-id="x">1</p><p data-id="x">2</p></div>';
    const r = applyPatches(dup, [{ nodeId: "x", html: "<p>nuevo</p>" }]);
    expect(r.failed).toEqual([{ nodeId: "x", reason: "ambiguous" }]);
    expect(r.html).toBe(dup);
  });

  it("<body> no es direccionable: parchearlo sería rediseñar", () => {
    // parse5 en modo fragmento descarta html/head/body, así que nunca entran al
    // índice. El efecto buscado es el mismo (no se pueden parchear); el motivo que
    // reporta es `missing` porque, para este índice, ese nodo no existe.
    const doc = '<body data-id="root"><p data-id="p">x</p></body>';
    const r = applyPatches(doc, [{ nodeId: "root", html: "<body><p>otro</p></body>" }]);
    expect(r.applied).toEqual([]);
    expect(r.failed).toEqual([{ nodeId: "root", reason: "missing" }]);
  });

  it("sobre un DOCUMENTO completo respeta doctype, head y el resto del body", () => {
    const doc = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><style>.a{color:red}</style></head>
<body><header data-id="h">viejo</header><main data-id="m"><p data-id="p">texto</p></main></body></html>`;
    const r = applyPatches(doc, [{ nodeId: "h", html: "<header>NUEVO</header>" }]);
    expect(r.applied).toEqual(["h"]);
    expect(r.html).toContain("<!DOCTYPE html>");
    expect(r.html).toContain('<meta charset="utf-8">');
    expect(r.html).toContain(".a{color:red}");
    expect(r.html).toContain('<p data-id="p">texto</p>');
    expect(r.html).toContain("NUEVO");
    expect(r.html).not.toContain("viejo");
  });

  it("un patch que falla no impide los que sí aplican", () => {
    const r = applyPatches(DOC, [
      { nodeId: "no-existe", html: "<p>x</p>" },
      { nodeId: "t", html: "<h1>Ok</h1>" },
    ]);
    expect(r.applied).toEqual(["t"]);
    expect(r.failed).toEqual([{ nodeId: "no-existe", reason: "missing" }]);
    expect(r.html).toContain("Ok");
  });

  it("no toca los <script> del documento (el round-trip por DOM los rompía)", () => {
    const doc = `<div data-id="w"><p data-id="p">x</p><script>const a = 1 < 2 && 3 > 2;</script></div>`;
    const r = applyPatches(doc, [{ nodeId: "p", html: "<p>y</p>" }]);
    expect(r.html).toContain("const a = 1 < 2 && 3 > 2;");
  });
});
