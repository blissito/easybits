import type { Route } from "./+types/fleet-agents";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { createFleetAgent } from "~/.server/core/fleetAgentOperations";

// GET  /api/v2/fleet-agents          → list the caller's pools
// POST /api/v2/fleet-agents          → create a fleetAgent (returns token for the surface)
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const pools = await db.fleetAgent.findMany({
    where: { ownerId: ctx.user.id },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ pools });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");
  const body = await request.json().catch(() => ({}));
  const fleetAgent = await createFleetAgent(ctx, {
    name: typeof body?.name === "string" ? body.name : undefined,
    systemPrompt: typeof body?.systemPrompt === "string" ? body.systemPrompt : undefined,
    model: typeof body?.model === "string" ? body.model : undefined,
    workerTemplate: typeof body?.workerTemplate === "string" ? body.workerTemplate : undefined,
    persona: body?.persona && typeof body.persona === "object" ? body.persona : undefined,
    maxWorkersPerVm: Number.isFinite(body?.maxWorkersPerVm) ? body.maxWorkersPerVm : undefined,
    vmMemMb: Number.isFinite(body?.vmMemMb) ? body.vmMemMb : undefined,
    maxVms: Number.isFinite(body?.maxVms) ? body.maxVms : undefined,
    idleSuspendMin: Number.isFinite(body?.idleSuspendMin) ? body.idleSuspendMin : undefined,
  });
  return Response.json({ fleetAgent }, { status: 201 });
}
