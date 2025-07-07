import { db } from "~/.server/db";
import { createOrder, getUserOrNull } from "~/.server/getters";
import { assignAssetToUserByEmail, getEmailFromEvent } from "~/.server/webhookUtils";

export const paymentIntentSucceeded = async (event: Stripe.Event, request: Request) => {
    const email = getEmailFromEvent(event);
        if (email) {
        
    const user = await getUserOrNull(request);

    const paymentIntent = event.data.object;
          const assetId = paymentIntent.metadata?.assetId;

          if(!user||!assetId ||!paymentIntent) {
            throw new Response(
                "(User/AssetId/PaymentIntent) not found", 
                {
                    status: 400
                }
            );
          } 
    
          // Obtener el asset para crear la orden
          const asset = await db.asset.findUnique({
            where: { id: assetId },
          });
    
          if (!asset) {
            console.error("Asset no encontrado:", assetId);
            throw new Response("Asset not found", {
                status: 404
            });
          }
    
          // Crear la orden cuando el pago es exitoso usando createOrder
          const order = await createOrder({
            asset,
            status: "PAID",
            customer: user!,
          });
    
          // Asignar el asset al usuario
          await assignAssetToUserByEmail({ assetId, email });
          // Notify merchant and customer
        //   await notifyMerchantAndCustomer({ assetId, customer_email: email, merchant_email: asset.user.email });
    
          // Info
          console.info(
            `::ORDEN_CREADA::${order.id}::ASSET_ID::${assetId}::ASSIGNADO_AL_USER::${email}`
          );
        } else {
          console.error("No se pudo determinar el email en el evento");
          throw new Response("Missing required email", {
            status: 400,
          });
        }
      
}
