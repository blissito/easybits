import { db } from "../db";
import {
  REFERRAL_SIGNUP_BONUS,
  REFERRAL_UPGRADE_BONUS,
  REFERRAL_WELCOME_BONUS,
  MAX_REFERRALS,
} from "~/lib/plans";
import logger from "../logger";

export async function processReferralSignup(
  referredUserId: string,
  referrerPublicKey: string
) {
  try {
    const referrer = await db.user.findUnique({
      where: { publicKey: referrerPublicKey },
      select: { id: true },
    });
    if (!referrer) return;
    if (referrer.id === referredUserId) return;

    // Check if referred already has a referral
    const existing = await db.referral.findUnique({
      where: { referredId: referredUserId },
    });
    if (existing) return;

    // Check referrer cap
    const count = await db.referral.count({
      where: { referrerId: referrer.id },
    });
    if (count >= MAX_REFERRALS) return;

    // Create referral and award bonuses
    await db.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: referredUserId,
        status: "SIGNED_UP",
        bonusAwarded: REFERRAL_SIGNUP_BONUS,
      },
    });

    await db.user.update({
      where: { id: referrer.id },
      data: { aiGenerationsBonus: { increment: REFERRAL_SIGNUP_BONUS } },
    });

    await db.user.update({
      where: { id: referredUserId },
      data: { aiGenerationsBonus: { increment: REFERRAL_WELCOME_BONUS } },
    });

    logger.info("Referral signup processed", {
      referrerId: referrer.id,
      referredId: referredUserId,
    });
  } catch (error) {
    logger.error("Error processing referral signup", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function processReferralUpgrade(referredUserId: string) {
  try {
    const referral = await db.referral.findUnique({
      where: { referredId: referredUserId },
    });
    if (!referral || referral.status !== "SIGNED_UP") return;

    await db.referral.update({
      where: { id: referral.id },
      data: {
        status: "UPGRADED",
        bonusAwarded: { increment: REFERRAL_UPGRADE_BONUS },
      },
    });

    await db.user.update({
      where: { id: referral.referrerId },
      data: { aiGenerationsBonus: { increment: REFERRAL_UPGRADE_BONUS } },
    });

    logger.info("Referral upgrade processed", {
      referrerId: referral.referrerId,
      referredId: referredUserId,
    });
  } catch (error) {
    logger.error("Error processing referral upgrade", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getReferralStats(userId: string) {
  const referrals = await db.referral.findMany({
    where: { referrerId: userId },
    include: {
      referred: {
        select: { displayName: true, picture: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalBonus = referrals.reduce((sum, r) => sum + r.bonusAwarded, 0);

  return {
    count: referrals.length,
    totalBonus,
    referrals: referrals.map((r) => ({
      id: r.id,
      displayName: r.referred.displayName,
      picture: r.referred.picture,
      status: r.status,
      bonusAwarded: r.bonusAwarded,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
