import { readFileSync } from "node:fs"
import { JSDOM } from "jsdom"
import { describe, expect, it } from "vitest"
import { ebPickerJs } from "./eb-picker"

describe("eb-picker.js (generado desde @ghostystudio/pointer)", () => {
  it("public/eb-picker.js está al día con el paquete", () => {
    expect(readFileSync("public/eb-picker.js", "utf8")).toBe(ebPickerJs())
  })

  it("el protocolo viejo eb-* sigue funcionando (apps por URL, editores abiertos)", () => {
    const dom = new (JSDOM as any)(
      `<html><body><section data-eb-id="hero"><h1>Hola</h1></section><p id="x">sin id</p></body></html>`,
      { runScripts: "outside-only", pretendToBeVisual: true },
    )
    const w = dom.window as any
    const sent: any[] = []
    const fake = { postMessage: (m: any) => sent.push(m) }
    w.__p = fake
    w.eval(ebPickerJs().replace(/window\.top===window/g, "false").replace(/\bwindow\.parent\b|\bparent\b/g, "__p"))
    expect(sent.some((m) => m.type === "eb-picker-ready")).toBe(true)
    w.document.querySelector("h1").dispatchEvent(new w.MouseEvent("click", { bubbles: true }))
    expect(sent.find((m) => m.type === "eb-selected")).toEqual({ type: "eb-selected", id: "hero", tag: "section" })
    // Sin data-eb-id no se señala nada.
    const n = sent.length
    w.document.querySelector("#x").dispatchEvent(new w.MouseEvent("click", { bubbles: true }))
    expect(sent.length).toBe(n)
    // eb-theme pinta los tokens; eb-pointing apaga.
    w.dispatchEvent(new w.MessageEvent("message", { data: { type: "eb-theme", colors: { primary: "#123456" } }, source: fake }))
    expect(w.document.documentElement.style.getPropertyValue("--color-primary")).toBe("#123456")
    w.dispatchEvent(new w.MessageEvent("message", { data: { type: "eb-pointing", on: false }, source: fake }))
    w.document.querySelector("h1").dispatchEvent(new w.MouseEvent("click", { bubbles: true }))
    expect(sent.length).toBe(n)
  })
})
