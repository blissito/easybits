/**
 * Spike DESECHABLE — ¿aguanta Gemini structured-output el conteo de filas?
 *
 * Pregunta única: ¿filas que entran == filas que salen, cero inventadas?
 * NO produce template, NO toca DB, NO escribe nada en prod. Solo el número.
 *
 * Run: npx tsx scripts/derive-template-spike.ts "/ruta/al.pdf"
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const MODEL = "gemini-2.5-pro";

// ── Schema tipado y cerrado (additionalProperties:false vía .strict) ──────────
const Schema = z
  .object({
    docType: z.string().describe("tipo de documento, ej. 'orden del día'"),
    title: z.string(),
    // KV fields de la portada (fecha, hora, código de vestimenta, sede)
    fields: z
      .array(z.object({ label: z.string(), value: z.string() }).strict())
      .describe("campos clave-valor de la portada"),
    // BLOQUE REPETIBLE 1 — la agenda. Una entrada por bloque de horario.
    agenda: z
      .array(
        z
          .object({
            time: z.string().describe("rango horario tal cual aparece, ej. '08:50 - 09:05'"),
            title: z.string(),
            detail: z.string().describe("texto secundario/ponente; '' si no hay"),
            sourceText: z
              .string()
              .describe("TEXTO VERBATIM copiado del documento para esta fila — para verificar grounding"),
          })
          .strict()
      )
      .describe("TODOS los bloques de horario. NO inventes, NO omitas ninguno."),
    // BLOQUE REPETIBLE 2 — tarjetas de personal (foto + nombre + cargo).
    personnel: z
      .array(
        z
          .object({
            group: z.string().describe("encabezado de sección al que pertenece la tarjeta"),
            name: z.string(),
            role: z.string(),
          })
          .strict()
      )
      .describe("TODAS las tarjetas de personal. NO inventes, NO omitas ninguna."),
  })
  .strict();

const SYSTEM = `Eres un extractor de documentos institucionales. Tu salida alimenta datos de gobierno: la fidelidad es absoluta.
REGLAS DURAS:
- NO inventes filas, nombres, horarios ni cargos. Si no está en la imagen, no existe.
- NO omitas ninguna fila de la agenda ni ninguna tarjeta de personal. Cuéntalas todas.
- Copia el texto tal cual (mismo idioma, mismos acentos). En sourceText pega el texto verbatim de esa fila.
- Si un bloque de horario abarca varias páginas, sigue contando; no reinicies.`;

// ── Rasterizar PDF → PNG por página ──────────────────────────────────────────
async function rasterize(pdfPath: string): Promise<Buffer[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spike-"));
  const prefix = path.join(dir, "page");
  await execFileAsync("pdftoppm", ["-png", "-scale-to-x", "1400", "-scale-to-y", "-1", pdfPath, prefix], {
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => parseInt(a.replace(/\D+/g, ""), 10) - parseInt(b.replace(/\D+/g, ""), 10));
  const bufs = await Promise.all(files.map((f) => fs.readFile(path.join(dir, f))));
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  return bufs;
}

// ── Ground truth barato desde el text layer ───────────────────────────────────
async function groundTruth(pdfPath: string): Promise<{ text: string; timeRanges: string[] }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spike-txt-"));
  const out = path.join(dir, "t.txt");
  await execFileAsync("pdftotext", ["-layout", pdfPath, out], { timeout: 60_000 }).catch(() => {});
  const text = await fs.readFile(out, "utf8").catch(() => "");
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  // rangos "HH:MM - HH:MM" y horas sueltas al inicio de bloque
  const ranges = [...text.matchAll(/\b\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\b/g)].map((m) => m[0]);
  return { text, timeRanges: ranges };
}

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) throw new Error("Uso: npx tsx scripts/derive-template-spike.ts '/ruta/al.pdf'");
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error("Falta GOOGLE_GENERATIVE_AI_API_KEY en env");

  console.log(`\n🔬 Spike derive-template — ${path.basename(pdfPath)}\n`);

  const [pages, gt] = await Promise.all([rasterize(pdfPath), groundTruth(pdfPath)]);
  console.log(`📄 ${pages.length} páginas rasterizadas`);
  console.log(`📐 ground truth (text layer): ${gt.timeRanges.length} rangos horarios detectados`);
  if (gt.timeRanges.length) console.log(`   ${gt.timeRanges.join("  ·  ")}\n`);

  const t0 = Date.now();
  const { object, usage } = await generateObject({
    model: google(MODEL),
    schema: Schema,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text" as const, text: "Extrae TODO el documento al schema. Cuenta cada fila de agenda y cada tarjeta de personal." },
          ...pages.map((b) => ({ type: "image" as const, image: b })),
        ],
      },
    ],
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Reporte ─────────────────────────────────────────────────────────────────
  console.log(`\n⏱  ${secs}s · tokens in/out: ${usage?.inputTokens}/${usage?.outputTokens}\n`);
  console.log(`📋 docType: ${object.docType}`);
  console.log(`🏷  title:   ${object.title}`);
  console.log(`🔑 fields:  ${object.fields.length}`);
  object.fields.forEach((f) => console.log(`      · ${f.label}: ${f.value}`));

  console.log(`\n📅 AGENDA — extraídas ${object.agenda.length} filas (ground truth ≈ ${gt.timeRanges.length}):`);
  object.agenda.forEach((r, i) => console.log(`   ${String(i + 1).padStart(2)}. ${r.time.padEnd(16)} ${r.title.slice(0, 60)}`));

  console.log(`\n👥 PERSONAL — extraídas ${object.personnel.length} tarjetas:`);
  object.personnel.forEach((p, i) =>
    console.log(`   ${String(i + 1).padStart(2)}. [${p.group.slice(0, 28)}] ${p.name} — ${p.role.slice(0, 40)}`)
  );

  // ── Veredicto: la única métrica que importa ───────────────────────────────────
  const gtRows = gt.timeRanges.length;
  const exRows = object.agenda.length;
  const delta = exRows - gtRows;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`VEREDICTO — conteo de filas de agenda:`);
  console.log(`   ground truth (text layer): ${gtRows}`);
  console.log(`   extraído por Gemini:       ${exRows}`);
  if (delta === 0) console.log(`   ✅ PARIDAD EXACTA — la base aguanta. Procede.`);
  else if (delta > 0) console.log(`   ⚠️  +${delta} filas DE MÁS — posible invención o sub-split. Revisar manualmente.`);
  else console.log(`   ❌ ${delta} filas FALTANTES — tiró filas. Considerar parser dedicado (Textract/Doc AI).`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\nNota: el text layer puede contar distinto a las filas visuales (rangos partidos,`);
  console.log(`horas sueltas sin rango). El conteo definitivo es ojo-humano contra esta lista.\n`);
}

main().catch((e) => {
  console.error("💥", e);
  process.exit(1);
});
