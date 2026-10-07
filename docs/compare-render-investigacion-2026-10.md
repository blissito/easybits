# compare_render — estado del arte y decisión producto vs feature (7 oct 2026)

Nota: la investigación hizo sólo 3 búsquedas web. Las partes sobre Builder/Visual Copilot, Figma-to-code, Design2Code y DreamSim salen de conocimiento previo y conviene confirmarlas.

## Hallazgos
- **Motores de diff (commodity):** pixelmatch y odiff (YIQ, antialias, ignorar regiones; Argos usa odiff por dentro). diff-pdf y pdf-visual-diff sólo comparan raster contra raster: no ven el texto.
- **SaaS de regresión visual que se mueve hacia agentes:**
  - Lost Pixel se fue con Figma y cierra (abr 2026).
  - Argos es OSS; gratis hasta 5k capturas al mes, luego $100 al mes. Tiene CLI y API "agent-ready".
  - Percy tiene un Visual Review Agent con MCP (oct 2025).
  - Chromatic tiene MCP de Storybook (mar 2026).
  - Applitools sigue en precio enterprise.

  Todos hacen **regresión** (la versión N contra la N-1 de la misma app), ninguno **fidelidad de un clon** (formato A contra formato B).
- **APIs de diff para agentes** (por ejemplo Apify lintlab Screenshot Diff por MCP): pixel diff pintado en rojo, sin defensa contra trampas.
- **OpenAI documents skill (`render_and_diff.py`):** LibreOffice → Pillow ImageChops + diff del texto. Devuelve un booleano por página, sin umbrales ni anti-trampas.
- **Investigación:**
  - VisRefiner (arXiv 2602.05998): alinea el diff visual con ediciones de código y añade RL.
  - UI2Code^N (ICML 2026): recompensa relativa entre candidatos.

  Sus métricas son más blandas que las nuestras y no están blindadas contra trampas.

## Qué adoptar en compare_render
1. odiff como motor de layout (más rápido; antialias e ignore-regions nativos).
2. Diff legible para el agente: lo que cambió en rojo y el resto atenuado, más recortes de original y clon en las peores `regions`.
3. Score continuo además del veredicto binario, para best-of-N en `presentationClone`.
4. SSIM o DreamSim sólo informativo, nunca para decidir.
5. Entrada DOCX y PPTX (LibreOffice → PDF → mismo pipeline).

## Recomendación
**Feature diferenciador de EasyBits, no producto separado.** El argumento de venta sería "veredicto que el agente no puede engañar".
- Publicar la batería de trampas como benchmark abierto para ganar credibilidad.
- Separarlo sólo si aparece demanda externa vía MCP. En ese caso se cobraría por página verificada, posicionado en fidelidad contra Argos y Percy, que hacen regresión.

Fuentes: argos-ci.com/docs/diff-algorithm · argos-ci.com/blog/ai-visual-testing · argos-ci.com/blog/lost-pixel-alternatives · mcpservers.org/servers/apify-com-lintlab-screenshot-diff · arxiv.org/abs/2602.05998 · icml.cc/virtual/2026/poster/66252

---

# presentationClone: qué hace la comunidad (7 oct 2026, segunda ronda)

## PDF → HTML fiel
- **pdf2htmlEX** (el fork mantenido): la mayor fidelidad (fuentes incrustadas, cada línea en absoluto), pero el HTML casi no se puede editar.
- **MuPDF stext / PyMuPDF**: la mejor materia prima, con caja, fuente y color por carácter. Ya la tenemos.
- **Docling, Marker, MinerU, Unstructured**: pensados para RAG; tiran el layout y no sirven para clonar.

## Patrón que gana: extracción determinista + LLM sólo para diseño
- **SlideCoder** ([arxiv.org/html/2506.07964v1](https://arxiv.org/html/2506.07964v1)): pasarle al modelo las posiciones ya segmentadas, con un prompt que conoce el layout, da hasta +40.5 puntos. No se le pide que adivine coordenadas.
- **Auto-Slides** y **SlideGen**: siguen el mismo patrón (extraer → verificar → reparar).
- **Design2Code**: los modelos fallan en recall y posición, no en el texto.

## ¿Observación en tiempo real?
- **No existe observación continua.** Chrome DevTools MCP, Playwright MCP, Browser Use, Stagehand y los previews de Cursor/v0/Lovable sólo capturan bajo demanda.
- **Contra un original sólo comparan mcp-perfectpixel, PageLens MCP y RenderLens**, y son pixel diff sin defensa contra trampas.
- **El estándar es un ciclo discreto:** editar → render → comparar → corregir.

## Plan para presentationClone
1. El esqueleto se genera en código desde MuPDF stext: cada línea en absoluto, con su caja, fuente, tamaño y color. El LLM nunca pone coordenadas.
2. El fondo sale de MuPDF sin la capa de texto.
3. El LLM sólo agrupa en bloques editables, pone semántica (h1, listas) y formas.
4. Ciclo con compare_render que corrige sólo las regiones malas; máximo 2 o 3 vueltas.
5. pdf2htmlEX queda como piso de fidelidad para comparar.

## Fuentes
- [SlideCoder](https://arxiv.org/html/2506.07964v1)
- [SlideGen](https://arxiv.org/pdf/2512.04529v1)
- [PageLens MCP](https://glama.ai/mcp/servers/amoghmanral/pagelens-mcp)
- [RenderLens](https://mcpservers.org/en/servers/renderlens-dev)
- [Argos: Playwright MCP y visual testing](https://argos-ci.com/blog/playwright-mcp-visual-testing)

---

# Fuentes en los PDFs de producción (7 oct 2026)

Medición de sólo lectura sobre los 224 PDFs más recientes de la plataforma (Files en estado DONE, de menos de 25 MB, sin almacenamiento propio). El universo es de 2,120 PDFs. Se clasificó con `pdffonts` sobre las páginas 1 a 3, y cada PDF cuenta en la categoría más difícil que trae.

| Categoría | % | Qué pasa con el esqueleto |
|---|---|---|
| TrueType incrustado | 83.9 | Ya se clona exacto |
| Type 3 | 8.9 | Texto en su lugar; la tipografía falla. 19 de 20 vienen de Chrome en Linux (nuestras cajas de render) |
| Error de descarga | 2.7 | — |
| Fuente no incrustada | 2.2 | Sustituta (react-pdf, jsPDF) |
| CFF / Type 1 | 1.8 | Sustituta (LibreOffice, Illustrator) |
| Sin texto | 0.4 | Lo clona el LLM |

Por origen: el MCP concentra el Type 3 (17 de 81 PDFs).

**Conclusión:** el conversor Type 3 sube la cobertura de ~84 % a ~93 %. Lo más barato es evitar que nuestras propias cajas generen Type 3, porque casi todos salen de ahí.
