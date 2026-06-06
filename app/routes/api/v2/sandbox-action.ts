import type { Route } from "./+types/sandbox-action";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
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
    case "exec":
      if (!body.command)
        return Response.json({ error: "command required" }, { status: 400 });
      return Response.json(
        await execCommand(ctx, id, {
          command: body.command,
          cwd: body.cwd,
          timeoutSeconds: body.timeoutSeconds,
          env: body.env,
        })
      );
    case "run-code":
      if (!body.code)
        return Response.json({ error: "code required" }, { status: 400 });
      return Response.json(
        await runCode(ctx, id, {
          code: body.code,
          lang: body.lang,
          timeoutSeconds: body.timeoutSeconds,
        })
      );
    case "run-cell":
      if (!body.code)
        return Response.json({ error: "code required" }, { status: 400 });
      return Response.json(
        await runCell(ctx, id, {
          code: body.code,
          timeoutSeconds: body.timeoutSeconds,
        })
      );
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
