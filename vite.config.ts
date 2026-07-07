import { reactRouter } from "@react-router/dev/vite";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: { port: 3000 },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  plugins: [reactRouter(), tsconfigPaths()],
  build: {
    // esbuild minify: several× faster than terser, negligible size delta.
    minify: "esbuild",
    assetsInlineLimit: 4096,
    sourcemap: process.env.NODE_ENV === "development",
    rollupOptions: {
      external: ["react-hook-multipart"],
    },
  },
});
