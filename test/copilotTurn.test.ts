import { describe, it, expect, vi } from "vitest";
import { fakeAgentActionTable } from "./fakeAgentActions";

// Un turno del copiloto: cuando una herramienta deja una propuesta pendiente, el turno emite
// `permission` (la forma de ACP/Ghosty que pinta la ConfirmCard) antes del `done`.

const h = vi.hoisted(() => ({ db: {} as any, routeMessage: vi.fn() }));
vi.mock("~/.server/db", () => ({ db: h.db }));
vi.mock("~/.server/core/fleetAgentOperations", () => ({
  routeMessage: h.routeMessage,
  FleetAgentAtCapacity: class extends Error {},
  createFleetAgent: vi.fn(),
  recycleFleetAgentBoxes: vi.fn(),
}));
vi.mock("~/.server/core/fleetAdmitHold", () => ({ withAdmitRetry: (fn: () => unknown) => fn() }));
vi.mock("~/.server/core/siteOperations", () => ({}));
vi.mock("~/.server/core/fleetUsage", () => ({ recordFleetTurnUsage: vi.fn() }));
vi.mock("~/.server/lifecycle.server", () => ({ isDraining: () => false, registerDrain: vi.fn() }));

import { startAgentTurn, subscribeSiteTurn, type TurnEvent } from "~/.server/core/siteTurns.server";
import { proposeAction } from "~/.server/core/agentActions";
import { copilotAfterTool, copilotTurnText, parseCopilotContext } from "~/.server/core/adminCopilot";

const owner = { id: "a".repeat(24), email: "root@easybits.cloud", roles: ["Admin"] } as any;
h.db.agentAction = fakeAgentActionTable();
h.db.fleetTurn = {
  findUnique: vi.fn(async () => null),
  findFirst: vi.fn(async () => null),
  findMany: vi.fn(async () => []),
  create: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
  updateMany: vi.fn(async () => ({ count: 0 })),
};
h.db.fleetAgentMessage = { create: vi.fn(), findFirst: vi.fn(async () => null), update: vi.fn() };

describe("turno del copiloto", () => {
  it("emite permission cuando run_cron deja una propuesta, y luego done", async () => {
    let sent: { text: string } | null = null;
    h.routeMessage.mockImplementation(async (_id: string, msg: { text: string }, opts: any) => {
      sent = msg;
      opts.onChunk("Te dejo la tarjeta. ");
      opts.onTool("mcp__easybits__run_cron", { phase: "start" });
      await proposeAction(owner.id, "run_cron", { job: "purge-notifications" });
      opts.onTool("", { phase: "end", ok: true });
      return "Te dejo la tarjeta. Apruébala.";
    });
    const events: TurnEvent[] = [];
    const finished = new Promise<void>((resolve) => {
      void startAgentTurn({ user: owner, scopes: ["READ", "WRITE"] }, {
        surface: "admin-copilot",
        groupId: `admin-crons:${owner.id}`,
        fleetAgentId: "f".repeat(24),
        sender: "admin-copilot",
        text: "corre la purga de notificaciones",
        prepare: async (t) => ({ text: copilotTurnText(t, parseCopilotContext({ page: "crons", job: "purge-notifications" })) }),
        afterTool: copilotAfterTool(owner.id),
      }).then(() => {
        subscribeSiteTurn(`admin-crons:${owner.id}`, (e) => {
          events.push(e);
          if (e.type === "done" || e.type === "error") resolve();
        }, { snapshot: false });
      });
    });
    await finished;
    expect(sent!.text).toBe(
      "[Contexto del panel — pantalla: crons; tarea seleccionada: purge-notifications («Purga de notificaciones»)]\ncorre la purga de notificaciones"
    );
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "permission")).toHaveLength(1);
    expect(types.indexOf("permission")).toBeLessThan(types.indexOf("done"));
    const perm = events.find((e) => e.type === "permission")!;
    expect(perm).toMatchObject({
      id: h.db.agentAction.rows[0].id,
      title: "Ejecutar ahora «Purga de notificaciones» (purge-notifications)",
      tool: "run_cron",
      options: [
        { optionId: "approve", kind: "allow_once" },
        { optionId: "reject", kind: "reject_once" },
      ],
    });
  });

  it("el contexto ignora tareas inventadas", () => {
    expect(parseCopilotContext({ page: "crons", job: "rm -rf" })).toEqual({ page: "crons", job: undefined });
    expect(parseCopilotContext("x")).toBeNull();
  });
});
