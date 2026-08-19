# Fotos infantiles | Cyberlol

Sitio de HTML plano, sin build, servido en
**https://www.easybits.cloud/s/colina-fulgurante/**

Herramienta client-side: subes una foto, la encuadras y descarga/imprime una hoja
con la foto repetida en rejilla, a 300 dpi, lista para recortar. Todo el
procesamiento ocurre en el navegador (canvas); el servidor sólo sirve el HTML.

## Identidad en la DB (producción)

| Cosa | Valor |
|---|---|
| Website | `6a84b3bd7b4429064de720fa` — slug `colina-fulgurante` |
| Owner | `699f35cbc8ad86037eda62b1` (fixtergeek@gmail.com) |
| Files | `sites/6a84b3bd7b4429064de720fa/{index.html,print.html,document.pdf}` |
| og:image | `og/6a84b3bd7b4429064de720fa-cyberlol.png` (bucket público) |

Nació el 18-ago-2026 desde la flota en la cuenta **siiqtec@gmail.com**; el
19-ago se transfirió a fixtergeek. La transferencia son DOS cosas: `Website.ownerId`
**y** el `ownerId` de sus Files — el loader de `/s/:slug` busca los archivos por
`ownerId` del sitio, así que mover sólo el Website deja el sitio en 404.

Al transferir chocó el `@@unique([ownerId, slug])` con un sitio BORRADO del
destino que ocupaba el mismo slug; se renombró ese muerto a
`colina-fulgurante-deleted-69bea4ed`.

## Cómo modificarlo

`index.html` de esta carpeta es la **fuente**. Editar aquí y publicar:

```bash
npx tsx scripts/publish-site-html.ts colina-fulgurante docs/sites/fotos-infantiles/index.html
```

El script sube un objeto con llave NUEVA y repunta el File (el CDN cachea por
URL: reusar la llave deja a la gente con la versión vieja).

⚠️ Escribir a Mongo con `$runCommandRaw` exige fechas como `{ $date: "..." }`.
Un `new Date()` crudo se guarda como string y Prisma revienta con P2023
(`Failed to convert ... to DateTime`) — tumba el sitio entero con 500.

## Geometría de impresión (lo que hay que no romper)

- 300 dpi. Hoja **6×4″** = 1800×1200 px (default) u **hoja Carta** = 2550×3300 px.
- Tamaños de foto: 2.5×3 cm (infantil MX), 3×4 (carnet), 3.5×4.5 (visa/ICAO);
  px = `cm / 2.54 * 300`.
- Rejilla: 6×4 siempre 4×2 = 8 fotos, bloque **centrado**. Carta calcula filas y
  columnas con lo que quepa dejando **0.5″ de margen**, y el bloque va anclado
  **arriba-izquierda** (no centrado) para dejar hoja libre: 56 · 36 · 25 fotos
  según el tamaño.
- Las fotos van pegadas, sin separación: un corte por línea.
- Guías de corte: **opcionales, apagadas por default**. Líneas interiores
  `rgba(0,0,0,.12)` de 1px + ticks negros en el margen, nunca sobre la foto.

### El bug de "sale chiquito y centrado"

La ventana de impresión fijaba `img{width:6in;height:4in}`. Si el papel del
diálogo no era exactamente ese (Carta, o el mismo 4×6 en vertical), el navegador
aplicaba "ajustar a página" y encogía la hoja. Ahora la imagen se mide en
**porcentaje** del área imprimible (`width:100%;height:auto`), así llena el ancho
real sea cual sea el papel. `@page{size:…;margin:0}` queda sólo como sugerencia.

El resto lo manda el diálogo del navegador y **no se puede forzar desde el HTML**
— por eso la ventana de impresión abre con una checklist (papel, escala 100%,
márgenes ninguno, orientación) antes de disparar `print()`.

## SEO / redes / agentes

Las metas están escritas **en el HTML**. Eso apaga la inyección automática del
loader (`app/routes/s.$slug.$.tsx` no toca el head si ya hay `og:title`), que si
no pone la descripción genérica "Documento creado con EasyBits".

- OG completo (incluye `image:width/height/alt`, `site_name`, `locale`) + Twitter
  `summary_large_image` + canonical + robots.
- `og.png` de esta carpeta es la miniatura, hecha a mano con `sharp` desde un SVG.
  Sustituyó al screenshot automático, que capturaba el editor VACÍO (canvas negro
  y un "Choose File") y como card se veía pésimo. Está cacheada en
  `Website.metadata.ogImageUrl` para que el screenshotter no la vuelva a pisar.
- JSON-LD con `@graph`: `WebApplication` (gratis, featureList, `potentialAction`)
  + `HowTo` de 4 pasos, para buscadores y agentes.

## Pendientes

- El `<h1>` y el subtítulo siguen diciendo "hoja 6×4"" y "8 fotos", desactualizados
  desde que existe la variante Carta. No se tocaron: es copy y lo redacta el dueño.
- El botón de IA ("camisa y fondo blanco") pide al usuario su propia API key de
  OpenAI, guardada en el navegador. Si algún día se quiere sin key, hay que
  mover esa llamada al servidor.
