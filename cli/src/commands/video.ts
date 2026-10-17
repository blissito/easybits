// Video: proyectos de escenas (HTML + timeline GSAP + narración) que se renderizan a MP4 en la
// caja HyperFrames del dueño, y la lista de videos generados con IA (video_create).
import type { Command, Ctx } from "../types.js";
import { existsSync, readFileSync } from "node:fs";
import { EasybitsError, resolveBaseUrl } from "@easybits.cloud/sdk";
import { need, readStdin, str, bool } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { resolveCredential } from "../client.js";
import { CliError, EXIT, usageError } from "../errors.js";
import { confirm, requireYesIfHeadless, YES_OPTION } from "../prompt.js";
import { download, progress, sleep } from "../progress.js";
import { t } from "../i18n.js";

export type VideoScene = {
  id: string;
  order: number;
  label?: string;
  durationSec: number;
  html: string;
  timeline?: string;
  narration?: string;
  narrationVoice?: string;
};

/** Lo que devuelven la lista y las escrituras (summary() del servidor). */
export type ProjectSummary = {
  id: string;
  name: string;
  status: "draft" | "rendering" | "ready" | "failed" | string;
  width: number;
  height: number;
  fps: number;
  theme: string;
  sceneCount: number;
  durationSec: number;
  hasAudio: boolean;
  lastRenderUrl: string | null;
  lastRenderFileId: string | null;
  updatedAt: string;
};

export type Project = ProjectSummary & {
  scenes: VideoScene[];
  audioAssetName: string | null;
  assets: Array<{ name: string; url: string }>;
  failReason: string | null;
  lastRenderMs: number | null;
};

// Espejo de app/lib/videoFormats.ts (video.test.ts los compara). El servidor ignora un preset
// desconocido y cae en 1080x1920: aquí se rechaza antes.
export const VIDEO_PRESETS: Record<string, [number, number]> = {
  portrait: [1080, 1920],
  story: [1080, 1920],
  reel: [1080, 1920],
  tiktok: [1080, 1920],
  square: [1080, 1080],
  landscape: [1920, 1080],
  "16-9": [1920, 1080],
  youtube: [1920, 1080],
};
export const VIDEO_THEMES = ["default", "dark", "light", "brand"] as const;
export const VOICES = ["em_santa", "em_alex", "ef_dora"] as const;

/** Cuerpo de POST /video-projects: `--format` es un preset o WxH (100-4096 px). */
export function projectBody(o: { name?: string; format?: string; fps?: string; theme?: string }, usage: string): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (o.name) body.name = o.name;
  if (o.format) {
    if (o.format in VIDEO_PRESETS) body.format = { preset: o.format };
    else {
      const m = /^(\d{3,4})x(\d{3,4})$/i.exec(o.format);
      if (!m || [m[1], m[2]].some((n) => Number(n) < 100 || Number(n) > 4096)) {
        throw usageError(t(`Unknown --format "${o.format}". One of: ${Object.keys(VIDEO_PRESETS).join(", ")}, or WxH (100-4096 px).`, `--format desconocido "${o.format}". Uno de: ${Object.keys(VIDEO_PRESETS).join(", ")}, o WxH (100-4096 px).`), usage);
      }
      body.width = Number(m[1]);
      body.height = Number(m[2]);
    }
  }
  if (o.fps != null) {
    const n = Number(o.fps);
    if (!Number.isInteger(n) || n < 1 || n > 60) throw usageError(t("--fps goes from 1 to 60.", "--fps va de 1 a 60."), usage);
    body.fps = n;
  }
  if (o.theme) {
    if (!(VIDEO_THEMES as readonly string[]).includes(o.theme)) throw usageError(t(`--theme is one of: ${VIDEO_THEMES.join(", ")}.`, `--theme es uno de: ${VIDEO_THEMES.join(", ")}.`), usage);
    body.theme = o.theme;
  }
  return body;
}

/** Escenas en orden. */
export const scenesOf = (p: Pick<Project, "scenes">): VideoScene[] => [...(p.scenes ?? [])].sort((a, b) => a.order - b.order);

