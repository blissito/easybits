import { useFetcher, useSearchParams } from "react-router";
import { data } from "react-router";
import { db } from "~/.server/db";
import { getPaginatedUsers } from "~/.server/pagination/admin";
import { PaginatedTable } from "~/components/common/pagination/PaginatedTable";
import { TablePagination } from "~/components/common/pagination/TablePagination";
import type { Route } from "./+types/users";
import { useState } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { PLANS, normalizePlan } from "~/lib/plans";

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
    case "addGenerations": {
      const amount = Number(formData.get("amount"));
      if (!amount || amount < 1 || amount > 1000)
        return data({ error: "Cantidad inválida" }, { status: 400 });
      const currentBonus = user.aiGenerationsBonus ?? 0;
      await db.user.update({
        where: { id: userId },
        data: { aiGenerationsBonus: currentBonus + amount },
      });
      await db.aiGenerationLog.create({
        data: { userId, type: "admin_bonus", product: "admin" },
      });
      return { ok: true };
    }
    case "subtractGenerations": {
      const amount = Number(formData.get("amount"));
      if (!amount || amount < 1 || amount > 1000)
        return data({ error: "Cantidad inválida" }, { status: 400 });
      const currentBonus = user.aiGenerationsBonus ?? 0;
      await db.user.update({
        where: { id: userId },
        data: { aiGenerationsBonus: Math.max(0, currentBonus - amount) },
      });
      await db.aiGenerationLog.create({
        data: { userId, type: "admin_deduct", product: "admin" },
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
    <div className="pb-12">
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
          <BrutalButton size="chip" type="submit" className="text-sm px-4 py-2">
            Buscar
          </BrutalButton>
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {paginatedUsers.map((user: any) => (
                  <UserCard key={user.id} user={user} />
                ))}
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

function EnableSwitch({ user, busy, fetcher, className }: { user: any; busy: boolean; fetcher: ReturnType<typeof useFetcher>; className?: string }) {
  const enabled = user.roles.length > 0;
  return (
    <fetcher.Form method="post" className={className}>
      <input type="hidden" name="intent" value={enabled ? "disable" : "addRole"} />
      {!enabled && <input type="hidden" name="role" value="Enrolled" />}
      <input type="hidden" name="userId" value={user.id} />
      <button
        type="submit"
        disabled={busy}
        aria-label={enabled ? "Deshabilitar usuario" : "Habilitar usuario"}
        className="relative inline-flex h-5 w-9 items-center rounded-full border-2 border-black transition-colors disabled:opacity-50"
        style={{ backgroundColor: enabled ? "#9870ED" : "#e5e7eb" }}
      >
        <span
          className="inline-block h-3 w-3 rounded-full bg-white border border-black transition-transform"
          style={{ transform: enabled ? "translateX(16px)" : "translateX(2px)" }}
        />
      </button>
    </fetcher.Form>
  );
}

function UserCard({ user }: { user: any }) {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [newRole, setNewRole] = useState("");
  const busy = fetcher.state !== "idle";

  const plan = normalizePlan((user.metadata as any)?.plan);
  const limit = PLANS[plan].aiGenerationsPerMonth;
  const used = user.aiGenerationsCount ?? 0;
  const bonus = user.aiGenerationsBonus ?? 0;
  const totalAvailable = limit !== null ? limit + bonus : null;
  const remaining = totalAvailable !== null ? Math.max(0, totalAvailable - used) : null;

  return (
    <article className="border-2 border-black rounded-xl bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
      {/* Header: avatar + info + switch */}
      <div className="flex items-center gap-3">
        <img
          src={user.picture || "/images/profile.svg"}
          alt=""
          className="w-10 h-10 rounded-full border-2 border-black flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <fetcher.Form
              method="post"
              className="flex gap-1 items-center"
              onSubmit={() => setEditing(false)}
            >
              <input type="hidden" name="intent" value="updateName" />
              <input type="hidden" name="userId" value={user.id} />
              <input
                name="displayName"
                defaultValue={user.displayName || ""}
                className="px-2 py-0.5 border-2 border-black rounded text-xs w-full"
                autoFocus
              />
              <BrutalButton size="chip" type="submit">OK</BrutalButton>
              <BrutalButton size="chip" mode="ghost" onClick={() => setEditing(false)}>X</BrutalButton>
            </fetcher.Form>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="font-bold text-sm truncate block hover:underline text-left w-full"
              title="Editar nombre"
            >
              {user.displayName || "—"}
            </button>
          )}
          <p className="font-mono text-[11px] text-gray-500 truncate">{user.email}</p>
        </div>
        <EnableSwitch user={user} busy={busy} fetcher={fetcher} className="flex-shrink-0" />
      </div>

      {/* Roles */}
      <div className="flex gap-1 flex-wrap items-center">
        {user.roles.map((role: string) => (
          <span
            key={role}
            className="px-2 py-0.5 bg-brand-100 text-brand-700 text-[11px] font-bold rounded-md border border-brand-300 inline-flex items-center gap-1"
          >
            {role}
            <fetcher.Form method="post" className="inline">
              <input type="hidden" name="intent" value="removeRole" />
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="role" value={role} />
              <button type="submit" className="text-red-500 font-bold hover:text-red-700 text-xs">x</button>
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
            className="px-1.5 py-0.5 border border-black rounded text-[11px] w-14"
          />
          {newRole && (
            <BrutalButton size="chip" type="submit" className="px-1.5 py-0">+</BrutalButton>
          )}
        </fetcher.Form>
      </div>

      {/* Gens + controls */}
      <div className="border-t border-gray-200 pt-2 flex items-center justify-between gap-2">
        <div>
          <span className={`text-xl font-bold ${remaining !== null && remaining <= 0 ? "text-red-500" : "text-green-600"}`}>
            {remaining ?? "∞"}
          </span>
          <span className="text-xs text-gray-400 ml-1">restantes</span>
          <div className="text-[10px] text-gray-400">
            {used}/{totalAvailable ?? "∞"} ({limit ?? "∞"} plan + {bonus} bonus)
          </div>
        </div>
        <GensControls userId={user.id} />
      </div>

      {/* Footer: date + plan */}
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>{new Date(user.createdAt).toLocaleDateString()}</span>
        <span className="uppercase font-bold tracking-wider">{plan}</span>
      </div>
    </article>
  );
}

function GensControls({ userId }: { userId: string }) {
  const fetcher = useFetcher();
  const [amount, setAmount] = useState("10");
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? (fetcher.data as any).error : null;

  const submit = (intent: string) => {
    fetcher.submit(
      { intent, userId, amount },
      { method: "post" }
    );
  };

  return (
    <div className="inline-flex gap-0.5 items-center mt-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => submit("subtractGenerations")}
        className="w-6 h-6 text-xs font-bold bg-red-100 text-red-600 border border-red-300 rounded hover:bg-red-200 disabled:opacity-50"
      >
        −
      </button>
      <input
        type="number"
        min="1"
        max="1000"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-12 h-6 text-center text-xs border border-black rounded px-0.5"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => submit("addGenerations")}
        className="w-6 h-6 text-xs font-bold bg-green-100 text-green-600 border border-green-300 rounded hover:bg-green-200 disabled:opacity-50"
      >
        +
      </button>
      {error && <span className="text-red-600 text-[10px] font-bold ml-1">{error}</span>}
    </div>
  );
}
