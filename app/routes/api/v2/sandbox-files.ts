import type { Route } from "./+types/sandbox-files";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  writeFile,
  readFile,
  listFiles,
  deleteFile,
  moveFile,
  mkdir,
  editFile,
} from "~/.server/core/sandboxOperations";

// GET /api/v2/sandboxes/:id/files/:op   (op: read | list, path via ?path=)
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  if (params.op === "read") {
    if (!path)
      return Response.json({ error: "path required" }, { status: 400 });
    return Response.json(
      await readFile(ctx, params.id, {
        path,
        encoding: (url.searchParams.get("encoding") as "utf8" | "base64") || undefined,
      })
    );
  }
  if (params.op === "list") {
    if (!path)
      return Response.json({ error: "path required" }, { status: 400 });
    return Response.json(await listFiles(ctx, params.id, { path }));
  }
  return Response.json({ error: `unknown op '${params.op}'` }, { status: 404 });
}

// POST /api/v2/sandboxes/:id/files/:op   (op: write | delete | move | mkdir)
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
  switch (params.op) {
    case "write":
      if (!body.path || typeof body.content !== "string")
        return Response.json(
          { error: "path and content required" },
          { status: 400 }
        );
      return Response.json(
        await writeFile(ctx, id, {
          path: body.path,
          content: body.content,
          encoding: body.encoding,
        })
      );
    case "delete":
      if (!body.path)
        return Response.json({ error: "path required" }, { status: 400 });
      return Response.json(
        await deleteFile(ctx, id, { path: body.path, recursive: body.recursive })
      );
    case "move":
      if (!body.from || !body.to)
        return Response.json(
          { error: "from and to required" },
          { status: 400 }
        );
      return Response.json(
        await moveFile(ctx, id, { from: body.from, to: body.to })
      );
    case "mkdir":
      if (!body.path)
        return Response.json({ error: "path required" }, { status: 400 });
      return Response.json(await mkdir(ctx, id, { path: body.path }));
    case "edit":
      if (!body.path || typeof body.oldString !== "string" || typeof body.newString !== "string")
        return Response.json(
          { error: "path, oldString and newString required" },
          { status: 400 }
        );
      return Response.json(
        await editFile(ctx, id, {
          path: body.path,
          oldString: body.oldString,
          newString: body.newString,
          replaceAll: body.replaceAll,
        })
      );
    default:
      return Response.json(
        { error: `unknown op '${params.op}'` },
        { status: 404 }
      );
  }
}
