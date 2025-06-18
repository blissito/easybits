import { type ActionFunctionArgs } from "react-router";
import { db } from "~/.server/db";
import {
  constructStripeEvent,
  getMetadataFromEvent,
  assignAssetToUserByEmail,
  removeAssetFromUserByEmail,
  getEmailFromEvent,
} from "~/.server/webhookUtils";

export const action = async ({ request }: ActionFunctionArgs) => {
  const event = await constructStripeEvent(request);
  if (event instanceof Response) return event;
  const accountId = event.data.object.id;

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object;
      const user = await db.user.findFirst({
        where: { stripeId: accountId },
      });

      if (!user) {
        return new Response("User not found", { status: 404 });
      }

      // Actualizar rol merchant basado en el estado de la cuenta
      await db.user.update({
        where: { id: user.id },
        data: {
          roles: { push: "merchant" },
        },
      });

      return new Response(null, { status: 200 });
    }

    case "account.application.deauthorized": {
      const user = await db.user.findFirst({
        where: { stripeId: accountId },
      });

      if (!user) {
        return new Response("User not found", { status: 404 });
      }

      // Remove merchant role //@todo this removes everything! correct this
      await db.user.update({
        where: { id: user.id },
        data: {
          roles: [],
        },
      });

      return new Response(null, { status: 200 });
    }

    case "payout.paid":
    case "transfer.created":
      // Handle these events if needed
      return new Response(null, { status: 204 });

    case "charge.succeeded": {
      const metadata = getMetadataFromEvent(event);
      const email = getEmailFromEvent(event);
      if (!metadata || !metadata.assetId || !email) {
        return new Response("Missing required metadata or email", {
          status: 400,
        });
      }
      return assignAssetToUserByEmail({ assetId: metadata.assetId, email });
    }

    case "payment_intent.succeeded":
    case "payment_intent.created": {
      const metadata = getMetadataFromEvent(event);
      const email = getEmailFromEvent(event);
      if (!metadata || !metadata.assetId || !email) {
        return new Response("Missing required metadata or email", {
          status: 400,
        });
      }
      return assignAssetToUserByEmail({ assetId: metadata.assetId, email });
    }

    case "charge.updated": {
      const charge = event.data.object;
      const metadata = getMetadataFromEvent(event);
      const email = getEmailFromEvent(event);
      if (!metadata || !metadata.assetId || !email) {
        return new Response("Missing required metadata or email", {
          status: 400,
        });
      }
      // Si el cargo es exitoso, asignamos el asset
      if (charge.status === "succeeded") {
        return assignAssetToUserByEmail({ assetId: metadata.assetId, email });
      }
      // Si el cargo falló o fue reembolsado, removemos el asset
      else if (charge.status === "failed" || charge.status === "refunded") {
        return removeAssetFromUserByEmail({ assetId: metadata.assetId, email });
      }
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
      return new Response("Event type not handled", { status: 404 });
  }
};
