import type { Route } from "./+types/sites.$id.takeover.$pass.$op";
import { db } from "~/.server/db";
import { getUserOrNull } from "~/.server/getters";
import type { AuthContext } from "~/.server/apiAuth";
import { getSite, siteGroupId } from "~/.server/core/siteOperations";
import { humanOnBox, readTakeoverPass, watchOnBox } from "~/.server/core/renderClient";
import { liveBrowserSession } from "~/.server/core/siteTurns.server";
import { releaseHandoff } from "~/.server/core/browserHandoff";

// «Tomar el control» por EasyBits: GET …/live (SSE de la pestaña) y POST …/input|release.
// Con un pase de sólo mirar (`m: "watch"`, de sites.$id.watch) únicamente sirve …/live.
// Hace falta la sesión del dueño del sitio Y el pase firmado de sites.$id.takeover: el pase solo
// no sirve, y la persona nunca ve el host de la caja. Ruta de recurso: sin export default.
async function proxy(request: Request, params: Route.LoaderArgs["params"]) {
  const op = params.op;
  if (op !== "live" && op !== "input" && op !== "release") return new Response("Not found", { status: 404 });
  if ((op === "live") !== (request.method === "GET")) return new Response("Method not allowed", { status: 405 });
  const user = await getUserOrNull(request).catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const site = await getSite({ user, scopes: ["READ", "WRITE"] } as AuthContext, params.id!);
  const pass = readTakeoverPass(params.pass!, site.id);
  if (!pass) return Response.json({ error: "session_gone" }, { status: 404 });
  const owner = await db.user.findUnique({ where: { id: pass.o } });
  if (!owner) return Response.json({ error: "session_gone" }, { status: 404 });
  const ctx = { user: owner, scopes: ["READ", "WRITE"] } as AuthContext;
  if (pass.m === "watch") {
    if (op !== "live") return new Response("Not found", { status: 404 });
    // Con el turno terminado no se mira nada: sin esto, la reconexión del EventSource
    // despertaría una caja dormida.
    if (!liveBrowserSession(siteGroupId(site.id), pass.t)) return Response.json({ error: "session_gone" }, { status: 404 });
    try {
      const res = await watchOnBox(ctx, pass.t, request.signal);
      if (!res.ok) return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
      return new Response(res.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }
  try {
    const res = await humanOnBox(ctx, op, pass.t, op === "live" ? undefined : await request.text(), request.signal);
    // «Devolver el control» despierta al agente que esperaba en browser_ask_human (mismo turno).
    if (op === "release" && res.ok && pass.i) releaseHandoff(pass.i);
    if (op === "live" && res.ok) {
      return new Response(res.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" } });
    }
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

export const loader = ({ request, params }: Route.LoaderArgs) => proxy(request, params);
export const action = ({ request, params }: Route.ActionArgs) => proxy(request, params);
