import type { Route } from "./+types/machines-tiers";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  HOSTING_CATALOG,
  SELLABLE_TIERS,
  DISK_ADDON_GB,
  DISK_ADDON_PRICE,
} from "~/lib/hostingCatalog";

// GET /api/v2/machines/tiers — public-ish catalog (READ scope).
export async function loader({ request }: Route.LoaderArgs) {
  requireAuth(await authenticateRequest(request));
  return Response.json({
    tiers: SELLABLE_TIERS.map((k) => HOSTING_CATALOG[k]),
    diskAddon: { gb: DISK_ADDON_GB, price: DISK_ADDON_PRICE },
  });
}
