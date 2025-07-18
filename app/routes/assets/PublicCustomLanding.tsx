import React from "react";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/PublicCustomLanding";
import { ContentTemplate, FooterTemplate, HeaderTemplate } from "./template";
import { db } from "~/.server/db";
import { createCheckoutSession, getPublishableKey } from "~/.server/stripe";
import { EmojiConfetti } from "~/components/Confetti";
import { FooterSuscription } from "~/components/forms/FooterSubscription";
import type { Asset } from "@prisma/client";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getReviews } from "~/.server/reviews";
import { useFetcher } from "react-router";
import { useTelemetry } from "~/hooks/useTelemetry";
import toast from "react-hot-toast";

export const meta = ({ data }: Route.MetaArgs) => {
  const { asset } = data as { asset: Asset & { user: any } };
  return getBasicMetaTags({
    title: asset.title,
    description: asset.description
      ? asset.description.slice(0, 80).replace("#", "") + "..."
      : "Hecha un vistazo a este increíble asset 🚀",
    image: `https://easybits-public.fly.storage.tigris.dev/${asset.userId}/gallery/${asset.id}/metaImage`,
  });
};

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const host = url.hostname.split(".")[0]; // host
  const domain = url.hostname;

  let asset: Asset | null;

  if (!domain.includes("easybits")) {
    const user = await db.user.findFirst({
      where: {
        domain,
      },
    });
    asset = await db.asset.findUnique({
      where: {
        userId: user?.id, // undefined pass it, useful for dev (localhost)
        slug: params.assetSlug,
      },
      include: {
        user: true,
      },
    });
    // @todo this could throw in here
  } else {
    const hostExists = await db.user.findFirst({
      where: { host },
    });

    if (!hostExists && host !== "localhost")
      throw new Response("User not found", { status: 404 });

    asset = await db.asset.findUnique({
      where: {
        userId: hostExists?.id,
        slug: params.assetSlug,
      },
      include: {
        user: true,
      },
    });
  }
  if (!asset) throw new Response("Asset not found", { status: 404 });
  // Nueva validación: si el asset no está publicado, redirigir a la tienda
  if (!asset.published) {
    // Determinar la URL de la tienda según el dominio
    let tiendaUrl = "/tienda";
    if (domain.endsWith(".localhost")) {
      tiendaUrl = `http://${host}.localhost:3000/tienda`;
    } else if (!domain.includes("easybits")) {
      tiendaUrl = `https://${domain}/tienda`;
    } else if (host !== "localhost") {
      tiendaUrl = `https://${host}.easybits.cloud/tienda`;
    } else {
      tiendaUrl = "/tienda";
    }
    return Response.redirect(tiendaUrl, 302);
  }
  const assetReviews = await getReviews(asset.id);

  // Generating ActionButton
  const OpenCheckout = <button className="bg-indigo-500">Pushale</button>;

  const publishableKey = await getPublishableKey();
  const searchParams = url.searchParams;

  const successStripeId = searchParams.get("session_id");
  // file names
  const files = await db.file.findMany({
    orderBy: { createdAt: "desc" },
    where: {
      assetIds: {
        has: asset!.id,
      },
    },
    select: {
      name: true,
      id: true,
      size: true,
    },
  });

  return {
    OpenCheckout,
    files,
    asset,
    publishableKey,
    successStripeId,
    assetReviews,
  } as {
    OpenCheckout: React.ReactNode;
    files: { name: string; id: string; size: number }[];
    asset: Asset & { user: any };
    publishableKey: string | undefined;
    successStripeId: string | null;
    assetReviews: any[];
  };
};

export const action = async ({ request, params }: Route.ClientActionArgs) => {
  /** reuse this logic from loader, but can make it a getter funtion or something */
  const url = new URL(request.url);
  const host = url.hostname.split(".")[0]; // host
  const hostExists = await db.user.findFirst({
    where: { host },
  });
  if (!hostExists && host !== "localhost")
    throw new Response("User not found", { status: 404 });

  const asset = await db.asset.findUnique({
    where: {
      userId: hostExists?.id,
      slug: params.assetSlug,
    },
    include: {
      user: true,
    },
  });

  const formData = await request.formData();
  const stripeAccount = formData.get("stripeAccount");
  const checkoutSession = await createCheckoutSession({
    stripeAccount,
    asset,
  });

  return { checkoutSession };
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { asset, files, successStripeId, assetReviews } = loaderData as {
    asset: Asset & { user: any };
    files: { name: string; id: string; size: number }[];
    successStripeId: string | null;
    assetReviews: any[];
  };
  // Fetcher
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";
  // Stripe Checkout
  const handleOpenCheckout = () => {
    if (!asset.stripePrice) {
      toast.error("Este Asset no tiene un precio relacionado");
      return;
    }
    fetcher.submit(
      {
        intent: "account_checkout",
        assetId: asset.id,
      },
      {
        method: "post",
        action: "/api/v1/stripe/checkout",
      }
    );
  };

  const errorMessage = fetcher.data?.message;

  const defaultRatings = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const reviewsByRating = assetReviews?.reduce((acc, review) => {
    const rating = review.rating;
    if (!acc[rating]) {
      acc[rating] = 0;
    }
    acc[rating] += 1;
    return acc;
  }, defaultRatings);

  const reviews = {
    total: assetReviews.length || 0,
    byRating: reviewsByRating || defaultRatings,
  };
  const text = asset.template?.ctaText
    ? asset.template.ctaText
    : (asset.price || 0) <= 0
    ? "Suscribirse gratis"
    : "Comprar";

  // register visit
  useTelemetry({
    assetId: asset.id,
    ownerId: asset.userId,
    linkType: "assetDetail",
  });

  return (
    <article>
      <HeaderTemplate asset={asset} />
      {successStripeId && <EmojiConfetti />}
      <ContentTemplate
        asset={asset as any}
        files={files as any}
        actionButton={
          Number(asset.price) !== 0 ? (
            <>
              <BrutalButton
                id="purchase-button"
                isLoading={isLoading}
                isDisabled={!!errorMessage || !asset.stripePrice}
                type="button"
                onClick={handleOpenCheckout}
                mode="landing"
                className="h-16"
                containerClassName="h-16  border-none rounded-none"
                style={{
                  backgroundColor:
                    (asset as any)?.user?.storeConfig?.hexColor || "red",
                }}
              >
                {text}
              </BrutalButton>
              {!asset.stripePrice && Number(asset.price) > 0 && (
                <p className="text-red-500 text-xs">
                  Este Asset no tiene un precio de stripe asignado.
                </p>
              )}
              {errorMessage && (
                <p className="text-red-500 text-xs">{errorMessage}</p>
              )}
            </>
          ) : null
        }
        reviews={reviews}
        assetReviews={assetReviews}
      />

      <FooterTemplate
        asset={asset}
        form={({ isLoading }: { isLoading: boolean }) => {
          return <FooterSuscription asset={asset} isLoading={isLoading} />;
        }}
      />
    </article>
  );
}

// URL {
//     href: 'http://fixtergeek.localhost:3000/p/taller_en_vivo',
//     origin: 'http://fixtergeek.localhost:3000',
//     protocol: 'http:',
//     username: '',
//     password: '',
//     host: 'fixtergeek.localhost:3000',
//     hostname: 'fixtergeek.localhost',
//     port: '3000',
//     pathname: '/p/taller_en_vivo',
//     search: '',
//     searchParams: URLSearchParams {},
//     hash: ''
//   }
