// Para los tests: `import "./x.js"` dentro de src/ resuelve a `./x.ts` cuando existe (tsup lo hace
// al compilar; node --test con transform-types no). Así un test puede importar comandos enteros.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(spec, ctx, next) {
  if (spec.startsWith(".") && spec.endsWith(".js") && ctx.parentURL && ctx.parentURL.startsWith("file:")) {
    const ts = new URL(spec.slice(0, -3) + ".ts", ctx.parentURL);
    if (existsSync(fileURLToPath(ts))) return next(ts.href, ctx);
  }
  return next(spec, ctx);
}`),
);
