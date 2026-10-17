import { test } from "node:test";
import assert from "node:assert/strict";
import { EasybitsError } from "@easybits.cloud/sdk";
import { VIDEO_PRESETS, projectBody, renderErrorIsFinal, sceneBody, sceneRef, sceneRows, scenesOf } from "./commands/video.ts";
import { REF_ARGS } from "./refs.ts";

const u = "usage";
const project = {
  scenes: [
    { id: "s-2", order: 1, durationSec: 4, html: "<div/>", label: "Oferta", narration: "Treinta por ciento en toda la tienda" },
    { id: "s-1", order: 0, durationSec: 3, html: "<div/>", label: "Intro" },
  ],
};

test("escenas en orden, por número (1 = la primera) o por id", () => {
  const scenes = scenesOf(project);
  assert.deepEqual(scenes.map((s) => s.id), ["s-1", "s-2"]);
  assert.equal(sceneRef(scenes, "2", u).id, "s-2");
  assert.equal(sceneRef(scenes, "s-1", u).id, "s-1");
  assert.throws(() => sceneRef(scenes, "3", u), /1-2/);
  assert.deepEqual(sceneRows(scenes).map((r) => [r.n, r.label, r.narration]), [[1, "Intro", "-"], [2, "Oferta", "Treinta por ciento en toda la tienda"]]);
});

test("create: preset o WxH, fps y tema se validan antes de la API", () => {
  assert.deepEqual(projectBody({ name: "Promo", format: "square" }, u), { name: "Promo", format: { preset: "square" } });
  assert.deepEqual(projectBody({ format: "1280x720", fps: "24", theme: "dark" }, u), { width: 1280, height: 720, fps: 24, theme: "dark" });
  assert.throws(() => projectBody({ format: "vertical" }, u), /vertical/);
  assert.throws(() => projectBody({ format: "99x720" }, u), /4096/);
  assert.throws(() => projectBody({ fps: "120" }, u), /60/);
  assert.throws(() => projectBody({ theme: "neon" }, u), /brand/);
});

test("presets del CLI = los del servidor (app/lib/videoFormats.ts)", async () => {
  const { VIDEO_FORMAT_PRESETS } = await import("../../app/lib/videoFormats.ts");
  assert.deepEqual(VIDEO_PRESETS, VIDEO_FORMAT_PRESETS);
});

test("banderas de escena: --timeline archivo o código, --narration \"\" la borra, voz y duración validadas", () => {
  const files: Record<string, string> = { "intro.js": "tl.from('#t',{opacity:0})" };
  const read = (p: string) => files[p] ?? null;
  assert.deepEqual(sceneBody({ timeline: "intro.js" }, u, read), { timeline: "tl.from('#t',{opacity:0})" });
  assert.deepEqual(sceneBody({ timeline: "tl.to('#x',{x:100})" }, u, read), { timeline: "tl.to('#x',{x:100})" });
  assert.deepEqual(sceneBody({ narration: "", duration: "2.5", voice: "ef_dora", label: "Cierre" }, u, read), { narration: "", durationSec: 2.5, narrationVoice: "ef_dora", label: "Cierre" });
  assert.throws(() => sceneBody({ voice: "alloy" }, u, read), /em_santa/);
  assert.throws(() => sceneBody({ duration: "500" }, u, read), /120/);
  assert.deepEqual(sceneBody({}, u, read), {});
});

test("render: un fallo del servidor es final; un corte del proxy o de la red se sigue por el estado", () => {
  assert.equal(renderErrorIsFinal(new EasybitsError(400, '{"error":"Add at least one scene before rendering"}')), true);
  assert.equal(renderErrorIsFinal(new EasybitsError(502, '{"error":"hyperframes box timed out"}')), true);
  assert.equal(renderErrorIsFinal(new EasybitsError(504, "<html>Gateway Timeout</html>")), false);
  assert.equal(renderErrorIsFinal(new EasybitsError(502, "")), false);
  assert.equal(renderErrorIsFinal(new TypeError("fetch failed")), false);
});

test("el proyecto se acepta por nombre en cada subcomando que lo toma", () => {
  for (const k of ["video projects", "video scenes", "video music"]) assert.deepEqual(REF_ARGS[k], { index: 1, kind: "video" }, k);
  assert.deepEqual(REF_ARGS["video render"], { index: 0, kind: "video" });
});
