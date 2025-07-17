import {
  createOrder,
  getUserOrNull,
  getUserOrRedirect,
} from "~/.server/getters";
import type { Route } from "./+types/user";
import { db } from "~/.server/db";
import { findNewsletter, scheduleNext } from "~/.server/emails/startNewsLetter";
// import { sendPurchase } from "~/.server/emails/sendPurchase";
import {
  createHost,
  removeHost,
  showHost,
} from "~/lib/fly_certs/certs_getters";
import { redirect } from "react-router";
import { scheduleReview } from "~/.server/emails/scheduleReview";
import { sendPurchase } from "~/.server/emails/sendPurchase";
import type { Asset } from "@prisma/client";
import { getServerDomain } from "~/.server/urlUtils";
// @TODO: recaptcha (cloudflare?)
// @todo try use transactions
// const transaction = await prisma.$transaction([deletePosts, deleteUser])

// @todo separate this in an if block !! yes please!

export type CertificateResponse = {
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

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "get_orders") {
    const user = await getUserOrRedirect(request);
    const merchant = Boolean(formData.get("merchant") || 1);
    // Obtener parámetros de paginación desde la URL
    const url = new URL(request.url, `http://${request.headers.get("host")}`);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.max(
      1,
      Number(url.searchParams.get("pageSize")) || 20
    );
    const offset = (page - 1) * pageSize;
    const assets = merchant
      ? []
      : await db.asset.findMany({
          select: {
            id: true,
          },
          where: {
            userId: user.id,
          },
        });
    // Consulta paginada
    const [orders, totalItems] = await Promise.all([
      db.order.findMany({
        select: {
          customer_email: true,
          asset: true,
          merchant: false, // not needed?
          merchantId: true,
          customer: true,
          id: true,
          total: true,
          status: true,
          createdAt: true,
        },
        where: {
          merchantId: merchant ? user.id : undefined,
          customerId: merchant ? undefined : user.id,
          assetId: merchant
            ? undefined
            : {
                in: assets.map((asset) => asset.id),
              },
        },
        skip: offset,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      db.order.count({
        where: {
          merchantId: merchant ? user.id : undefined,
          customerId: merchant ? undefined : user.id,
          assetId: merchant
            ? undefined
            : {
                in: assets.map((asset) => asset.id),
              },
        },
      }),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      orders,
      pagination: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }
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
      include: { user: true },
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
        customer_email: user.email,
      },
    });
    // avoid order creation
    if (orderExists) {
      // throw redirect("/dash/compras/" + assetId); // ya no queremos redireccionar
      return { success: true };
    }
    // order creation @todo count stats?
    await createOrder({
      customer: user,
      asset,
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

  if (intent === "update_domain") {
    const userId = formData.get("userId") as string;
    const domain = formData.get("domain") as string;
    const exists = await db.user.findFirst({
      where: {
        domain,
      },
    });
    if (exists) {
      // return { error: "Este dominio ya está en uso, intenta con otro" };
    }
    const user = await getUserOrNull(request);
    user?.domain && (await removeHost(user.domain));
    const domainResult = (await createHost(domain)) as CertificateResponse;

    // const domainResult: any = await showHost(domain);

    if (domainResult) {
      await db.user.update({
        where: {
          id: userId,
        },
        data: { domain, dnsConfig: domainResult.addCertificate.certificate },
      });
    }
    return { success: true };
  }

  if (intent === "check_domain") {
    const user = await getUserOrNull(request);
    if (!user) return null;

    const domain = formData.get("domain") as string;
    const domainResult = await showHost(domain);

    // @todo document this "specialities"
    if ((domainResult as any)?.app?.certificate) {
      await db.user.update({
        where: {
          id: user.id,
        },
        data: { domain, dnsConfig: (domainResult as any).app.certificate },
      });
    }
  }

  if (intent === "update_host") {
    const currentUser = await getUserOrRedirect(request);
    const host = formData.get("host") as string;
    const domain = getServerDomain();

    // Update DNS validation instructions to use dynamic domain
    const dnsValidationInstructions = `CNAME _acme-challenge.${host}.${domain} => ${host}.${domain}.jnk0nd.flydns.net.`;
    const dnsValidationHostname = `_acme-challenge.${host}.${domain}`;
    const dnsValidationTarget = `${host}.${domain}.jnk0nd.flydns.net`;
    const hostname = `${host}.${domain}`;

    // removing previous
    if (!currentUser) return { error: "User not found" };

    // console.log("removing:", `${currentUser.host}.${domain}`);
    await removeHost(`${currentUser.host}.${domain}`);
    const hostResult = (await createHost(
      `${host}.${domain}`
    )) as CertificateResponse;

    const {
      addCertificate: { certificate },
    } = hostResult || { addCertificate: {} };

    await db.user.update({
      where: {
        id: currentUser.id,
      },
      data: { host, dnsConfig: certificate },
    });

    return { success: true, nextStep: 1 };
  }

  if (intent === "remove_host") {
    const user = await getUserOrRedirect(request);
    const host = formData.get("host") as string;
    const domain = getServerDomain();

    // console.log("removing:", `${user.host}.${domain}`);
    await removeHost(`${user.host}.${domain}`);

    return {
      message: "Host removed successfully",
      hostname: `${host}.${domain}`,
    };
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
