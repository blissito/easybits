import type { Route } from "./+types/sandbox-action";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  SandboxExecBody,
  SandboxRunCodeBody,
  SandboxRunCellBody,
} from "~/.server/sandbox/schemas";
import {
  extendSandbox,
  suspendSandbox,
  resumeSandbox,
  execCommand,
  runCode,
  runCell,
  kernelRestart,
  exposeSandboxPort,
} from "~/.server/core/sandboxOperations";
import { computeEnvFor } from "~/.server/compute/gateway";

const invalid = (issues: unknown) =>
  Response.json({ error: "Invalid body", issues }, { status: 400 });

// POST /api/v2/sandboxes/:id/:action
// action ∈ extend | suspend | resume | exec | run-code | run-cell |
//          kernel-restart | expose
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  const id = params.id;
  const body = await request.json().catch(() => ({}));

  switch (params.action) {
    case "extend":
      return Response.json(await extendSandbox(ctx, id, body.extendSeconds));
    case "suspend":
      return Response.json(await suspendSandbox(ctx, id));
    case "resume":
      return Response.json(await resumeSandbox(ctx, id));
    case "exec": {
      const p = SandboxExecBody.safeParse(body);
      if (!p.success) return invalid(p.error.issues);
      // eb.compute: inyecta OPENAI_API_KEY/BASE_URL (zero-config LLM). BYOK gana.
      const env = { ...(p.data.env ?? {}) };
      if (!env.OPENAI_API_KEY) {
        Object.assign(env, await computeEnvFor(ctx.user.id, id).catch(() => ({})));
      }
      return Response.json(await execCommand(ctx, id, { ...p.data, env }));
    }
    case "run-code": {
      const p = SandboxRunCodeBody.safeParse(body);
      if (!p.success) return invalid(p.error.issues);
      return Response.json(await runCode(ctx, id, p.data));
    }
    case "run-cell": {
      const p = SandboxRunCellBody.safeParse(body);
      if (!p.success) return invalid(p.error.issues);
      return Response.json(await runCell(ctx, id, p.data));
    }
    case "kernel-restart":
      return Response.json(await kernelRestart(ctx, id));
    case "expose":
      if (typeof body.port !== "number")
        return Response.json({ error: "port required" }, { status: 400 });
      return Response.json(await exposeSandboxPort(ctx, id, body.port));
    default:
      return Response.json(
        { error: `unknown action '${params.action}'` },
        { status: 404 }
      );
  }
}
