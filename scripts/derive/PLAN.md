# Clone fiel de PDFs institucionales — plan ejecutable (MCP, todos los users)

**Decisión (Jun 2026):** reescribir las tripas de la MCP tool `clone_document` mode:`clone`
con un método **grounded + determinista** que reemplaza el camino lossy "visión→regenera HTML".
Corre server-side en Fly; servido a toda la base vía el MCP de EasyBits.

**Probado localmente** (evidencia, no fe):
- `scripts/derive-template-spike.ts` — Gemini structured-output aguanta el conteo: 21/21 filas de
  agenda en doc de 2 páginas densas, 0 tiradas, 0 inventadas. (spike desechable)
- `scripts/derive/extract.py` — PyMuPDF mina 93 bloques de texto grounded + 25 imágenes reales
  (con alpha y rect de colocación) del doc INNOVAKIDS. Cero IA en este paso. **Es la base del paso 1.**

## Principio
Visión solo acomoda; **nunca redacta ni transcribe**. El texto y los assets salen de PyMuPDF
(grounded). El LLM recibe bloques posicionados + URLs de assets y emite HTML/Tailwind que
reproduce la geometría usando los textos/URLs dados. Mínima superficie de alucinación.

## ⚠️ Alcance de v1: SOLO PDFs digitales (no escaneados)
El método (texto grounded + imágenes embebidas + binding por coords) exige un PDF **digital**
con capa de texto y assets embebidos. Un PDF **escaneado** (imagen plana, sin capa de texto) no
tiene nada que minar. **Detectar al entrar** (`pdftotext` vacío / 0 imágenes embebidas) y rechazar
con mensaje claro, o rutear a un camino OCR+layout ML (Surya / PaddleOCR PP-Structure) — **fuera
de v1**. No intentar el método grounded sobre un escaneo: fallaría silenciosamente.

## ⚠️ Estado: clone_document se queda DESPUBLICADA por ahora (decisión usuario, Jun 2026)
Nada de este plan está en prod — es diseño + extractor validado local. `clone_document` no se
re-habilita por ahora. Cuando se construya el motor grounded, decidir entonces si shipea tras el
guard `ENABLE_CLONE_DOCUMENT` o como tool nueva. Prerrequisito previo a cualquier reactivación:
el fix `pdfToImages.ts` (pdftoppm, commit ff216c3f) está en `main` pero CI deshabilitado → deploy
manual `flyctl` pendiente del dev. **No reactivar antes de ese deploy.**

## Pipeline v1 — extracción determinista + binding en código + 1 llamada IA

1. **Extracción (`scripts/derive/extract.py`, PyMuPDF) — determinista, sin IA.** ✅ escrito y probado.
   **AGPL aceptado como deuda temporal para v1** (decisión Jun 2026) → un solo script, una pasada.
   Invocar vía `child_process`. JSON por página: `text_blocks[{text,bbox,font,size,color,bold}]`
   + `images[{xref,native,alpha,rect,png|file}]` + `size`. **El SMask se re-pega como alpha**
   (sin esto las fotos salen opacas — bug del reference, ya corregido: 22/25 con alpha probado).
   Falta añadir: dedup por md5 (mismo logo en cada página) + clasificar (descartar mask/ruido).
   Añadir `python3` + `PyMuPDF` (wheel autocontenido) al Docker de Fly.
   - **Render de página** para que el LLM VEA el layout: `pix = pg.get_pixmap(dpi=150)` (PyMuPDF) o `pdftoppm`.
   - **GA (deuda):** swap a permisivo — `pdftohtml -xml` (poppler: da texto E imágenes con posición,
     203 spans + 34 imgs probado) + `pikepdf`/ImageMagick-composite para el alpha. Evita AGPL. No bloquea v1.

2. **Clasificar + subir assets reales.** Heurística del reference (std-dev / aspecto / tamaño):
   descartar `mask`/ruido (std-dev<0.02 o <32px), marcar `background`/`logo`/`photo`. Subir cada
   asset útil → Tigris del user, `access:public` → URL. **Jamás regenerar** logos/escudos/fotos.
   El chrome de marca (barra header con logos) se puede recortar del render como UNA imagen fija.
   (Edge: logo vectorial → fallback rasterizar ese bbox.)

