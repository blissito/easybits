import { describe, it, expect } from "vitest";
import { buildDeployHtml } from "../packages/html-tailwind-generator/src/buildHtml";
import { replaceCdnWithCompiledCSS } from "../app/.server/tailwind";

// El CDN de Tailwind síncrono en el <head> deja la página EN BLANCO 20-30s en cada
// visita (se re-descargan ~400 KB sin caché compartida). Estos tests congelan que el
// horneado lo elimina de verdad y no se lleva estilos por delante al hacerlo.

const sections = [
  {
    id: "hero",
    name: "Hero",
    html: `<section class="bg-primary text-on-primary py-20 px-6">
      <h1 class="text-5xl font-bold mb-4">Barbería El Corte</h1>
      <a class="inline-block bg-accent text-on-accent px-8 py-4 rounded-lg">Reservar</a>
    </section>`,
  },
  {
    id: "servicios",
    name: "Servicios",
    html: `<section class="py-16 px-6 bg-surface">
      <div class="p-6 rounded-xl bg-primary/10 border border-accent/20">
        <h3 class="text-lg font-bold text-on-surface">Corte</h3>
      </div>
    </section>`,
  },
] as any;

const raw = () => buildDeployHtml(sections, "sunset", undefined, false);

describe("horneado de Tailwind", () => {
  it("el HTML v3 recién construido TRAE el CDN (si esto falla, el builder cambió)", () => {
    const html = raw();
    expect(html).toContain("cdn.tailwindcss.com");
    expect(html).toContain("tailwind.config");
  });

  it("quita el script del CDN Y el de config, no solo uno", async () => {
    const baked = await replaceCdnWithCompiledCSS(raw());
    // Dejar `tailwind.config` sin el CDN reventaría con "tailwind is not defined".
    expect(baked).not.toContain("cdn.tailwindcss.com");
    expect(baked).not.toMatch(/<script>\s*tailwind\.config/);
  });

  it("emite el CSS de las clases usadas, incluidas las semánticas con opacidad", async () => {
    const baked = await replaceCdnWithCompiledCSS(raw());
    expect(baked).toContain(".bg-primary");
    expect(baked).toContain(".rounded-xl");
    // bg-primary/10 no lo genera Tailwind desde CSS vars — lo emite generateOpacityRules
    expect(baked).toContain("bg-primary\\/10");
    expect(baked).toContain("color-mix");
  });

  it("es idempotente: hornear dos veces no duplica", async () => {
    const once = await replaceCdnWithCompiledCSS(raw());
    const twice = await replaceCdnWithCompiledCSS(once);
    expect(twice).toBe(once);
  });

  it("devuelve intacto un HTML que nunca usó el CDN", async () => {
    const plain = "<html><head><style>a{color:red}</style></head><body>hola</body></html>";
    expect(await replaceCdnWithCompiledCSS(plain)).toBe(plain);
  });

  it("una clase LITERAL dentro de un string de JS sí la atrapa el escaneo", async () => {
    // El escáner tokeniza el documento entero, no solo los atributos class=, así que
    // esto NO necesita safelist. Acota el riesgo de quitar el CDN: el problema no es
    // "hay JS", es la concatenación (test siguiente).
    const withJs = raw().replace("</body>", `<script>el.className='bg-emerald-500'</script></body>`);
    expect(await replaceCdnWithCompiledCSS(withJs)).toContain(".bg-emerald-500");
  });

  it("safelist rescata la clase CONCATENADA, que el escaneo no puede ver", async () => {
    const withJs = raw().replace(
      "</body>",
      `<script>el.className='bg-' + tone + '-500'</script></body>`
    );
    const sin = await replaceCdnWithCompiledCSS(withJs);
    const con = await replaceCdnWithCompiledCSS(withJs, { safelist: ["bg-emerald-500"] });
    expect(sin).not.toContain(".bg-emerald-500");
    expect(con).toContain(".bg-emerald-500");
  });
});
