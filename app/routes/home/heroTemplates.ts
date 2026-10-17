/**
 * Plantillas de muestra para la vista previa del hero mientras no hay sitio real
 * (sin sesión, o antes de que el agente escriba el primer archivo). HTML autocontenido
 * para `srcDoc`: sin red, sin imágenes externas. Las secciones entran una por una para
 * que se lea como «se está construyendo».
 */

import { templateFor, type SiteTemplateKey as TemplateKey } from "~/lib/siteTemplates";

export { templateFor };

const base = (vars: string, body: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{${vars}}
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.5 system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink)}
nav,section,footer{animation:in .6s cubic-bezier(.2,.8,.2,1) both}
${Array.from({ length: 8 }, (_, i) => `body>*:nth-child(${i + 1}){animation-delay:${0.15 + i * 0.35}s}`).join("")}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){nav,section,footer{animation:none}}
nav{display:flex;align-items:center;gap:24px;padding:18px 40px;font-size:14px}
nav b{font-size:18px;margin-right:auto}
.btn{display:inline-block;padding:12px 22px;border-radius:999px;background:var(--accent);color:var(--on);font-weight:700;font-size:14px}
.wrap{padding:56px 40px}
h1{font-size:44px;line-height:1.05;letter-spacing:-.02em}
h2{font-size:26px;margin-bottom:20px}
.muted{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:var(--card);border-radius:16px;padding:22px}
footer{padding:28px 40px;font-size:13px;color:var(--muted)}
</style></head><body>${body}</body></html>`;

const TEMPLATES: Record<TemplateKey, string> = {
  portafolio: base(
    "--bg:#f6f1ea;--ink:#1d1a16;--muted:#7a7066;--accent:#1d1a16;--on:#f6f1ea;--card:#ebe3d8",
    `<nav><b style="font-family:Georgia,serif;font-style:italic">Lucía Ortega</b><span>Bodas</span><span>Eventos</span><span>Paquetes</span><span class="btn">Agenda</span></nav>
<section style="margin:0 40px;height:300px;border-radius:20px;background:linear-gradient(135deg,#c9a98a,#8a6a52);display:flex;align-items:flex-end;padding:36px">
  <h1 style="font-family:Georgia,serif;font-weight:400;color:#fff;max-width:520px">Historias de boda contadas con luz natural</h1></section>
<section class="wrap"><h2 style="font-family:Georgia,serif;font-weight:400">Galería</h2>
  <div class="grid">${["#b89478", "#6f5a4a", "#d8c3ad", "#9c7b63", "#c7ad95", "#5e4b3e"].map((c) => `<div style="height:120px;border-radius:14px;background:${c}"></div>`).join("")}</div></section>
<section class="wrap" style="padding-top:0"><h2 style="font-family:Georgia,serif;font-weight:400">Paquetes</h2>
  <div class="grid">${[["Esencial", "$12,900"], ["Completo", "$18,500"], ["Destino", "$29,000"]].map(([n, p]) => `<div class="card"><p class="muted">${n}</p><p style="font-size:24px;font-weight:700">${p}</p><p class="muted" style="font-size:13px">MXN · horas de cobertura y álbum</p></div>`).join("")}</div></section>
<footer>© Lucía Ortega Fotografía · CDMX</footer>`
  ),
  despacho: base(
    "--bg:#ffffff;--ink:#0f1f2e;--muted:#5c6b78;--accent:#0f3d5e;--on:#fff;--card:#f1f5f8",
    `<nav><b>Rivera &amp; Asociados</b><span>Servicios</span><span>Equipo</span><span>Contacto</span><span class="btn">Agenda una llamada</span></nav>
<section class="wrap" style="display:grid;grid-template-columns:1.2fr 1fr;gap:32px;align-items:center">
  <div><p class="muted" style="font-weight:700;font-size:13px;letter-spacing:.08em">CONTADORES PÚBLICOS</p><h1 style="margin:10px 0 16px">Tus impuestos al día, sin sustos con el SAT</h1><span class="btn">Diagnóstico gratis</span></div>
  <div style="height:220px;border-radius:20px;background:#dfe8ef;display:grid;place-items:center;font-size:56px;font-weight:800;color:#0f3d5e">+18<span style="font-size:15px;font-weight:600">años</span></div></section>
