import { Outlet, redirect } from "react-router";
import { HeaderMobile, SideBar } from "./SideBar";
import { getUserOrNull } from "~/.server/getters";
import { hasValidShareCookie } from "~/.server/shareLinks";
import type { Route } from "./+types/DashLayout";

export const loader = async ({ request }: Route.LoaderArgs) => {
  // Guest share sessions skip the login + onboarding gates here. The child
  // route's loader is responsible for validating the share against the
  // requested resource and rejecting mismatches.
  const isShareSession = await hasValidShareCookie(request);
  if (isShareSession) {
    return { isAdmin: false, isShareSession: true };
  }

  const user = await getUserOrNull(request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect("/login?next=" + url.pathname);
  }
  if (
    !user.metadata?.customer_type ||
    (user.metadata?.asset_types.length || 0) < 1
  ) {
    return redirect("/onboarding");
  }
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
  const isAdmin = adminEmails.includes(user.email?.toLowerCase() || "") || user.roles.includes("Admin");
  return { isAdmin, isShareSession: false };
};

export default function DashLayout({ loaderData }: Route.ComponentProps) {
  const isAdmin = loaderData?.isAdmin ?? false;
  const isShareSession = loaderData?.isShareSession ?? false;
  if (isShareSession) {
    return (
      <main className="flex relative min-h-svh bg-pattern">
        <Outlet />
      </main>
    );
  }
  return (
    <main className="flex relative  min-h-svh bg-pattern">
      <HeaderMobile isAdmin={isAdmin} />
      <SideBar isAdmin={isAdmin} />
      <Outlet />
    </main>
  );
}
