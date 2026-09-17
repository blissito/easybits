// /.well-known/skills/index.json y los archivos de cada skill (RFC 8615, el formato que lee
// `npx skills add https://easybits.cloud`). También sirve bajo /.well-known/agent-skills/*.
// Sólo `loader`: la lógica vive en ~/.server/docs/skillsWellKnown (un export extra aquí
// mete ~/.server en el bundle del cliente y rompe el build).
import type { Route } from "./+types/skills";
import { skillsIndex, skillFile } from "~/.server/docs/skillsWellKnown";

const TYPES: Record<string, string> = {
  md: "text/markdown",
  json: "application/json",
  py: "text/x-python",
  sh: "text/x-shellscript",
  txt: "text/plain",
};

export function loader({ params }: Route.LoaderArgs) {
  const rest = (params["*"] ?? "").replace(/^\/+/, "");
  const cache = { "Cache-Control": "public, max-age=600", "Access-Control-Allow-Origin": "*" };
  if (rest === "index.json" || rest === "") {
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
