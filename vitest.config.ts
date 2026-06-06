import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // Los *.spec.ts son tests de Playwright (corren con `npm run e2e`),
    // no de vitest. Excluirlos para no fallar el unit suite.
    exclude: [...configDefaults.exclude, "**/*.spec.ts"],
  },
});
