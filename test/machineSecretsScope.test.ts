import { describe, it, expect, vi, beforeEach } from "vitest";

// Varios negocios en UNA cuenta: cada máquina tiene su propio valor de un
// secreto con el mismo nombre (JWT_SECRET, FACTURAPI_KEY…). El vault es por
// (dueño, nombre), así que el alcance vive en el nombre guardado.

const vault = new Map<string, string>();
const k = (u: string, n: string) => `${u}|${n}`;
const mockDb = {
  secret: {
    upsert: vi.fn(async ({ where, create }: any) => {
      vault.set(k(where.userId_name.userId, where.userId_name.name), create.value);
      return { id: "x", name: create.name };
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      const v = vault.get(k(where.userId_name.userId, where.userId_name.name));
      return v == null ? null : { id: "x", value: v };
    }),
    update: vi.fn(async () => ({})),
  },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));
vi.mock("~/.server/crypto", () => ({ encryptSecret: (v: string) => v, decryptSecret: (v: string) => v }));

const { createSecret, machineSecretName, getMachineSecretValue, copyMachineSecrets } = await import(
  "~/.server/core/secretOperations"
);

beforeEach(() => vault.clear());

describe("secretos con alcance de máquina", () => {
  it("el nombre guardado es válido para el vault y distinto por máquina", () => {
    const a = machineSecretName("sb_clave01", "JWT_SECRET");
    const b = machineSecretName("sb_aguas02", "JWT_SECRET");
    expect(a).toMatch(/^[A-Z_][A-Z0-9_]*$/);
    expect(a).not.toBe(b);
  });

  it("cada máquina lee el suyo; sin uno propio cae al global", async () => {
    await createSecret("u1", { name: "SES_API_KEY", value: "global" });
    await createSecret("u1", { name: machineSecretName("sb_a", "JWT_SECRET"), value: "A" });
    await createSecret("u1", { name: machineSecretName("sb_b", "JWT_SECRET"), value: "B" });

    expect(await getMachineSecretValue("u1", "sb_a", "JWT_SECRET")).toBe("A");
    expect(await getMachineSecretValue("u1", "sb_b", "JWT_SECRET")).toBe("B");
    expect(await getMachineSecretValue("u1", "sb_a", "SES_API_KEY")).toBe("global");
    expect(await getMachineSecretValue("u1", "sb_c", "JWT_SECRET")).toBeNull();
  });

  it("el redeploy copia los secretos de la máquina a su reemplazo", async () => {
    await createSecret("u1", { name: machineSecretName("sb_old", "JWT_SECRET"), value: "A" });
    await copyMachineSecrets("u1", "sb_old", "sb_new", ["JWT_SECRET", "SES_API_KEY"]);
    expect(await getMachineSecretValue("u1", "sb_new", "JWT_SECRET")).toBe("A");
  });
});
