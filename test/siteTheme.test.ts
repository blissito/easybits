import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_THEME,
  SITE_THEMES,
  THEME_TOKENS,
  parseThemeColors,
  replaceStaticTheme,
  themeBlockStatic,
  themeCssTw4,
  validThemeColors,
} from "~/lib/siteTheme";
import { starterFiles, stackThemeFiles } from "~/.server/starters";

const other: Record<string, string> = SITE_THEMES.find((t) => t.id === "dracula")!.colors;

describe("siteTheme", () => {
  it("todas las paletas traen todos los tokens en #rrggbb", () => {
    for (const t of SITE_THEMES) expect(validThemeColors(t.colors), t.id).not.toBeNull();
  });

  it("tw4: @theme con cada token y se vuelve a leer igual", () => {
    const css = themeCssTw4(other);
    expect(css).toContain("@theme {");
    for (const k of THEME_TOKENS) expect(css).toContain(`--color-${k}: ${other[k]};`);
    expect(parseThemeColors(css)).toEqual(validThemeColors(other));
  });

  it("estático: reemplaza el bloque y conserva el resto del HTML", () => {
    const html = `<html><head><script src="https://cdn.tailwindcss.com"></script>\n${themeBlockStatic(DEFAULT_SITE_THEME.colors)}\n<title>x</title></head><body data-eb-id="a">hola</body></html>`;
    const out = replaceStaticTheme(html, other)!;
    expect(parseThemeColors(out)).toEqual(validThemeColors(other));
    expect(out).toContain("<title>x</title>");
    expect(out).toContain('<body data-eb-id="a">hola</body>');
    expect(out.match(/id="eb-theme"/g)).toHaveLength(1);
  });

  it("estático sin bloque → null (sitio anterior a los temas)", () => {
    expect(replaceStaticTheme("<html><head></head><body></body></html>", other)).toBeNull();
  });

  it("colores incompletos o inválidos se rechazan", () => {
    expect(validThemeColors({ ...other, primary: "red" })).toBeNull();
    const { accent, ...sinAccent } = other;
    void accent;
    expect(validThemeColors(sinAccent)).toBeNull();
  });

  it("starters con Tailwind 4 importan eb-theme.css y lo traen", () => {
    const t = stackThemeFiles("tanstack")!;
    const files = starterFiles("tanstack");
    expect(files[t.main]).toContain(t.importLine);
    expect(parseThemeColors(files[t.theme])).toEqual(validThemeColors(DEFAULT_SITE_THEME.colors));
    expect(stackThemeFiles("remix")).toBeNull();
  });
});
