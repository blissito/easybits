import { useRef, useMemo } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/flota-poc";
import { Canvas } from "~/components/landings3/Canvas";
import { getUserOrNull } from "~/.server/getters";
import type { Section3, IframeMessage } from "~/lib/landing3/types";

export const meta = () => [
  { title: "POC — Flota en fieltro — EasyBits" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrNull(request);
  // Logueado → directo a su flota; visitante (p.ej. desde redes) → a planes.
  return { ctaHref: user ? "/dash/flota" : "/planes" };
};

// ---------------------------------------------------------------------------
// POC: la visualización de la flota (cajas + fantasmas) renderizada DENTRO del
// Canvas del SDK (html-in-canvas) con textura de fieltro. Datos mock — esto es
// solo para evaluar el look; no toca el HUD real (app/routes/dash/pools.tsx).
// ---------------------------------------------------------------------------

type MockBox = {
  id: string;
  status: "running" | "suspended" | null;
  slots: number;
  max: number;
  label: string;
};

const MOCK_BOXES: MockBox[] = [
  { id: "vm-1", status: "running", slots: 4, max: 4, label: "4/4 agentes" },
  { id: "vm-2", status: "running", slots: 2, max: 4, label: "2/4 agentes" },
  { id: "vm-3", status: "suspended", slots: 3, max: 4, label: "dormida" },
  { id: "vm-4", status: null, slots: 0, max: 4, label: "libre" },
];

// Ghosty en HTML/SVG plano (sin JSX/framer) + filtro de fieltro en el cuerpo.
function ghostSvg(sleeping: boolean): string {
  const eyes = sleeping
    ? `<path d="M22 41 Q29 47 36 41" stroke="#1C1726" stroke-width="3.5" stroke-linecap="round" fill="none" />
       <path d="M48 41 Q55 47 62 41" stroke="#1C1726" stroke-width="3.5" stroke-linecap="round" fill="none" />`
    : `<ellipse cx="29" cy="41" rx="8" ry="11" fill="#1C1726" />
       <ellipse cx="55" cy="41" rx="8" ry="11" fill="#1C1726" />`;
  return `
  <svg viewBox="0 0 84 96" class="felt-ghost" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g filter="url(#feltEdge)">
      <path d="M11 80 L11 41 C11 21 23 5 42 5 C61 5 73 21 73 41 L73 80 Q65.25 88 57.5 80 Q49.75 88 42 80 Q34.25 88 26.5 80 Q18.75 88 11 80 Z" fill="#9870ED" />
      <ellipse cx="23" cy="50" rx="5" ry="3" fill="#B79BF2" />
      <ellipse cx="61" cy="50" rx="5" ry="3" fill="#B79BF2" />
    </g>
    <path d="M16 37 L4 33" stroke="#EAE7F4" stroke-width="4" stroke-linecap="round" />
    <path d="M68 37 L80 33" stroke="#EAE7F4" stroke-width="4" stroke-linecap="round" />
    <path d="M37 36 Q42 32 47 36" stroke="#EAE7F4" stroke-width="4" stroke-linecap="round" fill="none" />
    ${eyes}
    <circle cx="29" cy="40" r="13.5" stroke="#EAE7F4" stroke-width="4" />
    <circle cx="55" cy="40" r="13.5" stroke="#EAE7F4" stroke-width="4" />
  </svg>`;
}

function boxHtml(b: MockBox): string {
  const full = b.slots >= b.max;
  const stateClass =
    b.status === null
      ? "felt-free"
      : b.status === "suspended"
        ? "felt-sleep"
        : full
          ? "felt-full"
          : "felt-room";
  const sleeping = b.status === "suspended";
  const dim = sleeping ? "felt-dim" : "";

  const slots = Array.from({ length: b.max })
    .map((_, j) =>
      j < b.slots
        ? `<div class="felt-slot ${dim}">${ghostSvg(sleeping)}</div>`
        : `<span class="felt-slot felt-empty"></span>`
    )
    .join("");

  const zzz = sleeping && b.slots > 0 ? `<span class="felt-zzz">Zzz</span>` : "";

  return `
  <div class="felt-box ${stateClass}">
    ${zzz}
    <div class="felt-agents">${slots}</div>
    <span class="felt-label">${b.label}</span>
  </div>`;
}

function buildFleetSection(): Section3 {
  const boxes = MOCK_BOXES.map(boxHtml).join("");
  const html = `
<style>
  /* el iframe del editor pinta un box-shadow inline (azul/morado) al hover/seleccionar;
     lo neutralizamos — un !important del stylesheet gana sobre el inline del JS. */
  * { box-shadow: none !important; }
  /* el body del iframe lo pinta el SDK con var(--color-surface) del tema; lo
     forzamos al cream del fieltro (y la variable, por si algo más la lee). */
  :root { --color-surface: #cdb277 !important; }
  html, body { margin: 0; background: #cdb277 !important; }
  .felt-stage {
    font-family: ui-rounded, "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif;
    min-height: 100vh;
    padding: 56px 32px;
    background: #cdb277;
  }
  .felt-stage::before {
    content: ""; position: fixed; inset: 0; pointer-events: none;
    filter: url(#feltSurface); opacity: 0.55; mix-blend-mode: multiply;
  }
  .felt-title {
    text-align: center; font-size: 26px; font-weight: 800; letter-spacing: 0.04em;
    color: #4a3f2c; margin: 0 0 6px; text-shadow: 0 1px 0 rgba(255,255,255,0.6);
  }
  .felt-sub { text-align: center; font-size: 14px; color: #8a7c60; margin: 0 0 36px; }
  .felt-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 26px;
    max-width: 880px; margin: 0 auto;
  }
  @media (max-width: 720px) { .felt-grid { grid-template-columns: repeat(2, 1fr); } }
  .felt-box {
    position: relative; aspect-ratio: 1 / 1; border-radius: 24px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
    /* costura: el dashed se ondula porque la caja entera pasa por #feltRough
       (feDisplacementMap de baja frecuencia) → borde cortado a mano, no perfecto. */
    border: 3px dashed rgba(60, 42, 16, 0.5);
    /* overflow:hidden recorta el grano ::after a la esquina redondeada — border-radius
       NO recorta la salida de un filtro, overflow sí (de ahí el "cubo" anterior). */
    overflow: hidden;
    filter: url(#feltRough) drop-shadow(0 10px 14px rgba(0,0,0,0.22));
    box-shadow:
      inset 0 3px 7px rgba(255,255,255,0.65),
      inset 0 -10px 20px rgba(0,0,0,0.12) !important;
    transition: transform 0.18s ease;
  }
  .felt-box:hover { transform: translateY(-3px) scale(1.02); }
  /* grano/pelos de fieltro (clipeado por overflow:hidden de la caja) */
  .felt-box::after {
    content: ""; position: absolute; inset: 0;
    filter: url(#feltSurface); opacity: 0.7; mix-blend-mode: multiply; pointer-events: none;
  }
  /* tela teñida por estado (paleta apagada/pastel = lana) */
  .felt-full  { background: #a9c79b; border-color: #6f9a63; }
  .felt-room  { background: #cfe0bf; border-color: #9bbf8f; }
  .felt-sleep { background: #c8c6e6; border-color: #a6a3d6; }
  .felt-free  { background: #e6dcc6; border-color: rgba(0,0,0,0.18); }
  .felt-agents {
    position: relative; display: grid; grid-template-columns: repeat(2, 1fr);
    gap: 12px; place-items: center;
  }
  .felt-slot { width: 38px; height: 46px; display: flex; align-items: center; justify-content: center; }
  .felt-ghost { width: 32px; height: 40px; filter: drop-shadow(0 3px 3px rgba(0,0,0,0.22)); }
  .felt-dim { opacity: 0.55; }
  .felt-empty {
    width: 22px; height: 22px; border-radius: 7px;
    border: 2px dashed rgba(0,0,0,0.22); background: rgba(255,255,255,0.45);
  }
  .felt-label {
    font-size: 15px; font-weight: 700; color: #4a3f2c;
    text-shadow: 0 1px 0 rgba(255,255,255,0.5);
  }
  .felt-zzz {
    position: absolute; top: 12px; right: 16px; font-size: 16px; font-weight: 800;
    color: #6f6ab8; transform: rotate(-8deg); pointer-events: none;
  }
</style>

<!-- filtros de fieltro (técnica Codrops/Sara Soueidan): el ruido fractal se usa
     como bump map y se ILUMINA con feDiffuseLighting → superficie fibrosa con
     relieve, no grano plano. feComponentTransfer levanta los niveles para que el
     multiply sólo oscurezca las "fibras" y no toda la caja. -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <filter id="feltSurface" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.84" numOctaves="5" seed="8" stitchTiles="stitch" result="noise" />
      <feDiffuseLighting in="noise" surfaceScale="1.6" diffuseConstant="1" lighting-color="#ffffff" result="lit">
        <feDistantLight azimuth="235" elevation="58" />
      </feDiffuseLighting>
      <feComponentTransfer in="lit">
        <feFuncR type="linear" slope="0.5" intercept="0.55" />
        <feFuncG type="linear" slope="0.5" intercept="0.55" />
        <feFuncB type="linear" slope="0.5" intercept="0.55" />
      </feComponentTransfer>
    </filter>
    <!-- borde afelpado del fantasma: ruido fino que desplaza el contorno (pelos) -->
    <filter id="feltEdge" x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="3" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4"
        xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <!-- líneas IRREGULARES de la caja (técnica Daniel Jones / Ben Gammon): ruido de
         BAJA frecuencia desplaza el contorno entero → borde de fieltro cortado a mano. -->
    <filter id="feltRough" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="5" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="3"
        xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </defs>
</svg>

<div class="felt-stage">
  <h2 class="felt-title">FLOTA EN FIELTRO</h2>
  <p class="felt-sub">POC · cajas y agentes con textura de tela (html-in-canvas)</p>
  <div class="felt-grid">${boxes}</div>
</div>`;

  return { id: "fleet-felt", order: 0, html, label: "Flota en fieltro" };
}

export default function FlotaPocRoute() {
  const { ctaHref } = useLoaderData<typeof loader>();
  const iframeRectRef = useRef<DOMRect | null>(null);
  const sections = useMemo<Section3[]>(() => [buildFleetSection()], []);
  const onMessage = (_msg: IframeMessage) => {};

  return (
    <div className="relative h-[calc(100vh-2rem)] w-full bg-[#cdb277]">
      <Canvas
        sections={sections}
        theme="sky"
        onMessage={onMessage}
        iframeRectRef={iframeRectRef}
      />

      {/* CTA overlay — fuera del iframe para que el click navegue de verdad
          (el Canvas intercepta clicks adentro y el iframe está sandboxeado). */}
      <a
        href={ctaHref}
        className="group absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full px-8 py-4 font-bold text-[#4a3f2c] no-underline transition-transform hover:-translate-y-0.5"
        style={{
          fontFamily:
            'ui-rounded, "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif',
          background: "#a9c79b",
          border: "3px dashed #6f9a63",
          boxShadow:
            "inset 0 3px 7px rgba(255,255,255,0.65), 0 10px 18px rgba(0,0,0,0.22)",
          textShadow: "0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        Crea tu flota de agentes →
      </a>
    </div>
  );
}
