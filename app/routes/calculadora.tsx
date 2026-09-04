// /calculadora — "Arma tu agente": prototipo interactivo (HTML plano con
// Alpine-less vanilla JS) servido tal cual mientras se itera el diseño. La
// versión React con sliders quedó descartada por fea; la matemática es la
// misma de app/lib/calculadora.ts (plan plano + packs al menor costo).
import html from "./calculadora.html?raw";

export async function loader() {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

export default function Calculadora() {
  return null;
}
