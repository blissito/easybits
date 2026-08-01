import {
  searchImage as _searchImage,
  type PexelsResult,
} from "@easybits.cloud/html-tailwind-generator/images";

export type { PexelsResult };

/**
 * Llaves de plataforma de los bancos de fotos. **Ninguna es obligatoria**: sin
 * ellas la cadena del SDK cae a Openverse, que no pide llave.
 *
 * Se centralizan aquí para que los ~12 call sites internos (documentos,
 * presentaciones, landings) hereden la cadena completa, en vez de pasar sólo la
 * de Pexels — que era lo que hacían y dejaba fuera a Unsplash y Pixabay.
 */
export function stockPhotoKeys() {
  return {
    pexelsApiKey: process.env.PEXELS_API_KEY,
    unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY,
    pixabayApiKey: process.env.PIXABAY_API_KEY,
  };
}

/**
 * Busca una foto de stock. El nombre del archivo es histórico: ya no es sólo
 * Pexels — encadena Pexels → Unsplash → Pixabay → Openverse.
 */
export async function searchImage(query: string): Promise<PexelsResult | null> {
  return _searchImage(query, stockPhotoKeys());
}
