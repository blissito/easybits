# Plan: publicar el editor de documentos (canvas) + export "email" sin Tailwind

> Para retomar después de reiniciar. Auditado y simplificado.

## Objetivo
1. Publicar **el editor NUEVO** (canvas-based, el de las rutas `share/`) como paquete consumible desde otra app RRv7.
2. Agregar un export **"email"**: HTML con estilos **inline**, **sin Tailwind**, sin `<script>`, apto Gmail/Outlook — para que fixtergeek componga correos con el mismo editor.

## Restricciones (no perder de vista)
- **Editor a publicar = el de `share/`** (`DocumentCanvas` + `DocumentActionBar` + `DocumentShareEditor`). **NO** el GrapesJS de `dash/documents/editor.tsx`.
- **No romper consumidores actuales** (ej. denik.me) del paquete `@easybits.cloud/html-tailwind-generator`. → Todo **aditivo**: subpaths nuevos, **cero cambios** a los exports existentes (`.`, `./components`, `./components4`, `./buildHtmlV4`, themes, etc.). Bump **minor**.
- **Email = sin Tailwind en la salida.** El output no lleva clases ni CDN ni `<style>` de utilidades.

## Ya está publicado — NO tocar
En `@easybits.cloud/html-tailwind-generator` ya viven y se reutilizan:
- Tipos `Section3`, `IframeMessage`.
- Theme builder: `buildSingleThemeCss`, `buildCustomTheme`, `LANDING_THEMES`.
- `getIframeScript` (script de interacción del canvas).

## Lo que falta empaquetar (vive en `app/`)
- `app/components/documents/DocumentCanvas.tsx`
- `app/components/documents/DocumentActionBar.tsx` (jala `cn` y `hasInlineStyleConflict` → bundlear)
- `app/components/share/DocumentShareEditor.tsx` (orquestador)
- `app/lib/documents/buildHtml.ts` (`buildDocumentHtml` / `buildDocumentPrintHtml` / `buildDocumentPreviewHtml`)

---

## Fase 1 — Publicar el editor (alto valor, bajo riesgo)
Mover los 4 archivos de arriba a `packages/html-tailwind-generator/src/` y agregar **subpath nuevo** `./document`:
- Export: `DocumentShareEditor`, `DocumentCanvas`, `DocumentActionBar`, `buildDocument*`.

**CSS aislado (simplificado):**
- El canvas ya renderiza cada página en un **iframe con su propio `<head>`** → el HTML del documento ya está aislado del host. No hay nada que hacer ahí.
- Lo único acoplado a Tailwind es el **chrome/toolbar** (~40 clases en `DocumentActionBar`). Decisión simple: **enviar un CSS precompilado** (`tailwindcss` CLI escaneando solo esos componentes con nuestra paleta) → `@easybits.cloud/html-tailwind-generator/document.css`. El host hace `import` de ese css y **no necesita Tailwind ni configurar nada**. (Evita pedirle al consumidor que matchee nuestra paleta.)

**SSR / `ssr.noExternal`:**
- Componentes son client-effect-only (refs/iframes), sin imports server-only. Funciona si el consumidor agrega en su vite config:
  `ssr: { noExternal: ['@easybits.cloud/html-tailwind-generator'] }`
- Documentar esa línea en el README del subpath.

---

## Fase 2 — Export "email" SIN Tailwind (best-effort, simplificado)
Subpath **server-side** nuevo `./email` con una sola función `buildEmailHtml(sections, opts)`.

**Pipeline (mecánico y confiable, NADA de transpilers raros):**
1. Ensamblar el HTML de las secciones (sin chrome de flipbook).
2. **Compilar Tailwind → CSS real** (ya tenemos `tailwindcss@3.4` + `postcss` en deps; se usa solo en build-time de este export, no llega Tailwind a la salida).
3. **Aplanar `var()`** a valores literales (Outlook no soporta custom properties) — resolver desde el themeCss.
4. **`juice`** para inline-ear todo el CSS en atributos `style=` (única dep nueva).
5. **Quitar** `<script>` y el `<script src=cdn.tailwindcss>`.
6. Envolver en **layout de tabla** con `max-width` (contenedor centrado responsive).

**Simplificación clave (auditoría):** NO construir un convertidor flex/grid→tablas. En su lugar, **email-mode usa layout en flujo** (una columna, `max-width`, sin `position:absolute`/grid). Así Outlook se comporta sin lógica frágil. Los docs con covers absolutos degradan en Outlook — eso es aceptado y documentado; para email se compone en flujo.

**No romper a denik.me:** las deps pesadas del email (`tailwindcss`, `postcss`, `juice`) se **cargan con `import()` dinámico dentro de `./email`**. Quien solo use el editor/landings no las ejecuta. Marcar `juice` como dependency normal (peso de install menor, no cambia comportamiento de exports existentes).

---

## Versionado y publish
- Bump **minor** (0.2.x → 0.3.0). Solo se **agregan** exports `./document`, `./document.css`, `./email`. Nada existente cambia de firma.
- Seguir el flujo del repo (memoria SDK Workflow): editar en `packages/html-tailwind-generator/` → bump `package.json` → `npm publish --access public` → `npm i @easybits.cloud/html-tailwind-generator@<ver>` en la app.

## Decisiones tomadas (defaults, redirigibles)
- Toolbar → **CSS precompilado** (cero requisitos al host). [alternativa: exigir Tailwind al host — descartada por fricción]
- Email → **best-effort en flujo** (Outlook-absoluto NO). [alternativa: fidelidad pixel Outlook = otro nivel de esfuerzo, no recomendado]

## Orden de ejecución
1. Fase 1 (editor + document.css + SSR doc).
2. Publicar, probar consumo desde la app de fixtergeek.
3. Fase 2 (email pipeline).
4. Publicar minor final.
