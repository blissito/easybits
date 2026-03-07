import type { LandingBlock } from "~/lib/landing2/blockTypes";
import { BLOCK_VARIANTS } from "~/lib/landing2/blockTypes";
import { VariantSelector, BlockFloatingToolbar } from "./VariantSelector";

export function ComparisonBlock({
  block,
  onUpdate,
}: {
  block: LandingBlock;
  onUpdate: (content: Record<string, any>) => void;
}) {
  const c = block.content;
  const headers: string[] = c.headers || ["Feature", "Nosotros", "Otros"];
  const rows: { label: string; values: string[] }[] = c.rows || [];
  const highlightCol: number = c.highlightCol ?? 1;

  const updateHeader = (index: number, value: string) => {
    const updated = [...headers];
    updated[index] = value;
    onUpdate({ headers: updated });
  };

  const updateRow = (ri: number, field: string, value: any) => {
    const updated = [...rows];
    updated[ri] = { ...updated[ri], [field]: value };
    onUpdate({ rows: updated });
  };

  const updateCell = (ri: number, ci: number, value: string) => {
    const updated = [...rows];
    const vals = [...(updated[ri].values || [])];
    vals[ci] = value;
    updated[ri] = { ...updated[ri], values: vals };
    onUpdate({ rows: updated });
  };

  const addRow = () =>
    onUpdate({
      rows: [...rows, { label: "Feature", values: headers.slice(1).map(() => "-") }],
    });

  const removeRow = (index: number) =>
    onUpdate({ rows: rows.filter((_: any, i: number) => i !== index) });

  const addColumn = () => {
    const newHeaders = [...headers, "Columna"];
    const newRows = rows.map((r: any) => ({
      ...r,
      values: [...(r.values || []), "-"],
    }));
    onUpdate({ headers: newHeaders, rows: newRows });
  };

  return (
    <div style={{ background: "var(--landing-bg)", color: "var(--landing-text)" }}>
      <BlockFloatingToolbar>
        <VariantSelector
          options={BLOCK_VARIANTS.comparison!}
          value={c.variant || "table"}
          onChange={(v) => onUpdate({ variant: v })}
        />
      </BlockFloatingToolbar>
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ title: e.currentTarget.textContent || "" })}
            className="text-3xl font-extrabold text-center mb-6 outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg px-2"
          >
            {c.title || "Comparacion"}
          </h2>

          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold">Columna destacada:</span>
            {headers.slice(1).map((_: string, i: number) => (
              <button
                key={i}
                type="button"
                onClick={() => onUpdate({ highlightCol: i + 1 })}
                className={`px-3 py-1 text-xs font-bold rounded-lg border-2 border-black ${
                  highlightCol === i + 1
                    ? "bg-brand-500 text-white shadow-[2px_2px_0_#000]"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {headers.map((h: string, i: number) => (
                    <th
                      key={i}
                      className={`p-2 border border-gray-300 ${i === highlightCol ? "bg-brand-500/10" : ""}`}
                    >
                      <input
                        type="text"
                        value={h}
                        onChange={(e) => updateHeader(i, e.target.value)}
                        className="w-full text-center font-bold bg-transparent outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                      />
                    </th>
                  ))}
                  <th className="p-1 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, ri: number) => (
                  <tr key={ri} className="group">
                    <td className="p-2 border border-gray-300">
                      <input
                        type="text"
                        value={row.label || ""}
                        onChange={(e) => updateRow(ri, "label", e.target.value)}
                        className="w-full bg-transparent outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1 font-medium"
                      />
                    </td>
                    {(row.values || []).map((v: string, ci: number) => (
                      <td
                        key={ci}
                        className={`p-2 border border-gray-300 ${ci + 1 === highlightCol ? "bg-brand-500/10" : ""}`}
                      >
                        <input
                          type="text"
                          value={v}
                          onChange={(e) => updateCell(ri, ci, e.target.value)}
                          className="w-full text-center bg-transparent outline-none focus:ring-2 focus:ring-brand-500/30 rounded px-1"
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <button
                        type="button"
                        onClick={() => removeRow(ri)}
                        className="w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 mt-4 justify-center">
            <button
              type="button"
              onClick={addRow}
              className="px-4 py-2 text-sm font-bold border-2 border-black rounded-lg shadow-[2px_2px_0_#000] bg-white hover:bg-gray-50"
            >
              + Fila
            </button>
            <button
              type="button"
              onClick={addColumn}
              className="px-4 py-2 text-sm font-bold border-2 border-black rounded-lg shadow-[2px_2px_0_#000] bg-white hover:bg-gray-50"
            >
              + Columna
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
