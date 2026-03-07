import type { LandingBlock } from "~/lib/landing2/blockTypes";

export function HeroBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  return (
    <div className="py-16 lg:py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h1
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ headline: e.currentTarget.textContent || "" })}
          className="text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.headline || "Tu título aquí"}
        </h1>
        <p
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ subtitle: e.currentTarget.textContent || "" })}
          className="mt-6 text-xl opacity-70 max-w-2xl mx-auto outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.subtitle || "Subtítulo descriptivo"}
        </p>
        <div className="mt-8">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ ctaText: e.currentTarget.textContent || "" })}
            className="inline-block bg-black text-white px-6 py-3 rounded-lg font-bold text-lg cursor-text outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {c.ctaText || "Comenzar"}
          </span>
        </div>
      </div>
    </div>
  );
}
