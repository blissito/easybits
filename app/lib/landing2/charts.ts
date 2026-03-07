// Chart.js inline script generator for landing HTML output

interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
}

const CHART_COLORS = [
  "var(--landing-accent)",
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

export function buildChartScript(
  blockId: string,
  chartType: string,
  labels: string[],
  datasets: ChartDataset[],
): string {
  const type = chartType === "area" ? "line" : chartType;
  const isArea = chartType === "area";
  const isPie = type === "pie" || type === "doughnut";

  const dsJson = datasets.map((ds, i) => {
    const color = ds.color || CHART_COLORS[i % CHART_COLORS.length];
    const base: Record<string, any> = {
      label: ds.label,
      data: ds.data,
      backgroundColor: isPie
        ? ds.data.map((_, j) => CHART_COLORS[j % CHART_COLORS.length])
        : color,
      borderColor: color,
      borderWidth: isPie ? 2 : 2,
    };
    if (isArea) {
      base.fill = true;
      base.backgroundColor = color.startsWith("var(")
        ? "rgba(99,102,241,0.2)"
        : hexToRgba(color, 0.2);
    }
    if (type === "bar") {
      base.borderRadius = 6;
    }
    return base;
  });

  return `<canvas id="chart-${blockId}" style="width:100%;max-height:400px"></canvas>
<script>
(function(){
  var ctx=document.getElementById('chart-${blockId}');
  if(!ctx)return;
  new Chart(ctx,{
    type:'${type}',
    data:{
      labels:${JSON.stringify(labels)},
      datasets:${JSON.stringify(dsJson)}
    },
    options:{
      responsive:true,
      maintainAspectRatio:true,
      plugins:{legend:{labels:{color:'var(--landing-text)'}}},
      scales:${isPie ? "{}" : `{x:{ticks:{color:'var(--landing-text)'},grid:{color:'rgba(128,128,128,0.1)'}},y:{ticks:{color:'var(--landing-text)'},grid:{color:'rgba(128,128,128,0.1)'}}}`}
    }
  });
})();
</script>`;
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
