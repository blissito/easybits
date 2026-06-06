import type { Route } from "./+types/agent-skills";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { installSkill, listInstalledSkills } from "~/.server/core/skillsOperations";

// GET /api/v2/agents/:id/skills
// Owner-only. Devuelve { skills: InstalledSkillEntry[] } leyendo el FS de la VM.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    const skills = await listInstalledSkills(ctx, params.id!);
    return Response.json({ skills });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("unavailable") || msg.includes("invalid")
        ? 400
        : 502;
    return Response.json({ error: msg }, { status });
  }
}

// POST /api/v2/agents/:id/skills
//
// Owner-only. Multipart form-data:
//   - exactly one `.md` file (the skill definition) — accepted under any
//     field name; the first .md File entry found is used
//   - any number of additional asset files (images, helpers, etc.)
//
// Files land in the sandbox at /skills/<slug>/. The .md is renamed to
// SKILL.md; assets keep their original (sanitized) filenames. Then we
// notify the openclaw runtime via POST :port/skills/install so it picks
// up the new skill without a restart.
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "multipart/form-data body required" },
      { status: 400 }
    );
  }

  let skillFile: File | null = null;
  const assets: File[] = [];
  for (const [, value] of form.entries()) {
    if (!(value instanceof File)) continue;
    const isMd =
      value.name.toLowerCase().endsWith(".md") || value.type === "text/markdown";
    if (isMd && !skillFile) {
      skillFile = value;
    } else {
      assets.push(value);
    }
  }

  if (!skillFile) {
    return Response.json(
      { error: "a .md skill file is required (first .md entry is used)" },
      { status: 400 }
    );
  }

  try {
    const skillContent = await skillFile.arrayBuffer();
    const assetBuffers = await Promise.all(
      assets.map(async (a) => ({
        filename: a.name,
        content: await a.arrayBuffer(),
      }))
    );
    const result = await installSkill(ctx, params.id!, {
      skillFilename: skillFile.name,
      skillContent,
      assets: assetBuffers,
    });
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("unavailable") ||
          msg.includes("must") ||
          msg.includes("invalid") ||
          msg.includes("required") ||
          msg.includes("exceeds") ||
          msg.includes("empty") ||
          msg.includes("duplicate") ||
          msg.includes("cannot")
        ? 400
        : 502;
    return Response.json({ error: msg }, { status });
  }
}
