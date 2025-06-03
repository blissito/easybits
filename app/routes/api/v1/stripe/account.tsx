import { getUserOrRedirect } from "~/.server/getters";
import {
  createAccountV2,
  createClientSecret,
  createOnboarding,
  getAccountPayments,
  getAccountCapabilities,
} from "~/.server/stripe_v2";
import type { Route } from "./+types/account";
import { db } from "~/.server/db";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "get_account_payments") {
    // @todo permissions
    const stripeId = formData.get("stripeId") as string;
    const payments = await getAccountPayments(stripeId);
    const capabilities = await getAccountCapabilities(stripeId);
    return { payments, capabilities };
  }

  if (intent === "get_client_secret") {
    const accountId = formData.get("accountId") as string;
    const capabilities = await getAccountCapabilities(accountId);
    if (!capabilities) return { clientSecret: null };

    const clientSecret = await createClientSecret({
      accountId,
      onboarding: capabilities?.card_payments === "inactive",
      payments: capabilities?.card_payments !== "inactive",
    });
    return { clientSecret };
    // return new Response(JSON.stringify({ client_secret }));
  }

  if (intent === "create_new_account") {
    const user = await getUserOrRedirect(request);
    const account = await createAccountV2(user);
    await db.user.update({
      where: {
        id: user.id,
      },
      data: {
        stripeId: account.id,
      },
    });
    // generate onboarding url
    const client_secret = await createOnboarding(account.id);
    return { clientSecret: client_secret };
  }

  return null;
};
