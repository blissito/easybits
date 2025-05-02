import {
  createOrder,
  getUserOrNull,
  getUserOrRedirect,
} from "~/.server/getters";
import type { Route } from "./+types/user";
import { db } from "~/.server/db";
import { findNewsletter, scheduleNext } from "~/.server/emails/startNewsLetter";
// import { sendPurchase } from "~/.server/emails/sendPurchase";
import { createHost, removeHost } from "~/lib/fly_certs/certs_getters";
import { redirect } from "react-router";
import { scheduleReview } from "~/.server/emails/scheduleReview";
import type { Asset, User } from "@prisma/client";
import { sendPurchase } from "~/.server/emails/sendPurchase";
// @TODO: recaptcha (cloudflare?)
// @todo try use transactions
// const transaction = await prisma.$transaction([deletePosts, deleteUser])

// @todo separate this in an if block !! yes please!

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  // @todo is this ok in here? good question, is comfortable, yes...
  if (intent === "free_subscription") {
    const email = formData.get("email") as string;
    const displayName = formData.get("displayName") as string;
    const assetId = formData.get("assetId") as string;
    const initialNewsletterData = {
      next: 1,
      assetId,
    };
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: {
        title: true,
        id: true,
        createdAt: true,
        price: true,
        user: true,
      },
    });
    if (!asset) throw new Response("Asset not found", { status: 404 });

    let user = await db.user.findUnique({
      where: {
        email,
      },
    });
    if (!user) {
      user = await db.user.create({
        data: {
          displayName,
          newsletters: [initialNewsletterData],
          email: email.toLowerCase(),
          assetIds: [assetId],
        },
      });
    } else {
      // newsletter stuff... @todo revisit? move from here?
      let newsletters = [...user.newsletters];
      const found = findNewsletter(assetId, newsletters);
      if (!found) {
        newsletters = [...new Set([...newsletters, initialNewsletterData])];
      }
      //
      const assetIds = [...new Set([...user.assetIds, assetId])];
      user = await db.user.update({
        where: { email },
        data: { newsletters, assetIds },
      });
    }

    const orderExists = await db.order.findFirst({
      where: {
        assetId,
        userId: user.id,
      },
    });
    // avoid order creation
    if (orderExists) {
      throw redirect("/dash/compras/" + assetId); // ventajas de usar fetcher pa todo...
    }
    // order creation @todo count stats?
    await createOrder({
      userId: user.id,
      assetId: asset.id,
      email: user.email,
    });
    // // deliver product @todo downloadable file link?
    await sendPurchase({
      email: user.email,
      data: {
        assetId,
        assetName: asset.title,
        date: asset.createdAt,
        price: asset.price!,
      },
    });
    // @todo what else? any other notification?
    await scheduleNext({ userId: user.id, assetId }); // @todo revisit, improve
    // Schedule ask_for_review_send
    await scheduleReview({
      // @ts-ignore
      asset,
      user,
    });
    return { success: true };
  }

  if (intent === "update_profile") {
    const user = await getUserOrRedirect(request);
    const data = JSON.parse(formData.get("data") as string);
    await db.user.update({
      where: {
        id: user.id,
      },
      data,
    });
    return { success: true };
  }

  if (intent === "self") {
    return await getUserOrNull(request);
  }

  if (intent === "update_host") {
    const userId = formData.get("userId") as string;
    const host = formData.get("host") as string;
    const exists = await db.user.findFirst({
      where: {
        host,
      },
    });
    if (exists) {
      return { error: "Este dominio ya está en uso, intenta con otro" };
    }

    // removing previous
    const user = await db.user.findUnique({
      where: {
        id: userId,
      },
    });
    if (!user) return { error: "User not found" };

    // console.log("removing:", `${user.host}.easybits.cloud`);
    await removeHost(`${user.host}.easybits.cloud`);
    const hostResult = (await createHost(`${host}.easybits.cloud`)) as {
      addCertificate: {
        certificate: {
          configured: true;
          acmeDnsConfigured: false;
          acmeAlpnConfigured: true;
          certificateAuthority: "lets_encrypt";
          certificateRequestedAt: "2025-05-01T21:54:07Z";
          dnsProvider: "googledomains";
          dnsValidationInstructions: "CNAME _acme-challenge.blissmos.easybits.cloud => blissmos.easybits.cloud.jnk0nd.flydns.net.";
          dnsValidationHostname: "_acme-challenge.blissmos.easybits.cloud";
          dnsValidationTarget: "blissmos.easybits.cloud.jnk0nd.flydns.net";
          hostname: "blissmos.easybits.cloud";
          id: "cert_6nkrnj";
          source: "fly";
        };
      };
    };

    const {
      addCertificate: { certificate },
    } = hostResult || { addCertificate: {} };

    await db.user.update({
      where: {
        id: userId,
      },
      data: { host, dnsConfig: certificate },
    });

    return { success: true, nextStep: 1 };
  }

  return null;
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");

  if (intent === "self") {
    return await getUserOrNull(request);
  }
  return null;
};
