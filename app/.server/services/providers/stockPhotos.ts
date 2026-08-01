/**
 * Búsqueda de fotos de stock en bancos gratuitos.
 *
 * El motor vive en `@easybits.cloud/html-tailwind-generator/images` y encadena
 * **Pexels → Unsplash oficial → Pixabay → Unsplash napi → Openverse**, en ese
 * orden por CALIDAD. Openverse va al final aunque sea el único que no pide
 * llave: sirve fotos CC de Flickr/Sketchfab que valen como red de seguridad pero
 * desentonan como hero.
 *
 * Hasta ahora esto sólo corría por dentro al generar landings y documentos.
 * Aquí se expone como servicio del catálogo para que llegue a la API, al SDK y
 * al MCP.
 *
 * **Todas las llaves son de plataforma y opcionales.** Sin ninguna configurada
 * la cadena sigue respondiendo por Openverse, así que el servicio nunca queda
 * inservible por falta de configuración — a diferencia de Brightdata o
 * ElevenLabs, que lanzan `ServiceConfigError`.
 */
import { searchStockPhoto } from "@easybits.cloud/html-tailwind-generator/images";
import { ServiceProviderError } from "../errors";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";
import { uploadPublicImage } from "../uploadImage";
import { CREDIT_SCALE } from "~/lib/credits";

const SERVICE_ID = "image.stock.search";

/** Tope de la descarga cuando `save` está activo. Un hero de banco ronda 1-3 MB. */
const MAX_BYTES = 25 * 1024 * 1024;

export interface StockPhotoSearchInput {
  query: string;
  /** Baja la foto al storage del usuario y devuelve además un `fileId`. */
  save?: boolean;
}

export interface StockPhotoSearchOutput extends ServiceResult {
  data: {
    url: string;
    alt: string;
    photographer: string;
    provider: string;
    sourceUrl?: string;
    /** Sólo con `save: true`. */
    fileId?: string;
    /** Sólo con `save: true`: la copia en el storage del usuario. */
    savedUrl?: string;
    attribution: string;
  };
}

export const stockPhotoSearchService: ServiceDef<
  StockPhotoSearchInput,
  StockPhotoSearchOutput
> = {
  id: SERVICE_ID,
  product: "image",
  displayName: "Stock photo search (Pexels/Unsplash/Pixabay/Openverse)",
  description:
    "Busca una foto de stock libre de regalías en varios bancos gratuitos y devuelve su URL, " +
    "con opción de guardarla en la biblioteca del usuario.",

  estimateCost: () => 1 * CREDIT_SCALE,

  async execute(input, ctx: ServiceCtx): Promise<StockPhotoSearchOutput> {
    const query = input.query?.trim();
    if (!query) {
      throw new ServiceProviderError(SERVICE_ID, 400, "query is required");
    }

    const photo = await searchStockPhoto(query, {
      pexelsApiKey: process.env.PEXELS_API_KEY,
      unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY,
      pixabayApiKey: process.env.PIXABAY_API_KEY,
    });

    // Ningún banco encontró nada. En la práctica casi no ocurre: el buscador de
    // Pexels es difuso y devuelve algo hasta para una consulta sin sentido, así
    // que este camino cubre sobre todo un fallo de red de TODA la cadena.
    //
    // El corolario incómodo: una consulta mala no falla, devuelve una foto
    // irrelevante — y ya se cobró el crédito. No hay forma fiable de detectarlo
    // aquí (haría falta juicio semántico), así que se expone `alt` para que
    // quien llama juzgue la relevancia; la tool MCP lo pide explícitamente.
    if (!photo) {
      throw new ServiceProviderError(
        SERVICE_ID,
        404,
        `Ningún banco encontró resultados para "${query}"`,
      );
    }

    const attribution = photo.sourceUrl
      ? `Foto de ${photo.photographer} en ${photo.provider} (${photo.sourceUrl})`
      : `Foto de ${photo.photographer} en ${photo.provider}`;

    const data: StockPhotoSearchOutput["data"] = {
      url: photo.url,
      alt: photo.alt,
      photographer: photo.photographer,
      provider: photo.provider,
      sourceUrl: photo.sourceUrl,
      attribution,
    };

    if (input.save) {
      const res = await fetch(photo.url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        throw new ServiceProviderError(
          SERVICE_ID,
          res.status,
          `no se pudo descargar la foto de ${photo.provider}`,
        );
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_BYTES) {
        throw new ServiceProviderError(
          SERVICE_ID,
          413,
          `la foto pesa ${Math.round(buffer.length / 1024 / 1024)} MB (máximo ${MAX_BYTES / 1024 / 1024})`,
        );
      }
      // El content-type sale del banco. Casi siempre es JPEG — asumir PNG,
      // como hacía el helper original, dejaba archivos mal etiquetados.
      const contentType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      const saved = await uploadPublicImage(ctx.userId, buffer, {
        contentType,
        source: photo.provider,
        name: photo.alt || query,
        serviceId: SERVICE_ID,
      });
      data.fileId = saved.fileId;
      data.savedUrl = saved.imageUrl;
    }

    return { modelId: photo.provider, data };
  },
};
