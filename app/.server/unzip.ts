/**
 * Lector de ZIP mínimo (servidor) — suficiente para desempaquetar un skill.
 *
 * Lee el directorio central (no los local headers: los que escribe macOS pueden
 * traer tamaños en el data descriptor y quedarse en cero ahí) y descomprime con
 * `zlib.inflateRawSync` cuando el método es DEFLATE (8) — que es lo que produce
 * "Comprimir" de macOS y cualquier zip normal. El método 0 (store) va tal cual.
 *
 * Sin dependencias: `jszip`/`fflate` sólo existen aquí como transitivas de otras
 * librerías, y apoyarse en eso es apoyarse en algo que un `npm update` ajeno puede
 * llevarse. No soporta ZIP64 ni cifrado.
 */
import { inflateRawSync } from "node:zlib";

export type UnzipEntry = { path: string; bytes: Buffer };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

export function unzip(buf: Buffer): UnzipEntry[] {
  // El End Of Central Directory vive al final; puede llevar comentario, así que se
  // busca hacia atrás (máx. 64KB de comentario).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("no parece un archivo .zip");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // offset del directorio central
  const out: UnzipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const path = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (path.endsWith("/")) continue; // carpeta
    // El tamaño de los campos variables del LOCAL header manda para localizar los
    // datos: no tiene por qué coincidir con el del central.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    let bytes: Buffer;
    if (method === 0) bytes = Buffer.from(raw);
    else if (method === 8) bytes = inflateRawSync(raw);
    else throw new Error(`compresión no soportada en ${path}`);
    out.push({ path, bytes });
  }
  return out;
}

/** Descarta la basura de los zips de macOS y las carpetas ocultas. */
export function isUsefulSkillFile(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return !path.startsWith("__MACOSX/") && !base.startsWith(".") && base.length > 0;
}
