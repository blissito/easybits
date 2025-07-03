import { redirect } from "react-router";
import { db } from "./db";
import type { Order, Prisma } from "@prisma/client";

export const updateUser = async ({ userId, data }) => {
  console.log({ userId, data });
  return await db.user.update({
    where: {
      id: userId,
    },
    data,
  });
};

export const getMerchantOrders = ({
  userId,
  select,
}: {
  userId: string;
  select?: Prisma.OrderSelect;
}) => {
  return db.order.findMany({
    select: select || {
      id: true,
      asset: true,
      customer: true,
      total: true,
      status: true,
      createdAt: true,
    },
    where: {
      merchantId: userId,
    },
  }) as Promise<Partial<Order>[]>;
};
