import "./felt.css";

/**
 * Filtros SVG del kit de FIELTRO. Monta UNA sola vez por página (los ids de filtro
 * son globales y los referencian las clases de felt.css y cualquier `filter: url(#...)`).
 *
 *   <FeltFilters />
 *   <div className="felt" style={{ "--felt-fill": "#a9c79b" }}>…</div>
 *
 * Valores extraídos del POC (app/routes/flota-poc.tsx):
 *  - #feltSurface: grano fractal ILUMINADO (feDiffuseLighting) → tela con relieve.
 *  - #feltEdge:    contorno afelpado de figuras (feDisplacementMap fino).
 *  - #feltRough:   borde irregular cortado a mano (feDisplacementMap baja frecuencia).
 */
export function FeltFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {/* grano de tela: el ruido se usa como bump map y se ilumina; feComponentTransfer
            levanta los niveles para que el multiply sólo oscurezca las "fibras". */}
        <filter id="feltSurface" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.84" numOctaves="5" seed="8" stitchTiles="stitch" result="noise" />
          <feDiffuseLighting in="noise" surfaceScale="1.6" diffuseConstant="1" lightingColor="#ffffff" result="lit">
            <feDistantLight azimuth="235" elevation="58" />
          </feDiffuseLighting>
          <feComponentTransfer in="lit">
            <feFuncR type="linear" slope="0.5" intercept="0.55" />
            <feFuncG type="linear" slope="0.5" intercept="0.55" />
            <feFuncB type="linear" slope="0.5" intercept="0.55" />
          </feComponentTransfer>
        </filter>

        {/* contorno afelpado del fantasma: ruido fino que desplaza el borde (pelos) */}
        <filter id="feltEdge" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* líneas IRREGULARES de la caja: ruido de BAJA frecuencia desplaza el contorno
            entero → borde de fieltro cortado a mano, no perfecto. */}
        <filter id="feltRough" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
