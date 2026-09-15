# StickerCut — `easybits.cloud/s/rayo-creciente/`

Sucesora multi-imagen de `fotos-infantiles`: hoja para imprimir + archivo de corte
para plóter (Silhouette 3/4 marcas, Cricut). Plan: `~/.claude/plans/zippy-crunching-zebra.md`.

| Qué | Valor |
|---|---|
| Website | `6aa96e1edc0d354d9cc0b02b` — slug `rayo-creciente` (nombre "StickerCut") |
| Owner | fixtergeek |
| Files | `sites/6aa96e1edc0d354d9cc0b02b/{engine.js,calib.html,index.html}` |

## Archivos
- `engine.js` — motor puro (mm internos, 300 dpi al exportar): `layout`, `renderPage`,
  `toPDF` (PDF a mano, JPEG por página), `toDXF` (R12 ASCII en **pulgadas**, Studio asume
  1 unidad = 1"), `toPNG` (inyecta `pHYs` 300 dpi). Geometría de marcas = mínimos de
  Silhouette Studio (inset 10 mm, brazos 5 mm, grosor 1 mm, cuadro 5×5 mm), tomada de
  silhouette-card-maker (MIT).
- `calib.html` — hoja de calibración (Fase 0): 6 piezas de 40 mm con borde negro
  impreso a propósito (referencia para medir el corte) + regla de 10 cm. En el producto
  las líneas de corte NO se imprimen.
- `index.html` — la app (Fase 1).

## Publicar
Primera vez de cada archivo: MCP `deploy_website_file` (crea el File). Después:
`npx tsx scripts/publish-site-html.ts rayo-creciente docs/sites/stickercut/<archivo> <archivo>`
(repunta el File con llave nueva; el CDN cachea por URL).

## Decisiones
- Las posiciones de celda dependen sólo de (hoja, tamaño de pieza, modo): una página a
  medio llenar deja las celdas vacías al final, NO se recentra. Así la plantilla
  `.studio3` que el usuario guarda una vez sirve para siempre.
- Tamaños distintos de pieza van en páginas distintas (rejilla uniforme, como SCM).
- Capa `PAGE` del DXF = contorno de la hoja, para que "Centrar en página" no mueva nada.
