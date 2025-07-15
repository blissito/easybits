import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { trackTelemetryVisit } from "~/.server/telemetry";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = await request.json();
    const { intent, assetId, ownerId, linkType } = body;

    if (intent !== "track-visit") {
      return json({ error: "Invalid intent" }, { status: 400 });
    }
    if (!ownerId) {
      return json({ error: "Missing ownerId" }, { status: 400 });
    }
    await trackTelemetryVisit({
      asset: assetId ? { ownerId, id: assetId } : { ownerId },
      request,
      linkType: linkType || "store",
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: "Telemetry error" }, { status: 500 });
  }
};
