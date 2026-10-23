# Auditoría: capturas de «La computadora del agente» (23-oct-2026)


Sólo leí, no edité nada. Los dos tests (7/7) y `npm run typecheck` pasan.

**1. Flujo de una captura**
- El agente llama a `browser_open`, `browser_act` o `browser_look`. El MCP siempre le pide la captura a la caja (`screenshot:true`, fleet-render…mcp.ts:310/328/347). render-svc saca un JPEG q60 sólo del viewport (browserSessions.ts:296): 1280×800, o 780×1688 en móvil con densidad 2. Son unos ~50-200 KB y viajan en base64 dentro del JSON.
- Si hay un turno en vivo del mismo agente en ese proceso (`hasLiveTurn`, :264), la imagen se sube al bucket público de plataforma como `agent-frames/<uuid>.jpg` (:266). Esa subida se espera antes de contestarle al modelo. Al paso sólo se le cuelga la URL (`pushBrowserFrame`), que sale por SSE (`step`) y queda en `FleetTurn.steps` (Json, máximo 300 pasos).
- Hay una captura por cada llamada `browser_*` y ninguna en `close`. Al modelo la imagen sólo le llega si la pidió.
- El replay sirve `FleetTurn.steps` en `/replay/:token` sin `sessionId` (siteTurns.server.ts `getSharedReplay`). Las imágenes se quedan en el CDN público para siempre: no tienen dueño, ni caducidad, ni forma de borrarlas.
- El riesgo de la imagen gigante de 17000px está contenido: sólo es el viewport, no hay `fullPage` y no hay parámetro de viewport.

**2. Bugs verificados**
- **Alto: el replay público filtra comandos.** `getSharedReplay` sólo quita `sessionId`. `command` (hasta 2000 caracteres, fleetAgentOperations collectStream), `detail` y `browser.url` salen tal cual y AgentComputer.tsx:109/318 los muestra. Ejemplo: un `curl -H "Authorization: Bearer eb_sk_…"` o una URL con `?token=` queda pública. Tampoco se pueden revocar: no hay endpoint para poner `shareToken` en null.
- **Alto: las capturas son públicas aunque nadie comparta nada.** Cada captura queda en el CDN público (fleet-render:266) aunque el replay sea privado, y no se borra ni al borrar la cuenta. Puede salir una página con sesión iniciada, o un campo que la persona llenó durante «tomar el control» si el agente luego hace `browser_look`.
- **Alto: render-svc no tiene autenticación.** `/browser/open|act|look|takeover` y `/render/*` contestan a cualquiera en `https://sb-<id>-9300…` (server.ts:1060; el host `expose` no pone ningún gate). `takeoverOnBox` le manda ese host al navegador de la persona (renderClient.ts:266). Con ese host y un `sessionId`, que también va al cliente dentro de los pasos, cualquiera puede manejar el navegador o pedir su propio token de control.
- **Alto: el despliegue azul/verde rompe el panel y el control.** `hasLiveTurn` y `liveBrowserSession` sólo miran la memoria del proceso. El turno sigue en el color viejo mientras drena (hasta 20 min), pero las llamadas MCP del worker y el POST de takeover caen en el color nuevo. Resultado: capturas que se pierden sin aviso y «tomar el control» que responde 404.
- **Medio: el desalojo de sesiones no es LRU.** browserSessions.ts:102 cierra la primera que se abrió, no la menos usada: `touch` no reordena el Map. Como la caja es una por dueño y tiene 4 cupos para toda su flota, la sesión activa de un agente se puede cerrar porque otro agente abrió una quinta (`session_gone` a media tarea).
- **Medio: «tomar el control» muere antes de sus 10 min.** El tráfico de la persona va directo a la caja y nunca llama `touchServiceBox`, así que el reaper la duerme a los 5 min (`idleMin:5`). Además, si la página no cambia, el screencast no manda cuadros y `SESSION_IDLE_MS=200s` cierra la sesión mientras la persona la está viendo. Al devolver el control, nada despierta al agente: si su turno ya terminó, ahí se queda.
- **Medio:** los tokens de control viajan en el query string (`?token=` en `liveUrl`/`inputUrl`) y quedan en los logs de acceso de Caddy. Es justo el patrón que se retiró en `renderMcpServer`.
- **Bajo:**
  - El botón del editor muestra la liga vieja tras un turno nuevo: `replayUrl` nunca se resetea (editor.tsx:133/715).
  - Con dos `browser_*` en paralelo, la captura se cuelga del último paso de navegador «running», que puede ser otro (`pushBrowserFrame`). Lo mismo con `render_url` o `screenshot`, que `stepKind` también clasifica como navegador.
  - Si el turno vive en otro proceso, el poll sólo reenvía cuando cambian `text` o `tools` (siteTurns ~:386), así que un paso con captura nueva no le llega al panel.
  - `POST /replay` sin cuerpo se puede disparar por CSRF y volver público el último turno, aunque el atacante no puede leer el token.

**3. Qué falta para un replay demo en la home**
- No se puede hacer en vivo para anónimos: Bittor tiene `render` apagado a propósito. Tiene que ser un replay grabado en una cuenta de la casa.
- Falta redacción en el servidor: quitar o resumir `command`, `detail` y las URLs con query, con una allowlist de herramientas que se muestran.
- Falta mover las capturas a Files del dueño, ligadas al turno, para poder borrarlas o caducarlas, y que no queden en `agent-frames` públicas desde el primer momento.
- Faltan revocación (`DELETE /replay`), imagen OG y una forma de incrustar AgentComputer en la home sin SSE.
- Falta un turno demo fijado con su token, en lugar de depender de `FleetTurn` del usuario.
- Falta revisar a mano cada captura antes de publicarla: hoy nada impide que salga una página con datos privados.

**4. Recomendaciones, por prioridad**
1. Token por caja en render-svc: un secreto en el env del spawn, mandado como header en `postToBox`. Que `/browser/human/*` acepte sólo su token propio, y no exponer el host al cliente: hacer proxy desde la app.
2. Redactar en `getSharedReplay` (comando, detalle, URLs) y agregar revocación.
3. Subir las capturas a un prefijo privado o firmado, ligado a `turnId`, con lifecycle, y borrarlas junto con el turno o la cuenta.
4. Pasar `hasLiveTurn`, `pushBrowserFrame` y `liveBrowserSession` a la base, o a un camino que sobreviva al azul/verde, por ejemplo escribir el paso en `FleetTurn` y validar takeover contra la fila.
5. Hacer el LRU real (`delete` + `set` en `touch`) y aislar cupos por agente.
6. Durante el control: `touchServiceBox` desde la app, un keepalive que haga `touch` en la sesión, y avisarle al agente cuando se devuelve el control.
7. Si no hay panel en vivo, pedir la captura sólo cuando el modelo la quiera, y no esperar la subida antes de contestarle (hacerla en segundo plano).

Archivos clave:
- /Users/bliss/easybits/app/routes/api/v2/fleet-render.$fleetAgentId.mcp.ts
- /Users/bliss/easybits/app/.server/core/siteTurns.server.ts
- /Users/bliss/easybits/app/.server/core/renderClient.ts
- /Users/bliss/sandbox-host/templates/render-svc/browserSessions.ts
- /Users/bliss/sandbox-host/templates/render-svc/server.ts