3. **Binding POSICIONAL en CÓDIGO (no IA) — RISK #1 del reference.**
   Emparejar foto↔nombre/cargo por **vecino-más-cercano sobre bboxes**. **NUNCA por reconocimiento
   facial ni dejándoselo al LLM** — con N thumbnails parecidos pondría la cara equivocada bajo un
   funcionario (defecto grave en gobierno). **Algoritmo de referencia ya implementado:**
   `cloner-extractor-reference/extract-photos.py` — filtra fotos retrato (aspecto 0.6–1.6, 25–200px),
   nombre = span de mayor fuente A LA DERECHA y solapado verticalmente con el centro de la foto,
   ordenado por (distancia horizontal, fuente). Copiar ese algoritmo. Salida: pares ya resueltos.

4. **Una llamada LLM "layout → código"** (Gemini, modelo de `aiModels.ts`).
   - Input: por página, los `text_blocks` (bbox+estilo) y los **pares ya bindeados** `{texto, asset_url, rect}`.
   - Contrato del prompt: *"Acomoda estos bloques en HTML+Tailwind reproduciendo la geometría.
     USA EXACTAMENTE estos textos y estas URLs en su rect (no cambies, no inventes, no omitas, no
     re-emparejes fotos). El modelo arregla, no redacta ni reasigna assets."*
   - Output: un `<section>` por página (formato landings v4 / `create_document`).

4. **Render = `create_document`** (Landing v4, version:4) con ese HTML.
   Cae en el editor existente. El user edita/exporta/deploya con `get_document`/`export_document`/
   `deploy_document` (ya existen). El "confirmar humano" del brief = editar ahí. **Cero UI nueva.**

5. **Verify determinista (sin IA).** ¿Aparecen los N `text_blocks` fuente en el HTML de salida?
   Substring/normalizado. Si falta alguno → marcar en la respuesta (`{missingBlocks: [...]}`).

## Licencia del motor de extracción
**DECISIÓN (Jun 2026): AGPL ACEPTADO como deuda temporal para v1.** PyMuPDF/mutool son AGPL
(Artifex). Uso server-side como subproceso, sin redistribuir el binario = riesgo bajo; la
cláusula de red es zona gris pero aceptable mientras no se empaquete/distribuya. v1 corre con
PyMuPDF (ya probado). **Deuda de GA (no bloquea v1):** swap a permisivo medido contra PyMuPDF —
`pdftohtml -xml` (poppler: texto+imágenes con posición) + `pikepdf`/`pypdfium2` (BSD) para alpha.
Ver `cloner-extractor-reference/EXTRACTION-NOTES.md` y `PDF-TOOLS.md`.

## Archivos a tocar
- `scripts/derive/extract.py` — ✅ escrito y probado (PyMuPDF, alpha/smask corregido). Es el extractor
  de v1. Falta: dedup md5 + clasificación. Swap permisivo = deuda de GA. Referencia: `cloner-extractor-reference/`.
- `app/.server/core/documentClone.ts` — reemplazar el motor de mode:`clone`:
  `resolveSource` → invocar extract.py (no pdfToImages) → subir assets → 1 llamada layout→HTML
  (no la actual por-página visión) → `createDocument` → verify. `reimagine` se queda igual.
- `app/.server/mcp/server.ts` (~L2900) — re-habilitar `clone_document` (se deshabilitó por OOM de
  chromium, ya resuelto). Quitar el guard `ENABLE_CLONE_DOCUMENT`.
- `app/.server/services/registry.ts` + `consume.ts` — registrar `doc.clone` con
  `estimateCost = COST_DOC` (1 generación). Envolver la llamada IA del paso 3 en `consumeService`.
  Re-llenar/editar/exportar = gratis (no IA).
- `app/.server/mcp/toolGroups.ts` — confirmar `clone_document` en grupo `design`/`all`.
- `Dockerfile` — añadir `python3` + `pip install PyMuPDF` (wheel autocontenido, sin libs de sistema).
  Verificar que sobrevive `npm prune` (es runtime, no build).

## Cobro
1 generación (`COST_DOC = 100 cr`) en la única llamada IA (paso 3). Todo lo demás gratis.
Loguear en `AiGenerationLog` (`type:"doc.clone"`, `product:"doc"`, `pageCount`).

## Fuera de v1 (no construir aún)
- **Template reusable + fill con datos nuevos** (la parte paramétrica del brief). Es barata después:
  el paso 1 ya entrega data tipada. Construir cuando haya demanda de re-emitir el mismo doc.
- `structured_doc`/@react-pdf como render: solo si una tabla densa desborda y exige paginación auto.
- Diffing multi-instancia (TWIX) para auto-confirmar slot vs fijo.

## Verificación de aceptación
- Conteo: filas de agenda y tarjetas del output == fuente (vía el verify del paso 5).
- Assets == reales (no drift de color/logo): son los PNG extraídos, por construcción.
- Editable: abre en el editor y se puede cambiar fecha/filas sin tocar el diseño.
