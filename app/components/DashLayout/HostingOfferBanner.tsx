import { Link, useLocation } from "react-router";

/**
 * Banner en todo el panel para el cliente al que una agencia le entregó apps: mientras no se
 * suscriba, las apps siguen siendo de la agencia. Lleva a /dash/hosting (donde ya está la
 * tarjeta con el desglose y el botón de pago), y ahí mismo no se muestra.
 */
export function HostingOfferBanner({
  apps,
  fromName,
  top,
}: {
  apps: number;
  fromName: string | null;
  top: boolean;
}) {
  const { pathname } = useLocation();
  if (pathname.startsWith("/dash/hosting")) return null;
  return (
    <div
      className={
        "fixed left-0 right-0 z-[99] bg-brand-500 border-b-2 border-black px-4 py-1.5 flex items-center justify-center gap-3 text-sm " +
        (top ? "top-0" : "top-9")
      }
    >
      <span className="text-black truncate">
        <strong>{fromName ?? "Tu equipo"}</strong> te entregó {apps} {apps === 1 ? "app" : "apps"}. Suscríbete
        para reclamar su propiedad.
      </span>
      <Link
        to="/dash/hosting"
        className="shrink-0 border-2 border-black rounded-lg px-2.5 py-0.5 bg-black text-white font-medium hover:opacity-80"
      >
        Suscribirme →
      </Link>
    </div>
  );
}
