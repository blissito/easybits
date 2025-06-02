import { getUserOrRedirect } from "~/.server/getters";
import { createAccountV2, createOnboarding } from "~/.server/stripe_v2";
import type { Route } from "./+types/account";
import { db } from "~/.server/db";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_new_account") {
    const user = await getUserOrRedirect(request);
    const account = await createAccountV2(user);
    await db.user.update({
      where: {
        id: user.id,
      },
      data: {
        stripe: account,
      },
    });
    // generate onboarding url
    const onboardingComponent = await createOnboarding(account.id);
    return { clientSecret: onboardingComponent.client_secret };
  }

  return null;
};
