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
  // El índice se refetchea en `npx skills update`: 60 s para que un deploy se vea pronto.
  // Los archivos de cada skill van cacheados más tiempo (cambian con el digest).
  const cache = { "Cache-Control": "public, max-age=600", "Access-Control-Allow-Origin": "*" };
  const indexCache = { ...cache, "Cache-Control": "public, max-age=60" };
  if (rest === "index.json" || rest === "") {
    // v0.2.0 con digest en AMBAS rutas (/.well-known/skills y /agent-skills): el CLI de
    // Vercel guarda el `digest` del índice en el lock y sólo así `update` detecta cambios
    // sin re-descargar todo. Sin el índice generado (dev/test) cae al legacy `files[]`.
    if (skillsIndexV2) {
      return new Response(skillsIndexV2, { headers: { ...indexCache, "Content-Type": "application/json; charset=utf-8" } });
    }
    return Response.json({ skills: skillsIndex() }, { headers: indexCache });
  }
  // Legacy explícito para clientes que sólo entienden `files[]`.
  if (rest === "index.legacy.json") {
    return Response.json({ skills: skillsIndex() }, { headers: indexCache });
  }
  const m = rest.match(/^([a-z0-9-]+)\/(.+)$/);
  const body = m ? skillFile(m[1], m[2]) : undefined;
  if (body === undefined) return new Response("Not Found", { status: 404 });
  const ext = rest.split(".").pop() ?? "";
  return new Response(body, {
    headers: { ...cache, "Content-Type": `${TYPES[ext] ?? "text/plain"}; charset=utf-8` },
  });
}
