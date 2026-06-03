# Extractor del clonador — implementación de referencia

Esto es el **extractor inicial** que mina un PDF fuente en sus "tripas" reusables, antes
de reconstruir. Lo implementé como `pdf-assets` (bash). Aquí está el script + las decisiones.
Léelo para destrabar el extractor del clonador de EasyBits.

## Qué produce (de un PDF → un dir de salida)
- `page-*.png`  → render de cada página (para VER el layout). `pdftoppm -png -r 200`.
- `images/*`    → imágenes embebidas recortadas, **con transparencia (alpha)**.
- `text.txt`    → texto real, layout-aware. `pdftotext -layout`. **Esta es la fuente del contenido (grounded), NO se re-transcribe con visión.**
- `fonts.txt`   → tipografías embebidas. `pdffonts`.
- Manifiesto a stdout: `ASSET | TYPE(logo/photo/photo(cutout)/mask/background) | WxH | ALPHA`.

## Las decisiones que importan (y por qué batalla el extractor)

### 1. Cutouts CON alpha = `mutool extract -a`, NO poppler solo
poppler (`pdfimages -all`/`-png`) saca la imagen y su `/SMask` (máscara alpha) en archivos
SEPARADOS → alpha=False, y duplica (image + smask). Para cutouts transparentes limpios en un
paso: **`mutool extract -a`** (MuPDF) → saca `.pam` RGBA (luego `convert x.pam x.png`).
- Benchmark: mutool 0.78s vs poppler+composite ~12s en un PDF de 6 págs/17MB. Idéntica calidad.
- ⚠️ MuPDF es **AGPL**. Alternativa permisiva: **pypdfium2 (PDFium/BSD)** o **PyMuPDF** (AGPL) o
  poppler + componer la smask a mano con ImageMagick (`-compose CopyOpacity`). Ver EXTRACTION-NOTES.md.
- Si NO hay mutool, el script cae a `pdfimages -all` (sin alpha fusionado). Por eso quizá tu
  extractor saca máscaras blancas / fotos sin transparencia: **te falta el merge de la smask.**

### 2. Render memory-bounded = `pdftoppm` nativo, NUNCA Chromium+pdf.js
(Ya lo arreglaste en `pdfToImages.ts`.) `pdftoppm` streamea del disco; no metas el PDF como
base64 por CDP a un Chromium → OOM (-32603).

### 3. Clasificación (heurística simple, con `identify`)
Por imagen, una llamada `identify -format '%w %h %A %[fx:standard_deviation]'`:
- std-dev < 0.02 o `max(W,H)<32` → **mask/ruido** (descartar; son las siluetas blancas).
- `max(W,H)>=1500` y aspecto 0.5–2.0 → **background** (decorativo; reusar como raster).
- aspecto >2 o <0.5, o `<200px` con alpha → **logo**.
- 200–1500px balanceado → **photo** (`(cutout)` si trae alpha).

### 4. Nombres de archivo con acentos/espacios/paréntesis
Resolución fuzzy con **Unicode NFKD** (Python), no `iconv //TRANSLIT` (en Debian convierte
"DÍA"→"D?A" y rompe el match). Ver `resolve_input()` en el script. Sin esto, el extractor
falla "file not found" con nombres tipo "ORDEN DEL DÍA INNOVAKIDS (2).pdf".

## ⚠️ EL RIESGO #1 de la reconstrucción: foto↔nombre debe ser POSICIONAL, no facial
Al reconstruir "personal a cargo" (grid de foto+nombre+cargo), **NO emparejes la foto al
nombre por reconocimiento facial** — con N thumbnails parecidos el modelo se equivoca y pones
la cara equivocada bajo un funcionario (defecto grave en gobierno). **Empareja por POSICIÓN:**
layout-detection → "la foto inmediatamente a la izquierda del texto 'Dr. X' es de X" →
extrae/recorta esa región. Correcto por construcción, sin adivinar caras.

## Archivos aquí
- `pdf-assets` — el extractor completo (bash, funcionando). Léelo de arriba a abajo.
- `EXTRACTION-NOTES.md` — benchmark mutool vs poppler vs PIL, licencias, ruta permisiva (pypdfium2).
- `metodo-pagina-fiel.txt` — el método de reconstrucción completo (extraer→template→llenar→render).
