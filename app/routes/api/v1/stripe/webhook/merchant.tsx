import { db } from "~/.server/db";
import {
  removeAssetFromUserByEmail,
  constructStripeEvent,
  getEmailFromEvent,
} from "~/.server/webhookUtils";
import { applyRateLimit } from "~/.server/rateLimiter";
import { webhookHandlers } from "~/.server/stripe/handlers";

export const action = async ({
  request,
}: {
  request: Request;
  params: { assetId: string };
}) => {
  // Aplicar rate limiting
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const event = await constructStripeEvent(request);
  if (event instanceof Response) return event;
  const email = getEmailFromEvent(event);

  // Testing new event handler
  await webhookHandlers[event.type](event, request); // this can throw and it's ok

  // Manejo específico para actualizaciones de cuenta (onboarding completado)
  if (event.type === "account.updated") {
    const account = event.data.object;
    const accountId = account.id;

    // Buscar usuario por stripeId
    const user = await db.user.findFirst({
      where: {
        stripeIds: {
          has: accountId,
        },
      },
    });

    if (user) {
      console.info(`Account ${accountId} updated for user ${user.email}`);
      // Aquí podrías actualizar el estado del usuario si es necesario
      // Por ejemplo, marcar que el onboarding está completo
    }
  }

  // Manejo de éxitos
  // if (
  //   event.type === "payment_intent.succeeded" ||
  //   event.type === "charge.succeeded"
  // ) {
  //   if (email) {
  //     const paymentIntent = event.data.object;
  //     const assetId = paymentIntent.metadata?.assetId;

  //     if (!assetId) {
  //       console.error("No assetId en metadata del payment intent");
  //       return new Response("Missing assetId in metadata", { status: 400 });
  //     }

  //     // Obtener el asset y el usuario para crear la orden
  //     const [asset, user] = await Promise.all([
  //       db.asset.findUnique({
  //         where: { id: assetId },
  //         include: { user: true }
  //       }),
  //       db.user.findUnique({
  //         where: { email }
  //       })
  //     ]);

  //     if (!asset) {
  //       console.error("Asset no encontrado:", assetId);
  //       return new Response("Asset not found", { status: 404 });
  //     }

  //     if (!user) {
  //       console.error("Usuario no encontrado:", email);
  //       return new Response("User not found", { status: 404 });
  //     }

  //     // Crear la orden cuando el pago es exitoso usando createOrder
  //     const order = await createOrder({
  //       customer: user,
  //       asset,
  //       status: "PAID",
  //     });

  //     // Asignar el asset al usuario
  //     await assignAssetToUserByEmail({ assetId, email });

  //     console.info(
  //       `::ORDEN_CREADA::${order.id}::ASSET_ID::${assetId}::ASSIGNADO_AL_USER::${email}`
  //     );
  //   } else {
  //     console.error("No se pudo determinar el email en el evento");
  //     return new Response("Missing required email", {
  //       status: 400,
  //     });
  //   }
  // }
  // listener para activar o desactivar acceso al asset
  if (event.type === "charge.updated") {
    if (email) {
      const paymentIntent = event.data.object;
      const assetId = paymentIntent.metadata?.assetId;

      if (assetId) {
        const charge = event.data.object;
        if (charge.status === "failed" || charge.status === "refunded") {
          // Buscar la orden por email y assetId
          const order = await db.order.findFirst({
            where: {
              customer_email: email,
              assetId: assetId,
              status: "PAID",
            },
          });

          if (order) {
            await removeAssetFromUserByEmail({ assetId, email });
            // Actualizar el estado de la orden a refunded en vez de eliminarla
            await db.order.update({
              where: { id: order.id },
              data: { status: charge.status },
            });
            return new Response("Asset removed and order updated", {
              status: 200,
            });
          }
        }
      }
      return new Response(null, { status: 200 });
    } else {
      console.error("No email en charge.updated");
      return new Response("Missing required metadata or email", {
        status: 400,
      });
    }
  }

  // resto y no soportadas
  switch (event.type) {
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

    case "payment_intent.created": {
      console.info("payment_intent.created");
      return new Response(null, { status: 200 });
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
      return new Response("Event type not handled", { status: 404 });
  }
};
