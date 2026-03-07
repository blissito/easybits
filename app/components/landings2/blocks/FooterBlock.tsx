import type { LandingBlock } from "~/lib/landing2/blockTypes";

export function FooterBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  return (
    <div className="py-10 px-6 bg-gray-100 rounded-2xl mx-4 my-2">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <span
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ companyName: e.currentTarget.textContent || "" })}
          className="font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.companyName || "Mi Empresa"}
        </span>
        <p className="text-sm text-gray-500">
          &copy; {new Date().getFullYear()} {c.companyName || "Mi Empresa"}
        </p>
      </div>
    </div>
  );
}
