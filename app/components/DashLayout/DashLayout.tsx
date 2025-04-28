import { Outlet } from "react-router";
import { HeaderMobile, SideBar } from "./SideBar";

export default function DashLayout() {
  return (
    <main className="flex relative  min-h-screen">
      <HeaderMobile />
      <SideBar />
      <Outlet />
    </main>
  );
}