/** Una escena por número (1 = la primera) o por id. */
export function sceneRef(scenes: VideoScene[], ref: string, usage: string): VideoScene {
  const byId = scenes.find((s) => s.id === ref);
  if (byId) return byId;
  if (/^\d+$/.test(ref)) {
    const n = Number(ref);
    if (n >= 1 && n <= scenes.length) return scenes[n - 1];
  }
  throw usageError(
    t(`No scene "${ref}" in this project (${scenes.length} scenes: use 1-${scenes.length} or a scene id).`, `No hay escena "${ref}" en este proyecto (${scenes.length} escenas: usa 1-${scenes.length} o el id de la escena).`),
    usage,
  );
}

export function sceneRows(scenes: VideoScene[]) {
  return scenes.map((s, i) => ({ n: i + 1, id: s.id, label: s.label ?? "-", durationSec: s.durationSec, narration: s.narration ? s.narration.slice(0, 40) : "-" }));
}

/**
 * Las banderas de una escena → cuerpo de POST/PATCH. `--timeline` es un archivo que exista o el
 * código GSAP tal cual; `--narration ""` borra la narración. `--duration` en segundos (0.3-120).
 */
export function sceneBody(
  o: { timeline?: string; duration?: string; label?: string; narration?: string; voice?: string },
  usage: string,
  readFile: (p: string) => string | null = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null),
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (o.timeline != null) body.timeline = readFile(o.timeline) ?? o.timeline;
  if (o.duration != null) {
    const n = Number(o.duration);
    if (!Number.isFinite(n) || n < 0.3 || n > 120) throw usageError(t("--duration goes from 0.3 to 120 seconds.", "--duration va de 0.3 a 120 segundos."), usage);
    body.durationSec = n;
  }
  if (o.label != null) body.label = o.label;
  if (o.narration != null) body.narration = o.narration;
  if (o.voice != null) {
    if (!(VOICES as readonly string[]).includes(o.voice)) throw usageError(t(`--voice is one of: ${VOICES.join(", ")}.`, `--voice es una de: ${VOICES.join(", ")}.`), usage);
    body.narrationVoice = o.voice;
  }
  return body;
}

/**
 * Un error del POST de render: ¿falló el render (no tiene caso esperar) o se cayó la conexión
 * (un proxy cortó por tiempo y el render sigue en el servidor)? El servidor responde sus fallas
 * con JSON `{error}`; un 502/503/504 sin JSON es del camino, no del render.
 */
export function renderErrorIsFinal(e: unknown): boolean {
  if (!(e instanceof EasybitsError)) return false; // red caída / abortado: el render puede seguir
  if (e.status < 500) return true;
  try {
    return typeof JSON.parse(e.body)?.error === "string";
  } catch {
    return false;
  }
}

const SIZE = (p: Pick<ProjectSummary, "width" | "height">) => `${p.width}x${p.height}`;
const projectPath = (id: string) => `/video-projects/${encodeURIComponent(id)}`;
const getProject = (ctx: Ctx, id: string) => api<Project>(ctx, "GET", projectPath(id));

/** HTML de un archivo o de stdin (`-`). */
function readHtml(path: string, usage: string): Promise<string> | string {
  if (path === "-") {
    if (process.stdin.isTTY) throw usageError(t("Expected the HTML on stdin.", "Se esperaba el HTML por stdin."), usage);
    return readStdin().then((b) => b.toString("utf8"));
  }
  if (!existsSync(path)) throw usageError(t(`File not found: ${path}`, `No existe el archivo: ${path}`), usage);
  return readFileSync(path, "utf8");
}

/** POST /render con señal para soltarlo (api() no la recibe). */
async function postRender(ctx: Ctx, id: string, signal: AbortSignal): Promise<ProjectSummary & { file: { fileId: string; url: string; renderMs?: number } }> {
  const token = await resolveCredential(ctx);
  const base = (await resolveBaseUrl()).replace(/\/$/, "");
  const res = await fetch(`${base}/api/v2${projectPath(id)}/render`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal });
  const text = await res.text();
  if (!res.ok) throw new EasybitsError(res.status, text);
  return JSON.parse(text);
}

const SCENE_FLAGS = {
  timeline: { type: "string", value: "file|code", description: "GSAP against the paused timeline `tl`: a file, or the code itself" },
  duration: { type: "string", value: "sec", description: "Seconds on screen (default: fits the narration, else 3)" },
  label: { type: "string", value: "name", description: "Scene name" },
  narration: { type: "string", value: "text", description: "Voiceover text, synthesized at render time (\"\" removes it)" },
  voice: { type: "string", value: "id", description: "Narration voice: em_santa (default), em_alex, ef_dora" },
} as const;

