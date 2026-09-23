import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

// Push-deploy: el receptor del webhook de GitHub es una ruta PÚBLICA. Lo que la
// protege es la firma; lo que evita deploys de más es el filtro de rama y el
// colapso de pushes seguidos. Esto congela esas tres cosas.

let sandboxRow: any = null;
let hookSecret: string | null = "s3cret";
const mockDb = { sandbox: { findUnique: vi.fn(async () => sandboxRow) } };
vi.mock("~/.server/db", () => ({ db: mockDb }));
vi.mock("~/.server/core/secretOperations", () => ({
  SECRET_REF_RE: /^\$secret:([A-Z_][A-Z0-9_]*)$/,
  createSecret: vi.fn(),
  deleteSecretByName: vi.fn(),
  listSecrets: vi.fn(async () => []),
  getSecretValue: vi.fn(async () => hookSecret),
}));
vi.mock("~/.server/core/hostingMonitorOperations", () => ({
  ownerContext: vi.fn(async (id: string) => ({ user: { id, email: "o@x.com" }, scopes: ["WRITE"] })),
}));
vi.mock("~/.server/emails/sendTransactional", () => ({ sendTransactional: vi.fn() }));

let release: () => void = () => {};
const launchApp = vi.fn(
  () => new Promise((r) => { release = () => r({ version: 2 }); })
);
vi.mock("~/.server/core/releaseOperations", async (orig) => ({
  ...(await orig<any>()),
  launchApp,
}));

const { handleGithubHook, verifyGithubSignature } = await import("~/.server/core/pushDeployOperations");

const sign = (body: string, secret = "s3cret") =>
  "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const hook = (payload: object, event = "push", secret = "s3cret") => {
  const body = JSON.stringify(payload);
  return handleGithubHook(
    "sb_abc",
    body,
    new Headers({ "x-github-event": event, "x-hub-signature-256": sign(body, secret), "content-type": "application/json" })
  );
};
const push = (sha: string, ref = "refs/heads/main") => ({
  ref,
  after: sha,
  head_commit: { message: `commit ${sha}\n\ncuerpo` },
  repository: { default_branch: "main" },
});

beforeEach(() => {
  hookSecret = "s3cret";
  sandboxRow = {
    ownerId: "owner1",
    status: "running",
    runspec: {
      appDir: "/srv/app",
      port: 4000,
      prebuilt: true,
      source: { repo: "https://github.com/u/r.git", branch: "main", tokenRef: "GH_TOKEN" },
    },
  };
  launchApp.mockClear();
});

describe("verifyGithubSignature", () => {
  it("acepta la firma correcta y rechaza cualquier otra", () => {
    expect(verifyGithubSignature("{}", sign("{}"), "s3cret")).toBe(true);
    expect(verifyGithubSignature("{}", sign("{}", "otro"), "s3cret")).toBe(false);
    expect(verifyGithubSignature("{}", null, "s3cret")).toBe(false);
    expect(verifyGithubSignature("{}", "sha256=corta", "s3cret")).toBe(false);
  });
});

describe("handleGithubHook", () => {
  it("404 si el push-deploy está apagado (no hay secreto)", async () => {
    hookSecret = null;
    expect((await hook(push("a1"))).status).toBe(404);
  });

  it("403 con firma inválida, sin desplegar", async () => {
    const res = await hook(push("a1"), "push", "otro");
    expect(res.status).toBe(403);
    expect(launchApp).not.toHaveBeenCalled();
  });

  it("ping → 200", async () => {
    expect((await hook({ zen: "hi" }, "ping")).status).toBe(200);
  });

  it("otra rama se ignora", async () => {
    const res = await hook(push("a1", "refs/heads/feature"));
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBeTruthy();
    expect(launchApp).not.toHaveBeenCalled();
  });

  it("push a la rama → 202 y redeploy con el runspec guardado, token por referencia", async () => {
    const res = await hook(push("abcdef1234"));
    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(launchApp).toHaveBeenCalledTimes(1));
    const params = (launchApp.mock.calls[0] as any)[1];
    expect(params).toMatchObject({
      sandboxId: "sb_abc",
      repo: "https://github.com/u/r.git",
      branch: "main",
      repoToken: "$secret:GH_TOKEN",
      appDir: "/srv/app",
      port: 4000,
      prebuilt: false,
      message: "push abcdef1: commit abcdef1234",
    });
    release();
  });

  it("pushes seguidos: el primero corre, los intermedios se colapsan en el último", async () => {
    await hook(push("c1"));
    await vi.waitFor(() => expect(launchApp).toHaveBeenCalledTimes(1));
    const r2 = await hook(push("c2"));
    const r3 = await hook(push("c3"));
    expect(r2.body.queued).toBe(true);
    expect(r3.body.queued).toBe(true);
    release();
    await vi.waitFor(() => expect(launchApp).toHaveBeenCalledTimes(2));
    expect((launchApp.mock.calls[1] as any)[1].message).toContain("c3");
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(launchApp).toHaveBeenCalledTimes(2);
  });

  it("máquina sin repo → 409", async () => {
    sandboxRow.runspec = { appDir: "/app" };
    expect((await hook(push("a1"))).status).toBe(409);
  });
});
