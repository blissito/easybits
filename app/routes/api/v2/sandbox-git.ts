import type { Route } from "./+types/sandbox-git";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  gitCheckout,
  gitClone,
  gitCommit,
  gitLog,
  gitPull,
  gitPush,
  gitStatus,
} from "~/.server/core/gitOperations";

// Espejo REST de las tools sandbox_git_*. Misma forma que sandbox-files: una
// ruta con :op, para no multiplicar archivos por operación.
//
// El `token` acepta el valor literal o `$secret:NOMBRE` — la resolución vive en
// gitOperations, así que este archivo nunca ve una credencial en claro.

// GET /api/v2/sandboxes/:id/git/:op   (op: status | log)
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  const url = new URL(request.url);
  const dir = url.searchParams.get("dir") || "";
  if (!dir) return Response.json({ error: "dir required" }, { status: 400 });

  switch (params.op) {
    case "status":
      return Response.json(await gitStatus(ctx, params.id, { dir }));
    case "log": {
      const limitRaw = url.searchParams.get("limit");
      const { items, nextCursor } = await gitLog(ctx, params.id, {
        dir,
        limit: limitRaw ? Number(limitRaw) : undefined,
        cursor: url.searchParams.get("cursor") || undefined,
        path: url.searchParams.get("path") || undefined,
      });
      // Mismo envelope que el resto de listas de la API.
      return Response.json({ items, nextCursor, hasMore: nextCursor !== null });
    }
    default:
      return Response.json({ error: `unknown op '${params.op}'` }, { status: 404 });
  }
}

// POST /api/v2/sandboxes/:id/git/:op   (op: clone | commit | push | pull | checkout)
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
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const auth = { token: body.token, username: body.username };

  switch (params.op) {
    case "clone":
      if (!body.repo || !body.dir)
        return Response.json({ error: "repo and dir required" }, { status: 400 });
      return Response.json(
        await gitClone(ctx, id, {
          repo: body.repo,
          dir: body.dir,
          branch: body.branch,
          depth: body.depth,
          commit: body.commit,
          auth,
        })
      );
    case "commit":
      if (!body.dir || !body.message)
        return Response.json({ error: "dir and message required" }, { status: 400 });
      return Response.json(
        await gitCommit(ctx, id, {
          dir: body.dir,
          message: body.message,
          addAll: body.addAll,
          paths: body.paths,
          authorName: body.authorName,
          authorEmail: body.authorEmail,
        })
      );
    case "push":
      if (!body.dir)
        return Response.json({ error: "dir required" }, { status: 400 });
      return Response.json(
        await gitPush(ctx, id, {
          dir: body.dir,
          remote: body.remote,
          branch: body.branch,
          setUpstream: body.setUpstream,
          force: body.force,
          auth,
        })
      );
    case "pull":
      if (!body.dir)
        return Response.json({ error: "dir required" }, { status: 400 });
      return Response.json(
        await gitPull(ctx, id, { dir: body.dir, rebase: body.rebase, auth })
      );
    case "checkout":
      if (!body.dir || !body.branch)
        return Response.json({ error: "dir and branch required" }, { status: 400 });
      return Response.json(
        await gitCheckout(ctx, id, {
          dir: body.dir,
          branch: body.branch,
          create: body.create,
          from: body.from,
        })
      );
    default:
      return Response.json({ error: `unknown op '${params.op}'` }, { status: 404 });
  }
}
