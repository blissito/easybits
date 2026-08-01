/**
 * Guardar una imagen en el storage público del usuario.
 *
 * Extraído de `providers/openai.ts`, donde nació como `uploadPublicPng` y estaba
 * clavado a PNG y a `source: "openai"`. Lo comparten ahora el generador de
 * imágenes y la búsqueda de fotos de stock — que devuelve JPEG, así que el
 * content-type tenía que dejar de ser una constante.
 *
 * Lo que NO es obvio y por eso vive aquí una sola vez: el `storageKey` tiene un
 * índice único (`File_storageKey_key`), así que dos archivos con el mismo nombre
 * revientan con un 500 crudo. Se resuelve en dos frentes — un pre-check que
 * auto-sufija (-1, -2…) y un retry por `P2002` para la carrera TOCTOU entre dos
 * creates paralelos que eligieron la misma key.
 */
import { nanoid } from "nanoid";
import { db } from "../db";
import { buildPublicAssetUrl, getPlatformPublicClient } from "../storage";
import { ServiceProviderError } from "./errors";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function slugify(name: string, fallbackPrefix: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || `${fallbackPrefix}-${nanoid(6)}`
  );
}

async function resolveUniqueStorageKey(
  userId: string,
  base: string,
  ext: string,
): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const suffix = n === 0 ? "" : `-${n}`;
    const key = `${userId}/${base}${suffix}.${ext}`;
    const existing = await db.file.findUnique({
      where: { storageKey: key },
      select: { id: true },
    });
    if (!existing) return key;
  }
  // Patológico: 50 colisiones. Key aleatoria garantizada.
  return `${userId}/${base}-${nanoid(6)}.${ext}`;
}

export async function uploadPublicImage(
  userId: string,
  buffer: Buffer,
  opts: {
    contentType: string;
    /** `File.source` — de dónde vino ("openai", "pexels", "unsplash"…). */
    source: string;
    name?: string;
    /** Id del servicio, sólo para que los errores digan quién falló. */
    serviceId: string;
  },
): Promise<{ fileId: string; imageUrl: string }> {
  const ext = EXT_BY_TYPE[opts.contentType.toLowerCase()] ?? "jpg";
  const base = slugify(opts.name || `${opts.source}-${nanoid(6)}`, opts.source);
  const client = getPlatformPublicClient();

  let storageKey = await resolveUniqueStorageKey(userId, base, ext);
  for (let attempt = 0; attempt < 2; attempt++) {
    const putUrl = await client.getPutUrl(storageKey, { timeout: 120 });
    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers: { "Content-Type": opts.contentType },
    });
    if (!putRes.ok) {
      throw new ServiceProviderError(
        opts.serviceId,
        putRes.status,
        "upload: Tigris public put failed",
      );
    }
    const imageUrl = buildPublicAssetUrl(storageKey);
    try {
      const file = await db.file.create({
        data: {
          name: `${base}.${ext}`,
          storageKey,
          slug: storageKey,
          size: buffer.length,
          contentType: opts.contentType,
          ownerId: userId,
          access: "public",
          url: imageUrl,
          status: "DONE",
          source: opts.source,
        },
      });
      return { fileId: file.id, imageUrl };
    } catch (e: any) {
      if (e?.code === "P2002" && attempt === 0) {
        storageKey = `${userId}/${base}-${nanoid(6)}.${ext}`;
        continue;
      }
      throw new ServiceProviderError(
        opts.serviceId,
        null,
        `save failed: ${e?.message || "db.file.create"}`,
      );
    }
  }
  throw new ServiceProviderError(
    opts.serviceId,
    null,
    "save failed: exhausted retries",
  );
}
