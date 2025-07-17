import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
// import { externalizeDeps } from "vite-plugin-externalize-deps";

export default defineConfig({
  server: { port: 3000 },

  plugins: [
    reactRouter(),
    tsconfigPaths(),
    tailwindcss(),
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
