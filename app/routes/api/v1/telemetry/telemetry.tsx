import { data } from "react-router";
import { trackTelemetryVisit } from "~/.server/telemetry";
import type { Route } from "./+types/telemetry";

export const action = async ({ request }: Route.ActionArgs) => {
  try {
    const body = await request.data();
    const { intent, assetId, ownerId, linkType } = body;

    if (intent !== "track-visit") {
      return data({ error: "Invalid intent" }, { status: 400 });
    }
    if (!ownerId) {
      return data({ error: "Missing ownerId" }, { status: 400 });
    }
    await trackTelemetryVisit({
      asset: assetId ? { ownerId, id: assetId } : { ownerId },
      request,
      linkType: linkType || "store",
    });
    return data({ ok: true });
  } catch (err) {
    return data({ error: "Telemetry error" }, { status: 500 });
  }
};
