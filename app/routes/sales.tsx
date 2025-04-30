import { BsStripe } from "react-icons/bs";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";
import { SalesTable } from "./sales/SalesTable";
import { Empty } from "./assets/Empty";
import { IoCopy } from "react-icons/io5";
import { useSubmit } from "react-router";
import { useState } from "react";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { createAccount } from "~/.server/stripe";
import useStripeConnect from "~/hooks/useStripeConnect";
import { getUserOrNull, getUserOrRedirect } from "~/.server/getters";
import { useActionData, useFetcher, useLoaderData } from "react-router";
import { updateUser } from "~/.server/user";
import Spinner from "~/components/common/Spinner";
import { Modal } from "~/components/common/Modal";
import type { Route } from "./+types/sales";
import { db } from "~/.server/db";

const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const assets = await db.asset.findMany({
    where: {
      userId: user.id,
    },
  });
  const assetIds = assets.map((a) => a.id);
  const orders = await db.order.findMany({
    where: {
      assetId: {
        in: assetIds,
      },
    },
    include: {
      user: true,
      asset: true,
    },
  });
  return {
    orders,
    user,
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

export default function Sales({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [accountCreatePending, setAccountCreatePending] = useState(false);
  const [onboardingExited, setOnboardingExited] = useState(false);
  const [error, setError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fetcher = useFetcher();
  // const loaderData = useLoaderData();
  // const actionData = useActionData();
  const isStripeLoading = fetcher.state !== "idle";
  const connectedAccountId =
    loaderData?.user?.stripe?.id || actionData?.account?.id;
  const stripeConnectInstance = useStripeConnect({
    connectedAccountId,
    publishableKey: loaderData.publishableKey,
  });
  const { orders } = loaderData;
  return (
    <>
      <article
        className={cn(
          " min-h-svh w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8  2xl:px-0 ",
          LAYOUT_PADDING
        )}
      >
        <Header title="Ventas" />
        {!connectedAccountId && (
          <EmptyPayment
            connectedAccountId={connectedAccountId}
            stripeConnectInstance={stripeConnectInstance}
            setOnboardingExited={setOnboardingExited}
            isStripeLoading={isStripeLoading}
            isModalOpen={isModalOpen}
            setIsModalOpen={setIsModalOpen}
          />
        )}

        {orders.length < 1 && <EmptySales />}
        <SalesTable orders={orders} />
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
}) => {
  const submit = useSubmit();
  const handleSubmit = () => {
    setIsModalOpen(true);

    const formData = new FormData();
    // formData.append("stripeAccount", assetUserStripeId);

    submit(formData, {
      method: "post",
    });
  };
  return (
    <Empty
      illustration={<img className="w-44 mx-auto " src="/sales-empty.webp" />}
      title="  Conecta una pasarela de pagos"
      text={<span>Conectate a Stripe para ofrecerte pagos seguros.</span>}
      footer={
        <div className="flex gap-6 justify-center">
          {!connectedAccountId ? (
            <BrutalButton
              className="bg-[#6772E5] flex gap-2 items-center"
              onCick={handleSubmit}
            >
              Conectar Stripe
              <BsStripe />
            </BrutalButton>
          ) : (
            // <Link to="/dash/ventas/stripe">
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
            containerClassName="z-50 text-black text-center "
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
          >
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
          </Modal>
        </div>
      }
    />
  );
};

export const EmptySales = () => {
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
          <BrutalButton className=" flex gap-2 items-center">
            Copiar link <IoCopy />
          </BrutalButton>
        </div>
      }
    />
  );
};
