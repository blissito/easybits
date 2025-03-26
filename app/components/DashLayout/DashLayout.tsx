import { Outlet } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "../DashLayout/+types/DashLayout";
import { HeaderMobile, SideBar } from "./SideBar";

export const loader = async ({ request }: Route.LoaderArgs) => ({
  user: await getUserOrRedirect(request),
});

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
