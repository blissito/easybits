import { useFetcher, useSearchParams } from "react-router";
import { data } from "react-router";
import { db } from "~/.server/db";
import { getPaginatedUsers } from "~/.server/pagination/admin";
import { PaginatedTable } from "~/components/common/pagination/PaginatedTable";
import { TablePagination } from "~/components/common/pagination/TablePagination";
import type { Route } from "./+types/users";
import { useState } from "react";

export const meta = () => [
  { title: "Usuarios — EasyBits" },
  { name: "robots", content: "noindex" },
];

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

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const userId = formData.get("userId") as string;

  if (!userId) return data({ error: "Missing userId" }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return data({ error: "User not found" }, { status: 404 });

  switch (intent) {
    case "addRole": {
      const role = formData.get("role") as string;
      if (!role) return data({ error: "Missing role" }, { status: 400 });
      if (user.roles.includes(role)) return { ok: true };
      await db.user.update({
        where: { id: userId },
        data: { roles: { push: role } },
      });
      return { ok: true };
    }
    case "removeRole": {
      const role = formData.get("role") as string;
      if (!role) return data({ error: "Missing role" }, { status: 400 });
      await db.user.update({
        where: { id: userId },
        data: { roles: user.roles.filter((r) => r !== role) },
      });
      return { ok: true };
    }
    case "updateName": {
      const displayName = formData.get("displayName") as string;
      await db.user.update({
        where: { id: userId },
        data: { displayName },
      });
      return { ok: true };
    }
    case "disable": {
      await db.user.update({
        where: { id: userId },
        data: { roles: [] },
      });
      return { ok: true };
    }
    default:
      return data({ error: "Invalid intent" }, { status: 400 });
  }
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
                      <th scope="col" className="px-4 py-2"></th>
                      <th scope="col" className="px-4 py-2">Email</th>
                      <th scope="col" className="px-4 py-2">Nombre</th>
                      <th scope="col" className="px-4 py-2">Roles</th>
                      <th scope="col" className="px-4 py-2">Registro</th>
                      <th scope="col" className="px-4 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map((user: any) => (
                      <UserRow key={user.id} user={user} />
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination />
            </>
          )}
        </PaginatedTable>
      ) : (
        <div className="border-2 border-black rounded-xl p-12 text-center bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="font-bold text-gray-400 uppercase tracking-wider">No se encontraron usuarios.</p>
        </div>
      )}
    </div>
  );
}

function UserRow({ user }: { user: any }) {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [newRole, setNewRole] = useState("");
  const busy = fetcher.state !== "idle";

  return (
    <tr className="border-b-2 border-black hover:bg-gray-50 align-top">
      <td className="px-4 py-2">
        <img
          src={user.picture || "/images/profile.svg"}
          alt=""
          className="w-8 h-8 rounded-full"
        />
      </td>
      <td className="px-4 py-2 font-mono text-xs">{user.email}</td>
      <td className="px-4 py-2">
        {editing ? (
          <fetcher.Form
            method="post"
            className="flex gap-1"
            onSubmit={() => setEditing(false)}
          >
            <input type="hidden" name="intent" value="updateName" />
            <input type="hidden" name="userId" value={user.id} />
            <input
              name="displayName"
              defaultValue={user.displayName || ""}
              className="px-2 py-0.5 border-2 border-black rounded text-xs w-28"
              autoFocus
            />
            <button
              type="submit"
              className="text-xs font-bold bg-black text-white px-2 rounded"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs font-bold px-2"
            >
              X
            </button>
          </fetcher.Form>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="hover:underline text-left"
            title="Editar nombre"
          >
            {user.displayName || "—"}
          </button>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1 flex-wrap items-center">
          {user.roles.map((role: string) => (
            <span
              key={role}
              className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-md border border-brand-300 inline-flex items-center gap-1"
            >
              {role}
              <fetcher.Form
                method="post"
                className="inline"
                onSubmit={(e) => {
                  if (!confirm(`¿Quitar el rol "${role}" de ${user.email}?`)) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="removeRole" />
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="role" value={role} />
                <button
                  type="submit"
                  className="text-brand-500 hover:text-red-600 font-black text-xs leading-none"
                  title={`Quitar ${role}`}
                >
                  x
                </button>
              </fetcher.Form>
            </span>
          ))}
          <fetcher.Form
            method="post"
            className="inline-flex gap-1 items-center"
            onSubmit={() => setNewRole("")}
          >
            <input type="hidden" name="intent" value="addRole" />
            <input type="hidden" name="userId" value={user.id} />
            <input
              name="role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="+ rol"
              className="px-1 py-0.5 border border-black rounded text-xs w-16"
            />
            {newRole && (
              <button
                type="submit"
                className="text-xs font-bold bg-brand-500 text-white px-1.5 rounded"
              >
                +
              </button>
            )}
          </fetcher.Form>
        </div>
      </td>
      <td className="px-4 py-2 text-gray-500 text-xs">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-2">
        {user.roles.length === 0 ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="addRole" />
            <input type="hidden" name="role" value="Enrolled" />
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              disabled={busy}
              className="px-2 py-1 bg-green-600 text-white font-bold text-xs rounded-lg border-2 border-black hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform disabled:opacity-50"
            >
              Habilitar
            </button>
          </fetcher.Form>
        ) : (
          <fetcher.Form
            method="post"
            onSubmit={(e) => {
              if (!confirm(`¿Deshabilitar a ${user.email}? Se le quitarán todos los roles.`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="disable" />
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              disabled={busy}
              className="px-2 py-1 bg-red-600 text-white font-bold text-xs rounded-lg border-2 border-black hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform disabled:opacity-50"
            >
              Deshabilitar
            </button>
          </fetcher.Form>
        )}
      </td>
    </tr>
  );
}
