/**
 * Artifact operations — la capa de "artefacto vivo con identidad + versiones" del sistema
 * kind-pluggable (plan fuzzy-wibbling-allen). Fase 1: kind `doc`, respaldado por un
 * Landing v4 (documentId = artifactId). `create` nace la v1; `update` aplica contenido
 * nuevo al MISMO documentId → **nueva versión** (snapshot del contenido previo en
 * `metadata.sectionVersions`, contador en `metadata.artifact.version`). Esto es el
 * edit-in-place: "modifícalo" avanza de versión, no crea un doc nuevo.
 *
 * Reusa `createDocument`/`updateDocument`/`getDocument` (documentOperations); aquí solo
 * va la semántica de artefacto + el versionado server-side (que el editor cliente hoy
 * hace por su cuenta; lo movemos al server para que el agente también versione).
 */
import { nanoid } from "nanoid";
import { marked } from "marked";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { createDocument, updateDocument, getDocument } from "./documentOperations";

export type ArtifactKind = "doc";

// Envuelve el HTML como sección de PROSA que fluye (misma que el editor colab / from-office):
// paginación natural en PDF (no recorte a 11in fijo) + editable en BlockNote.
function wrapFlow(innerHtml: string): string {
  return `<section data-doc-flow="1" class="w-[8.5in] min-h-[11in] p-16 bg-surface text-on-surface leading-relaxed">${innerHtml}</section>`;
}

async function toInnerHtml(opts: { markdown?: string; html?: string }): Promise<string | null> {
  if (opts.html && opts.html.trim()) return opts.html;
  if (opts.markdown && opts.markdown.trim()) return String(await marked.parse(opts.markdown));
  return null;
}

export type ArtifactRef = {
  artifactId: string;
  kind: ArtifactKind;
  version: number;
  title: string;
};

/** Crea un artefacto `doc` (v1). Devuelve la identidad estable (artifactId = documentId). */
export async function createArtifact(
  ctx: AuthContext,
  opts: { kind?: ArtifactKind; title?: string; markdown?: string; html?: string }
): Promise<ArtifactRef> {
  const inner = (await toInnerHtml(opts)) ?? "<p></p>";
  const doc = await createDocument(ctx, {
    name: (opts.title || "Documento").slice(0, 120),
    sections: [{ id: nanoid(12), order: 0, html: wrapFlow(inner), type: "artifact", name: "Página 1" }],
  });
  const meta = ((doc as { metadata?: Record<string, unknown> }).metadata) || {};
  await db.landing
    .update({ where: { id: doc.id }, data: { metadata: { ...meta, artifact: { kind: "doc", version: 1 } } } })
    .catch(() => {});
  return { artifactId: doc.id, kind: "doc", version: 1, title: doc.name };
}

/**
 * Actualiza el contenido del artefacto → NUEVA VERSIÓN sobre el MISMO documentId.
 * Snapshotea el contenido previo en `metadata.sectionVersions[sectionId]` (mismo shape
 * que usa `PageList` → el selector de versiones del editor lo lee) y sube el contador.
 */
export async function updateArtifact(
  ctx: AuthContext,
  id: string,
  opts: { markdown?: string; html?: string }
): Promise<ArtifactRef> {
  const doc = await getDocument(ctx, id); // verifica ownership + version===4
  const inner = await toInnerHtml(opts);
  if (!inner) throw new Error("artifact_update requiere markdown o html");

  const sections = ((doc.sections as Array<Record<string, unknown>>) || []);
  const first = sections[0] || { id: "page-1", order: 0, html: "" };
  const key = (first.id as string) || "page-1";

  const meta = ((doc.metadata as Record<string, unknown>) || {});
  const sv = { ...((meta.sectionVersions as Record<string, Array<{ html: string; timestamp: number }>>) || {}) };
  // Snapshot del HTML previo ANTES de aplicar el cambio (cap 20).
  const prevHtml = (first.html as string) || "";
  sv[key] = [...(sv[key] || []), { html: prevHtml, timestamp: Date.now() }].slice(-20);
  const version = (((meta.artifact as { version?: number })?.version) || 1) + 1;

  await updateDocument(ctx, id, {
    sections: [{ id: key, order: (first.order as number) ?? 0, html: wrapFlow(inner) }],
  });
  await db.landing
    .update({
      where: { id },
      data: { metadata: { ...meta, sectionVersions: sv, artifact: { kind: "doc", version } } },
    })
    .catch(() => {});

  return { artifactId: id, kind: "doc", version, title: doc.name };
}

/** Estado del artefacto (identidad + versión actual + share url). */
export async function getArtifact(ctx: AuthContext, id: string): Promise<ArtifactRef & { shareUrl: string | null }> {
  const doc = await getDocument(ctx, id, { includeHtml: false });
  const meta = ((doc.metadata as Record<string, unknown>) || {});
  const art = (meta.artifact as { kind?: ArtifactKind; version?: number }) || {};
  return {
    artifactId: id,
    kind: art.kind || "doc",
    version: art.version || 1,
    title: doc.name,
    shareUrl: (doc as { shareUrl?: string | null }).shareUrl ?? null,
  };
}
