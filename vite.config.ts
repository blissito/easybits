import { reactRouter } from "@react-router/dev/vite";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
// import { externalizeDeps } from "vite-plugin-externalize-deps";

export default defineConfig({
  server: { port: 3000 },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },

  plugins: [
    reactRouter(),
    tsconfigPaths(),
    //  externalizeDeps()
  ],
  build: {
    // Habilitar compresión
    minify: "terser",
    // Reducir el tamaño de los assets
    assetsInlineLimit: 4096,
    // Habilitar source maps solo en desarrollo
    sourcemap: process.env.NODE_ENV === "development",
  },
  // build: {
  //   rollupOptions: {
  //     // make sure to externalize deps that shouldn't be bundled
  //     // into your library
  //     external: ["react-hook-multipart"],
  //   },
  // },
});
