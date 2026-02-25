import { useFetcher } from "react-router";
import { db } from "~/.server/db";
import { getPaginatedWaitlistUsers } from "~/.server/pagination/admin";
import { PaginatedTable } from "~/components/common/pagination/PaginatedTable";
import { TablePagination } from "~/components/common/pagination/TablePagination";
import type { Route } from "./+types/waitlist";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url, `http://${request.headers.get("host")}`);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 20);

  const { users, pagination } = await getPaginatedWaitlistUsers({
    page,
    pageSize,
  });
  return { users, pagination };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const userId = formData.get("userId") as string;
  if (!userId) return { error: "Missing userId" };

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found" };

  await db.user.update({
    where: { id: userId },
    data: { roles: { push: "Enrolled" } },
  });

  return { ok: true };
};

export default function AdminWaitlist({ loaderData }: Route.ComponentProps) {
  const { users, pagination } = loaderData;

  return (
    <div>
      {users.length > 0 ? (
        <PaginatedTable
          data={users}
          totalItems={pagination.totalItems}
          config={{ defaultPageSize: pagination.pageSize }}
        >
          {(paginatedUsers) => (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-2 border-black">
                  <thead>
                    <tr className="bg-black text-white text-left">
                      <th className="px-4 py-2"></th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Nombre</th>
                      <th className="px-4 py-2">Registro</th>
                      <th className="px-4 py-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map((user: any) => (
                      <WaitlistRow key={user.id} user={user} />
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination />
            </>
          )}
        </PaginatedTable>
      ) : (
        <p className="text-gray-500 font-mono">
          No hay usuarios en la waitlist.
        </p>
      )}
    </div>
  );
}

function WaitlistRow({ user }: { user: any }) {
  const fetcher = useFetcher();
  const isApproving = fetcher.state !== "idle";

  return (
    <tr className="border-b-2 border-black hover:bg-gray-50">
      <td className="px-4 py-2">
        <img
          src={user.picture || "/images/profile.svg"}
          alt=""
          className="w-8 h-8 rounded-full"
        />
      </td>
      <td className="px-4 py-2 font-mono">{user.email}</td>
      <td className="px-4 py-2">{user.displayName || "—"}</td>
      <td className="px-4 py-2 text-gray-500">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-2">
        <fetcher.Form method="post">
          <input type="hidden" name="userId" value={user.id} />
          <button
            type="submit"
            disabled={isApproving}
            className="px-3 py-1 bg-brand-500 text-white font-bold text-xs rounded-lg border-2 border-black hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform disabled:opacity-50"
          >
            {isApproving ? "Aprobando..." : "Aprobar"}
          </button>
        </fetcher.Form>
      </td>
    </tr>
  );
}
