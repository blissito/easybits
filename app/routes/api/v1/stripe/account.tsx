import { getUserOrNull, getUserOrRedirect } from "~/.server/getters";
import {
  createAccountV2,
  createClientSecret,
  getAccountPayments,
  getAccountCapabilities,
} from "~/.server/stripe_v2";
import type { Route } from "./+types/account";
import { db } from "~/.server/db";

export const action = async ({ request }: Route.ActionArgs) => {
  const isProd = process.env.NODE_ENV === "production";
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "get_account_payments") {
    // @todo permissions
    const user = await getUserOrNull(request);
    if (!user || !user.stripeId)
      throw new Response("Stripe account not found", { status: 404 });

    const payments = await getAccountPayments(user.stripeId, true);
    const capabilities = await getAccountCapabilities(user.stripeId, true);

    return {
      payments,
      capabilities,
    };
  }

  if (intent === "get_client_secret") {
    let clientSecret;
    const user = await getUserOrRedirect(request);
    const accountId = user.stripeIds[isProd ? 0 : 1];
    const capabilities = await getAccountCapabilities(accountId, !isProd);

    if (capabilities?.card_payments?.status === "active") {
      // Si ya está activo, no necesitamos client secret
      return { clientSecret: null };
    }

    try {
      const result = await createClientSecret({
        accountId,
        onboarding: true,
        payments: false,
      });
      clientSecret = result;
    } catch (error) {
      console.error("Error creating client secret:", error);
      throw new Response("Failed to create client secret", { status: 500 });
    }

    return { clientSecret };
  }

  if (intent === "create_new_account") {
    const user = await getUserOrRedirect(request);
    const isProd = process.env.NODE_ENV === "production";
    try {
      const account = await createAccountV2(user);

      // Actualizar el usuario con el nuevo stripeId
      const stripeIds = [...user.stripeIds];
      stripeIds[isProd ? 0 : 1] = account.id;
      if (!stripeIds[0]) {
        stripeIds[0] = "";
      } else if (!stripeIds[1]) {
        stripeIds[1] = "";
      }

      await db.user.update({
        where: { id: user.id },
        data: {
          stripeIds,
        },
      });

      // Crear client secret para onboarding
      const result = await createClientSecret({
        accountId: account.id,
        onboarding: true,
        payments: false,
      });

      return { clientSecret: result };
    } catch (error) {
      console.error("Error creating account:", error);
      throw new Response("Failed to create account", { status: 500 });
    }
  }

  throw new Response("Invalid intent", { status: 400 });
};
