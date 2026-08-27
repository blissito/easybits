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

- 300 dpi. Hojas: **6×4″** = 1800×1200 px (default), **Carta** = 2550×3300 px,
  **A4** (8.27×11.69″) = 2481×3507 px.
- Tamaños de foto: 2.5×3 cm (infantil MX, default), 3×3 (cuadrada), 3×4 (carnet),
  3.5×4.5 (visa/ICAO); px = `cm / 2.54 * 300`.
- Rejilla: 6×4 siempre 4×2 = 8 fotos. Las hojas grandes (Carta y A4) calculan
  filas y columnas con lo que quepa dejando **0.25″ de margen** (el mínimo que la
  impresora no alcanza). **El bloque siempre va centrado**, en las tres hojas.

  Antes eran 0.5″ y el bloque iba anclado arriba-izquierda "para dejar hoja
  libre": en la práctica el sobrante se acumulaba abajo y a la derecha y la
  impresión parecía media hoja vacía. Con 0.25″ + centrado, 3×3 cm reales da
  **6 × 9 = 54 fotos en A4** (6 × 8 = 48 en Carta) y el margen se reparte.

- **Zoom por debajo de 1×.** `baseScale()` es un *cover* (la celda queda llena y
  se recortan los bordes) y el slider empezaba en 1, así que la foto completa era
  inalcanzable. Ahora `minZoom()` calcula el *contain* para la proporción de celda
  vigente y baja el mínimo del slider hasta ahí; con zoom < 1 la foto se **centra**
  (no se clampea a la esquina) y el sobrante se rellena de blanco.

- **La celda se compone en su propio canvas** (`drawTile`) y ese canvas se repite
  en la rejilla. No se puede dibujar `img` con un `srcRect` directo a cada celda:
  en modo contain eso estira la foto a la celda y se pierde el relleno blanco.

- **Modo planilla (`fit3`, "proporción de la foto").** Los otros tamaños son cm
  exactos y recortan; éste NO respeta medidas: la celda toma el aspect ratio de la
  foto y crece para llenar la hoja, así entra completa sin franjas blancas. El
  usuario elige **columnas** (2–5, `#cols`, visible sólo en este modo) y las
  **filas son las que quepan** con esa altura (`fitRows`). Como la celda depende de
  la foto, `loadFile` y el cambio de hoja llaman `setStageAspect()` antes de
  redibujar.
- El papel se describe en **un solo lugar**, el mapa `SHEETS` del script:
  `{ big, label, file, orient }` por `value` del `<select>`. `big` decide rejilla
  calculada + margen; `label`/`orient` alimentan la checklist de impresión y
  `file` el nombre del PNG (`fotos-infantiles-a4.png`). Agregar un papel nuevo =
  una `<option>` + una entrada aquí, nada más. Antes esto era un
  `isLetter() ? … : …` regado por el archivo y cualquier papel nuevo salía
  etiquetado como Carta.
- Las fotos van pegadas, sin separación: un corte por línea.
- Guías de corte: **opcionales, encendidas por default**. Líneas interiores
  `rgba(0,0,0,.12)` de 1px + ticks negros en el margen, nunca sobre la foto.

## Layout de una sola pantalla

Tres columnas — *encuadre* · *opciones* · *hoja* — que caben sin scroll vertical.

- El modo se activa sólo con espacio real: `@media (min-width: 900px) and
  (min-height: 620px)`. Debajo de eso vuelve al flujo normal con scroll (móvil
  intacto). `body { height: 100dvh; overflow: hidden }` + `box-sizing: border-box`
  global — sin lo segundo el padding desborda y el slider de zoom se corta.
- **`fitStage()` mide el stage en JS y no es opcional.** El recuadro de encuadre
  ES la proporción de la foto: si se deforma, el recorte que ve el usuario deja de
  ser el que se imprime. Dentro de una columna de altura fija, `aspect-ratio` de
  CSS no resuelve (el ancho depende del alto y el alto de la columna → el
  navegador cae al `min-width`), así que se calcula a mano: alto disponible menos
  la fila de zoom, ancho = alto × ar, con clamp por el ancho de la columna. Corre
  dentro de `drawCrop()`, o sea en cada resize y en cada cambio de tamaño de foto.
  Fuera del modo una-pantalla se limpia el estilo inline y manda el CSS.

## UI

- **Dropzone** en vez del `<input type=file>` crudo: clic, drag & drop, teclado
  (Enter/Espacio) y **pegar del portapapeles** (`paste`). El input sigue ahí,
  `hidden`, y todo pasa por `loadFile(file)` — un solo camino, valide lo que
  valide la entrada. Al cargar, el título del dropzone muestra el nombre.
  `dragover`/`drop` también se cancelan en `window`, si no el navegador abre la
  imagen y se pierde la sesión.
- **Un solo botón primario**: Descargar PNG. El de IA es `secondary` — competían
  dos morados y el ojo no sabía cuál era la acción principal.
- **Imprimir es sólo icono** (`.icon-only`, con `title` y `aria-label`).

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

- **Subdominio propio + anuncio.** La herramienta ya está madura; el siguiente
  paso es sacarla de `/s/colina-fulgurante` a un dominio propio y hacerle un
  anuncio (existe el pipeline `blender-ad` / HyperFrames para el video).
- El `<h1>` y el subtítulo siguen diciendo "hoja 6×4"" y "8 fotos", desactualizados
  desde que existe la variante Carta. No se tocaron: es copy y lo redacta el dueño.
- El botón de IA ("camisa y fondo blanco") pide al usuario su propia API key de
  OpenAI, guardada en el navegador. Si algún día se quiere sin key, hay que
  mover esa llamada al servidor.
