import { Outlet, redirect } from "react-router";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "../DashLayout/+types/DashLayout";
import { HeaderMobile, SideBar } from "./SideBar";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const isEnrolled = user.roles.find((r) => r === "Enrolled");
  const isProd = process.env.NODE_ENV !== "development";
  if (isProd && !isEnrolled) {
    return redirect("/waitlist");
  }
  return { user };
};

export default function DashLayout({
  loaderData: { user },
}: Route.ComponentProps) {
  return (
    <main className="flex relative z-10 min-h-screen">
      <HeaderMobile />
      <SideBar />
      <Outlet />
    </main>
  );
}
