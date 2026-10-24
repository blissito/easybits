# Cómo entregan imágenes/archivos los agentes (chat ↔ panel)

Investigado 23-oct-2026. `S` = `https://github.com/kortix-ai/suna/blob/7ed29a41269893a68bc25f20f583da3b936a7ef5/frontend/src`

## 1. Suna / Kortix (código, Apache-2)
- **Los entregables son argumentos de una tool, no links en texto.** `ask`/`complete` llevan `attachments: string[]` (rutas del sandbox). El chat pinta el texto en markdown + `renderAttachments(...)` → `FileAttachmentGrid` (`S/hooks/messages/utils/assistant-message-renderer.tsx` L77-138; `S/components/thread/content/ThreadContent.tsx` L40-55). Las demás tools salen como **chip compacto** (icono + nombre + parámetro) que abre el panel en ese paso (`renderRegularToolCall`, mismo archivo ~L158-175).
- **Grid de miniaturas**: imágenes primero, previsualizables (HTML/MD/PDF/CSV) a ancho completo; 1→1 columna, 2-4→2, >4→3; altura 200 px (600/400/300 en standalone según cuántas) (`S/components/thread/file-attachment.tsx` L952-980; `attachment-group.tsx` L143-152, L168-210). Inline: máx 5 visibles (2 en móvil) + tarjeta «N more»; en grid con ≥4 → carrusel (`attachment-group.tsx` L216, L491-508).
- **La imagen se baja del sandbox autenticada** (`/sandboxes/{id}/files/content?path=`, blob URL), con skeleton `aspect-ratio 4/3` mientras carga y estado «sandbox borrado» (`file-attachment.tsx` L152-175, L271-275, L449-640). Botón de descarga aparte con `stopPropagation`.
- **Clic** → `handleOpenFileViewer(path, filePathList)` abre `FileViewerModal` con **la lista entera del mensaje** para navegar anterior/siguiente + descargar todo en zip (`S/components/thread/ThreadComponent.tsx` L638-653; `file-viewer-modal.tsx` L68-101, L255-391). Ojo: en este commit el archivo abre **modal**, no el panel.
- **Panel lateral** (`tool-call-side-panel.tsx`): un paso por tool con slider de línea de tiempo, «Live Updates / Jump to Live» (L259-330, L397) y pestaña tools/browser (L79). `CompleteToolView` repite el grid «Files (N)» y «tasks completed» dentro del panel (`tool-views/CompleteToolView.tsx` L74-121, L199-290).
- **Screenshots del navegador** viven **sólo en el paso del panel**: `BrowserToolView` lee `output.image_url` o `screenshot_base64` (L112-240); nunca se vuelcan al chat.

## 2. Manus
- Panel «Manus's Computer» muestra navegador/terminal/archivos en vivo y permite **replay** de la línea de tiempo ([WorkOS](https://workos.com/blog/introducing-manus-the-general-ai-agent), [MIT Tech Review](https://www.technologyreview.com/2025/03/11/1113133/manus-ai-review/)).
- Archivos: entrada **«View all files in this task»** arriba a la derecha ([blog sandbox](https://manus.im/blog/manus-sandbox)). Al compartir, el receptor ve **sólo conversación + output artifacts**, nunca el sandbox (mismo blog; [help: share](https://help.manus.im/en/articles/11711198-how-can-i-share-a-task)). Cards de archivo al final del mensaje: no encontré doc oficial, sólo guías de terceros.

## 3. ChatGPT agent / Operator y Claude
- ChatGPT agent: el usuario ve la ventana del navegador virtual con narración de pasos y capturas; los entregables (docs, hojas, slides) salen al chat para descargar ([launch post](https://openai.com/index/introducing-chatgpt-agent/), [VentureBeat](https://venturebeat.com/ai/openai-unveils-chatgpt-agent-that-gives-chatgpt-its-own-computer-to-autonomously-use-your-email-and-web-apps-download-and-create-files-for-you)). Help center 403 desde aquí: detalle de UI sin verificar.
- Claude: el artifact «abre en su propia ventana junto a la conversación», con copiar/descargar arriba y todo guardado en la pestaña **Artifacts** del sidebar ([help](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)). Archivos creados: se descargan «directo desde la conversación» ([help files](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)).

## 4. Lovable / v0 / Bolt
- Lovable: browser testing toma screenshots al tamaño del preview, pero se ven en la **vista Details** que se abre al dar clic en la **tarjeta de actividad** del chat, no inline ([docs](https://docs.lovable.dev/features/browser-testing)).
- v0: sin screenshots del agente; el preview es la superficie (Design Mode, [docs](https://v0.app/docs/design-mode)). Bolt: no encontré evidencia de que muestre capturas.

## Qué copiar (5 reglas)
1. **Nunca URL cruda en chat.** El agente entrega por un campo estructurado (`attachments`/resultado de tool) y la UI lo pinta; la prosa sólo describe (Suna `ask/complete`).
2. **Evidencia en el paso, entregable en el chat.** Screenshots de verificación (3 tamaños) viven en el paso del panel (Suna `BrowserToolView`, Lovable Details); al chat va sólo lo que el usuario pidió, como grid de miniaturas.
3. **Grid con tope**: imágenes primero, 1/2/3 columnas por cantidad, altura fija ~200 px, «+N» o carrusel después de 5; skeleton 4:3 mientras carga.
4. **Clic = abrir con la lista del grupo** (anterior/siguiente, descargar uno/todos); en nuestro caso en el panel «computadora», no modal, porque el panel siempre está abierto. Descarga con botón aparte.
5. **Chip por paso + vista de «todos los archivos»**: cada tool es un chip que salta a su paso en el panel (con «volver a en vivo»), y al cierre un resumen con los entregables; un índice de archivos de la tarea tipo Manus, que es lo único que ve quien recibe el link compartido.
