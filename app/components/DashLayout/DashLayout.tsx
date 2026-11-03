import { data, Outlet, redirect } from "react-router";
import { HeaderMobile, SideBar } from "./SideBar";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { HostingOfferBanner } from "./HostingOfferBanner";
import { pendingOffersForEmail } from "~/.server/core/hostingOfferOperations";
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
    throw redirect(
      "/login?next=" + encodeURIComponent(url.pathname + url.search)
    );
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
    const target = new URL(request.url);
    return redirect(
      "/onboarding?next=" +
        encodeURIComponent(target.pathname + target.search)
    );
  }
  const isAdmin = isAdminUser(user);
  const [unreadCount, pendingOffer] = await Promise.all([
    countUnread(user.id).catch(() => 0),
    // Una agencia le entregó apps y aún no se suscribe: banner en todo el panel.
    pendingOffersForEmail(user.email).catch(() => null),
  ]);

  // Limpieza proactiva: si el user logueado todavía trae cookie de share
  // pegada (de una visita previa al share link), la borramos para que no
  // pueda causar confusiones futuras en navegadores donde caduque la
  // sesión y caigan en el branch isShareSession.
  const cookieHeader = request.headers.get("Cookie") || "";
  if (cookieHeader.includes("eb_share=")) {
    return data(
      { isAdmin, isShareSession: false, impersonating, unreadCount, pendingOffer, picture: user.picture ?? null },
      { headers: { "Set-Cookie": clearShareCookie() } }
    );
  }
  return { isAdmin, isShareSession: false, impersonating, unreadCount, pendingOffer, picture: user.picture ?? null };
};

export default function DashLayout({ loaderData }: Route.ComponentProps) {
  const isAdmin = loaderData?.isAdmin ?? false;
  const isShareSession = loaderData?.isShareSession ?? false;
  const impersonating = loaderData?.impersonating ?? null;
  const unreadCount = loaderData?.unreadCount ?? 0;
  const picture = (loaderData as { picture?: string | null } | undefined)?.picture ?? null;
  const pendingOffer =
    (loaderData as { pendingOffer?: { apps: number; fromName: string | null } | null } | undefined)?.pendingOffer ?? null;
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
        "flex relative min-h-svh bg-pattern" +
        (impersonating && pendingOffer ? " pt-[4.5rem]" : impersonating || pendingOffer ? " pt-9" : "")
      }
    >
      {impersonating && (
        <ImpersonationBanner
          asEmail={impersonating.asEmail}
          asName={impersonating.asName}
        />
      )}
      {pendingOffer && (
        <HostingOfferBanner apps={pendingOffer.apps} fromName={pendingOffer.fromName} top={!impersonating} />
      )}
      <HeaderMobile isAdmin={isAdmin} />
      <SideBar isAdmin={isAdmin} unreadCount={unreadCount} picture={picture} />
      <Outlet />
    </main>
  );
}
