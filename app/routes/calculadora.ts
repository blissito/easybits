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

// Sin `export default`: un componente vuelve "renderizable" a esta ruta y React
// Router sirve el shell de la SPA en vez del HTML de arriba — la página se veía
// EN BLANCO en producción. Mismo bug que tenían robots.txt y sitemap.xml.

