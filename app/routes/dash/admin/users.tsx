import { useSearchParams } from "react-router";
import { getPaginatedUsers } from "~/.server/pagination/admin";
import { PaginatedTable } from "~/components/common/pagination/PaginatedTable";
import { TablePagination } from "~/components/common/pagination/TablePagination";
import type { Route } from "./+types/users";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url, `http://${request.headers.get("host")}`);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 20);
  const search = url.searchParams.get("search") || undefined;

  const { users, pagination } = await getPaginatedUsers({
    page,
    pageSize,
    search,
  });
  return { users, pagination };
};

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  const { users, pagination } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <div>
      <form
        className="mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const search = fd.get("search") as string;
          setSearchParams(search ? { search } : {});
        }}
      >
        <div className="flex gap-2">
          <input
            name="search"
            type="text"
            defaultValue={searchParams.get("search") || ""}
            placeholder="Buscar por email..."
            className="px-4 py-2 border-2 border-black rounded-xl font-mono text-sm w-full max-w-md"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white font-bold rounded-xl border-2 border-black text-sm hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform"
          >
            Buscar
          </button>
        </div>
      </form>

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
                      <th className="px-4 py-2">Roles</th>
                      <th className="px-4 py-2">Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map((user: any) => (
                      <tr
                        key={user.id}
                        className="border-b-2 border-black hover:bg-gray-50"
                      >
                        <td className="px-4 py-2">
                          <img
                            src={user.picture || "/images/profile.svg"}
                            alt=""
                            className="w-8 h-8 rounded-full"
                          />
                        </td>
                        <td className="px-4 py-2 font-mono">{user.email}</td>
                        <td className="px-4 py-2">
                          {user.displayName || "—"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {user.roles.map((role: string) => (
                              <span
                                key={role}
                                className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-md border border-brand-300"
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination />
            </>
          )}
        </PaginatedTable>
      ) : (
        <p className="text-gray-500 font-mono">No se encontraron usuarios.</p>
      )}
    </div>
  );
}
