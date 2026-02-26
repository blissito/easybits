import { BrutalButton } from "~/components/common/BrutalButton";
import { Header } from "~/components/layout/Header";
import { cn } from "~/utils/cn";

import { Empty } from "./assets/Empty";

import { useFetcher } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "./+types/sales";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from "@stripe/connect-js";
import { SalesTable } from "./sales/SalesTable";
import { getPaginatedOrders } from "~/.server/pagination/orders";
import { PaginatedTable } from "~/components/common/pagination/PaginatedTable";
import { TablePagination } from "~/components/common/pagination/TablePagination";
import { getUserOrRedirect } from "~/.server/getters";
import { FaStripeS } from "react-icons/fa";
import { getAccountCapabilities } from "~/.server/stripe_v2";

const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export const loader = async ({ request }: Route.LoaderArgs) => {
  // Obtener usuario autenticado
  const user = await getUserOrRedirect(request);

  // Leer parámetros de paginación de la URL
  const url = new URL(request.url, `http://${request.headers.get("host")}`);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 20);
  // Obtener órdenes paginadas
  const { orders, pagination } = await getPaginatedOrders({
    user,
    merchant: true,
    page,
    pageSize,
  });
  const isProd = process.env.NODE_ENV === "production";
  const u = { ...user, stripeId: user.stripeIds[isProd ? 0 : 1] };
  const capabilities = await getAccountCapabilities(u.stripeId, !isProd);
  return {
    user: u,
    orders,
    pagination,
    onboardingDone: capabilities?.card_payments?.status === "active",
  };
};

export default function Sales({ loaderData }: Route.ComponentProps) {
  const user = loaderData.user;
  const orders = loaderData.orders;
  const onboardingDone = loaderData.onboardingDone;
  const pagination = loaderData.pagination;
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
    if (!clientSecret) return;
    createInstance(clientSecret);
  }, [clientSecret]);

  // Solo obtener client secret si el onboarding no está completo
  useEffect(() => {
    if (user.stripeId && !onboardingDone) {
      fetcher.submit(
        { intent: "get_client_secret" },
        { method: "post", action: "/api/v1/stripe/account" }
      );
    }
  }, [user.stripeId, onboardingDone]);

  const handleOnboardingExit = () => {
    console.log("The account has exited onboarding");
  };

  return (
    <>
      <article
        className={cn(
          " min-h-svh w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8  2xl:px-0 ",
          LAYOUT_PADDING
        )}
      >
        <Header
          title="Ventas"
          searcher={false}
          layout={false}
          cta={
            user.stripeId && (
              <ConectStripeButton
                accountId={user.stripeId}
                isLoading={isLoading}
                onClick={handleStripeConnect}
                onboardingCompleted={onboardingDone}
              />
            )
          }
        />
        {orders.length < 1 && (
          <EmptySales
            cta={
              !user.stripeId && (
                <ConectStripeButton
                  accountId={user.stripeId}
                  isLoading={isLoading}
                  onClick={handleStripeConnect}
                  onboardingCompleted={onboardingDone}
                />
              )
            }
          />
        )}
        {orders.length > 0 && (
          <PaginatedTable
            data={orders}
            totalItems={pagination.totalItems}
            config={{ defaultPageSize: pagination.pageSize }}
          >
            {(paginatedOrders) => (
              <>
                <SalesTable orders={paginatedOrders as any} />
                <TablePagination />
              </>
            )}
          </PaginatedTable>
        )}
        {stripeConnectInstance && !onboardingDone && (
          <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
            <ConnectAccountOnboarding onExit={handleOnboardingExit} />
          </ConnectComponentsProvider>
        )}
      </article>
    </>
  );
}

export const EmptySales = ({ cta }: { cta: ReactNode }) => {
  return (
    <Empty
      illustration={
        <img
          className="w-44 mx-auto "
          src="/empty-states/sales-empty.webp"
          alt="No hay ventas registradas"
        />
      }
      title="Administra tus ventas desde aquí"
      text={
        <span>
          Tus clientes/seguidores te están conociendo. <br />
          ¡Sigue compartiendo tu tienda!
        </span>
      }
      footer={cta && <div className="flex gap-6 justify-center">{cta}</div>}
    />
  );
};

const ConectStripeButton = ({
  accountId,
  isLoading,
  onClick,
  onboardingCompleted,
}: {
  accountId?: string | null;
  isLoading: boolean;
  onClick: () => void;
  onboardingCompleted?: boolean;
}) => {
  if (onboardingCompleted) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-100 border-2 border-green-500 rounded-lg">
        <FaStripeS className="text-green-600" />
        <span className="text-green-800 font-medium">Cuenta Stripe activa</span>
      </div>
    );
  }

  return (
    <BrutalButton
      isDisabled={!!accountId}
      isLoading={isLoading}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <FaStripeS />
        <span>
          {accountId ? "Id: " + accountId : "Conecta tu cuenta Stripe"}
        </span>
      </div>
    </BrutalButton>
  );
};
