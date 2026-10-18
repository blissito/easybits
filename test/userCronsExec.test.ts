import { describe, it, expect, vi, beforeEach } from "vitest";

// Acción `exec`: rutas dentro de la caja, logs con tope y secretos acotados a UN cron.
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
    findFirst: vi.fn(async ({ where }: any) => {
      const names = [...vault.keys()].filter((key) => key.startsWith(`${where.userId}|`)).map((key) => key.split("|")[1]);
      const hit = names.find((n) => where.OR.some((o: any) => (typeof o.name === "string" ? o.name === n : n.startsWith(o.name.startsWith))));
      return hit ? { id: "x" } : null;
    }),
    update: vi.fn(async () => ({})),
  },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));
vi.mock("~/.server/crypto", () => ({ encryptSecret: (v: string) => v, decryptSecret: (v: string) => v }));

const { boxPath, joinLogs, cronSecretName, cronSecretValue, validateAction, EXEC_WORKDIR } = await import(
  "~/.server/core/userCronOperations"
);
const { createSecret, resolveSecretRef } = await import("~/.server/core/secretOperations");

const CRON_A = "6a00000000000000000000aa";
const CRON_B = "6a00000000000000000000bb";
const status = async (p: Promise<unknown>) => p.then(() => null, (e) => (e as Response).status ?? String(e));

beforeEach(() => vault.clear());

describe("rutas en la caja", () => {
  it("relativa al directorio de trabajo, ~ bajo /root, absoluta tal cual", () => {
    expect(boxPath("asc.py")).toBe(`${EXEC_WORKDIR}/asc.py`);
    expect(boxPath("./scripts/asc.py")).toBe(`${EXEC_WORKDIR}/scripts/asc.py`);
    expect(boxPath("~/.appstoreconnect/private_keys/AuthKey_X.p8")).toBe("/root/.appstoreconnect/private_keys/AuthKey_X.p8");
    expect(boxPath("/etc/x.conf")).toBe("/etc/x.conf");
  });
  it("rechaza .. y vacías", () => {
    expect(() => boxPath("../etc/passwd")).toThrow();
    expect(() => boxPath("")).toThrow();
  });
});

describe("logs", () => {
  it("stdout y stderr juntos, con la cola si se pasan del tope", () => {
    expect(joinLogs("hola\n", "")).toBe("hola");
    expect(joinLogs("", "falló")).toBe("[stderr]\nfalló");
    const big = joinLogs("a".repeat(1000) + "FIN", "", 100);
    expect(big.length).toBeLessThanOrEqual(100);
    expect(big.endsWith("FIN")).toBe(true);
  });
});

describe("secretos acotados a un cron", () => {
  it("cada cron lee el suyo; otro cron cae al global o a nada", async () => {
    await createSecret("u1", { name: cronSecretName(CRON_A, "ASC_P8"), value: "llave-de-A" });
    expect(await cronSecretValue("u1", CRON_A, "ASC_P8")).toBe("llave-de-A");
    expect(await cronSecretValue("u1", CRON_B, "ASC_P8")).toBeNull();
    await createSecret("u1", { name: "ASC_P8", value: "global" });
    expect(await cronSecretValue("u1", CRON_B, "ASC_P8")).toBe("global");
  });
  it("otro cron no lo puede pedir por su nombre guardado", async () => {
    const stored = cronSecretName(CRON_A, "ASC_P8");
    await createSecret("u1", { name: stored, value: "llave-de-A" });
    expect(await status(validateAction("u1", { type: "exec", command: "true", secrets: [{ name: stored }] }))).toBe(400);
    expect(await status(validateAction("u1", { type: "http", url: "https://example.com", secretName: stored }))).toBe(400);
  });
  it("tampoco por $secret: (agentes, git, machines)", async () => {
    const stored = cronSecretName(CRON_A, "ASC_P8");
    await createSecret("u1", { name: stored, value: "llave-de-A" });
    await expect(resolveSecretRef("u1", `$secret:${stored}`)).rejects.toMatchObject({ code: "SecretsMissing" });
  });
  it("exec sin el secreto en ningún lado → 400; con secretValues pasa", async () => {
    const action = { type: "exec", command: "python3 asc.py", secrets: [{ name: "ASC_P8", file: "~/.appstoreconnect/k.p8" }] };
    expect(await status(validateAction("u1", action))).toBe(400);
    const ok = await validateAction("u1", action, { secretValues: { ASC_P8: "-----BEGIN PRIVATE KEY-----" } });
    expect(ok).toMatchObject({ type: "exec", template: "python", timeoutSeconds: 300, secrets: [{ name: "ASC_P8", file: "~/.appstoreconnect/k.p8" }] });
  });
});
