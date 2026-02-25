import { getStripe } from "~/.server/stripe";

export const action = async ({ request }: { request: Request }) => {
  try {
    const stripe = getStripe();
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig) {
      throw new Error("No signature header");
    }

    const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_SIGN!);
    
    // Aquí puedes agregar logs para ver la metadata
    console.log("Webhook event received:", {
      type: event.type,
      metadata: event.data.object.metadata,
    });

    return new Response(JSON.stringify({ received: true }));
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
};
