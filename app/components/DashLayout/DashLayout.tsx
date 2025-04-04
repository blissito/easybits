import { Outlet, redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "../DashLayout/+types/DashLayout";
import { HeaderMobile, SideBar } from "./SideBar";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const isAdmin = user.roles.find((r) => r === "Admin");
  const isProd = process.env.NODE_ENV === "development";
  if (isProd && !isAdmin) {
    return redirect("/waitlist");
  }
  return { user };
};

export default function DashLayout({ loaderData }: Route.ComponentProps) {
  // const { user } = loaderData;

  return (
    <main className="flex relative z-10 min-h-screen">
      <HeaderMobile />
      <SideBar />
      <Outlet />
    </main>
  );
}
