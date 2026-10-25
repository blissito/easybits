import { describe, it, expect, vi, beforeEach } from "vitest";

// Una caja que llegó por runbook (desde Fly) corre sin fila en EasyBits, así que
// sus secretos se editaban a mano en /app/secrets.env. `machines adopt` le crea la
// fila sin tocarla y copia ese archivo al vault desde el servidor.
const rows = new Map<string, any>();
const mockDb = {
  sandbox: {
    findUnique: vi.fn(async ({ where }: any) => rows.get(where.sandboxId) ?? null),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: any) => (rows.set(data.sandboxId, data), data)),
    update: vi.fn(async ({ where, data }: any) => {
      const row = { ...rows.get(where.sandboxId), ...data };
      rows.set(where.sandboxId, row);
      return row;
    }),
  },
  agent: { findFirst: vi.fn(async () => null) },
};
vi.mock("~/.server/db", () => ({ db: mockDb }));

const createSecret = vi.fn();
vi.mock("~/.server/core/secretOperations", async (orig) => ({
  ...(await orig<any>()),
  createSecret,
}));

const host = { sandboxId: "sb_x", ownerId: "owner1", template: "app-host", status: "running", metadata: {} } as any;
let fileContent = "";
const getSandbox = vi.fn(async () => host);
const readFile = vi.fn(async () => ({ content: fileContent, size: fileContent.length, encoding: "utf8" }));
vi.mock("~/.server/core/sandboxOperations", async (orig) => ({
  ...(await orig<any>()),
  getSandbox,
  readFile,
}));

const { adoptMachine, parseAdoptEnv, setRunspec, publishRelease } = await import(
  "~/.server/core/releaseOperations"
);

const ctx = (id = "owner1") => ({ user: { id }, scopes: ["READ", "WRITE"] }) as any;

beforeEach(() => {
  rows.clear();
  createSecret.mockClear();
  mockDb.sandbox.create.mockClear();
  host.ownerId = "owner1";
  getSandbox.mockImplementation(async () => host);
  fileContent = "# secretos\nDATABASE_URL=postgres://a:b@c/d?x=1\nJWT_SECRET=abc==\n";
});

describe("machines adopt", () => {
  it("crea la fila externa e importa los nombres, sin devolver valores", async () => {
    const r = await adoptMachine(ctx(), {
      sandboxId: "sb_x",
      name: "mailmask-prod",
      unit: "app",
      importEnvFrom: "/app/secrets.env",
    });
    expect(r.imported).toEqual(["DATABASE_URL", "JWT_SECRET"]);
    expect(JSON.stringify(r)).not.toContain("postgres://");
    const row = rows.get("sb_x");
    expect(row).toMatchObject({ ownerId: "owner1", managedBy: "external", status: "running", tier: "mini" });
    expect(row.runspec).toMatchObject({ appDir: "/app", unit: "app", secretNames: ["DATABASE_URL", "JWT_SECRET"] });
    expect(row.stripeSubItemId).toBeUndefined();
    expect(createSecret).toHaveBeenCalledWith("owner1", { name: "DATABASE_URL__M_SBX", value: "postgres://a:b@c/d?x=1" });
  });

  it("dryRun no escribe nada", async () => {
    const r = await adoptMachine(ctx(), { sandboxId: "sb_x", name: "m", importEnvFrom: "/app/secrets.env", dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.imported).toHaveLength(2);
    expect(rows.size).toBe(0);
    expect(createSecret).not.toHaveBeenCalled();
  });

  it("404 si la caja es de otro o no existe en el host", async () => {
    host.ownerId = "otro";
    await expect(adoptMachine(ctx(), { sandboxId: "sb_x", name: "m" })).rejects.toMatchObject({ status: 404 });
    getSandbox.mockImplementation(async () => {
      throw new Error("404 not found");
    });
    await expect(adoptMachine(ctx(), { sandboxId: "sb_x", name: "m" })).rejects.toMatchObject({ status: 404 });
    expect(rows.size).toBe(0);
  });

  it("409 si ya tiene fila; 404 si la fila es de otro", async () => {
    rows.set("sb_x", { sandboxId: "sb_x", ownerId: "owner1", status: "running" });
    await expect(adoptMachine(ctx(), { sandboxId: "sb_x", name: "m" })).rejects.toMatchObject({ status: 409 });
    await expect(adoptMachine(ctx("intruso"), { sandboxId: "sb_x", name: "m" })).rejects.toMatchObject({ status: 404 });
  });

  it("aborta sin escribir si el archivo trae comillas o nombres raros", async () => {
    fileContent = 'A="x"\nlower=1\nOK=1\n';
    await expect(
      adoptMachine(ctx(), { sandboxId: "sb_x", name: "m", importEnvFrom: "/app/secrets.env" })
    ).rejects.toMatchObject({ code: "ImportEnvInvalid" });
    expect(rows.size).toBe(0);
    expect(createSecret).not.toHaveBeenCalled();
  });
});

describe("parseAdoptEnv", () => {
  it("toma el valor literal, como docker --env-file", () => {
    const { values, problems } = parseAdoptEnv("export A=b=c\n\n# x\nB= con espacio\nC=");
    expect(problems).toEqual([]);
    expect(values).toEqual({ A: "b=c", B: " con espacio", C: "" });
  });
  it("marca duplicados", () => {
    expect(parseAdoptEnv("A=1\nA=2").problems[0]).toContain("dos veces");
  });
});

describe("barandales de una caja adoptada", () => {
  beforeEach(() => {
    rows.set("sb_x", { sandboxId: "sb_x", ownerId: "owner1", status: "running", managedBy: "external", runspec: { appDir: "/app" } });
  });

  it("runspec acepta secretNames y unit, rechaza el arranque por comando", async () => {
    await expect(setRunspec(ctx(), "sb_x", { unit: "app" })).resolves.toMatchObject({ unit: "app" });
    const err = await setRunspec(ctx(), "sb_x", { startCommand: "npm start" }).catch((e) => e);
    expect(err).toBeInstanceOf(Response);
    expect(err.status).toBe(409);
  });

  it("publish responde 409", async () => {
    const err = await publishRelease(ctx(), "sb_x").catch((e) => e);
    expect(err.status).toBe(409);
  });
});
