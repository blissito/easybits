import { z } from "zod";
import { db } from "./db";

// Modelo TypeScript para un evento de telemetría
export interface TelemetryEvent {
  ownerId: string;
  assetId?: string;
  linkType: "store" | "assetDetail" | "website";
  eventType: "visit";
  timestamp: Date;
  sessionId?: string;
  ip?: string;
  metadata?: Record<string, any>;
}

// Schema Zod para validación
export const TelemetryEventSchema = z.object({
  ownerId: z.string(),
  assetId: z.string().optional(),
  linkType: z.union([z.literal("store"), z.literal("assetDetail"), z.literal("website")]),
  eventType: z.literal("visit"),
  timestamp: z.coerce.date(),
  sessionId: z.string().optional(),
  ip: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function trackTelemetryVisit({
  asset,
  request,
  linkType = "assetDetail",
}: {
  asset: { ownerId: string; id?: string };
  request: Request | { headers: any; url: string };
  linkType?: "assetDetail" | "store" | "website";
}) {
  try {
    const headers = request.headers;
    const ip = headers["x-forwarded-for"] || headers["x-real-ip"] || "";
    // Extraer host completo
    let host = "";
    if (headers["host"]) {
      host = headers["host"];
    } else if (typeof request.url === "string") {
      try {
        host = new URL(request.url).host;
      } catch {}
    }
    const metadata = {
      userAgent: headers["user-agent"] || "",
      referrer: headers["referer"] || "",
      url: request.url,
      host,
    };
    const event: any = {
      ownerId: asset.ownerId,
      linkType,
      eventType: "visit",
      timestamp: new Date().toISOString(),
      ip,
      metadata,
    };
    if (asset.id) {
      event.assetId = asset.id;
    }
    const parsed = TelemetryEventSchema.parse(event);
    const mutableParsed = JSON.parse(JSON.stringify(parsed));
    await db.telemetryEvent.create({ data: mutableParsed });
  } catch (err) {
    console.error("Telemetry error:", err);
  }
}

// Native date helpers (replacing date-fns)
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function subMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  return result;
}

// Devuelve datos de visitas agrupados por mes para la gráfica de dashboard
export async function getVisitsChartData(ownerId: string) {
  const threeMonthsAgo = startOfMonth(subMonths(new Date(), 2));
  const visitsByMonth = await db.telemetryEvent.groupBy({
    by: ["timestamp"],
    where: {
      ownerId,
      eventType: "visit",
      timestamp: {
        gte: threeMonthsAgo,
      },
    },
    _count: true,
    orderBy: {
      timestamp: "asc",
    },
  });
  // Agrupar por mes
  const visitsPerMonth: Record<string, number> = {};
  visitsByMonth.forEach((row) => {
    const date = new Date(row.timestamp);
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
    visitsPerMonth[monthKey] = (visitsPerMonth[monthKey] || 0) + row._count;
  });
  const months = Array.from({ length: 3 }).map((_, i) => {
    const date = subMonths(new Date(), 2 - i);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  });
  return {
    labels: months.map((month) => {
      const [year, monthNum] = month.split("-").map(Number);
      const date = new Date(Date.UTC(year, monthNum - 1));
      const raw = new Intl.DateTimeFormat("es", { month: "short" }).format(
        date
      );
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }),
    datasets: [
      {
        label: "Visitas",
        data: months.map((month) => visitsPerMonth[month] || 0),
        borderColor: "#9870ED",
        backgroundColor: "rgba(152, 112, 237, 0.1)",
        borderWidth: 2,
        pointBorderColor: "#9870ED",
        pointBackgroundColor: "#9870ED",
        tension: 0.3,
        fill: true,
      },
    ],
  };
}
