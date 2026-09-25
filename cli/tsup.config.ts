import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

// La versión sale de package.json al compilar: `easybits --version` nunca miente.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  define: { __CLI_VERSION__: JSON.stringify(version) },
});
