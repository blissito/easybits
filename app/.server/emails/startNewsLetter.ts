import type { Asset, User } from "@prisma/client";
import { sendNewsLetter } from "./sendNewsLetter";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { db } from "../db";
import Agenda, { type Job, type JobAttributesData } from "agenda";

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

type NewsLetter = {
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
    console.error(new Error("Newsletter already sent"));
    // @todo send profile invite
    return;
  }

  const agenda = getAgenda();
  await agenda.start();
  agenda.schedule((asset.actions[nld.next] as Action).gap, "send_newsletter", {
    userId: user.id,
    assetId: asset.id,
  });
  console.info("::Send Scheduled::" + (asset.actions[nld.next] as Action)?.gap);
};

export const startNewsletter = async (assetId: string, user: User) => {
  const asset = await db.asset.findUnique({
    where: {
      id: assetId,
    },
  });
  if (!asset) throw new Error("Asset not found");

  const newsLetterData = findNewsletter(assetId, user.newsletters);

  if (!newsLetterData || newsLetterData.next === 0) {
    console.error(new Error("Newsletter not found or " + newsLetterData?.next));
    return; // avoid if 0
  }
  // first action (welcome)
  const action = asset.actions[0] as Action;
  await sendNewsLetter({
    subject: action.name, // @revisit name used as subject
    email: user.email,
    // @ts-ignore
    getTemplate: () => sanitizeHtml(marked(action.markdown)),
  });

  //set 1 to newsletter state
  await updateNewsletterState(asset.id, user, asset);

  const agenda = getAgenda();
  await agenda.start();
  agenda.schedule(action.gap, "send_newsletter", {
    userId: user.id,
    assetId,
  });
};

getAgenda().define("send_newsletter", async (job: Job) => {
  const {
    attrs: { data },
  } = job || {};
  const { userId, assetId } = data;
  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
  });
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || !user) throw new Error("No asset or user found");

  const actions = [...asset.actions] as Action[];

  // if 0 stop
  const newsletter = findNewsletter(assetId, user.newsletters);
  if (!newsletter || newsletter?.next === 0) {
    throw new Error("Found finished newsletter");
  }
  console.info("RUNNING::SEND_NEWLETTER::", newsletter);
  // find action
  const action = actions[newsletter.next];
  if (!action) throw new Error("No action found");

  // actual sending
  await sendNewsLetter({
    subject: action.name,
    email: user.email, // @todo bulk
    //@ts-ignore
    getTemplate: () => sanitizeHtml(marked(action.markdown)),
    // @todo el token?
    // @todo avoid if already current is grater
  });
  //set n to newsletter state
  await updateNewsletterState(asset.id, user, asset);
  await scheduleNext({
    userId: user.id,
    assetId: asset.id,
  });
});
