import { db } from "~/.server/db";

interface GetPaginatedUsersParams {
  page: number;
  pageSize: number;
  search?: string;
}

export async function getPaginatedUsers({
  page,
  pageSize,
  search,
}: GetPaginatedUsersParams) {
  const where = search
    ? { email: { contains: search, mode: "insensitive" as const } }
    : {};

  const [users, totalItems] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        picture: true,
        email: true,
        displayName: true,
        roles: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      currentPage: page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}
