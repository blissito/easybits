import { data, Outlet, redirect } from "react-router";
import { HeaderMobile, SideBar } from "./SideBar";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { getRealUserOrNull, getUserOrNull, isAdminUser } from "~/.server/getters";
import { clearShareCookie, hasValidShareCookie } from "~/.server/shareLinks";
import { countUnread } from "~/.server/core/notificationOperations";
import type { Route } from "./+types/DashLayout";

export const loader = async ({ request }: Route.LoaderArgs) => {
  // Si el visitante está logueado, SIEMPRE va por la vista normal del dash
  // (con sidebar). El share-cookie sólo tiene efecto cuando no hay sesión
  // de usuario — si no, una cookie de share quedaba pegada después de
  // visitar un share link y "robaba" el sidebar al dueño del dashboard.
  const user = await getUserOrNull(request);
  if (!user) {
    // Guest share sessions skip the login + onboarding gates aquí. El child
    // route's loader es responsable de validar el share contra el recurso
    // pedido y rechazar mismatches.
    const isShareSession = await hasValidShareCookie(request);
    if (isShareSession) {
      return { isAdmin: false, isShareSession: true, impersonating: null };
    }
    const url = new URL(request.url);
    throw redirect("/login?next=" + url.pathname);
  }
  // "Operar como": si el usuario efectivo (user) difiere del operador real,
  // estamos impersonando. El banner y el bypass de onboarding se basan en esto.
  const realUser = await getRealUserOrNull(request);
  const impersonating =
    realUser && realUser.id !== user.id
      ? { asEmail: user.email, asName: user.displayName }
      : null;
  if (
    !impersonating &&
    (!user.metadata?.customer_type ||
      (user.metadata?.asset_types.length || 0) < 1)
  ) {
    return redirect("/onboarding");
  }
  const isAdmin = isAdminUser(user);
  const unreadCount = await countUnread(user.id).catch(() => 0);

  // Limpieza proactiva: si el user logueado todavía trae cookie de share
  // pegada (de una visita previa al share link), la borramos para que no
  // pueda causar confusiones futuras en navegadores donde caduque la
  // sesión y caigan en el branch isShareSession.
  const cookieHeader = request.headers.get("Cookie") || "";
  if (cookieHeader.includes("eb_share=")) {
    return data(
      { isAdmin, isShareSession: false, impersonating, unreadCount },
      { headers: { "Set-Cookie": clearShareCookie() } }
    );
  }
  return { isAdmin, isShareSession: false, impersonating, unreadCount };
};

export default function DashLayout({ loaderData }: Route.ComponentProps) {
  const isAdmin = loaderData?.isAdmin ?? false;
  const isShareSession = loaderData?.isShareSession ?? false;
  const impersonating = loaderData?.impersonating ?? null;
  const unreadCount = loaderData?.unreadCount ?? 0;
  if (isShareSession) {
    return (
      <main className="flex relative min-h-svh bg-pattern">
        <Outlet />
      </main>
    );
  }
  return (
    <main
      className={
        "flex relative min-h-svh bg-pattern" + (impersonating ? " pt-9" : "")
      }
    >
      {impersonating && (
        <ImpersonationBanner
          asEmail={impersonating.asEmail}
          asName={impersonating.asName}
        />
      )}
      <HeaderMobile isAdmin={isAdmin} />
      <SideBar isAdmin={isAdmin} unreadCount={unreadCount} />
      <Outlet />
    </main>
  );
}
