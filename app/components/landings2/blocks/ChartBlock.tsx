import type { LandingBlock } from "~/lib/landing2/blockTypes";

const CHART_TYPES = ["bar", "line", "pie", "doughnut", "area"] as const;

export function ChartBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const chartType = c.chartType || "bar";
  const labels: string[] = c.labels || [];
  const datasets: { label: string; data: number[]; color: string }[] = c.datasets || [];

  const updateDataset = (index: number, field: string, value: any) => {
    const updated = [...datasets];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate({ datasets: updated });
  };

  const addDataset = () =>
    onUpdate({
      datasets: [
        ...datasets,
        { label: "Serie", data: labels.map(() => 0), color: "#9870ED" },
      ],
    });

  const removeDataset = (index: number) =>
    onUpdate({ datasets: datasets.filter((_: any, i: number) => i !== index) });

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}>
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl font-extrabold text-center mb-6 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Grafico"}
          </h2>

          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="text-xs font-bold">Tipo:</span>
            {CHART_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onUpdate({ chartType: t })}
                className={`px-3 py-1 text-xs font-bold rounded-lg border-2 border-black capitalize ${
                  chartType === t
                    ? "bg-brand-500 text-white shadow-[2px_2px_0_#000]"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-1">Labels (separados por coma)</label>
              <input
                type="text"
                value={labels.join(", ")}
                onChange={(e) =>
                  onUpdate({
                    labels: e.target.value.split(",").map((s: string) => s.trim()),
                  })
                }
                placeholder="Ene, Feb, Mar, Abr"
                className="w-full text-sm bg-white/80 border rounded-lg px-3 py-2"
              />
            </div>

            <div className="space-y-3">
              <span className="text-xs font-bold">Datasets</span>
              {datasets.map((ds: any, i: number) => (
                <div key={i} className="relative group border border-dashed border-gray-300 rounded-xl p-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => removeDataset(i)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ds.label || ""}
                      onChange={(e) => updateDataset(i, "label", e.target.value)}
                      placeholder="Nombre serie"
                      className="flex-1 text-sm bg-white/80 border rounded px-2 py-1"
                    />
                    <input
                      type="color"
                      value={ds.color || "#9870ED"}
                      onChange={(e) => updateDataset(i, "color", e.target.value)}
                      className="w-10 h-8 rounded border cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    value={(ds.data || []).join(", ")}
                    onChange={(e) =>
                      updateDataset(
                        i,
                        "data",
                        e.target.value.split(",").map((s: string) => Number(s.trim()) || 0)
                      )
                    }
                    placeholder="10, 20, 30, 40"
                    className="w-full text-sm bg-white/80 border rounded px-2 py-1"
                  />
                </div>
              ))}
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={addDataset}
                className="px-4 py-2 text-sm font-bold border-2 border-black rounded-lg shadow-[2px_2px_0_#000] bg-white hover:bg-gray-50"
              >
                + Dataset
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
