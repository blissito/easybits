import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { Route } from "./+types/PublicCustomLanding";
import { ContentTemplate, FooterTemplate, HeaderTemplate } from "./template";
import { db } from "~/.server/db";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
// import { getUserOrNull } from "~/.server/getters";
import { createCheckoutSession, getPublishableKey } from "~/.server/stripe";
import { useActionData } from "react-router";
import { useMemo } from "react";
import PaymentModal from "./PaymentModal";

const defaultURL = `https://easybits-public.fly.storage.tigris.dev/679442f532aff63d473fde99/gallery/67cb288d1d00d14f5e4bc605/metaImage`;

export const meta = ({
  data: {
    asset: { title, description, user, id },
  },
}: Route.MetaArgs) => {
  return getBasicMetaTags({
    title,
    description: description?.slice(0, 80).replace("#", "") + "...",
    image: `https://easybits-public.fly.storage.tigris.dev/${user.id}/gallery/${id}/metaImage`,
  });
};

export const loader = async ({ request, params }: Route.LoaderArgs) => {
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
  if (!asset) throw new Response("Asset not found", { status: 404 });

  const publishableKey = await getPublishableKey();
  //get own user for testing
  //const user = await getUserOrNull(request); //asset.user

  return {
    asset,
    publishableKey,
    // user
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
    asset,
    publishableKey,
    //user
  } = loaderData;
  const actionData = useActionData();
  const assetUserStripeId = asset?.user?.stripe?.id; //can youse your own user if already loggued in stripe for testing

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey, {
      stripeAccount: assetUserStripeId,
    });
  }, [publishableKey, assetUserStripeId]);

  return (
    <article>
      <HeaderTemplate asset={asset} />
      <ContentTemplate
        asset={asset}
        stripePromise={stripePromise}
        checkoutSession={actionData?.checkoutSession}
      />
      <FooterTemplate asset={asset} />
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
