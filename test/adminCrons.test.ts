import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeAgentActionTable } from "./fakeAgentActions";

// Copiloto del panel de crons: tools MCP (forma + sólo superusuarios), propuestas que NO
// ejecutan, aprobación con la sesión una sola vez, y que una llave no pueda aprobar.

const h = vi.hoisted(() => ({
  db: {} as any,
  startManualRun: vi.fn(async (job: string) => ({ started: true, job })),
  setCronPaused: vi.fn(async (job: string, paused: boolean, by: string | null) => ({
    job,
    paused,
    pausedBy: paused ? by : null,
    pausedAt: paused ? new Date("2026-10-17T00:00:00Z") : null,
  })),
  sessionUser: null as any,
}));
vi.mock("~/.server/db", () => ({ db: h.db }));
vi.mock("~/.server/cron", async (orig) => ({
  ...(await orig<object>()),
  startManualRun: h.startManualRun,
  setCronPaused: h.setCronPaused,
  listCronOverview: vi.fn(async () => [{ key: "purge-keys", name: "Purga de llaves revocadas", status: "al-dia" }]),
  listCronRuns: vi.fn(async (job: string) => [{ id: "r1", trigger: "manual", ok: false, error: `boom ${job}` }]),
}));
vi.mock("~/.server/getters", async (orig) => ({
  ...(await orig<object>()),
  getUserOrNull: vi.fn(async () => h.sessionUser),
}));

import { createMcpServer, getRegisteredTools } from "~/.server/mcp/server";
import { PENDING_TTL_MS, resolveAgentAction, proposeAction } from "~/.server/core/agentActions";
import { action as approveRoute } from "~/routes/api/v2/admin.agent-actions.$id";

const admin = { id: "a".repeat(24), email: "root@easybits.cloud", roles: ["Admin"] } as any;
const mortal = { id: "b".repeat(24), email: "x@y.z", roles: [] } as any;
const ctx = (user: any, scopes: string[]) => ({ authInfo: { user, scopes } });
const parse = (res: any) => JSON.parse(res.content[0].text);

let actions: ReturnType<typeof fakeAgentActionTable>;
beforeEach(() => {
  actions = fakeAgentActionTable();
  h.db.agentAction = actions;
  h.startManualRun.mockClear();
  h.setCronPaused.mockClear();
  h.sessionUser = admin;
});

describe("tools MCP admin-crons", () => {
  const registered = getRegisteredTools(createMcpServer(["admin-crons"])) as Record<string, any>;
  const call = (name: string, params: any, extra: any) => registered[name].handler(params, extra);

  it("el grupo enseña exactamente las 4 tools (más las meta-tools acotadas)", () => {
    const visible = Object.entries(registered)
      .filter(([, t]) => t.enabled !== false)
      .map(([n]) => n)
      .sort();
    expect(visible).toEqual(["discover_tools", "get_cron_runs", "list_crons", "pause_cron", "run_cron", "run_tool"]);
  });

  it("un usuario normal no las usa, aunque tenga ADMIN sobre sus recursos", async () => {
    for (const name of ["list_crons", "get_cron_runs", "run_cron", "pause_cron"]) {
      const res = await call(name, { job: "purge-keys", paused: true }, ctx(mortal, ["READ", "WRITE", "ADMIN"]));
      expect(res.isError).toBe(true);
      expect(parse(res).status).toBe(403);
    }
    expect(actions.rows).toHaveLength(0);
  });

  it("list_crons y get_cron_runs devuelven el envelope de lista", async () => {
    const list = parse(await call("list_crons", {}, ctx(admin, ["READ"])));
    expect(list).toMatchObject({ items: [{ key: "purge-keys" }], nextCursor: null, hasMore: false, total: 1 });
    const runs = parse(await call("get_cron_runs", { job: "purge-keys" }, ctx(admin, ["READ"])));
    expect(runs.items[0].error).toBe("boom purge-keys");
    const unknown = await call("get_cron_runs", { job: "nope" }, ctx(admin, ["READ"]));
    expect(unknown.isError).toBe(true);
  });

  it("run_cron sólo PROPONE: needs_confirmation sin isError, nada corre", async () => {
    const res = await call("run_cron", { job: "purge-notifications" }, ctx(admin, ["READ", "WRITE"]));
    expect(res.isError).toBeUndefined();
    const body = parse(res);
    expect(body).toMatchObject({ needs_confirmation: true, summary: "Ejecutar ahora «Purga de notificaciones» (purge-notifications)" });
    expect(body.actionId).toBe(actions.rows[0].id);
    expect(h.startManualRun).not.toHaveBeenCalled();
    // El modelo repite: misma tarjeta, no dos.
    const again = parse(await call("run_cron", { job: "purge-notifications" }, ctx(admin, ["READ", "WRITE"])));
    expect(again.actionId).toBe(body.actionId);
    expect(actions.rows).toHaveLength(1);
  });

  it("pause_cron arma el resumen desde la tabla, y una llave de sólo lectura no propone", async () => {
    const body = parse(await call("pause_cron", { job: "purge-keys", paused: true }, ctx(admin, ["READ", "WRITE"])));
    expect(body.summary).toBe("Pausar «Purga de llaves revocadas» (purge-keys)");
    expect(h.setCronPaused).not.toHaveBeenCalled();
    const ro = await call("pause_cron", { job: "purge-keys", paused: false }, ctx(admin, ["READ"]));
    expect(ro.isError).toBe(true);
  });
});

