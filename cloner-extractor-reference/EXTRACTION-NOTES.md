# doc-remix — decisión de motor de extracción (2026-06-02)

Por qué `pdf-assets` prefiere **`mutool extract -a`** (MuPDF) para los cutouts.

## El problema
Las imágenes embebidas con transparencia en un PDF se guardan en DOS objetos: la
imagen base (un xref) + su máscara alpha (`/SMask`, otro xref). Para un cutout
transparente limpio hay que re-unirlas. `poppler` (pdfimages) las saca SEPARADAS
(sin alpha fusionado); hay que componerlas uno mismo.

## Benchmark (PDF real: ORDEN DEL DÍA INNOVAKIDS, 6 pág, ~34 imágenes raster)
| Método | Tiempo | Licencia | Notas |
|--------|--------|----------|-------|
| `mutool extract -a` | **0.78s** | **AGPL** ⚠️ | re-pega smask en un paso (.pam RGBA). Calidad idéntica. |
| poppler `pdfimages -all` + ImageMagick `-composite` (loop) | 12.66s | permisiva ✅ | spawnea `convert` por par → lento |
| poppler `pdfimages -all` + Python PIL (un proceso) | 10.34s | permisiva (HPND) ✅ | el cuello es la EXTRACCIÓN de pdfimages, no el composite |

Conclusión: mutool es ~13–16× más rápido y la **calidad del cutout es idéntica**
(misma data, misma operación de máscara). El cuello de las alternativas es el
`pdfimages -all` mismo, no el paso de composición → ninguna alternativa permisiva
se acerca hoy.

## Calidad / features
- **Cutout raster: idéntico** entre mutool y poppler+composite (verificado visualmente).
- **Edge case:** imágenes con `/Matte` (alpha premultiplicado) — ni MuPDF ni poppler
  lo manejan perfecto; raro en docs institucionales.
- **CMYK→RGB:** la conversión puede diferir levemente entre tools sin perfil ICC. Menor.
- **Vector:** `mutool draw -F svg` extrae gráficos vectoriales. EN ESTOS DOCS los logos
  son RASTER (34 objetos image en pdfimages -list) → la feature vectorial es irrelevante aquí.
- **Repair PDF:** `mutool clean` ≈ cubierto por `qpdf` (Apache-2, ya en la imagen).

## Licencia MuPDF (Artifex) — REVISAR si se productiza
- Doble licencia: **AGPL v3 o comercial** (Artifex, ~miles USD/año, contacto directo).
- Uso actual (CLI subproceso en nuestro propio server, sin enlazar la lib ni
  redistribuir el binario): **bajo riesgo legal** = uso de herramienta, no derivado.
- ⚠️ La cláusula de RED del AGPL es zona gris; **si se empaqueta/distribuye como
  producto, vuelve a ser pregunta real.** Artifex es litigioso (caso Artifex v. Hancom).

## Elección actual (2026-06-02) — INTERINA, a reconsiderar
**mutool es la mejor opción HOY** (velocidad/calidad) y **la usamos ahora**. NO es
decisión final: el AGPL queda como deuda a **reconsiderar en el futuro** (sobre todo
si se productiza/distribuye). Las alternativas permisivas (poppler+PIL, **pypdfium2**
= PDFium/BSD, pikepdf) son el plan de reevaluación, no algo descartado. El script ya
cae a poppler si mutool no está.

## Ruta para soltar AGPL (experimento futuro) — "clonar el feature de mutool"
NO se reimplementa MuPDF (locura: motor completo). El feature usado es una rebanada:
"hallar imágenes embebidas, leer su `/SMask`, pegarlo como alpha". Lo difícil NO es
el alpha (trivial) sino **decodificar los filtros** (DCTDecode/JPEG, JPX/JPEG2000,
JBIG2, CCITT G4, Flate con CMYK/indexed/separation). Por eso: NO decodificar a mano,
parar sobre un parser permisivo que ya lo hace.

Opciones (lenguaje + lib), de menos a más esfuerzo:
1. **Python + pikepdf** (qpdf Apache-2 / MPL-2.0): `pikepdf.PdfImage(obj).as_pil_image()`
   **ya aplica el SMask** → wrapper de ~50 líneas. El "clon" casi no existe.
2. **Python + pypdfium2** (PDFium de Google/Chrome, **BSD-3**): motor C, rápido como
   mutool, bindings Python. ~30 líneas. La ruta limpia velocidad+permisivo.
3. **Binario standalone:** Rust (`lopdf` MIT + crates `image`/`zune-jpeg`) o Go
   (`pdfcpu` Apache-2). Más trabajo; fully permisivo y rápido.

Veredicto: factible, ~1 día para igualar calidad de mutool + endurecer edge cases de
colorspace/filtros (el 80% del esfuerzo). El plan: NO clonar mutool — **swap** a
pikepdf/pypdfium2, medido contra mutool. pikepdf = mínimo esfuerzo; pypdfium2 = mejor
velocidad/licencia.
