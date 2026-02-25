import { NavLink, Outlet, redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/admin";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  if (!adminEmails.includes(user.email?.toLowerCase() || "")) {
    return redirect("/dash");
  }
  return null;
};

const tabs = [
  { to: "/dash/admin", label: "Usuarios", end: true },
  { to: "/dash/admin/waitlist", label: "Waitlist" },
];

export default function AdminLayout() {
  return (
    <article className="pt-20 px-8 md:pl-36 w-full">
      <h1 className="text-3xl font-black tracking-tight mb-6 uppercase">
        Admin
      </h1>
      <nav className="flex gap-2 mb-8">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              isActive
                ? "group rounded-xl bg-black"
                : "group rounded-xl bg-transparent"
            }
          >
            {({ isActive }) => (
              <span
                className={`block px-4 py-2 text-sm font-bold rounded-xl border-2 border-black transition-all ${
                  isActive
                    ? "bg-brand-500 text-white -translate-x-1 -translate-y-1"
                    : "bg-white hover:-translate-x-1 hover:-translate-y-1"
                }`}
              >
                {tab.label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </article>
  );
}
