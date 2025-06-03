import { BsStripe } from "react-icons/bs";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";

import { Empty } from "./assets/Empty";

import { useFetcher, useSubmit } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import Spinner from "~/components/common/Spinner";
import { Modal } from "~/components/common/Modal";
import type { Route } from "./+types/sales";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
  ConnectPayments,
} from "@stripe/react-connect-js";
import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from "@stripe/connect-js";
import { SalesTable } from "./sales/SalesTable";

// @todo remove from here
const publishableKey =
  "pk_test_51RVduVRAAmJagW3o2m5Yy2UU8nXaIiZ7bmN8WYs15OstmjapDoJ7N2HgJeVxvBwt5Ga4PRVH5XAqN6BiK3lFylt800bhGCu9nF";
const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export const clientLoader = async () => {
  const response = await fetch("/api/v1/user", {
    method: "post",
    body: new URLSearchParams({
      intent: "self",
    }),
  });
  const user = await response.json();
  const stripeId = user.stripeId;
  return { user, stripeId };
};

export default function Sales({ loaderData }: Route.ComponentProps) {
  const { user, stripeId } = loaderData;
  const fetcher = useFetcher();
  // Stripe connect client instance
  const [stripeConnectInstance, setSCI] =
    useState<null | StripeConnectInstance>(null);
  const createInstance = (secret: string) => {
    const instance = loadConnectAndInitialize({
      fetchClientSecret: async () => secret,
      publishableKey,
    });
    setSCI(instance);
  };
  //

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
  const isLoading = fetcher.state !== "idle";
  const clientSecret = fetcher.data?.clientSecret;

  useEffect(() => {
    fetcher.submit(
      { intent: "get_client_secret", accountId: user.stripeId },
      { method: "post", action: "/api/v1/stripe/account" }
    );
  }, []);
  useEffect(() => {
    if (!clientSecret) return;

    createInstance(clientSecret);
  }, [clientSecret]);

  return (
    <>
      <article
        className={cn(
          " min-h-svh w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8  2xl:px-0 ",
          LAYOUT_PADDING
        )}
      >
        <Header title="Ventas" />
        {!stripeConnectInstance && (
          <EmptySales
            cta={
              <BrutalButton
                isDisabled={user.stripeId}
                isLoading={isLoading}
                onClick={handleStripeConnect}
              >
                {user.stripeId
                  ? "Cuenta conectada: " + user.stripeId
                  : "Conectar con stripe"}
              </BrutalButton>
            }
          />
        )}
        <SalesTable stripeId={stripeId} />
        {stripeConnectInstance && (
          <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
            <ConnectAccountOnboarding
              onExit={() => {
                console.log("The account has exited onboarding"); // @todo notify or save status?
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
      </article>
    </>
  );
}

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
