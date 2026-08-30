import { Link } from "react-router";
import Logo from "/logo-purple.svg";
import { FlipLetters } from "../animated/FlipLetters";
import { cn } from "~/utils/cn";

const MARK_SIZE = {
  sm: "w-8",
  nav: "w-12",
  hero: "w-20",
} as const;

/**
 * El logo de la casa: isotipo + "EasyBits" en dominó (FlipLetters).
 *
 * Vive aquí para que la navbar, el onboarding, las pantallas embebidas y
 * cualquier cosa nueva usen la misma marca, en vez de repetir el par
 * img+FlipLetters con clases distintas en cada archivo.
 */
export const BrandLogo = ({
  to,
  size = "nav",
  theme = "dark",
  layout = "row",
  className,
}: {
  /** Si se pasa, el logo es un link a esa ruta. Sin esto es sólo la marca. */
  to?: string;
  size?: keyof typeof MARK_SIZE;
  /** El fondo sobre el que va: "light" pinta las letras en negro. */
  theme?: "dark" | "light";
  layout?: "row" | "column";
  /** Para posicionar el bloque desde afuera (absolute, márgenes, etc.). */
  className?: string;
}) => {
  const mark = (
    <div
      className={cn(
        "flex items-center gap-3",
        layout === "column" && "flex-col gap-1",
        className
      )}
    >
      <img src={Logo} alt="EasyBits" className={MARK_SIZE[size]} />
      <FlipLetters word="EasyBits" type={theme === "light" ? "light" : undefined} />
    </div>
  );

  return to ? <Link to={to}>{mark}</Link> : mark;
};
