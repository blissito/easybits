import type { Route } from "./+types/pools.poll";
import { loader as fleetLoader } from "./pools";

// Live HUD poll endpoint for /dash/flota. Reuses the page's loader on the server
// to return the SAME payload, as plain JSON, so the client can poll it with a raw
// `fetch` and swallow transient failures (deploy/restart window) without bubbling
// to the route ErrorBoundary. This route has no component → server-only, so it
// never pulls pools.tsx's client code into a browser bundle. Auth is enforced by
// the reused loader → getUserOrRedirect.
export async function loader(args: Route.LoaderArgs) {
  return Response.json(await fleetLoader(args as any));
}
