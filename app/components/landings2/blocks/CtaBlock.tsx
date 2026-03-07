import type { LandingBlock } from "~/lib/landing2/blockTypes";

export function CtaBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  return (
    <div
      style={{ background: "var(--landing-accent)", color: "var(--landing-accent-text)" }}
      className="py-20"
    >
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ headline: e.currentTarget.textContent || "" })}
          className="text-3xl lg:text-4xl font-extrabold outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.headline || "¿Listo para empezar?"}
        </h2>
        <p
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ subtitle: e.currentTarget.textContent || "" })}
          className="mt-4 text-lg opacity-80 max-w-xl mx-auto outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.subtitle || "Subtítulo"}
        </p>
        <div className="mt-10">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ ctaText: e.currentTarget.textContent || "" })}
            style={{ background: "var(--landing-bg)", color: "var(--landing-accent)" }}
            className="inline-block px-8 py-4 rounded-lg font-bold text-lg cursor-text outline-none focus:ring-2 focus:ring-brand-500/30 shadow-lg"
          >
            {c.ctaText || "Empezar gratis"}
          </span>
        </div>
        <input
          type="text"
          value={c.ctaUrl || ""}
          onChange={(e) => onUpdate({ ctaUrl: e.target.value })}
          placeholder="URL del botón (ej: https://...)"
          className="mt-3 text-xs bg-white/80 backdrop-blur border rounded-lg px-2 py-1 w-full max-w-xs mx-auto"
        />
      </div>
    </div>
  );
}
