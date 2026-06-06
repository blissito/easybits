import { describe, it, expect } from "vitest";
import {
  SandboxCreateBody,
  SandboxExecBody,
  SandboxRunCellBody,
} from "~/.server/sandbox/schemas";

describe("sandbox schemas (fuente única de validación REST)", () => {
  it("create rechaza template inválido y acepta uno válido", () => {
    expect(SandboxCreateBody.safeParse({}).success).toBe(false);
    expect(SandboxCreateBody.safeParse({ template: "windows" }).success).toBe(false);
    const ok = SandboxCreateBody.safeParse({ template: "python", timeoutSeconds: 300 });
    expect(ok.success).toBe(true);
    // Regresión: los 17 templates canónicos (incl. variantes ghosty) deben pasar.
    expect(SandboxCreateBody.safeParse({ template: "ghosty-lite" }).success).toBe(true);
    expect(SandboxCreateBody.safeParse({ template: "cagent-ghosty" }).success).toBe(true);
  });

  it("create rechaza timeout fuera de rango [30,3600]", () => {
    expect(SandboxCreateBody.safeParse({ template: "node", timeoutSeconds: 10 }).success).toBe(false);
    expect(SandboxCreateBody.safeParse({ template: "node", timeoutSeconds: 99999 }).success).toBe(false);
  });

  it("exec rechaza command vacío (el hueco que cerramos)", () => {
    expect(SandboxExecBody.safeParse({ command: "" }).success).toBe(false);
    expect(SandboxExecBody.safeParse({}).success).toBe(false);
    expect(SandboxExecBody.safeParse({ command: "ls -la" }).success).toBe(true);
  });

  it("run-cell exige code no vacío", () => {
    expect(SandboxRunCellBody.safeParse({ code: "" }).success).toBe(false);
    expect(SandboxRunCellBody.safeParse({ code: "print(1)" }).success).toBe(true);
  });
});
