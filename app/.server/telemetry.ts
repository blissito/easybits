import { Effect, Schema } from "effect";
import { ObjectId } from "mongodb";
import { db } from "./db";
import type { Asset } from "@prisma/client";
import type { Request } from "express"; // O ajusta el tipo según tu framework
import { startOfMonth, subMonths } from "date-fns";

// Modelo TypeScript para un evento de telemetría
export interface TelemetryEvent {
  _id?: ObjectId;
  ownerId: string;
  assetId?: string;
  linkType: "store" | "assetDetail";
  eventType: "visit";
  timestamp: Date;
  sessionId?: string;
  ip?: string;
  metadata?: Record<string, any>;
}

// Schema Effect para validación
export const TelemetryEventSchema = Schema.Struct({
  ownerId: Schema.String,
  assetId: Schema.optional(Schema.String),
  linkType: Schema.Union(
    Schema.Literal("store"),
    Schema.Literal("assetDetail")
  ),
  eventType: Schema.Literal("visit"),
  timestamp: Schema.Date,
  sessionId: Schema.optional(Schema.String),
  ip: Schema.optional(Schema.String),
  metadata: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
});

// Setter auxiliar para guardar un evento de telemetría en MongoDB
// import { getMongoDb } from '../lib/mongo'; // Descomenta y ajusta si existe

export const insertTelemetryEvent = Effect.gen(function* (_) {
  return (event: TelemetryEvent) =>
    Effect.tryPromise({
      try: async () => {
        // const db = await getMongoDb();
        // const collection = db.collection('telemetry_events');
        // await collection.insertOne(event);
        // return true;
        return true; // Quita esto y descomenta lo de arriba cuando tengas getMongoDb
      },
      catch: (error) => error,
    });
});

export async function trackTelemetryVisit({
  asset,
  request,
  linkType = "assetDetail",
}: {
  asset: { ownerId: string; id?: string };
  request: Request | { headers: any; url: string };
  linkType?: "assetDetail" | "store";
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
    const parsed = Schema.decodeSync(TelemetryEventSchema)(event);
    const mutableParsed = JSON.parse(JSON.stringify(parsed));
    await db.telemetryEvent.create({ data: mutableParsed });
  } catch (err) {
    console.error("Telemetry error:", err);
  }
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
