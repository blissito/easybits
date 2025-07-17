import { db } from "~/.server/db";

interface GetPaginatedOrdersParams {
  user: any;
  merchant: boolean;
  page: number;
  pageSize: number;
}

export async function getPaginatedOrders({
  user,
  merchant,
  page,
  pageSize,
}: GetPaginatedOrdersParams) {
  const offset = (page - 1) * pageSize;
  const assets = merchant
    ? []
    : await db.asset.findMany({
        select: { id: true },
        where: { userId: user.id },
      });
  const [orders, totalItems] = await Promise.all([
    db.order.findMany({
      select: {
        customer_email: true,
        asset: true,
        merchant: false,
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
