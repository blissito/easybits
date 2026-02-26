import { db } from "~/.server/db";

// GET /api/health — public health check
export async function loader() {
  let dbStatus = "disconnected";
  try {
    await db.user.findFirst({ select: { id: true } });
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
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
