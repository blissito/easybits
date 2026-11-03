import type { Route } from "./+types/machines-tiers";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  HOSTING_CATALOG,
  SELLABLE_TIERS,
  DISK_ADDON_GB,
  DISK_ADDON_PRICE,
} from "~/lib/hostingCatalog";
import { assertCanSellHosting } from "~/.server/core/machineOperations";

// GET /api/v2/machines/tiers — catálogo INTERNO: sólo staff (casa o agencia con cortesía).
// El hosting es por cotización; para cualquier otro responde 403 HostingByQuote.
export async function loader({ request }: Route.LoaderArgs) {
  assertCanSellHosting(requireAuth(await authenticateRequest(request)));
  return Response.json({
    tiers: SELLABLE_TIERS.map((k) => HOSTING_CATALOG[k]),
    diskAddon: { gb: DISK_ADDON_GB, price: DISK_ADDON_PRICE },
  });
}
