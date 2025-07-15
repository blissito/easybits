import { Effect, Schema } from "effect";
import { ObjectId } from "mongodb";
import { db } from "./db";
import { Schema } from "effect";
import type { Asset } from "@prisma/client";
import type { Request } from "express"; // O ajusta el tipo según tu framework

// Modelo TypeScript para un evento de telemetría
export interface TelemetryEvent {
  _id?: ObjectId;
  userId: string;
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
  userId: Schema.String,
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
  asset: { userId: string; id?: string };
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
      userId: asset.userId,
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
