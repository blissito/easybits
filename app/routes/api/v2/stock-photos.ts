import type { Route } from "./+types/stock-photos";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { consumeService } from "~/.server/services/consume";
import type { StockPhotoSearchOutput } from "~/.server/services/providers/stockPhotos";

/**
 * GET /api/v2/stock-photos?q=...&save=true
 *
 * Busca una foto libre de regalías en los bancos gratuitos encadenados
 * (Pexels → Unsplash → Pixabay → Openverse) y devuelve su URL.
 *
 * Con `save=true` además la baja a la biblioteca del usuario y devuelve `fileId`
 * — por eso ese caso exige scope `WRITE`, mientras que la búsqueda a secas no.
 *
 * Cuesta 1 crédito, cobrado por `consumeService`. Eso hace de limitador: la
 * llave de los bancos es compartida entre todos los usuarios, así que sin un
 * costo un solo cliente podría agotar el rate limit de Pexels y degradar también
 * la generación interna de documentos.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const url = new URL(request.url);

  const query = url.searchParams.get("q") || "";
  if (!query) {
    return Response.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 },
    );
  }

  const save = url.searchParams.get("save") === "true";
  if (save) requireScope(ctx, "WRITE");

  const result = await consumeService<StockPhotoSearchOutput>(
    "image.stock.search",
    { query, save },
    { userId: ctx.user.id },
  );
  return Response.json(result.data);
}
