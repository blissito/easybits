import type { User } from "@prisma/client";
import { sendNewsLetter } from "./sendNewsLetter";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { db } from "../db";
import Agenda, { type Job, type JobAttributesData } from "agenda";

type Action = {
  assetId: string;
  name: string;
  intent: "send_email";
  gap: "in 1 week";
  index?: number;
  id?: string;
  markdown?: string;
};

export const startNewsletter = async (user: User, assetId: string) => {
  const asset = await db.asset.findUnique({
    where: {
      id: assetId,
    },
  });
  if (!asset) throw new Error("Newsletter not found");

  const newsLetterData = user.newsletters.find((n) => n.assetId === assetId);

  if (!newsLetterData || newsLetterData.next === 0) {
    return null; // avoid
  }

  // welcome email
  await sendNewsLetter({
    subject: asset.actions[0].name,
    email: user.email,
    getTemplate: () => sanitizeHtml(marked(asset.actions[0].markdown)),
  });

  newsLetterData.next = 1;
  const newsletters = [...user.newsletters];
  const nlIndex = newsletters.find((n) => n.assetId === assetId);
  newsletters.splice(nlIndex, 1, newsLetterData);

  await db.user.update({
    where: { id: user.id },
    data: { newsletters },
  });

  // schedule next one
  const agenda = new Agenda({ db: { address: process.env.DATABASE_URL! } });
  agenda.define("start_newsletter", async () => {
    await await sendNewsLetter({
      subject: asset.actions[1].name,
      email: user.email,
      getTemplate: () => sanitizeHtml(marked(asset.actions[1].markdown)),
      // @todo el token?
      // @todo avoid if already current is grater
    });
  });

  // @todo schedule next? or make it generic

  await agenda.start();
  agenda.schedule(asset.actions[0].gap, "start_newsletter");
};
