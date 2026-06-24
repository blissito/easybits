import { db } from "~/.server/db";
import { initSentry } from "~/.server/sentry";

// GET /api/health — public health check
export async function loader() {
  initSentry();
  let dbStatus = "disconnected";
  try {
    await db.user.findFirst({ select: { id: true } });
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }

  // Auto-relevantar los pools de WhatsApp tras un reinicio del app: Fly pega
  // este endpoint cada 30s, así que reconectamos los sockets Baileys (creds en
  // DB) ~30s después de cada deploy SIN que nadie abra el dashboard. Idempotente
  // (singleton interno) y fire-and-forget para no demorar el health check.
  if (dbStatus === "connected") {
    import("~/.server/integrations/whatsapp/baileys.server")
      .then((m) => m.ensureRehydrated())
      .catch(() => {});
  }

  const status = dbStatus === "connected" ? "ok" : "degraded";

  return Response.json(
    {
      status,
      db: dbStatus,
      uptime: Math.floor(process.uptime()),
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
