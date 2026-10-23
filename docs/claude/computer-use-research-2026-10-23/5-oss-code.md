# 5 · UIs open source de computer use (lectura de código, 23-oct-2026)

Comparado contra `app/components/sitios/AgentComputer.tsx` + `app/lib/agentSteps.ts`.
Copias locales de los archivos leídos: `.../cu-research/src/{suna,surf,bytebot,oo,vercel,anth,bu,owl}/`.

## Tabla

| Repo | Archivo clave | Cómo modela un paso | Render por herramienta | Navegación | Licencia |
|---|---|---|---|---|---|
| **Suna / Kortix** (clásico) | [tool-call-side-panel.tsx](https://github.com/kortix-ai/suna/blob/7ed29a41269893a68bc25f20f583da3b936a7ef5/frontend/src/components/thread/tool-call-side-panel.tsx) · [ToolViewRegistry.tsx](https://github.com/kortix-ai/suna/blob/7ed29a41269893a68bc25f20f583da3b936a7ef5/frontend/src/components/thread/tool-views/wrapper/ToolViewRegistry.tsx) · [BrowserToolView](https://github.com/kortix-ai/suna/blob/7ed29a41269893a68bc25f20f583da3b936a7ef5/frontend/src/components/thread/tool-views/BrowserToolView.tsx) · [CommandToolView](https://github.com/kortix-ai/suna/blob/7ed29a41269893a68bc25f20f583da3b936a7ef5/frontend/src/components/thread/tool-views/command-tool/CommandToolView.tsx) | `ToolCallInput {toolCall:{tool_call_id,function_name,arguments}, toolResult:{success,output,error}, timestamps, isSuccess}` → envuelto en `ToolCallSnapshot {id,index,timestamp}` | **Registro nombre→vista** (`'browser-act': BrowserToolView`, `'execute-command': CommandToolView`, `'create-file': FileOperationToolView`, ~60 vistas: web-search, crawl, expose-port, docs…) con `GenericToolView` de reserva. Todas reciben el mismo `ToolViewProps`. Comando: `$ cmd` + salida + exit code, y distingue comandos no bloqueantes. Navegador: captura (`image_url` o `screenshot_base64`) con toggle «captura ↔ input/output». | `NavigationMode = 'live' \| 'manual'`; **Slider** + prev/next + píldora de estado de 4 casos («Live Updates», «Jump to Live», «Latest Tool», «Jump to Latest»). Toggle `tools \| browser` (VNC en vivo). Regla de auto-salto en manual: salta si estabas en el último **o** si el paso nuevo es de archivo. ⌘I cierra panel. | ⚠️ **Apache-2.0 sólo hasta el commit `7ed29a4` (2-dic-2025)**; desde `3f735fb` es KPSL (y la app nueva en `apps/web/src/features/session/tool` es Elastic-2.0). Portar sólo de `7ed29a4`. |
| **E2B Surf** | [types/chat.ts](https://github.com/e2b-dev/surf/blob/main/types/chat.ts) · [lib/chat-context.tsx](https://github.com/e2b-dev/surf/blob/main/lib/chat-context.tsx) · [components/chat/message.tsx](https://github.com/e2b-dev/surf/blob/main/components/chat/message.tsx) · [app/page.tsx](https://github.com/e2b-dev/surf/blob/main/app/page.tsx) | Mensaje con `role:"action"`, `action: OpenAIComputerAction`, `status: pending\|completed\|failed`, **`repeatCount`** | Una sola tarjeta "action" con el JSON de la acción; la pantalla es un `<iframe src={vncUrl}>` del escritorio E2B (noVNC), no capturas. | Ninguna (sólo en vivo). | Apache-2.0 |
| **bytebot** (archivado) | [ComputerToolUtils.tsx](https://github.com/bytebot-ai/bytebot/blob/main/packages/bytebot-ui/src/components/messages/content/ComputerToolUtils.tsx) · [ComputerToolContentNormal.tsx](https://github.com/bytebot-ai/bytebot/blob/main/packages/bytebot-ui/src/components/messages/content/ComputerToolContentNormal.tsx) · [useScrollScreenshot.ts](https://github.com/bytebot-ai/bytebot/blob/main/packages/bytebot-ui/src/hooks/useScrollScreenshot.ts) · [tasks/[id]/page.tsx](https://github.com/bytebot-ai/bytebot/blob/main/packages/bytebot-ui/src/app/tasks/%5Bid%5D/page.tsx) | Bloques `tool_use` tipados de Anthropic (`ComputerToolUseContentBlock`) con guards `isClickMouseToolUseBlock`, `isScrollToolUseBlock`… | `getIcon(block)` / `getLabel(block)` + detalle **semántico de parámetros**: coordenadas `x, y`, trayectoria `From → To`, `scroll down 3`, `500ms`, ruta de archivo; clic derecho con icono propio. Los pasos "Screenshot" **no se pintan** en la lista (van al visor). | Tarea activa → VNC (`viewOnly` o take-over). Tarea terminada → **captura sincronizada con el scroll del chat** (`useScrollScreenshot`: la captura mostrada es la del mensaje visible). | Apache-2.0 |
| **Browserbase Open Operator** (archivado) | [app/components/ChatFeed.tsx](https://github.com/browserbase/open-operator/blob/main/app/components/ChatFeed.tsx) | `BrowserStep {text, reasoning, tool: GOTO\|ACT\|EXTRACT\|OBSERVE\|CLOSE\|WAIT\|NAVBACK, instruction, stepNumber}` | Lista de pasos con número + tool + razonamiento; la pantalla es el iframe del debugger en vivo de Browserbase (`sessionUrl` reescrita a `devtools-internal-compiled`). Al `CLOSE` se acaba. | Ninguna. | MIT (lo dice el README; no hay archivo LICENSE) |
| **Vercel AI SDK computer-use** | [components/message.tsx](https://github.com/vercel-labs/ai-sdk-computer-use/blob/main/components/message.tsx) · [app/page.tsx](https://github.com/vercel-labs/ai-sdk-computer-use/blob/main/app/page.tsx) | Partes `tool-invocation {toolName, toolCallId, state: call\|result, args}` del AI SDK | `switch(action)` → etiqueta humana + detalle ("Left clicking · (x, y)", "Typing · \"…\"", "Scrolling · down 3"); spinner / ✓ / stop por `state`; el resultado `screenshot` se pinta **en línea en el chat**; `bash` con su propia tarjeta. Escritorio en vivo en panel redimensionable. | Ninguna. | Sin LICENSE ni mención (tratar como todos los derechos: sólo ideas) |
| **Anthropic quickstarts** | [computer-use-demo/streamlit.py](https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/computer_use_demo/streamlit.py) · [dev_ui/trajectory_viewer/app.py](https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-best-practices/dev_ui/trajectory_viewer/app.py) · [dev_ui/localization_demo/static/index.html](https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-best-practices/dev_ui/localization_demo/static/index.html) | Turnos crudos de la API guardados como `transcript.jsonl` + `meta.json`; las imágenes **como archivos por ruta**, no base64 | Por tipo de bloque: `text`, `thinking` (expander), `tool_use` (código), `tool_result (ok\|error)` con texto/imagen. El demo de localización pinta una **cruz (crosshair) con la coordenada** sobre la captura, en el espacio escalado y en el original. | **Slider "Show through turn"** + `turn i / n`. | MIT |
| **browser-use web-ui** | [src/webui/components/browser_use_agent_tab.py](https://github.com/browser-use/web-ui/blob/main/src/webui/components/browser_use_agent_tab.py) | Callback `_handle_new_step(state, output, step_num)`: `state.screenshot` (JPEG b64) + `AgentOutput {current_state, action[]}` | Gradio Chatbot: "--- Step N ---" + `<img>` + JSON del output. Al final, **GIF** de toda la tarea (`generate_gif`). | Scroll del chat. | MIT. (La cloud de browser-use es cerrada.) |
| **OWL** | [owl/webapp.py](https://github.com/camel-ai/owl/blob/main/owl/webapp.py) | Logs de texto leídos de archivo por un hilo | Gradio: tail de logs, sin vistas por herramienta. | — | Apache-2.0 |
| **OpenManus** | — (no trae frontend; sólo CLI) | — | — | — | MIT |
| **Scrapybara** | [scrapybara-playground](https://github.com/Scrapybara/scrapybara-playground) (11★, MIT) — irrelevante | — | — | — | MIT |

## Fragmentos clave

Suna — registro con reserva genérica (el patrón que más escala):
```ts
const defaultRegistry: Record<string, ToolViewComponent> = {
  'browser-navigate-to': BrowserToolView, 'browser-act': BrowserToolView,
  'execute-command': CommandToolView, 'check-command-output': CheckCommandOutputToolView,
  'create-file': FileOperationToolView, /* … */ };
// fallback → GenericToolView (args + output en JSON)
```

Suna — auto-salto en modo manual:
```ts
} else if (hasNewSnapshots && navigationMode === 'manual') {
  const wasAtLatest = internalIndex === toolCallSnapshots.length - 1;
  const isLatestFileOp = ['create-file','edit-file','full-file-rewrite','read-file','delete-file'].includes(latestToolName);
  if (wasAtLatest || isLatestFileOp) jumpToLatest();
}
```

Surf — colapsar repeticiones en vez de una fila por acción:
```ts
if (incomingAction.type !== "wait") return [...prev, actionMessage];
// misma acción que la anterior → sube el contador
return [...prev.slice(0, -1), { ...last, repeatCount: (last.repeatCount ?? 1) + 1, status: "pending" }];
```

bytebot — detalle semántico por acción (no "click", sino dónde):
```tsx
{block.input.coordinates && <p>{x}, {y}</p>}
{"path" in block.input && <p>From: {p0.x},{p0.y} → To: {pn.x},{pn.y}</p>}
{isScrollToolUseBlock(block) && <p>{direction} {scrollCount}</p>}
if (getLabel(block) === "Screenshot") return null; // la captura va al visor, no a la lista
```

bytebot — en tareas terminadas la captura sigue al scroll del chat (`useScrollScreenshot`): escucha `scroll` (throttle 100 ms) + `MutationObserver`, y elige la captura del mensaje en pantalla.

## Dónde ya estamos

`AgentComputer` ya tiene lo que la mayoría NO: modo live/follow con «Volver a en vivo», flechas ←/→, replay con autoplay, terminal acumulada, editor con archivos vistos, recuadro de elemento resaltado, y «Tomar el control». Lo que nos falta frente al open source está en el **modelo del paso**: `AgentStep` no guarda resultado (`output`, `exitCode`, resultados de búsqueda, diff), así que `search` y `other` caen en `GenericView`.

## 3 ideas concretas para portar

1. **Registro de vistas por herramienta + resultado en el paso** (Suna, Apache vía `7ed29a4`). Agregar a `AgentStep` un `result?: {ok, summary, exitCode?, items?: {title,url}[], diff?}` recortado en `agentSteps.ts`, y cambiar el `if/else` por kind por un mapa `tool|kind → View` con `GenericView` de reserva. Primeras vistas: **SearchView** (lista de resultados con dominio y favicon, la query arriba), terminal con exit code en rojo, editor con diff (líneas +/−). Es lo que hace "semántico" al panel.
2. **Barra de pasos agrupada y con detalle de acción** (Surf `repeatCount` + bytebot `getIcon/getLabel` + Vercel `switch(action)`). Colapsar pasos consecutivos iguales («Desplazó ×4», «Esperó ×3»), ocultar capturas sueltas de la lista y poner el parámetro humano junto al icono: «Clic en (412, 230)», «Escribió "hola"», «Bajó 3». Sumar la **cruz con coordenada** de Anthropic sobre la captura cuando la acción fue un clic por coordenadas (hoy sólo pintamos el recuadro del elemento).
3. **Navegación de replay de Suna + sincronía con el chat de bytebot.** Un **slider** (scrubber) debajo de la barra de pasos y la píldora de 4 estados («En vivo» / «Ir a en vivo» / «Último paso» / «Ir al último»), con la regla de auto-salto: en manual sólo salta si estabas en el último o si el paso nuevo es de archivo. En replay compartido, que al hacer scroll del chat la computadora muestre el paso del mensaje visible (`IntersectionObserver` sobre los mensajes con `data-step-id`, más limpio que el throttle de bytebot).

Extra: guardar trayectorias como `transcript.jsonl` + capturas por ruta (Anthropic `trajectory_viewer`) en vez de base64 en el mensaje; y el GIF/MP4 de la tarea al final (browser-use) es un compartible barato con nuestras capturas JPEG.
