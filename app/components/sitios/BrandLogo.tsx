import { BRAND_LOGOS } from "~/lib/brandLogos";

/** Logo oficial de un stack o motor por su id; EasyBits usa su propio logo. */
export function BrandLogo({ id, className = "w-5 h-5" }: { id: string; className?: string }) {
  if (id === "easybits") return <img src="/logo-purple.svg" alt="" className={`${className} shrink-0`} />;
  const logo = BRAND_LOGOS[id];
  if (!logo) return null;
  return (
    <svg
      viewBox={logo.viewBox}
      aria-hidden="true"
      className={`${className} shrink-0`}
      style={logo.color ? { color: logo.color, fill: "currentColor" } : undefined}
      dangerouslySetInnerHTML={{ __html: logo.body }}
    />
  );
}
