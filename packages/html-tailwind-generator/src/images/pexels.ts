import { searchStockPhoto, type StockPhotoKeys } from "./stockPhotos";

export interface PexelsResult {
  url: string;
  photographer: string;
  alt: string;
}

/**
 * Busca una foto de stock. **El nombre del archivo es histórico**: hoy esto
 * encadena varios bancos (Pexels → Unsplash oficial → Pixabay → Openverse), no
 * sólo Pexels. La lógica vive en `stockPhotos.ts`.
 *
 * Se conserva la firma `(query, apiKey)` porque hay llamadas existentes que
 * pasan la llave de Pexels como string. El segundo argumento acepta además el
 * objeto de llaves completo, que es lo que activa el resto de la cadena.
 */
export async function searchImage(
  query: string,
  apiKeyOrKeys?: string | StockPhotoKeys
): Promise<PexelsResult | null> {
  const keys: StockPhotoKeys =
    typeof apiKeyOrKeys === "string"
      ? { pexelsApiKey: apiKeyOrKeys }
      : (apiKeyOrKeys ?? {});
  const photo = await searchStockPhoto(query, keys);
  return photo
    ? { url: photo.url, photographer: photo.photographer, alt: photo.alt }
    : null;
}

export {
  searchStockPhoto,
  type StockPhoto,
  type StockPhotoKeys,
} from "./stockPhotos";