const PROJECTS_USAGE = "easybits video projects <ls|get|create|rm> [<project>] [--name N] [--format F] [--fps N] [--theme T]";
const SCENES_USAGE = "easybits video scenes <ls|add|set|rm|reorder> <project> [<scene>] [<file.html|->] [flags]";
const MUSIC_USAGE = "easybits video music set <project> <url|none> [--name FILE]";

export const video: Command = {
  name: "video",
  aliases: ["videos"],
  group: "Content",
  summary: "Video projects: HTML + GSAP scenes with narration and music, rendered to MP4",
  synopsis: "video <projects|scenes|…>",
  subs: {
    projects: {
      summary: "List, show, create or delete video projects",
      usage: PROJECTS_USAGE,
      options: {
        name: { type: "string", value: "name", description: "create: project name" },
        format: { type: "string", value: "preset|WxH", description: "create: portrait (default 1080x1920), square, landscape, story, reel, tiktok, youtube, 16-9, or WxH" },
        fps: { type: "string", value: "n", description: "create: frames per second (default 30)" },
        theme: { type: "string", value: "theme", description: "create: background theme: default, dark, light, brand" },
        ...YES_OPTION,
      },
      examples: [
        "easybits video projects ls",
        'easybits video projects create --name "Promo otoño" --format square --json',
        "easybits video projects get 'Promo otoño'   # scenes, music, last render",
        "easybits video projects rm 'Promo otoño' --yes",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "ls|get|create|rm", PROJECTS_USAGE);
        if (action === "ls" || action === "list") {
          const r = await api<{ total: number; items: ProjectSummary[] }>(ctx, "GET", "/video-projects?limit=100");
          emit(ctx, r, () =>
            table(
              r.items.map((p) => ({ ...p, size: SIZE(p), duration: `${p.durationSec.toFixed(1)}s`, render: p.lastRenderUrl ?? "-", updatedAt: fmtDate(p.updatedAt) })),
              [["id", "ID"], ["name", "NAME"], ["sceneCount", "SCENES"], ["duration", "DURATION"], ["size", "SIZE"], ["status", "STATUS"], ["render", "URL"]],
              t('No video projects yet. Create one: easybits video projects create --name "…"', 'Todavía no hay proyectos de video. Crea uno: easybits video projects create --name "…"'),
            ),
          );
          return;
        }
        if (action === "create" || action === "new") {
          const body = projectBody({ name: str(ctx, "name"), format: str(ctx, "format"), fps: str(ctx, "fps"), theme: str(ctx, "theme") }, PROJECTS_USAGE);
          const { project } = await api<{ project: ProjectSummary }>(ctx, "POST", "/video-projects", body);
          emit(ctx, project, () => {
            console.log(t(`Created ${project.name} (${project.id}) — ${SIZE(project)} @ ${project.fps} fps.`, `Creado ${project.name} (${project.id}) — ${SIZE(project)} a ${project.fps} fps.`));
            console.log(t(`Next: easybits video scenes add ${project.id} scene.html --narration "…"`, `Sigue: easybits video scenes add ${project.id} escena.html --narration "…"`));
          });
          return;
        }
        if (action !== "get" && action !== "rm") throw usageError(t(`Unknown projects action "${action}".`, `Acción de projects desconocida "${action}".`), PROJECTS_USAGE);
        const id = need(ctx, 1, "project", PROJECTS_USAGE);
        if (action === "rm") {
          requireYesIfHeadless(ctx);
          const p = await getProject(ctx, id);
          await confirm(ctx, t(`Delete the video project "${p.name}" (${p.sceneCount} scenes)? Rendered MP4s stay in your files.`, `¿Borrar el proyecto de video "${p.name}" (${p.sceneCount} escenas)? Los MP4 renderizados se quedan en tus archivos.`));
          const r = await api<{ success: boolean }>(ctx, "DELETE", projectPath(id));
          emit(ctx, { ...r, id }, () => console.log(t(`Deleted ${p.name}.`, `Borré ${p.name}.`)));
          return;
        }
        const p = await getProject(ctx, id);
        emit(ctx, p, () => {
          console.log(`${p.name}  (${p.id})`);
          console.log(`${SIZE(p)} @ ${p.fps} fps   ${t("Theme", "Tema")}: ${p.theme}   ${t("Status", "Estado")}: ${p.status}${p.failReason ? ` — ${p.failReason}` : ""}`);
          console.log(`${t("Music", "Música")}: ${p.audioAssetName ?? "-"}   ${t("Duration", "Duración")}: ${p.durationSec.toFixed(1)}s`);
          if (p.lastRenderUrl) console.log(`MP4: ${p.lastRenderUrl}`);
          console.log("");
          table(sceneRows(scenesOf(p)), [["n", "#"], ["id", "ID"], ["label", "NAME"], ["durationSec", "DURATION"], ["narration", "NARRATION"]], t("No scenes yet.", "Todavía no hay escenas."));
        });
      },
    },
    scenes: {
      summary: "List, add, edit, delete or reorder a project's scenes",
      usage: SCENES_USAGE,
      options: {
        ...SCENE_FLAGS,
        after: { type: "string", value: "n", description: "add: insert after scene N (0 = first; default: at the end)" },
        ...YES_OPTION,
      },
      examples: [
        "easybits video scenes ls 'Promo otoño'",
        "easybits video scenes add 'Promo otoño' intro.html --timeline intro.js --narration \"Llegó el otoño\"",
        "easybits video scenes set 'Promo otoño' 2 --duration 4 --voice ef_dora",
        "easybits video scenes set 'Promo otoño' 2 escena2.html   # replace its HTML",
        "easybits video scenes reorder 'Promo otoño' 2 1 3",
        "easybits video scenes rm 'Promo otoño' 3 --yes",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "ls|add|set|rm|reorder", SCENES_USAGE);
        if (!["ls", "add", "set", "rm", "reorder"].includes(action)) throw usageError(t(`Unknown scenes action "${action}".`, `Acción de scenes desconocida "${action}".`), SCENES_USAGE);
        const id = need(ctx, 1, "project", SCENES_USAGE);
        const flags = () => sceneBody({ timeline: str(ctx, "timeline"), duration: str(ctx, "duration"), label: str(ctx, "label"), narration: str(ctx, "narration"), voice: str(ctx, "voice") }, SCENES_USAGE);
        if (action === "add") {
          const body = { ...flags(), html: await readHtml(need(ctx, 2, "file.html|-", SCENES_USAGE), SCENES_USAGE) };
          const after = str(ctx, "after");
          if (after != null) {
            if (!/^\d+$/.test(after)) throw usageError(t("--after must be a scene number (0 = first).", "--after debe ser un número de escena (0 = al inicio)."), SCENES_USAGE);
            (body as Record<string, unknown>).afterIndex = Number(after) - 1;
          }
          const r = await api<{ scene: VideoScene; sceneCount: number }>(ctx, "POST", `${projectPath(id)}/scenes`, body);
          emit(ctx, r, () => console.log(t(`Added ${r.scene.label ?? r.scene.id} (${r.scene.durationSec}s). ${r.sceneCount} scene(s).`, `Agregué ${r.scene.label ?? r.scene.id} (${r.scene.durationSec}s). ${r.sceneCount} escena(s).`)));
          return;
        }
        if (action === "rm") requireYesIfHeadless(ctx);
        const scenes = scenesOf(await getProject(ctx, id));
        if (action === "ls") {
          const rows = sceneRows(scenes);
          emit(ctx, rows, () => table(rows, [["n", "#"], ["id", "ID"], ["label", "NAME"], ["durationSec", "DURATION"], ["narration", "NARRATION"]], t("No scenes yet.", "Todavía no hay escenas.")));
          return;
        }
        if (action === "reorder") {
          const refs = ctx.args.slice(2);
          const ids = refs.map((r) => sceneRef(scenes, r, SCENES_USAGE).id);
          if (ids.length !== scenes.length || new Set(ids).size !== ids.length) {
            throw usageError(t(`Give every scene exactly once (${scenes.length} scenes).`, `Pasa cada escena exactamente una vez (${scenes.length} escenas).`), SCENES_USAGE);
          }
          const r = await api<{ scenes: Array<{ id: string; order: number; label?: string }> }>(ctx, "PUT", `${projectPath(id)}/scenes`, { sceneIds: ids });
          emit(ctx, r, () => table(r.scenes.map((s) => ({ n: s.order + 1, id: s.id, label: s.label ?? "-" })), [["n", "#"], ["id", "ID"], ["label", "NAME"]]));
          return;
        }
        const scene = sceneRef(scenes, need(ctx, 2, "scene", SCENES_USAGE), SCENES_USAGE);
        const n = scenes.indexOf(scene) + 1;
        if (action === "rm") {
          await confirm(ctx, t(`Delete scene ${n} (${scene.label ?? scene.id})?`, `¿Borrar la escena ${n} (${scene.label ?? scene.id})?`));
          const r = await api<{ success: boolean; sceneCount: number }>(ctx, "DELETE", `${projectPath(id)}/scenes/${encodeURIComponent(scene.id)}`);
          emit(ctx, r, () => console.log(t(`Deleted. ${r.sceneCount} scene(s) left.`, `Borrada. Quedan ${r.sceneCount} escena(s).`)));
          return;
        }
        const body = flags();
        if (ctx.args[3]) body.html = await readHtml(ctx.args[3], SCENES_USAGE);
        if (Object.keys(body).length === 0) throw usageError(t("Nothing to change: pass a file.html and/or --timeline, --duration, --label, --narration, --voice.", "Nada que cambiar: pasa un archivo.html y/o --timeline, --duration, --label, --narration, --voice."), SCENES_USAGE);
        const r = await api<{ scene: VideoScene; changed: boolean }>(ctx, "PATCH", `${projectPath(id)}/scenes/${encodeURIComponent(scene.id)}`, body);
        emit(ctx, r, () => console.log(r.changed ? t(`Scene ${n} updated.`, `Escena ${n} actualizada.`) : t("No change: the scene already had that.", "Sin cambios: la escena ya tenía eso.")));
      },
    },
    music: {
      summary: "Set or remove the background music (a public audio URL)",
      usage: MUSIC_USAGE,
      options: { name: { type: "string", value: "file", description: "File name inside the bundle (default: from the URL)" } },
      examples: [
        "easybits video music set 'Promo otoño' https://cdn.example.com/bed.mp3",
        "easybits video music set 'Promo otoño' none   # remove it",
      ],
      async run(ctx) {
        const action = need(ctx, 0, "set", MUSIC_USAGE);
        if (action !== "set") throw usageError(t(`Unknown music action "${action}".`, `Acción de music desconocida "${action}".`), MUSIC_USAGE);
        const id = need(ctx, 1, "project", MUSIC_USAGE);
        const url = need(ctx, 2, "url|none", MUSIC_USAGE);
        const clear = url === "none";
        if (!clear && !/^https?:\/\//.test(url)) throw usageError(t("Give a public http(s) URL (upload a local file first: easybits files upload song.mp3 --public).", "Pasa una URL pública http(s) (sube primero el archivo local: easybits files upload cancion.mp3 --public)."), MUSIC_USAGE);
        const r = await api<ProjectSummary & { audio: { name: string; url: string } | null }>(ctx, "POST", `${projectPath(id)}/audio`, { url: clear ? null : url, name: str(ctx, "name") });
        emit(ctx, r, () => console.log(r.audio ? t(`Music: ${r.audio.name}`, `Música: ${r.audio.name}`) : t("Music removed.", "Música quitada.")));
      },
    },
    render: {
      summary: "Render the project to MP4 on the server; --wait follows it to the end",
      usage: "easybits video render <project> [--wait] [--out FILE.mp4] [--timeout MIN]",
      options: {
        wait: { type: "boolean", description: "Wait for the MP4 (spinner in a terminal); without it, start and return" },
        out: { type: "string", value: "file", description: "With --wait: also download the MP4 here" },
        timeout: { type: "string", value: "min", description: "With --wait: give up after this many minutes (default 15)" },
      },
      examples: [
        "easybits video render 'Promo otoño' --wait --out promo.mp4",
        "easybits video render 'Promo otoño'          # starts it; then:",
        "easybits video projects get 'Promo otoño' --json   # status: rendering → ready | failed",
      ],
      async run(ctx) {
        const id = need(ctx, 0, "project", this.usage);
        const wait = bool(ctx, "wait");
        const out = str(ctx, "out");
        if (out && !wait) throw usageError(t("--out needs --wait.", "--out necesita --wait."), this.usage);
        const minutes = Number(str(ctx, "timeout") ?? 15);
        if (!Number.isFinite(minutes) || minutes <= 0) throw usageError(t("--timeout is minutes, > 0.", "--timeout son minutos, > 0."), this.usage);
        const before = await getProject(ctx, id);
        if (before.sceneCount === 0) throw usageError(t("The project has no scenes: easybits video scenes add …", "El proyecto no tiene escenas: easybits video scenes add …"), this.usage);

        const p = progress(ctx, t(`Rendering ${before.name} (${before.durationSec.toFixed(1)}s of video)…`, `Renderizando ${before.name} (${before.durationSec.toFixed(1)}s de video)…`));
        const ctrl = new AbortController();
        // Si ya hay un render en curso no se dispara otro: sólo se sigue.
        let post: Promise<unknown> | null = null;
        let postDone = false;
        let postResult: unknown = null;
        let postError: unknown = null;
        if (before.status !== "rendering") {
          post = postRender(ctx, id, ctrl.signal).then(
            (r) => ((postDone = true), (postResult = r)),
            (e) => ((postDone = true), (postError = e)),
          );
        }
        try {
          if (!wait) {
            // Esperar a que el servidor lo marque «rendering» (o a que un render corto acabe) y soltar.
            for (let i = 0; i < 30 && !postDone; i++) {
              if ((await getProject(ctx, id)).status === "rendering") break;
              await sleep(1000);
            }
            if (postError && renderErrorIsFinal(postError)) throw postError;
            if (!postDone) ctrl.abort();
            p.stop();
            const state = postResult ? (postResult as ProjectSummary) : await getProject(ctx, id);
            emit(ctx, state, () => {
              if (state.status === "ready" && state.lastRenderUrl) console.log(`MP4: ${state.lastRenderUrl}`);
              else console.log(t(`Rendering on the server. Follow it: easybits video render ${id} --wait`, `Renderizando en el servidor. Síguelo: easybits video render ${id} --wait`));
            });
            return;
          }
          // --wait: el POST es síncrono; si un proxy lo corta, se sigue por el estado del proyecto.
          if (post) await post;
          if (postError && renderErrorIsFinal(postError)) throw postError;
          let final: Project | null = null;
          const deadline = Date.now() + minutes * 60_000;
          while (!postResult) {
            final = await getProject(ctx, id);
            if (final.status !== "rendering") break;
            if (Date.now() > deadline) throw new CliError(t(`Still rendering after ${minutes} min.`, `Sigue renderizando después de ${minutes} min.`), EXIT.API, t(`Check later: easybits video projects get ${id}`, `Revisa luego: easybits video projects get ${id}`));
            p.update(t(`Rendering ${before.name}… (status: ${final.status})`, `Renderizando ${before.name}… (estado: ${final.status})`));
            await sleep(3000);
          }
          const state = (postResult as ProjectSummary) ?? final!;
          if (state.status === "failed" || !state.lastRenderUrl) {
            const reason = (state as Project).failReason ?? (await getProject(ctx, id)).failReason;
            throw new CliError(t(`Render failed: ${reason ?? "unknown"}`, `Falló el render: ${reason ?? "desconocido"}`), EXIT.API);
          }
          let bytes: number | undefined;
          if (out) {
            p.update(t("Downloading the MP4…", "Bajando el MP4…"));
            bytes = await download(state.lastRenderUrl, out);
          }
          p.stop();
          emit(ctx, { ...state, ...(out ? { out, bytes } : {}) }, () => {
            console.log(`MP4: ${state.lastRenderUrl}`);
            if (out) console.log(t(`Saved to ${out}`, `Guardado en ${out}`));
          });
        } finally {
          p.stop();
        }
      },
    },
    ls: {
      aliases: ["list"],
      summary: "List AI-generated videos (prompt → clip), newest first",
      usage: "easybits video ls [--limit N]",
      options: { limit: { type: "string", value: "n", description: "How many (default 50, max 100)" } },
      examples: ["easybits video ls", "easybits video ls --limit 5 --json"],
      async run(ctx) {
        const limit = str(ctx, "limit");
        const r = await api<{ videos: Array<{ id: string; prompt: string; status: string; duration: number; aspectRatio: string; videoFileId: string | null; failReason: string | null; createdAt: string }> }>(ctx, "GET", `/videos${limit ? `?limit=${encodeURIComponent(limit)}` : ""}`);
        emit(ctx, r.videos, () =>
          table(
            r.videos.map((v) => ({ ...v, prompt: v.prompt.slice(0, 40), duration: `${v.duration}s`, createdAt: fmtDate(v.createdAt) })),
            [["id", "ID"], ["prompt", "PROMPT"], ["status", "STATUS"], ["duration", "DURATION"], ["createdAt", "CREATED"]],
            t("No generated videos yet.", "Todavía no hay videos generados."),
          ),
        );
      },
    },
  },
};
