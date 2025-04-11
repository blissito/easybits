import { redirect } from "react-router";
import { getStripeCheckout } from "~/.server/stripe";
import type { Route } from "./+types/plans";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "creative_plan") {
    throw redirect(
      await getStripeCheckout({
        priceId: "price_1RCiRjIW1Nfyq2zeK57hbxu0",
      })
    );
  }

  if (intent === "expert_plan") {
    console.log("inside");
    const url = await getStripeCheckout({
      priceId: "price_1RCiTHIW1Nfyq2zecsPxxPvR",
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