describe("aprobación de acciones", () => {
  it("aprobar ejecuta UNA vez; el segundo clic no corre nada", async () => {
    const a = await proposeAction(admin.id, "run_cron", { job: "purge-keys" });
    const first = await resolveAgentAction(admin, a.id, "approve");
    expect(first).toMatchObject({ ok: true, status: "executed", result: { started: true, job: "purge-keys" } });
    const second = await resolveAgentAction(admin, a.id, "approve");
    expect(second).toEqual({ ok: false, status: "not_pending", current: "executed" });
    expect(h.startManualRun).toHaveBeenCalledTimes(1);
    expect(actions.rows[0].resolvedBy).toBe(admin.email);
  });

  it("dos aprobaciones simultáneas: sólo una ejecuta", async () => {
    const a = await proposeAction(admin.id, "pause_cron", { job: "purge-keys", paused: true });
    const outs = await Promise.all([resolveAgentAction(admin, a.id, "approve"), resolveAgentAction(admin, a.id, "approve")]);
    expect(outs.filter((o) => o.status === "executed")).toHaveLength(1);
    expect(h.setCronPaused).toHaveBeenCalledTimes(1);
    expect(h.setCronPaused).toHaveBeenCalledWith("purge-keys", true, admin.email);
  });

  it("rechazar no ejecuta", async () => {
    const a = await proposeAction(admin.id, "run_cron", { job: "purge-keys" });
    expect(await resolveAgentAction(admin, a.id, "reject")).toEqual({ ok: true, status: "rejected" });
    expect(await resolveAgentAction(admin, a.id, "approve")).toMatchObject({ status: "not_pending", current: "rejected" });
    expect(h.startManualRun).not.toHaveBeenCalled();
  });

  it("vence a los 15 min", async () => {
    const a = await proposeAction(admin.id, "run_cron", { job: "purge-keys" });
    const later = Date.now() + PENDING_TTL_MS + 1000;
    expect(await resolveAgentAction(admin, a.id, "approve", later)).toMatchObject({ status: "not_pending", current: "expired" });
    expect(h.startManualRun).not.toHaveBeenCalled();
  });

  it("otro superusuario no aprueba lo que no propuso él", async () => {
    const a = await proposeAction(admin.id, "run_cron", { job: "purge-keys" });
    const other = { id: "c".repeat(24), email: "otro@easybits.cloud" };
    expect(await resolveAgentAction(other, a.id, "approve")).toMatchObject({ status: "not_pending", current: "not_found" });
    expect(h.startManualRun).not.toHaveBeenCalled();
  });
});

describe("POST /api/v2/admin/agent-actions/:id", () => {
  const req = (headers: Record<string, string>, decision = "approve") =>
    new Request("https://www.easybits.cloud/api/v2/admin/agent-actions/x", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ decision }),
    });
  const run = async (headers: Record<string, string>, id: string, decision?: string) => {
    try {
      return await approveRoute({ request: req(headers, decision), params: { id } } as any);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
  };

  it("una llave (Bearer) NO aprueba, aunque traiga también la cookie del superusuario", async () => {
    const a = await proposeAction(admin.id, "run_cron", { job: "purge-keys" });
    const res = await run({ Authorization: "Bearer eb_sk_live_agente", Cookie: "__session=x" }, a.id);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("session_required");
    expect(actions.rows[0].status).toBe("pending");
    expect(h.startManualRun).not.toHaveBeenCalled();
  });

  it("sin sesión: 401; sesión de alguien que no es superusuario: 403", async () => {
    const a = await proposeAction(admin.id, "run_cron", { job: "purge-keys" });
    h.sessionUser = null;
    expect((await run({}, a.id)).status).toBe(401);
    h.sessionUser = mortal;
    expect((await run({}, a.id)).status).toBe(403);
    expect(h.startManualRun).not.toHaveBeenCalled();
  });

  it("otro origen: 403", async () => {
    const a = await proposeAction(admin.id, "run_cron", { job: "purge-keys" });
    expect((await run({ Origin: "https://evil.example" }, a.id)).status).toBe(403);
    expect(h.startManualRun).not.toHaveBeenCalled();
  });

  it("con la sesión: ejecuta y un segundo POST da 409", async () => {
    const a = await proposeAction(admin.id, "run_cron", { job: "purge-notifications" });
    const ok = await run({ Origin: "https://www.easybits.cloud" }, a.id);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, status: "executed" });
    expect((await run({}, a.id)).status).toBe(409);
    expect(h.startManualRun).toHaveBeenCalledTimes(1);
  });
});
