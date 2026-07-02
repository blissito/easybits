import type { Route } from "./+types/sandbox-action";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  SandboxExecBody,
  SandboxRunCodeBody,
  SandboxRunCellBody,
  SandboxLogsBody,
  SandboxRuntimeBody,
  SandboxApplyPatchBody,
} from "~/.server/sandbox/schemas";
import {
  extendSandbox,
  suspendSandbox,
  resumeSandbox,
  snapshotSandbox,
  forkSandbox,
  execCommand,
  runCode,
  runCell,
  kernelRestart,
  exposeSandboxPort,
  addSandboxDomain,
  removeSandboxDomain,
  listSandboxDomains,
  verifySandboxDomain,
  readLogs,
  runtimeControl,
  applyPatch,
} from "~/.server/core/sandboxOperations";
import { computeEnvFor } from "~/.server/compute/gateway";

const invalid = (issues: unknown) =>
  Response.json({ error: "Invalid body", issues }, { status: 400 });

// POST /api/v2/sandboxes/:id/:action
// action ∈ extend | suspend | resume | snapshot | fork | exec | run-code |
//          run-cell | kernel-restart | logs | runtime | apply-patch | expose |
//          domain-add | domain-remove | domain-list | domain-verify
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
    case "snapshot":
      return Response.json(await snapshotSandbox(ctx, id, { name: body.name }));
    case "fork":
      return Response.json(
        await forkSandbox(ctx, {
          sandboxId: id,
          count: body.count,
          name: body.name,
          metadata: body.metadata,
          timeoutSeconds: body.timeoutSeconds,
        })
      );
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
    case "logs": {
      const p = SandboxLogsBody.safeParse(body);
      if (!p.success) return invalid(p.error.issues);
      return Response.json(await readLogs(ctx, id, p.data));
    }
    case "runtime": {
      const p = SandboxRuntimeBody.safeParse(body);
      if (!p.success) return invalid(p.error.issues);
      return Response.json(await runtimeControl(ctx, id, p.data));
    }
    case "apply-patch": {
      const p = SandboxApplyPatchBody.safeParse(body);
      if (!p.success) return invalid(p.error.issues);
      return Response.json(await applyPatch(ctx, id, p.data));
    }
    case "expose":
      if (typeof body.port !== "number")
        return Response.json({ error: "port required" }, { status: 400 });
      return Response.json(await exposeSandboxPort(ctx, id, body.port));
    case "domain-add":
      if (typeof body.domain !== "string" || !body.domain.trim())
        return Response.json({ error: "domain required" }, { status: 400 });
      if (typeof body.port !== "number")
        return Response.json({ error: "port required" }, { status: 400 });
      return Response.json(await addSandboxDomain(ctx, id, body.domain, body.port));
    case "domain-remove":
      if (typeof body.domain !== "string" || !body.domain.trim())
        return Response.json({ error: "domain required" }, { status: 400 });
      return Response.json(await removeSandboxDomain(ctx, id, body.domain));
    case "domain-list":
      return Response.json(await listSandboxDomains(ctx, id));
    case "domain-verify":
      if (typeof body.domain !== "string" || !body.domain.trim())
        return Response.json({ error: "domain required" }, { status: 400 });
      return Response.json(await verifySandboxDomain(ctx, body.domain));
    default:
      return Response.json(
        { error: `unknown action '${params.action}'` },
        { status: 404 }
      );
  }
}
