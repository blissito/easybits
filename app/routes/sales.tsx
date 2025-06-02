import { BsStripe } from "react-icons/bs";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";

import { Empty } from "./assets/Empty";

import { useFetcher, useSubmit } from "react-router";
import { useEffect, useState, type ReactNode } from "react";

import { getUserOrRedirect } from "~/.server/getters";

import Spinner from "~/components/common/Spinner";
import { Modal } from "~/components/common/Modal";
import type { Route } from "./+types/sales";

import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from "@stripe/connect-js";
import { createOnboarding } from "~/.server/stripe_v2";

const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  let client_secret;
  if (user.stripe?.id) {
    try {
      client_secret = await createOnboarding(user.stripe.id);
    } catch (e) {
      console.log("ERR", e);
    }
  }

  return { user, clientSecret: client_secret };
};

export default function Sales({ loaderData }: Route.ComponentProps) {
  const { user, clientSecret } = loaderData;
  console.log("CSECRET", clientSecret);
  const fetcher = useFetcher();
  const handleStripeConnect = () => {
    fetcher.submit(
      {
        intent: "create_new_account",
      },
      {
        action: "/api/v1/stripe/account",
        method: "post",
      }
    );
  };

  const publishableKey =
    "pk_test_51RVduVRAAmJagW3o2m5Yy2UU8nXaIiZ7bmN8WYs15OstmjapDoJ7N2HgJeVxvBwt5Ga4PRVH5XAqN6BiK3lFylt800bhGCu9nF";
  const isLoading = fetcher.state !== "idle";
  const [cs, setClientSecret] = useState<string | null>(null);

  const stripeConnectInstance: StripeConnectInstance | null = cs
    ? loadConnectAndInitialize({
        // This is your test publishable API key.
        publishableKey: publishableKey,
        fetchClientSecret: () => cs,
      })
    : null;

  useEffect(() => {
    const csecret = clientSecret || fetcher.data?.clientSecret;
    setClientSecret(csecret);
  }, []);

  return (
    <>
      <article
        className={cn(
          " min-h-svh w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8  2xl:px-0 ",
          LAYOUT_PADDING
        )}
      >
        <Header title="Ventas" />
        <EmptySales
          cta={
            <BrutalButton
              isDisabled={user.stripe?.id}
              isLoading={isLoading}
              onClick={handleStripeConnect}
            >
              {user.stripe?.id
                ? "Cuenta conectada: " + user.stripe.id
                : "Conectar con stripe"}
            </BrutalButton>
          }
        />

        {stripeConnectInstance && (
          <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
            <ConnectAccountOnboarding
              onExit={() => {
                console.log("The account has exited onboarding");
              }}
              // Optional: make sure to follow our policy instructions above
              // fullTermsOfServiceUrl="{{URL}}"
              // recipientTermsOfServiceUrl="{{URL}}"
              // privacyPolicyUrl="{{URL}}"
              // skipTermsOfServiceCollection={false}
              // collectionOptions={{
              //   fields: 'eventually_due',
              //   futureRequirements: 'include',
              // }}
              // onStepChange={(stepChange) => {
              //   console.log(`User entered: ${stepChange.step}`);
              // }}
            />
          </ConnectComponentsProvider>
        )}

        {/* {!connectedAccountId && (
          <EmptyPayment
            connectedAccountId={connectedAccountId}
            stripeConnectInstance={stripeConnectInstance}
            setOnboardingExited={setOnboardingExited}
            isStripeLoading={isStripeLoading}
            isModalOpen={isModalOpen}
            setIsModalOpen={setIsModalOpen}
            user={loaderData?.user}
          />
        )} */}

        {/* // ya estas en stripe y no has vendido */}
        {/* {orders.length < 1 && <EmptySales />}
        {orders.length > 0 && <SalesTable orders={orders} />} */}
      </article>
    </>
  );
}

const EmptyPayment = ({
  connectedAccountId,
  stripeConnectInstance,
  setOnboardingExited,
  isStripeLoading,
  isModalOpen,
  setIsModalOpen,
}: any) => {
  const submit = useSubmit();
  const handleSubmit = () => {
    setIsModalOpen(true);

    const formData = new FormData();
    formData.append("stripeAccount", connectedAccountId);
    submit(formData, {
      method: "post",
    });
  };
  return (
    <Empty
      illustration={<img className="w-44 mx-auto " src="/sales-empty.webp" />}
      title="Conecta una pasarela de pagos"
      text={<span>Conectate a Stripe para ofrecerte pagos seguros.</span>}
      footer={
        <div className="flex gap-6 justify-center">
          {!connectedAccountId ? (
            <BrutalButton
              className="bg-[#6772E5] flex gap-2 items-center"
              onClick={handleSubmit}
            >
              Conectar Stripe
              <BsStripe />
            </BrutalButton>
          ) : (
            <BrutalButton
              className="bg-[#6772E5] flex gap-2 items-center"
              onClick={() => setIsModalOpen(true)}
            >
              Ve tu info de Stripe
              <BsStripe />
            </BrutalButton>
          )}
          <Modal
            key="asset-payment"
            containerClassName="z-50 text-black text-center"
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
          >
            <div className="h-full overflow-scroll px-9">
              {stripeConnectInstance || isStripeLoading ? (
                <ConnectComponentsProvider
                  connectInstance={stripeConnectInstance}
                >
                  <ConnectAccountOnboarding
                    onExit={() => setOnboardingExited(true)}
                  />
                </ConnectComponentsProvider>
              ) : (
                <Spinner />
              )}
            </div>
          </Modal>
        </div>
      }
    />
  );
};

export const EmptySales = ({ cta }: { cta: ReactNode }) => {
  return (
    <Empty
      illustration={<img className="w-44 mx-auto " src="/sales-empty.webp" />}
      title="Administra tus ventas desde aquí"
      text={
        <span>
          Tus clientes/seguidores te están conociendo. <br />
          ¡Sigue compartiendo tu tienda!
        </span>
      }
      footer={
        <div className="flex gap-6 justify-center">
          {cta || <BrutalButton>Conecta con Stripe</BrutalButton>}
        </div>
      }
    />
  );
};
