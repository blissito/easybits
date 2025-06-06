import React, { useState } from "react";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { createAccount, getPublishableKey } from "~/.server/stripe";
import useStripeConnect from "~/hooks/useStripeConnect";
import { getUserOrNull } from "~/.server/getters";
import { Form, useActionData, useFetcher, useLoaderData } from "react-router";
import { updateUser } from "~/.server/user";
import { BrutalButton } from "~/components/common/BrutalButton";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrNull(request);
  const publishableKey = await getPublishableKey();
  return {
    user,
    publishableKey,
  };
};

export const action = async ({ request }: Route.ClientActionArgs) => {
  const account = await createAccount();

  const user = await getUserOrNull(request);
  const updatedUser = await updateUser({
    userId: user.id,
    data: { stripe: account },
  });

  return { account, updatedUser };
};

export default function Stripe() {
  const [accountCreatePending, setAccountCreatePending] = useState(false);
  const [onboardingExited, setOnboardingExited] = useState(false);
  const [error, setError] = useState(false);
  const fetcher = useFetcher();
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const isLoading = fetcher.state !== "idle";
  const connectedAccountId =
    loaderData?.user?.stripe?.id || actionData?.account?.id;
  const stripeConnectInstance = useStripeConnect({
    connectedAccountId,
    publishableKey: loaderData.publishableKey,
  });

  return (
    <div className="relative w-full px-64 py-12">
      <div className="content">
        {!connectedAccountId && (
          <Form method="post">
            <BrutalButton type="submit">prende stripeee</BrutalButton>
          </Form>
        )}
        {isLoading && <p>Creating a connected account...</p>}
        {stripeConnectInstance && (
          <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
            <ConnectAccountOnboarding
              onExit={() => setOnboardingExited(true)}
            />
          </ConnectComponentsProvider>
        )}
        {error && <p className="error">Something went wrong!</p>}
        {(connectedAccountId || accountCreatePending || onboardingExited) && (
          <div className="dev-callout">
            {connectedAccountId && (
              <p>
                Your connected account ID is:{" "}
                <code className="bold">{connectedAccountId}</code>
              </p>
            )}

            {onboardingExited && (
              <p>The Account Onboarding component has exited</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
