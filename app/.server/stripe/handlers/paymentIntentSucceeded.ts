import type Stripe from "stripe";
import { db } from "~/.server/db";
import { createOrder, getUserOrNull } from "~/.server/getters";
import { assignAssetToUserByEmail, getEmailFromEvent } from "~/.server/webhookUtils";
import { sendPurchase, sendNotifyPurchase } from "~/.server/emails/sendPurchase";
import { scheduleReview } from "~/.server/emails/scheduleReview";

export const paymentIntentSucceeded = async (event: Stripe.Event, request: Request) => {
    const customer_email = getEmailFromEvent(event);
        if (customer_email) {

const paymentIntent = event.data.object;
const assetId = paymentIntent.metadata?.assetId;

          if(!assetId ||!paymentIntent) {
            throw new Response(
                "(AssetId/PaymentIntent) not found", 
                {
                    status: 400
                }
            );
          } 
    
          // Obtener el asset para crear la orden
          const asset = await db.asset.findUnique({
            where: { id: assetId },
            include: { user: true }, // important!
          });
    
          if (!asset) {
            console.error("Asset no encontrado:", assetId);
            throw new Response("Asset not found", {
                status: 404
            });
          }
    
          // Crear la orden cuando el pago es exitoso usando createOrder
    
          // Asignar el asset al usuario
          const customer = await assignAssetToUserByEmail({ assetId, email: customer_email });
          const order = await createOrder({
            asset,
            status: "PAID",
            customer
          });
          // 1. customer notification
          await sendPurchase({
            email: customer_email,
            data: {
              assetName: asset.title,
              price: asset.price!,
              date: new Date().toISOString(),
              assetId,
            },  
          });
          // 2. merchant notification
          await sendNotifyPurchase({
            email: asset.user?.email!,
            assetName: asset.title!,
            assetId,
            customer_email: customer_email,
          });
    
          // shcedule 7 days email to add review
          await scheduleReview({
            asset,
            user: customer,
            when: "in 7 days",
          });

          // Info
          console.info(
            `::ORDEN_CREADA::${order.id}::ASSET_ID::${assetId}::ASSIGNADO_AL_USER::${customer_email}`
          );
        } else {
          console.error("No se pudo determinar el email en el evento");
          throw new Response("Missing required email", {
            status: 400,
          });
        }
      
}
