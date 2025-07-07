import { redirect } from "react-router";
import type { Route } from "./+types/checkout";
import { createCheckoutURL } from "~/.server/stripe_v2";
import { db } from "~/.server/db";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = request.formData();
  const intent = (await formData).get("intent");
  if (intent === "account_checkout") {
    const assetId = (await formData).get("assetId") as string;
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: {
        user: { 
          select: { 
            stripeIds: true
          } 
        },
        price: true,
        stripePrice: true,
        userId: true,
      },
    });
    if (!asset) throw new Response("Asset not found", { status: 404 });

    // Get the current user's email from the session
    const user = await db.user.findUnique({
      where: { id: asset.userId },
      select: { email: true }
    });

    if (!user?.email) {
      throw new Response("User email not found", { status: 400 });
    }

    await db.order.create({
      data: {
        assetId,
        status: "pending",
        total: asset.price ? `$${asset.price} MXN` : "$0.00 MXN",
        price: asset.price || 0,
        priceId: asset.stripePrice,
        customer_email: user.email,
        // Set the relation IDs directly
        merchantId: asset.userId,
        customerId: asset.userId,
        // The asset relation is automatically handled by Prisma using assetId
      },
    });

    if (!asset.user.stripeIds || asset.user.stripeIds.length === 0) {
      throw new Response("No Stripe account found for this user", { status: 400 });
    }
    // Prod is index 0, dev is index 1
    const isDev = process.env.NODE_ENV === "development";
    const url = await createCheckoutURL(assetId, asset.user.stripeIds[isDev ? 1 : 0]);
    return redirect(url);
  }
  return null;
};
