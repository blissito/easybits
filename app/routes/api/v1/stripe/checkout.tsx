import { data, redirect } from "react-router";
import type { Route } from "./+types/checkout";
import { createCheckoutURL } from "~/.server/stripe_v2";
import { db } from "~/.server/db";
import type { Asset, User } from "@prisma/client";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = request.formData();
  const intent = (await formData).get("intent");

  const isProd = process.env.NODE_ENV === "production";

  if (intent === "account_checkout") {
    const assetId = (await formData).get("assetId") as string;
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: {
        user: {
          select: {
            stripeIds: true,
          },
        },
        price: true,
        stripePrice: true,
        userId: true,
      },
    });
    if (!asset) throw new Response("Asset not found", { status: 404 });

    const user = {
      ...asset.user,
      stripeId: asset.user.stripeIds[isProd ? 0 : 1],
    } as User;

    if (!user.stripeId) {
      return data(
        {
          message:
            "Lo sentimos, este Asset aún no tiene una cuenta Stripe relacionada",
        },
        { status: 402 }
      );
    }

    // Prod is index 0, dev is index 1
    const url = await createCheckoutURL(asset, user);
    console.log("WTF?", url);
    if (url) {
      return redirect(url);
    }
    throw new Response("No Stripe account found for this asset", {
      status: 400,
    });
  }
  return null;
};
