import { redirect } from "react-router";
import type { Route } from "./+types/checkout";
import { createCheckoutURL } from "~/.server/stripe_v2";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = request.formData();
  const intent = (await formData).get("intent");
  if (intent === "account_checkout") {
    const assetId = (await formData).get("assetId") as string;
    const url = await createCheckoutURL(assetId);
    console.log("URL:", url);
    return redirect(url);
  }
  return null;
};
