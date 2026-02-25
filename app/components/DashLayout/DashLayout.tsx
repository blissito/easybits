import { Outlet, redirect } from "react-router";
import { HeaderMobile, SideBar } from "./SideBar";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/DashLayout";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // @todo move to a function?
  if (
    !user.metadata?.customer_type ||
    (user.metadata?.asset_types.length || 0) < 1
  ) {
    return redirect("/onboarding");
  }
  const isEnrolled = user.roles.find((r) => r === "Enrolled");
  const isProd = process.env.NODE_ENV !== "development";
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
  const isAdmin = adminEmails.includes(user.email?.toLowerCase() || "") || user.roles.includes("Admin");
  if (isProd && !isEnrolled && !isAdmin) {
    return redirect("/waitlist");
  }
  return { isAdmin };
};

export default function DashLayout({ loaderData }: Route.ComponentProps) {
  const isAdmin = loaderData?.isAdmin ?? false;
  return (
    <main className="flex relative  min-h-svh bg-pattern">
      <HeaderMobile isAdmin={isAdmin} />
      <SideBar isAdmin={isAdmin} />
      <Outlet />
    </main>
  );
}
