import { getUserOrNull, getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/user";
import { db } from "~/.server/db";

import { startNewsletter } from "~/.server/emails/startNewsLetter";

// @todo use transactions
// const transaction = await prisma.$transaction([deletePosts, deleteUser])

export const action = async ({ request }: Route.ActionArgs) => {
  const url = new URL(request.url);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "free_subscription") {
    const email = formData.get("email") as string;
    const displayName = formData.get("displayName") as string;
    const assetId = formData.get("assetId") as string;

    const newsletterData = {
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
          newsletters: [newsletterData],
          email,
        },
      });
    } else {
      let newsletters = [...user.newsletters];
      const found = newsletters.find(
        (n) => n.assetId === newsletterData.assetId
      );
      if (!found) {
        newsletters = [...new Set([...newsletters, newsletterData])];
      }
      await db.user.update({
        where: { email },
        data: { newsletters },
      });
    }
    // trigger the 0 send
    await startNewsletter(user, assetId);
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
