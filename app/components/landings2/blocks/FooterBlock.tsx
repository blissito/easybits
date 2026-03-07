import type { LandingBlock } from "~/lib/landing2/blockTypes";

export function FooterBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const links: { label: string; url: string }[] = c.links || [];

  function updateLink(index: number, field: "label" | "url", value: string) {
    const updated = links.map((l, i) => (i === index ? { ...l, [field]: value } : l));
    onUpdate({ links: updated });
  }

  function addLink() {
    onUpdate({ links: [...links, { label: "Link", url: "#" }] });
  }

  function removeLink(index: number) {
    onUpdate({ links: links.filter((_, i) => i !== index) });
  }

  return (
    <div
      style={{ background: "var(--landing-text)", color: "var(--landing-bg)" }}
      className="py-12"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ companyName: e.currentTarget.textContent || "" })}
            className="font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.companyName || "Mi Empresa"}
          </span>

          <div className="flex flex-wrap items-center gap-3">
            {links.map((link, i) => (
              <div key={i} className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => updateLink(i, "label", e.target.value)}
                  className="text-xs bg-transparent border-none outline-none w-16 placeholder:opacity-50"
                  placeholder="Label"
                />
                <input
                  type="text"
                  value={link.url}
                  onChange={(e) => updateLink(i, "url", e.target.value)}
                  className="text-xs bg-transparent border-none outline-none w-20 opacity-60 placeholder:opacity-40"
                  placeholder="URL"
                />
                <button
                  type="button"
                  onClick={() => removeLink(i)}
                  className="text-xs opacity-50 hover:opacity-100 ml-1"
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addLink}
              className="text-xs opacity-50 hover:opacity-100 px-2 py-1 border border-current/20 rounded-lg"
            >
              + Link
            </button>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-white/10 text-center text-sm opacity-50">
          &copy; {new Date().getFullYear()} {c.companyName || "Mi Empresa"}. All rights reserved.
        </div>
      </div>
    </div>
  );
}
