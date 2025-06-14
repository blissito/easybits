import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/PublicCustomLanding";
import { ContentTemplate, FooterTemplate, HeaderTemplate } from "./template";
import { db } from "~/.server/db";
import { loadStripe } from "@stripe/stripe-js";
import { createCheckoutSession, getPublishableKey } from "~/.server/stripe";
import { useActionData, useFetcher } from "react-router";
import { useMemo } from "react";
import { EmojiConfetti } from "~/components/Confetti";
import { FooterSuscription } from "~/components/forms/FooterSubscription";
import type { Asset } from "@prisma/client";
import { Button } from "~/components/common/Button";
import { BrutalButton } from "~/components/common/BrutalButton";
import { getReviews } from "~/.server/reviews";

export const meta = ({
  data: {
    asset: { title, description, userId, id },
  },
}: Route.MetaArgs) => {
  return getBasicMetaTags({
    title,
    description: description?.slice(0, 80).replace("#", "") + "...",
    // @todo get this from config?
    image: `https://easybits-public.fly.storage.tigris.dev/${userId}/gallery/${id}/metaImage`,
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
  const {
    OpenCheckout,
    asset,
    publishableKey,
    files,
    successStripeId,
    assetReviews,
  } = loaderData;
  const actionData = useActionData();
  const assetUserStripeId = asset?.user?.stripe?.id;
  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey, {
      stripeAccount: assetUserStripeId,
    });
  }, [publishableKey, assetUserStripeId]);

  // Fetcher
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";
  // Stripe Checkout
  const handleOpenCheckout = () => {
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

  return (
    <article>
      <HeaderTemplate asset={asset} />
      {successStripeId && <EmojiConfetti />}
      <ContentTemplate
        asset={asset}
        stripePromise={stripePromise}
        checkoutSession={actionData?.checkoutSession}
        files={files}
        actionButton={
          asset.price !== "0" && asset.price !== 0 ? (
            <BrutalButton
              isLoading={isLoading}
              type="button"
              onClick={handleOpenCheckout}
              mode="landing"
              className="h-16"
              containerClassName="h-16  border-none rounded-none"
            >
              {"Comprar"}
            </BrutalButton>
          ) : null
        }
        reviews={reviews}
      />

      <FooterTemplate
        asset={asset}
        form={({
          isLoading,
          handleSubmit,
        }: {
          handleSubmit: () => void;
          isLoading: boolean;
        }) => {
          return (
            <FooterSuscription
              onSubmit={handleSubmit}
              asset={asset}
              isLoading={isLoading}
            />
          );
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