<section class="wrap" style="padding-top:0"><h2>Servicios</h2><div class="grid">${["Contabilidad mensual", "Nómina e IMSS", "Declaraciones anuales"].map((s) => `<div class="card"><p style="font-weight:700">${s}</p><p class="muted" style="font-size:14px">Para personas físicas y empresas.</p></div>`).join("")}</div></section>
<section class="wrap" style="padding-top:0"><div class="card" style="display:flex;gap:40px;justify-content:space-around;text-align:center">${[["320", "clientes"], ["98%", "renuevan"], ["24 h", "respuesta"]].map(([a, b]) => `<div><p style="font-size:30px;font-weight:800">${a}</p><p class="muted">${b}</p></div>`).join("")}</div></section>
<footer>Rivera &amp; Asociados · Guadalajara, Jal.</footer>`
  ),
  lanzamiento: base(
    "--bg:#0d0b1a;--ink:#f3f1ff;--muted:#a19cc0;--accent:#c4f25a;--on:#0d0b1a;--card:#1b1830",
    `<nav><b>Alcancía</b><span>Cómo funciona</span><span>Preguntas</span><span class="btn">Únete</span></nav>
<section class="wrap" style="text-align:center;padding-top:72px"><p style="color:var(--accent);font-weight:700;font-size:13px">LISTA DE ESPERA ABIERTA</p>
  <h1 style="max-width:620px;margin:12px auto 18px;font-size:50px">Tus finanzas, en orden sin abrir Excel</h1>
  <div style="display:inline-flex;gap:8px;background:var(--card);padding:6px;border-radius:999px"><span style="padding:10px 18px;color:var(--muted);font-size:14px">tu@correo.com</span><span class="btn">Quiero acceso</span></div></section>
<section class="wrap"><div class="grid">${[["Automático", "Conecta tu banco y listo."], ["Claro", "Una gráfica, no 40."], ["Privado", "Tus datos son tuyos."]].map(([a, b]) => `<div class="card"><p style="font-weight:700;color:var(--accent)">${a}</p><p class="muted" style="font-size:14px">${b}</p></div>`).join("")}</div></section>
<section class="wrap" style="padding-top:0"><div class="card" style="height:150px;background:linear-gradient(90deg,#1b1830,#2a2550)"></div></section>
<footer>Alcancía · Hecho en México</footer>`
  ),
  consultorio: base(
    "--bg:#ffffff;--ink:#12302b;--muted:#5d7470;--accent:#1fa37a;--on:#fff;--card:#eef7f3",
    `<nav><b>Clínica Sonríe</b><span>Servicios</span><span>Doctores</span><span>Ubicación</span><span class="btn">Agenda por WhatsApp</span></nav>
<section class="wrap" style="display:grid;grid-template-columns:1.1fr 1fr;gap:32px;align-items:center">
  <div><h1 style="margin-bottom:14px">Tu sonrisa en buenas manos, cerca de casa</h1><p class="muted" style="margin-bottom:20px">Citas el mismo día · estacionamiento · pagos a meses</p><span class="btn">Agenda tu cita</span></div>
  <div style="height:230px;border-radius:24px;background:#cfeee2;display:grid;place-items:center;font-size:84px">🦷</div></section>
<section class="wrap" style="padding-top:0"><h2>Servicios</h2><div class="grid">${[["Limpieza", "desde $650"], ["Ortodoncia", "desde $1,200/mes"], ["Blanqueamiento", "desde $2,900"]].map(([a, b]) => `<div class="card"><p style="font-weight:700">${a}</p><p class="muted" style="font-size:14px">${b} MXN</p></div>`).join("")}</div></section>
<section class="wrap" style="padding-top:0"><div class="card" style="display:flex;justify-content:space-between;align-items:center"><div><p style="font-weight:700">Lun a sáb · 9:00 a 20:00</p><p class="muted" style="font-size:14px">Av. Reforma 123, Puebla</p></div><span class="btn">Cómo llegar</span></div></section>
<footer>Clínica Sonríe · Ced. Prof. 1234567</footer>`
  ),
};

export function templateHtml(key: TemplateKey) {
  return TEMPLATES[key];
}
