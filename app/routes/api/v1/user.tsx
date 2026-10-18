import {
  createAssetOrder,
  getUserOrNull,
  getUserOrRedirect,
} from "~/.server/getters";
import type { Route } from "./+types/user";
import { db } from "~/.server/db";
import { findNewsletter, scheduleNext } from "~/.server/emails/startNewsLetter";
// import { sendPurchase } from "~/.server/emails/sendPurchase";
import {
  pointsToAppHost,
  registerAppHostname,
  unregisterAppHostname,
} from "~/.server/appHostDomains";
import { redirect } from "react-router";
import { scheduleReview } from "~/.server/emails/scheduleReview";
import { sendPurchase } from "~/.server/emails/sendPurchase";
import type { Asset } from "@prisma/client";
import { getServerDomain } from "~/.server/urlUtils";
// @TODO: recaptcha (cloudflare?)
// @todo try use transactions
// const transaction = await prisma.$transaction([deletePosts, deleteUser])

// @todo separate this in an if block !! yes please!

// Estado del dominio propio de la tienda (`User.dnsConfig`). Antes era el cert de Fly; hoy el
// Caddy del fierro emite el cert solo, así que lo único que falta saber es si el DNS ya llega.
export type DomainStatus = {
  hostname: string;
  clientStatus: "Ready" | "Awaiting configuration";
};

async function domainStatus(hostname: string): Promise<DomainStatus> {
  return {
    hostname,
    clientStatus: (await pointsToAppHost(hostname)) ? "Ready" : "Awaiting configuration",
  };
}

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
    const rawEmail = formData.get("email") as string;
    const email = rawEmail?.toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Response("Invalid email", { status: 400 });
    }
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
          email,
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
    await createAssetOrder({
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
      asset: asset as typeof asset & { user: typeof asset.user },
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

  if (intent === "update_trained") {
    const user = await getUserOrRedirect(request);
    await db.user.update({
      where: {
        id: user.id,
      },
      data: {
        trained: true,
      },
    });
    return { success: true };
  }

  if (intent === "self") {
    return await getUserOrNull(request);
  }

  if (intent === "update_domain") {
    const user = await getUserOrRedirect(request);
    const domain = formData.get("domain") as string;
    const exists = await db.user.findFirst({
      where: {
        domain,
      },
    });
    if (exists) {
      // return { error: "Este dominio ya está en uso, intenta con otro" };
    }
    if (user.domain && user.domain !== domain) await unregisterAppHostname(user.domain);
    if (!(await registerAppHostname(domain))) {
      return { error: "No se pudo dar de alta el dominio. Intenta de nuevo en un momento." };
    }
    await db.user.update({
      where: { id: user.id },
      data: { domain, dnsConfig: await domainStatus(domain) },
    });
    return { success: true };
  }

  if (intent === "check_domain") {
    const user = await getUserOrNull(request);
    if (!user) return null;

    const domain = formData.get("domain") as string;
    const status = await domainStatus(domain);
    await db.user.update({
      where: { id: user.id },
      data: { domain, dnsConfig: status },
    });
    return status;
  }

  if (intent === "update_host") {
    const currentUser = await getUserOrRedirect(request);
    const host = formData.get("host") as string;

    if (!currentUser) return { error: "User not found" };

    // `<host>.easybits.cloud` lo cubre el cert comodín del fierro: no hay alta por tienda.
    await db.user.update({
      where: { id: currentUser.id },
      data: { host },
    });

    return { success: true, nextStep: 1 };
  }

  if (intent === "remove_host") {
    await getUserOrRedirect(request);
    const host = formData.get("host") as string;
    const domain = getServerDomain();

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
