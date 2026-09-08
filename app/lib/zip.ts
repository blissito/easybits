/**
 * ZIP mínimo (método "store", sin compresión) en el navegador — sin dependencias.
 *
 * Se usa para entregar plantillas de varios archivos (p. ej. un skill: SKILL.md +
 * sus scripts). `jszip`/`fflate` existen en node_modules pero sólo como dependencias
 * TRANSITIVAS de otras librerías: apoyarse en ellas es apoyarse en algo que puede
 * desaparecer con un `npm update` ajeno. Un ZIP "store" son tres estructuras y un
 * CRC32; para unos KB de texto no vale la pena comprimir ni añadir un paquete.
 *
 * Acepta texto UTF-8 o bytes (para adjuntar archivos ya subidos). Rutas ASCII.
 * No soporta ZIP64.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { path: string; content: string | Uint8Array };

export function zipStore(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

  for (const { path, content } of entries) {
    const name = enc.encode(path);
    const data = typeof content === "string" ? enc.encode(content) : content;
    const crc = crc32(data);
    // Local file header + nombre + datos.
    const local = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), // hora/fecha: 0 = 1980-01-01, irrelevante en una plantilla
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0),
    ]);
    chunks.push(local, name, data);
    central.push(Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
    ]), name);
    offset += local.length + name.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);

  // `Uint8Array` puede tipar su buffer como SharedArrayBuffer; BlobPart exige
  // ArrayBuffer, así que copiamos a un buffer plano.
  const parts = [...chunks, ...central, end].map((u) => u.slice().buffer as ArrayBuffer);
  return new Blob(parts, { type: "application/zip" });
}
