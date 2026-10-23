/**
 * Ilustraciones de las tarjetas del hero, en el lenguaje de public/home/*.svg:
 * contorno negro grueso, rellenos sólidos y sombra dura desplazada. Sin gradientes.
 */

const INK = "#000";
const STROKE = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

type Props = { className?: string };

/** Mancuerna: administrador de gimnasio. */
export function GymArt({ className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g transform="translate(3 3)" fill={INK}>
        <rect x="6" y="18" width="10" height="24" rx="3" />
        <rect x="42" y="18" width="10" height="24" rx="3" />
        <rect x="16" y="26" width="26" height="8" rx="2" />
      </g>
      <rect x="16" y="26" width="26" height="8" rx="2" fill="#d1d5db" {...STROKE} />
      <rect x="6" y="18" width="10" height="24" rx="3" fill="#9870ED" {...STROKE} />
      <rect x="42" y="18" width="10" height="24" rx="3" fill="#9870ED" {...STROKE} />
      <rect x="1" y="23" width="5" height="14" rx="2" fill="#fbbf24" {...STROKE} />
      <rect x="52" y="23" width="5" height="14" rx="2" fill="#fbbf24" {...STROKE} />
    </svg>
  );
}

/** Alcancía con moneda: app para mis finanzas. */
export function FinanceArt({ className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="35" cy="41" rx="22" ry="16" fill={INK} />
      <ellipse cx="32" cy="38" rx="22" ry="16" fill="#f9a8d4" {...STROKE} />
      <path d="M18 51 v7 h7 v-5 M39 53 v5 h7 v-7" fill="#f9a8d4" {...STROKE} />
      <circle cx="44" cy="33" r="2" fill={INK} />
      <rect x="25" y="25" width="12" height="3" rx="1.5" fill={INK} />
      <circle cx="31" cy="12" r="8" fill="#fbbf24" {...STROKE} />
      <path d="M31 8 v8" {...STROKE} />
    </svg>
  );
}

/** Factura con sello de pagado: reemplazo de Aspel y Compaq. */
export function InvoiceArt({ className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M17 7 h28 l8 8 v42 H17 z" fill={INK} transform="translate(3 3)" />
      <path d="M14 7 h28 l8 8 v42 H14 z" fill="#fff" {...STROKE} />
      <path d="M42 7 v8 h8" fill="#e5e7eb" {...STROKE} />
      <path d="M21 20 h14 M21 28 h22 M21 35 h22 M21 42 h12" {...STROKE} />
      <circle cx="42" cy="47" r="9" fill="#8DCF6E" {...STROKE} />
      <path d="M38 47 l3 3 l5 -6" fill="none" {...STROKE} />
    </svg>
  );
}

/** Calendario con un día apartado: aplicación de reservas. */
export function BookingArt({ className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="10" y="13" width="44" height="42" rx="5" fill={INK} transform="translate(3 3)" />
      <rect x="7" y="13" width="44" height="42" rx="5" fill="#fff" {...STROKE} />
      <path d="M7 18 a5 5 0 0 1 5 -5 h34 a5 5 0 0 1 5 5 v6 H7 z" fill="#f87171" {...STROKE} />
      <path d="M18 8 v9 M40 8 v9" {...STROKE} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) =>
          r === 1 && c === 2 ? null : <circle key={`${r}${c}`} cx={15 + c * 9.5} cy={32 + r * 8} r="1.8" fill={INK} />
        )
      )}
      <rect x="30" y="35" width="10" height="10" rx="2" fill="#9870ED" {...STROKE} />
    </svg>
  );
}

/** Agente de IA: la burbuja con ojitos de la marca (asset existente). */
export function AgentArt({ className }: Props) {
  return <img src="/icons/escribenos.svg" alt="" className={className} />;
}
