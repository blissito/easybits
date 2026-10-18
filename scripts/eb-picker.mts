/**
 * Genera `public/eb-picker.js` desde `@ghostystudio/pointer` (una sola implementación del picker con
 * Ghosty Studio y Deník). La URL no cambia: las apps de los usuarios lo cargan por URL absoluta
 * (`starters/files.ts`, `EB_PICKER`) y /s/<slug> lo inyecta con `?eb_edit=1`.
 *
 *   npx tsx scripts/eb-picker.mts --write   → regenera el archivo
 *   npx tsx scripts/eb-picker.mts           → sólo verifica que esté al día (exit 1 si no)
 */
import { readFileSync, writeFileSync } from "node:fs"
import { ebPickerJs } from "../app/lib/eb-picker"

const target = new URL("../public/eb-picker.js", import.meta.url)
const next = ebPickerJs()
const write = process.argv.includes("--write")
const current = (() => {
  try {
    return readFileSync(target, "utf8")
  } catch {
    return ""
  }
})()
if (current === next) {
  console.log("eb-picker.js al día")
} else if (write) {
  writeFileSync(target, next)
  console.log("eb-picker.js regenerado desde @ghostystudio/pointer")
} else {
  console.error("public/eb-picker.js no coincide con @ghostystudio/pointer: corre `npx tsx scripts/eb-picker.mts --write`")
  process.exit(1)
}
