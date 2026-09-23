/**
 * @easybits.cloud/eve-sandbox — provider de sandbox para eve (Vercel, ≥ 0.64)
 * sobre microVMs Firecracker de EasyBits.
 *
 *   // agent/sandbox.ts
 *   import { defineSandbox } from "eve/sandbox";
 *   import { EasybitsSandbox } from "@easybits.cloud/eve-sandbox";
 *
 *   export const environment = EasybitsSandbox.environment({
 *     prepare: async (sandbox) => { await sandbox.run({ command: "npm i -g tsx" }); },
 *   });
 *   export default defineSandbox(() => environment.open());
 *
 * eve ≤ 0.63 (`defineSandbox({ backend, bootstrap })`) → fija `eve-sandbox@0.1`.
 * Mapeo completo en `./provider.ts`.
 */
export * from "./provider.js";
