import { describe, it, expect, vi, beforeEach } from "vitest";

// Sesión de Codex (plan de ChatGPT del usuario) vault ↔ caja: la credencial viaja por stdin,
// nunca se pisa una sesión más nueva y la versión renovada vuelve al vault.

const vault = vi.hoisted(() => new Map<string, string>());
const execCalls = vi.hoisted(() => [] as Array<{ command: string; stdin?: string; env?: Record<string, string> }>);
const boxFile = vi.hoisted(() => ({ value: "" as string }));

vi.mock("../app/.server/core/secretOperations", () => ({
  getSecretValue: async (_u: string, n: string) => vault.get(n) ?? null,
  createSecret: async (_u: string, { name, value }: { name: string; value: string }) => void vault.set(name, value),
}));
vi.mock("../app/.server/db", () => ({
  db: { secret: { findUnique: async () => (vault.has("CODEX_AUTH") ? { id: "s" } : null) } },
}));
vi.mock("../app/.server/core/sandboxOperations", () => ({
  execCommand: async (_ctx: unknown, _id: string, p: { command: string; stdin?: string; env?: Record<string, string> }) => {
    execCalls.push(p);
    if (p.command.startsWith("set -e")) {
      if (boxFile.value && p.env?.FORCE !== "1") return { exitCode: 0, stdout: "kept\n", stderr: "" };
      boxFile.value = p.stdin ?? "";
      return { exitCode: 0, stdout: "written\n", stderr: "" };
    }
    if (p.command.startsWith("cat ")) return { exitCode: 0, stdout: boxFile.value, stderr: "" };
    return { exitCode: 0, stdout: "present\n", stderr: "" };
  },
}));

import { connectCodex, isNewer, parseCodexAuth, saveCodex, saveCodexBeforeDestroy } from "../app/.server/core/codexAuth";

const ctx = { user: { id: "u1" } } as never;
const session = (refresh: string, at: string) =>
  JSON.stringify({ OPENAI_API_KEY: null, tokens: { access_token: "a", refresh_token: refresh, id_token: "i" }, last_refresh: at });

beforeEach(() => {
  vault.clear();
  execCalls.length = 0;
  boxFile.value = "";
});

describe("parseCodexAuth / isNewer", () => {
  it("rechaza lo que no es una sesión de ChatGPT", () => {
    expect(() => parseCodexAuth("sk-abc")).toThrow(/JSON/);
    expect(() => parseCodexAuth(JSON.stringify({ OPENAI_API_KEY: "sk-x" }))).toThrow(/sesión de ChatGPT/);
  });
  it("más nueva = otro refresh token con last_refresh posterior", () => {
    const a = parseCodexAuth(session("r2", "2026-10-22T10:00:00Z"));
    const b = parseCodexAuth(session("r1", "2026-10-21T10:00:00Z"));
    expect(isNewer(a, b)).toBe(true);
    expect(isNewer(b, a)).toBe(false);
    expect(isNewer(a, a)).toBe(false);
    expect(isNewer(a, null)).toBe(true);
  });
});

describe("connectCodex", () => {
  it("pone la sesión del vault en la caja POR STDIN (nunca en el comando)", async () => {
    vault.set("CODEX_AUTH", session("r1", "2026-10-22T10:00:00Z"));
    const r = await connectCodex(ctx, "sb_1");
    expect(r).toMatchObject({ session: "written", codex: "present" });
    const write = execCalls[0];
    expect(write.stdin).toContain("r1");
    expect(write.command).not.toContain("r1");
    expect(write.command).toContain("umask 077");
  });

  it("no pisa una sesión que la caja ya tiene; con force sí", async () => {
    vault.set("CODEX_AUTH", session("r1", "2026-10-22T10:00:00Z"));
    boxFile.value = session("r9", "2026-10-23T10:00:00Z");
    expect((await connectCodex(ctx, "sb_1", { install: false })).session).toBe("kept");
    expect(boxFile.value).toContain("r9");
    expect((await connectCodex(ctx, "sb_1", { force: true, install: false })).session).toBe("written");
    expect(boxFile.value).toContain("r1");
  });

  it("sin sesión en el vault, dice cómo conseguirla", async () => {
    await expect(connectCodex(ctx, "sb_1")).rejects.toThrow(/codex login --device-auth/);
  });
});

describe("saveCodex", () => {
  it("guarda la de la caja sólo si es más nueva que la del vault", async () => {
    vault.set("CODEX_AUTH", session("r1", "2026-10-22T10:00:00Z"));
    boxFile.value = session("r2", "2026-10-23T10:00:00Z");
    expect(await saveCodex(ctx, "sb_1")).toMatchObject({ saved: true });
    expect(vault.get("CODEX_AUTH")).toContain("r2");

    boxFile.value = session("r0", "2026-10-01T10:00:00Z"); // vieja: no reemplaza
    expect(await saveCodex(ctx, "sb_1")).toMatchObject({ saved: false });
    expect(vault.get("CODEX_AUTH")).toContain("r2");
  });

  it("caja sin sesión → error claro", async () => {
    await expect(saveCodex(ctx, "sb_1")).rejects.toThrow(/no tiene sesión/);
  });
});

describe("saveCodexBeforeDestroy", () => {
  it("si el usuario no usa CODEX_AUTH, ni siquiera entra a la caja", async () => {
    await saveCodexBeforeDestroy(ctx, "sb_1");
    expect(execCalls).toHaveLength(0);
  });
  it("si la caja trae una sesión renovada, la guarda; nunca lanza", async () => {
    vault.set("CODEX_AUTH", session("r1", "2026-10-22T10:00:00Z"));
    boxFile.value = session("r2", "2026-10-23T10:00:00Z");
    await saveCodexBeforeDestroy(ctx, "sb_1");
    expect(vault.get("CODEX_AUTH")).toContain("r2");
    boxFile.value = "basura";
    await expect(saveCodexBeforeDestroy(ctx, "sb_1")).resolves.toBeUndefined();
  });
});
