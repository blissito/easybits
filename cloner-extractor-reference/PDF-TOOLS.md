# PDF tools — toolchain del extractor/clonador

Las herramientas CLI exactas que usé, por tarea. Todas en la imagen del container ya
(poppler-utils + imagemagick + ghostscript; mutool si agregas mupdf-tools).

## Por tarea

| Tarea | Comando | Notas |
|-------|---------|-------|
| **Render de página → PNG** (ver layout, recortar) | `pdftoppm -png -r 200 -scale-to-x 1654 in.pdf page` | poppler. Memory-bounded (streamea de disco). NUNCA Chromium+pdf.js (OOM/-32603). |
| **Texto grounded** (la fuente del contenido) | `pdftotext -layout in.pdf out.txt` | poppler. **El contenido sale de aquí, NO se re-transcribe con visión** (no alucina). |
| **Cutouts CON alpha** (logos/fotos transparentes) | `mutool extract -a in.pdf` → `*.pam` → `convert x.pam x.png` | **MuPDF. La buena.** `-a` re-une la `/SMask` → RGBA en 1 paso. ⚠️ AGPL. |
| Imágenes embebidas (sin alpha fusionado) | `pdfimages -all in.pdf prefix` | poppler. Saca imagen + smask SEPARADOS (alpha=False, duplica). Permisivo pero hay que componer la máscara tú. |
| Componer smask a mano (alternativa a mutool) | `convert img.png smask.png -alpha off -compose CopyOpacity -composite out.png` | ImageMagick. Permisivo. Más lento que mutool. |
| Fuentes embebidas | `pdffonts in.pdf` | poppler. Para igualar tipografía (ej. Montserrat). |
| Metadata (páginas, tamaño) | `pdfinfo in.pdf` | poppler. |
| Medir/clasificar imagen | `identify -format '%w %h %A %[fx:standard_deviation]' img.png` | ImageMagick. W H alpha std-dev → clasificar logo/foto/mask/bg. |
| Reparar PDF roto | `qpdf --replace-input in.pdf` / `mutool clean` | qpdf (Apache-2, permisivo) o mutool. |
| Vector → SVG (logos vectoriales) | `mutool draw -F svg -o out.svg in.pdf 1` | MuPDF. Solo si el logo es vector (no raster). |

## Instalación (Debian, Dockerfile)
```
apt-get install -y poppler-utils imagemagick ghostscript mupdf-tools qpdf
```
(poppler = pdftoppm/pdfimages/pdftotext/pdffonts/pdfinfo. mupdf-tools = mutool. qpdf = reparar.)

## Licencias (importante para producto)
- **poppler** — GPL-2/3. Permisivo-ish (no AGPL).
- **ImageMagick** — Apache-2-like. Permisivo.
- **ghostscript / MuPDF (mutool)** — **AGPL** (Artifex) o licencia comercial. ⚠️ Revisar si se distribuye.
- **qpdf** — Apache-2. Permisivo.

## Ruta permisiva (sin AGPL) para los cutouts
Si quieres soltar MuPDF/Ghostscript:
- **pypdfium2** — PDFium de Google/Chrome, **BSD-3**. Render + extracción de imágenes. La más limpia.
- **pikepdf** — wrapper de qpdf (MPL/Apache). Estructura + reemplazo de imágenes.
- **PyMuPDF (fitz)** — potente pero AGPL (mismo dueño que mutool).
Benchmark y detalle en `EXTRACTION-NOTES.md`.

## Regla de oro
Visión = solo para VER layout / detectar regiones. Texto = `pdftotext` (grounded). Assets =
extraídos por referencia (cutouts/crops), NUNCA regenerados. Render = determinista.
