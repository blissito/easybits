import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function TeamBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const members = c.members || [];
  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...members];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ members: updated });
  };
  const addItem = () =>
    onUpdate({
      members: [...members, { name: "Nombre", role: "Rol", imageUrl: "", bio: "" }],
    });
  const removeItem = (index: number) =>
    onUpdate({ members: members.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}>
      <BlockFloatingToolbar>
        <VariantSelector
          options={BLOCK_VARIANTS.team!}
          value={c.variant || "grid"}
          onChange={(v) => onUpdate({ variant: v })}
        />
      </BlockFloatingToolbar>
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl font-extrabold text-center mb-10 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Nuestro equipo"}
          </h2>
          <div
            className={
              c.variant === "cards"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
                : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8"
            }
          >
            {members.map((m: any, i: number) => (
              <div key={i} className="relative group border border-dashed border-gray-300 rounded-xl p-5 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
                {m.imageUrl ? (
                  <img src={m.imageUrl} alt={m.name || ""} className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-2xl font-bold">
                    {(m.name || "?")[0]}
                  </div>
                )}
                <input
                  type="text"
                  value={m.imageUrl || ""}
                  onChange={(e) => updateItem(i, "imageUrl", e.target.value)}
                  placeholder="URL avatar"
                  className="text-xs bg-white/80 border rounded px-2 py-1 w-full"
                />
                <h3
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateItem(i, "name", e.currentTarget.textContent || "")}
                  className="font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1 text-center"
                >
                  {m.name || "Nombre"}
                </h3>
                <p
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateItem(i, "role", e.currentTarget.textContent || "")}
                  className="text-sm opacity-70 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1 text-center"
                >
                  {m.role || "Rol"}
                </p>
                <p
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateItem(i, "bio", e.currentTarget.textContent || "")}
                  className="text-xs opacity-60 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1 text-center"
                >
                  {m.bio || "Bio"}
                </p>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={addItem}
              className="px-4 py-2 text-sm font-bold border-2 border-black rounded-lg shadow-[2px_2px_0_#000] bg-white hover:bg-gray-50"
            >
              + Miembro
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
