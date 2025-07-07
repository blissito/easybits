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

    await db.order.create({
      data: {
        assetId,
        status: "pending",
        total: asset.price?.toString(),
        stripePriceId: asset.stripePrice,
        stripePriceProductId: asset.stripePrice,
        userId: asset.userId,
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
