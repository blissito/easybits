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
        user: { select: { stripeId: true } },
        price: true,
        stripePrice: true,
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
      },
    });

    const url = await createCheckoutURL(assetId, asset.user.stripeId!);
    return redirect(url);
  }
  return null;
};
