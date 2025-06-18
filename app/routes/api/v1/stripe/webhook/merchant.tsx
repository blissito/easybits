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
  const email = getEmailFromEvent(event);

  console.info("::STRIPE_EVENT_TYPE::", event.type);
  switch (event.type) {
    case "account.updated": {
      const user = await db.user.findFirst({
        where: { email },
      });

      if (!user) {
        return new Response("User not found", { status: 404 });
      }

      const account = event.data.object;
      const hasMerchant = user.roles?.includes("merchant");
      // Solo si alguno está deshabilitado, removemos el rol merchant
      if (!account.charges_enabled || !account.payouts_enabled) {
        if (hasMerchant) {
          await db.user.update({
            where: { id: user.id },
            data: {
              roles: user.roles.filter((r: string) => r !== "merchant"),
            },
          });
        }
      }

      return new Response(null, { status: 200 });
    }

    case "account.application.deauthorized": {
      const user = await db.user.findFirst({
        where: { email },
      });

      if (!user) {
        return new Response("User not found", { status: 404 });
      }

      // Remove merchant role //@todo this removes everything! correct this
      await db.user.update({
        where: { email },
        data: {
          roles: [], // @todo this removes everything! correct this
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
