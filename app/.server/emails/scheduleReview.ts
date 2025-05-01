import type { Asset, User } from "@prisma/client";
import Agenda from "agenda";
import { sendReview } from "./sendReview";

let agenda: Agenda;
const getAgenda = () => {
  agenda ??= new Agenda({ db: { address: process.env.DATABASE_URL! } });
  return agenda as typeof agenda;
};

export const scheduleReview = async ({
  asset,
  user,
  when = "in 7 days", // change time span here
}: {
  when: string;
  asset: Asset & { user: User };
  user: User;
}) => {
  const agenda = getAgenda();
  await agenda.start();
  agenda.schedule(when, "send_review", {
    assetId: asset.id,
    assetTitle: asset.title,
    creatorName: asset.user.displayName,
    email: user.email,
  });
};

// 2 definition
getAgenda().define("send_review", async (job: any) => {
  console.info("::JOB_WORKING::", job.attrs.name);
  const { assetTitle, creatorName, email, assetId } = job.attrs?.data || {};
  if (!assetTitle || !email || !creatorName || !assetId) {
    const error = new Error(
      "missing data to execute correctly::execution_avoided::"
    );
    console.error(error);
    throw error;
  }

  console.info("About to send::");
  sendReview(email, { assetTitle, creatorName, assetId });
});
