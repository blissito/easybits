import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    components: "src/components/index.ts",
    images: "src/images/index.ts",
    generate: "src/generate.ts",
    refine: "src/refine.ts",
    deploy: "src/deploy.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "ai",
    "@ai-sdk/anthropic",
    "@ai-sdk/openai",
    "@codemirror/lang-html",
    "@codemirror/state",
    "@codemirror/theme-one-dark",
    "@codemirror/view",
    "@codemirror/commands",
    "@codemirror/search",
    "@codemirror/language",
    "@codemirror/autocomplete",
    "react-icons",
  ],
  jsx: "automatic",
});
