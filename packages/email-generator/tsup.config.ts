import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Server-only deps stay external (the host installs them).
  external: [
    "tailwindcss",
    "postcss",
    "juice",
    "@easybits.cloud/html-tailwind-generator",
  ],
});
