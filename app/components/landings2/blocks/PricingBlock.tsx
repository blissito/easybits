import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

interface PricingPlan {
  name?: string;
  price?: string;
  period?: string;
  features?: string;
  ctaText?: string;
  highlighted?: boolean;
}

export function PricingBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const plans: PricingPlan[] = c.plans || [];

  const updatePlan = (index: number, field: string, value: any) => {
    const updated = [...plans];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ plans: updated });
  };
  const addPlan = () =>
    onUpdate({
      plans: [
        ...plans,
        { name: "Plan", price: "$9", period: "/mes", features: "Feature 1\nFeature 2", ctaText: "Empezar", highlighted: false },
      ],
    });
  const removePlan = (index: number) =>
    onUpdate({ plans: plans.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }} className="py-20">
      <div className="max-w-7xl mx-auto px-6">
        <BlockFloatingToolbar>
          <VariantSelector
            options={BLOCK_VARIANTS.pricing || []}
            value={c.variant || "cards"}
            onChange={(v) => onUpdate({ variant: v })}
          />
        </BlockFloatingToolbar>

        <h2
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
          className="text-3xl lg:text-4xl font-extrabold text-center mb-12 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
        >
          {c.title || "Precios"}
        </h2>

        {(c.variant || "cards") === "cards" ? (
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan, i) => (
              <div
                key={i}
                className="relative group rounded-xl p-6"
                style={{
                  border: plan.highlighted ? "2px solid var(--landing-accent)" : "2px solid color-mix(in srgb, var(--landing-text) 15%, transparent)",
                  background: plan.highlighted ? "color-mix(in srgb, var(--landing-accent) 5%, var(--landing-bg))" : "var(--landing-bg)",
                  boxShadow: plan.highlighted ? "4px 4px 0 var(--landing-accent)" : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => removePlan(i)}
                  className="absolute top-2 right-2 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
                >
                  &times;
                </button>

                <div className="flex items-center justify-between mb-4">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => updatePlan(i, "name", e.currentTarget.textContent || "")}
                    className="font-bold text-lg outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                  >
                    {plan.name || "Plan"}
                  </span>
                  <label className="flex items-center gap-1 text-xs opacity-60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plan.highlighted || false}
                      onChange={(e) => updatePlan(i, "highlighted", e.target.checked)}
                      className="rounded"
                    />
                    Destacar
                  </label>
                </div>

                <div className="flex items-baseline gap-1 mb-4">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => updatePlan(i, "price", e.currentTarget.textContent || "")}
                    className="text-3xl font-extrabold outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                    style={{ color: "var(--landing-accent)" }}
                  >
                    {plan.price || "$9"}
                  </span>
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => updatePlan(i, "period", e.currentTarget.textContent || "")}
                    className="text-sm opacity-60 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                  >
                    {plan.period || "/mes"}
                  </span>
                </div>

                <textarea
                  value={plan.features || ""}
                  onChange={(e) => updatePlan(i, "features", e.target.value)}
                  placeholder="Una feature por línea"
                  rows={4}
                  className="w-full text-sm bg-white/50 border border-black/10 rounded-lg px-3 py-2 resize-none mb-4"
                />

                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updatePlan(i, "ctaText", e.currentTarget.textContent || "")}
                  className="block text-center font-bold py-2 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/30 px-2"
                  style={{ background: "var(--landing-accent)", color: "var(--landing-accent-text)" }}
                >
                  {plan.ctaText || "Empezar"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th
                    className="text-left py-3 px-4 font-bold"
                    style={{ borderBottom: "2px solid color-mix(in srgb, var(--landing-text) 20%, transparent)" }}
                  >
                    Feature
                  </th>
                  {plans.map((plan, i) => (
                    <th
                      key={i}
                      className="relative group py-3 px-4 text-center"
                      style={{
                        borderBottom: "2px solid color-mix(in srgb, var(--landing-text) 20%, transparent)",
                        background: plan.highlighted ? "color-mix(in srgb, var(--landing-accent) 10%, transparent)" : "transparent",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => removePlan(i)}
                        className="absolute top-1 right-1 text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        &times;
                      </button>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updatePlan(i, "name", e.currentTarget.textContent || "")}
                        className="font-bold outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                      >
                        {plan.name || "Plan"}
                      </span>
                      <label className="flex items-center justify-center gap-1 text-xs opacity-60 cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          checked={plan.highlighted || false}
                          onChange={(e) => updatePlan(i, "highlighted", e.target.checked)}
                          className="rounded"
                        />
                        Destacar
                      </label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    className="py-3 px-4 font-semibold"
                    style={{ borderBottom: "1px solid color-mix(in srgb, var(--landing-text) 10%, transparent)" }}
                  >
                    Precio
                  </td>
                  {plans.map((plan, i) => (
                    <td
                      key={i}
                      className="py-3 px-4 text-center"
                      style={{
                        borderBottom: "1px solid color-mix(in srgb, var(--landing-text) 10%, transparent)",
                        background: plan.highlighted ? "color-mix(in srgb, var(--landing-accent) 5%, transparent)" : "transparent",
                      }}
                    >
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updatePlan(i, "price", e.currentTarget.textContent || "")}
                        className="font-extrabold text-xl outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                        style={{ color: "var(--landing-accent)" }}
                      >
                        {plan.price || "$9"}
                      </span>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updatePlan(i, "period", e.currentTarget.textContent || "")}
                        className="text-xs opacity-60 outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                      >
                        {plan.period || "/mes"}
                      </span>
                    </td>
                  ))}
                </tr>
                {(() => {
                  const allFeatures = plans.reduce<string[]>((acc, p) => {
                    const feats = (p.features || "").split("\n").filter(Boolean);
                    feats.forEach((f) => { if (!acc.includes(f)) acc.push(f); });
                    return acc;
                  }, []);
                  return allFeatures.map((feat, fi) => (
                    <tr key={fi}>
                      <td
                        className="py-2 px-4"
                        style={{ borderBottom: "1px solid color-mix(in srgb, var(--landing-text) 8%, transparent)" }}
                      >
                        {feat}
                      </td>
                      {plans.map((plan, pi) => {
                        const planFeats = (plan.features || "").split("\n").filter(Boolean);
                        return (
                          <td
                            key={pi}
                            className="py-2 px-4 text-center"
                            style={{
                              borderBottom: "1px solid color-mix(in srgb, var(--landing-text) 8%, transparent)",
                              background: plan.highlighted ? "color-mix(in srgb, var(--landing-accent) 5%, transparent)" : "transparent",
                            }}
                          >
                            {planFeats.includes(feat) ? (
                              <span style={{ color: "var(--landing-accent)" }} className="font-bold">&#10003;</span>
                            ) : (
                              <span className="opacity-30">&#8212;</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
                <tr>
                  <td className="py-3 px-4" />
                  {plans.map((plan, i) => (
                    <td key={i} className="py-3 px-4 text-center" style={{ background: plan.highlighted ? "color-mix(in srgb, var(--landing-accent) 5%, transparent)" : "transparent" }}>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updatePlan(i, "ctaText", e.currentTarget.textContent || "")}
                        className="inline-block font-bold py-2 px-4 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/30"
                        style={{ background: "var(--landing-accent)", color: "var(--landing-accent-text)" }}
                      >
                        {plan.ctaText || "Empezar"}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <div className="mt-4 text-xs opacity-50 text-center">
              Edita las features en cada plan con el textarea del modo &quot;cards&quot;
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={addPlan}
            className="text-xs font-bold px-4 py-2 border-2 border-dashed border-black/20 rounded-xl hover:border-black/40"
          >
            + Agregar plan
          </button>
        </div>
      </div>
    </div>
  );
}
