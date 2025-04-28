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
  if (isProd && !isEnrolled) {
    return redirect("/waitlist");
  }
  return null;
};

export default function DashLayout() {
  return (
    <main className="flex relative  min-h-screen">
      <HeaderMobile />
      <SideBar />
      <Outlet />
    </main>
  );
}
