import { decode, encode } from 'cbor-x';
import { customType } from 'drizzle-orm/sqlite-core';

// Columna BLOB con CBOR: preserva Uint8Array, Date, undefined y null,
// que es lo que viaja en input/output/eventData del runtime.
export function Cbor<T = unknown>() {
  return customType<{ data: T; driverData: Uint8Array | null }>({
    dataType: () => 'blob',
    fromDriver: (value): T => {
      if (value === null || value === undefined) return undefined as T;
      const buf = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      if (buf.length === 0) return undefined as T;
      return decode(buf) as T;
    },
    toDriver: (value): Uint8Array => {
      if (value === undefined) return Buffer.alloc(0);
      return Buffer.from(encode(value));
    },
  });
}
