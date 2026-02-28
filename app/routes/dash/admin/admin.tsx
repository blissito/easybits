import { NavLink, Outlet, redirect } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";

export const meta = () => [
  { title: "Admin — EasyBits" },
  { name: "robots", content: "noindex" },
];
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/admin";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const isSuperAdmin = adminEmails.includes(user.email?.toLowerCase() || "");
  const isRoleAdmin = user.roles.includes("Admin");
  if (!isSuperAdmin && !isRoleAdmin) {
    return redirect("/dash");
  }
  return null;
};

const tabs = [
  { to: "/dash/admin", label: "Usuarios", end: true },
];

export default function AdminLayout() {
  return (
    <article className="pt-20 px-8 md:pl-36 w-full">
      <h1 className="text-3xl font-black tracking-tight mb-6 uppercase">
        Admin
      </h1>
      <nav className="flex gap-2 mb-8" aria-label="Secciones de administración">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="contents">
            {({ isActive }) => (
              <BrutalButton
                size="chip"
                mode={isActive ? "inverted" : "ghost"}
                className="text-sm px-4 py-2"
              >
                {tab.label}
              </BrutalButton>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </article>
  );
}
