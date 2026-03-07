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
    <div className="py-16 px-6 bg-gray-900 text-white rounded-2xl mx-4 my-2">
      <div className="max-w-3xl mx-auto text-center">
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
        <div className="mt-8">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ ctaText: e.currentTarget.textContent || "" })}
            className="inline-block bg-white text-gray-900 px-6 py-3 rounded-lg font-bold text-lg cursor-text outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {c.ctaText || "Empezar gratis"}
          </span>
        </div>
      </div>
    </div>
  );
}
