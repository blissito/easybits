import type { Asset, User } from "@prisma/client";
import { sendNewsLetter } from "./sendNewsLetter";
import { db } from "../db";
import Agenda, { type Job } from "agenda";
import { interpolateStyles } from "~/routes/api/v1/utils";

// schedule this is v1 (@todo we want to bulk)
let agenda: Agenda;

const getAgenda = () => {
  agenda ??= new Agenda({ db: { address: process.env.DATABASE_URL! } });
  return agenda as typeof agenda;
};

type Action = {
  assetId: string;
  name: string;
  intent: "send_email";
  gap: "in 1 week";
  index?: number;
  id?: string;
  markdown?: string;
};

export type NewsLetter = {
  assetId: string;
  next: number;
};

export const findAction = (assetId: string, actions: Action[]) =>
  actions.find((n) => n.assetId === assetId);

export const findNewsletter = (assetId: string, newsletters: NewsLetter[]) =>
  newsletters.find((n) => n.assetId === assetId);

export const findNewsletterIndex = (
  assetId: string,
  newsletters: {
    assetId: string;
    next: number;
  }[]
) => newsletters.findIndex((n) => n.assetId === assetId);

export const updateNewsletterState = (
  assetId: string,
  user: User,
  asset: Asset
) => {
  const newsletters = [...user.newsletters];
  const userId = user.id;
  const actionsLength = asset.actions.length;
  const newsLetterData = findNewsletter(assetId, newsletters);

  if (!newsLetterData) throw new Error("newsletter state not found");

  newsLetterData.next = (newsLetterData.next + 1) % actionsLength; // bounded
  const nlIndex = findNewsletterIndex(assetId, newsletters);
  newsletters.splice(nlIndex, 1, newsLetterData);
  return db.user.update({
    where: { id: userId },
    data: { newsletters },
  });
};

export const scheduleNext = async (options: {
  userId: string;
  assetId: string;
}) => {
  const { userId, assetId } = options || {};
  // next schedule
  const asset = await db.asset.findUnique({
    where: {
      id: assetId,
    },
  });
  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user || !asset) throw new Error("Not user or asset found");

  const nld = findNewsletter(asset.id, user.newsletters);
  if (!nld) throw new Error("No newsletter data");

  if (nld.next === 0) {
    console.error("Newsletter already sent");
    // @todo send profile invite
    return;
  }

  if (nld.next === 1) {
    const firstAction = asset.actions[0] as Action;
    if (!firstAction) {
      console.error("Newsletter not found");
      return;
    }
    console.log("FIRST SEND 1", nld, firstAction.name);
    // @revisit send 0?
    await sendNewsLetter({
      subject: firstAction.name, // @revisit name used as subject
      email: user.email,
      getTemplate: () => interpolateStyles((firstAction as any).markdown),
    });
    // nld.next = 0; // 🪄✨ ???
  }

  const agenda = getAgenda();
  await agenda.start();
  agenda.schedule((asset.actions[nld.next] as Action).gap, "send_newsletter", {
    userId: user.id,
    assetId: asset.id,
    action: asset.actions[nld.next],
  });
  console.info("::Send Scheduled::" + (asset.actions[nld.next] as Action)?.gap);
};
// sendNewsLetter
getAgenda().define("send_newsletter", async (job: Job) => {
  const {
    attrs: { data },
  } = job || {};
  const { userId, assetId, action } = data;
  if (!action) throw new Error("No action found");

  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
  });
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || !user) throw new Error("No asset or user found");

  // const actions = [...asset.actions] as Action[];

  // if 0 stop
  const newsletter = findNewsletter(assetId, user.newsletters);
  if (!newsletter || newsletter?.next === 0) {
    throw new Error("Found finished newsletter");
  }

  // actual sending
  const result = await sendNewsLetter({
    subject: action.name,
    email: user.email, // @todo bulk
    getTemplate: () => interpolateStyles((action as any).markdown),
    // @todo el token?
    // @todo avoid if already current is grater
  });
  const isOk = result.response.includes("OK");
  if (!isOk) return; // if first sent failed stops
  // if(result.error) return; @todo
  //set n to newsletter state
  await updateNewsletterState(asset.id, user, asset);
  await scheduleNext({
    userId: user.id,
    assetId: asset.id,
  });
});
