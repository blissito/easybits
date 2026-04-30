import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BrutalButton } from "~/components/common/BrutalButton";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { cn } from "~/utils/cn";

export const meta = () => [
  ...getBasicMetaTags({
    title: "Brand Kit — EasyBits",
    description:
      "Descarga logos, isotipo y wordmark de EasyBits. SVG y PNG en variantes color, blanco y negro mono.",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/brand" },
];

type Asset = {
  href: string;
  label: string;
  bg: "light" | "dark";
  variant: "color" | "light" | "mono-black" | "mono-white";
};

const FULL_LOCKUPS: Asset[] = [
  { href: "/brand/logo.png", label: "Color", bg: "light", variant: "color" },
  { href: "/brand/logo-light.png", label: "Color sobre oscuro", bg: "dark", variant: "light" },
  { href: "/brand/logo-mono-black.png", label: "Mono negro", bg: "light", variant: "mono-black" },
  { href: "/brand/logo-mono-white.png", label: "Mono blanco", bg: "dark", variant: "mono-white" },
];

const COMPONENTS = [
  { href: "/brand/isotipo.svg", label: "Isotipo", desc: "Solo el ícono" },
  { href: "/brand/wordmark.svg", label: "Wordmark", desc: "Solo el texto" },
];

const FAVICONS = [
  { href: "/brand/favicon-32.png", label: "32×32" },
  { href: "/brand/favicon-192.png", label: "192×192" },
  { href: "/brand/favicon-512.png", label: "512×512" },
];

const RULES = [
  "Mantén un margen mínimo equivalente a la altura del isotipo alrededor del logo.",
  "No estires, rotes ni recolores el logo. Usa la variante que corresponda al fondo.",
  "Sobre fondos claros usa la variante color o mono negro. Sobre fondos oscuros, color sobre oscuro o mono blanco.",
  "Tamaño mínimo recomendado: 32px de alto para el isotipo, 96px de ancho para el lockup completo.",
];

function AssetCard({ asset }: { asset: Asset }) {
  const dark = asset.bg === "dark";
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "border-2 border-black rounded-2xl p-8 flex items-center justify-center min-h-[180px]",
          dark ? "bg-black" : "bg-white",
        )}
      >
        <img
          src={asset.href}
          alt={asset.label}
          className="h-24 w-auto"
          loading="lazy"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{asset.label}</span>
        <a href={asset.href} download>
          <BrutalButton size="chip" mode="ghost">
            Descargar PNG
          </BrutalButton>
        </a>
      </div>
    </div>
  );
}

export default function BrandPage() {
  return (
    <section className="min-h-screen bg-white">
      <AuthNav />

      <div className="max-w-6xl mx-auto px-6 pt-32 pb-16">
        <header className="mb-16">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Brand Kit
          </h1>
          <p className="mt-4 text-lg text-gray-700 max-w-2xl">
            Logos, isotipo y wordmark de EasyBits. Úsalos para artículos,
            integraciones, presentaciones y co-marketing.
          </p>
          <div className="mt-6">
            <a href="/brand/brand-kit.zip" download>
              <BrutalButton mode="brand">Descargar kit completo (.zip)</BrutalButton>
            </a>
          </div>
        </header>

        <div className="space-y-16">
          <section>
            <h2 className="text-2xl font-bold mb-6">Logo completo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {FULL_LOCKUPS.map((a) => (
                <AssetCard key={a.href} asset={a} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">Componentes (SVG)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {COMPONENTS.map((c) => (
                <div key={c.href} className="flex flex-col gap-3">
                  <div className="border-2 border-black rounded-2xl p-8 flex items-center justify-center min-h-[180px] bg-white">
                    <img src={c.href} alt={c.label} className="h-24 w-auto" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-xs text-gray-500">{c.desc}</div>
                    </div>
                    <a href={c.href} download>
                      <BrutalButton size="chip" mode="ghost">
                        Descargar SVG
                      </BrutalButton>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">Favicons</h2>
            <div className="grid grid-cols-3 gap-6">
              {FAVICONS.map((f) => (
                <div key={f.href} className="flex flex-col gap-3">
                  <div className="border-2 border-black rounded-2xl p-8 flex items-center justify-center min-h-[180px] bg-white">
                    <img src={f.href} alt={f.label} className="h-24 w-auto" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{f.label}</span>
                    <a href={f.href} download>
                      <BrutalButton size="chip" mode="ghost">
                        PNG
                      </BrutalButton>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">Paleta</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="border-2 border-black rounded-2xl overflow-hidden">
                <div className="h-24" style={{ background: "#9870ED" }} />
                <div className="p-4">
                  <div className="font-semibold">Brand purple</div>
                  <div className="text-xs text-gray-500 font-mono">#9870ED</div>
                </div>
              </div>
              <div className="border-2 border-black rounded-2xl overflow-hidden">
                <div className="h-24 bg-black" />
                <div className="p-4">
                  <div className="font-semibold">Black</div>
                  <div className="text-xs text-gray-500 font-mono">#000000</div>
                </div>
              </div>
              <div className="border-2 border-black rounded-2xl overflow-hidden">
                <div className="h-24 bg-white border-b-2 border-black" />
                <div className="p-4">
                  <div className="font-semibold">White</div>
                  <div className="text-xs text-gray-500 font-mono">#FFFFFF</div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">Reglas de uso</h2>
            <ul className="space-y-3">
              {RULES.map((r) => (
                <li key={r} className="flex gap-3">
                  <span className="text-brand-500 font-bold">•</span>
                  <span className="text-gray-700">{r}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <Footer />
    </section>
  );
}
