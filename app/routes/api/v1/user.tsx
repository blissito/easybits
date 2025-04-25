import { getUserOrNull, getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/user";
import { db } from "~/.server/db";

import { findNewsletter, scheduleNext } from "~/.server/emails/startNewsLetter";
import { sendPurchase } from "~/.server/emails/sendPurchase";
import {
  createHost,
  listHosts,
  removeHost,
} from "~/lib/fly_certs/certs_getters";
import { FaLessThanEqual } from "react-icons/fa";
// @TODO: recaptcha (cloudflare?)
// @todo use transactions
// const transaction = await prisma.$transaction([deletePosts, deleteUser])

export const action = async ({ request }: Route.ActionArgs) => {
  const url = new URL(request.url);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // @todo is this ok in here?
  if (intent === "free_subscription") {
    const email = formData.get("email") as string;
    const displayName = formData.get("displayName") as string;
    const assetId = formData.get("assetId") as string;

    // @todo separate this in an if block
    const initialNewsletterData = {
      next: 1,
      assetId,
    };

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
      let newsletters = [...user.newsletters];
      const found = findNewsletter(assetId, newsletters);
      if (!found) {
        newsletters = [...new Set([...newsletters, initialNewsletterData])];
      }
      const assetIds = [...new Set([...user.assetIds, assetId])];

      user = await db.user.update({
        where: { email },
        data: { newsletters, assetIds },
      });
      // send purchase email?
      const asset = await db.asset.findUnique({
        where: { id: assetId },
        select: { title: true },
      });
      await sendPurchase({
        email: user.email,
        data: {
          assetName: asset.title,
          date: asset.createdAt,
          price: asset.price,
        },
      });
    }
    // schedule the next send or avoid (when 0) //@todo make this a if block
    await scheduleNext({ userId: user.id, assetId });
    return { success: true };
  }

  if (intent === "update_profile") {
    const user = await getUserOrRedirect(request);
    const data = JSON.parse(formData.get("data") as string);
    return await db.user.update({
      where: {
        id: user.id,
      },
      data,
    });
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
      return { error: "Este host ya está tomado, intenta con otro" };
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
    // const r = await listHosts();
    // console.log("LIST", JSON.stringify(r, false, 2));
    await db.user.update({
      where: {
        id: userId,
      },
      data: { host },
    });
    await createHost(`${host}.easybits.cloud`);
    return { success: true };
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
