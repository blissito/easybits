import { db } from "~/.server/db";

interface GetPaginatedClientsParams {
  user: any;
  page: number;
  pageSize: number;
}

export async function getPaginatedClients({
  user,
  page,
  pageSize,
}: GetPaginatedClientsParams) {
  const assets = await db.asset.findMany({
    where: {
      userId: user.id,
    },
  });
  const assetIds = assets.map((a) => a.id);
  const allClients = await db.user.findMany({
    where: {
      assetIds: {
        hasSome: assetIds,
      },
    },
    select: {
      picture: true,
      id: true,
      displayName: true,
      email: true,
    },
  });
  const totalItems = allClients.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const clients = allClients.slice(
    (page - 1) * pageSize,
    (page - 1) * pageSize + pageSize
  );
  return {
    clients,
    pagination: {
      currentPage: page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}
