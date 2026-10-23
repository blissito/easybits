import { describe, expect, it } from "vitest";
import { inlineHtmlToJsx, replaceJsxText } from "~/lib/jsxTextEdit";

describe("replaceJsxText", () => {
  it("cambia sólo el texto y conserva la sangría", () => {
    const src = `<h1 className="t" data-eb-id="hero-title">\n  Hola mundo\n</h1>\n<p data-eb-id="x">igual</p>`;
    const r = replaceJsxText(src, "hero-title", { text: "Adiós {mundo}" });
    expect(r).toEqual({ ok: true, source: `<h1 className="t" data-eb-id="hero-title">\n  Adiós {"{"}mundo{"}"}\n</h1>\n<p data-eb-id="x">igual</p>` });
  });

  it("con formato en línea usa el HTML del navegador como JSX", () => {
    const src = `<h1 data-eb-id="h">Entrena fuerte. Paga <span className="text-primary">justo.</span></h1>`;
    const r = replaceJsxText(src, "h", { text: "Entrena. Paga poco.", html: `Entrena. Paga <span class="text-primary">poco.</span><br>` });
    expect(r).toEqual({ ok: true, source: `<h1 data-eb-id="h">Entrena. Paga <span className="text-primary">poco.</span><br /></h1>` });
  });

  it("rechaza expresiones, componentes, ids repetidos o ausentes", () => {
    expect(replaceJsxText(`<p data-eb-id="p">{gym.name}</p>`, "p", { text: "x" }).ok).toBe(false);
    expect(replaceJsxText(`<p data-eb-id="p"><Price /></p>`, "p", { text: "x" }).ok).toBe(false);
    expect(replaceJsxText(`<p data-eb-id="p">a</p><p data-eb-id="p">b</p>`, "p", { text: "x" }).ok).toBe(false);
    expect(replaceJsxText(`<p data-eb-id="q">a</p>`, "p", { text: "x" }).ok).toBe(false);
    expect(replaceJsxText(`<img data-eb-id="p" />`, "p", { text: "x" }).ok).toBe(false);
  });

  it("salta llaves y comillas dentro de la etiqueta de apertura", () => {
    const src = `<a href={url} data-eb-id="cta" onClick={() => go(">")}>Ir</a>`;
    expect(replaceJsxText(src, "cta", { text: "Vamos" })).toEqual({ ok: true, source: `<a href={url} data-eb-id="cta" onClick={() => go(">")}>Vamos</a>` });
  });
});

describe("inlineHtmlToJsx", () => {
  it("quita etiquetas no permitidas y atributos peligrosos", () => {
    expect(inlineHtmlToJsx(`a <script>x</script><b onclick="y">b</b> <a href="javascript:z">c</a>`)).toBe(`a x<b>b</b> <a>c</a>`);
  });
});
