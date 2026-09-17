// /.well-known/skills/index.json y los archivos de cada skill (RFC 8615, el formato que lee
// `npx skills add https://easybits.cloud`). También sirve bajo /.well-known/agent-skills/*.
// Sólo `loader`: la lógica vive en ~/.server/docs/skillsWellKnown (un export extra aquí
// mete ~/.server en el bundle del cliente y rompe el build).
import type { Route } from "./+types/skills";
import { skillsIndex, skillFile, skillsIndexV2 } from "~/.server/docs/skillsWellKnown";

const TYPES: Record<string, string> = {
  md: "text/markdown",
  json: "application/json",
  py: "text/x-python",
  sh: "text/x-shellscript",
  txt: "text/plain",
};

export function loader({ request, params }: Route.LoaderArgs) {
  const rest = (params["*"] ?? "").replace(/^\/+/, "");
  const cache = { "Cache-Control": "public, max-age=600", "Access-Control-Allow-Origin": "*" };
  if (rest === "index.json" || rest === "") {
    // /.well-known/agent-skills → v0.2.0 con digest (si el prebuild lo generó);
    // /.well-known/skills → legacy `files[]`, fallback del CLI de Vercel y de clientes viejos.
    const v2 = new URL(request.url).pathname.startsWith("/.well-known/agent-skills");
    if (v2 && skillsIndexV2) {
      return new Response(skillsIndexV2, { headers: { ...cache, "Content-Type": "application/json; charset=utf-8" } });
    }
    return Response.json({ skills: skillsIndex() }, { headers: cache });
  }
  const m = rest.match(/^([a-z0-9-]+)\/(.+)$/);
  const body = m ? skillFile(m[1], m[2]) : undefined;
  if (body === undefined) return new Response("Not Found", { status: 404 });
  const ext = rest.split(".").pop() ?? "";
  return new Response(body, {
    headers: { ...cache, "Content-Type": `${TYPES[ext] ?? "text/plain"}; charset=utf-8` },
  });
}
