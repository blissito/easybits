import { describe, expect, it } from "vitest";
import { letterSpacing, lineWords, stextLines } from "../app/.server/core/pdfCloneSkeleton";
import type { Char } from "../app/.server/core/renderCompare";

const ch = (c: string, x: number, o: Partial<Char> = {}): Char => ({
  c, x, y: 100, x1: x + 5, size: 10, font: "Arial", weight: 400, italic: false, color: "#000000", ...o,
});

describe("stextLines", () => {
  it("corta en los separadores de línea", () => {
    const nl = ch("\n", 0);
    expect(stextLines([ch("a", 0), nl, ch("b", 0), ch("c", 5), nl]).map((l) => l.map((c) => c.c).join(""))).toEqual(["a", "bc"]);
  });
});

describe("lineWords", () => {
  it("corta en espacios, en huecos grandes y en cambios de estilo", () => {
    const line = [
      ch("H", 0), ch("i", 5), ch(" ", 10), ch("y", 15),
      ch("o", 40), // hueco de 20 pt > ¼ del tamaño
      ch("B", 45, { color: "#ff0000" }),
    ];
    expect(lineWords(line).map((w) => w.map((c) => c.c).join(""))).toEqual(["Hi", "y", "o", "B"]);
  });
});

describe("letterSpacing", () => {
  const adv = { [String("1".codePointAt(0))]: 0.5, [String(",".codePointAt(0))]: 0.25 };
  it("no toca palabras con espaciado natural", () => {
    // avance natural 0.5 em × 10 pt = 5 pt
    expect(letterSpacing([ch("1", 0), ch("1", 5)], adv)).toBe("");
  });
  it("mide el espaciado que aplicó el PDF (Tc negativo)", () => {
    // natural 5 + 2.5 = 7.5 pt hasta el último carácter; el PDF lo pone en 6.5 → -0.5 pt por hueco
    expect(letterSpacing([ch("1", 0), ch(",", 4.5), ch("1", 6.5)], adv)).toBe("letter-spacing:-0.67px");
  });
  it("sin avances (fuente sustituida) no adivina", () => {
    expect(letterSpacing([ch("1", 0), ch("1", 9)], undefined)).toBe("");
    expect(letterSpacing([ch("x", 0), ch("1", 9)], adv)).toBe("");
  });
});
