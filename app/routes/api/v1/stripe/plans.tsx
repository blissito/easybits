import { redirect } from "react-router";
import { getStripeCheckout } from "~/.server/stripe";
import type { Route } from "./+types/plans";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "creative_plan") {
    throw redirect(
      await getStripeCheckout({
        priceId: "price_1RCmryIW1Nfyq2zeLLyg0gT9", // this is prod
        secret: process.env.DEV_STRIPE_SECRET_KEY,
      })
    );
  }

  if (intent === "expert_plan") {
    console.log("inside");
    const url = await getStripeCheckout({
      priceId: "price_1RCmssIW1Nfyq2zeGz8uiNoA", // prod
      secret: process.env.DEV_STRIPE_SECRET_KEY,
    });
    throw redirect(url);
  }

  return null;
};

export const loader = ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);

  // @todo success/cancel purchase screen
  if (url.searchParams.has("priceId") && url.searchParams.has("success")) {
    return redirect("/planes");
  }
  return { by: "blissmo", message: "t(*_*t)" };
};
