# 6 · Infra de navegador para agentes: vista en vivo y replay

Investigado el 23-oct-2026 en docs públicas y repos. El dato duro de cada viñeta viene de la fuente enlazada.

## Panorama: cómo lo hace cada proveedor

| Proveedor | Vista en vivo | Replay | Control humano |
|---|---|---|---|
| Browserbase | iframe `debuggerFullscreenUrl`, una URL por pestaña, `navbar=false` | **Video**: CDP screencast → HLS fMP4 (dejaron rrweb) | iframe interactivo; `pointer-events:none` = sólo ver |
| Steel.dev | iframe `debugUrl`: **WebRTC** en headful, **CDP screencast** en headless (legado) | HLS `/v1/sessions/{id}/hls` | `?interactive=true\|false`, `showControls` |
| Kernel | fork de **neko** (WebRTC + GStreamer sobre display X); noVNC como alternativa | **ffmpeg** del mismo display X → MP4 H.264; se puede ver en curso | `ENABLE_READONLY_VIEW` |
| Hyperbrowser | iframe `liveUrl?token=` (vence en 12 h) | **rrweb** JSON (`enableWebRecording`) + MP4 opcional | `viewOnlyLiveView: true` |
| Anchor | iframe `live_view_url`, `one_time_url` de un solo uso | MP4 automático; pausa/reanuda; enmascara datos sensibles | iframe interactivo por default |
| Browser Use cloud | iframe en `live.browser-use.com`, `readOnly=true`, `ui=false` | MP4 al detener el navegador; link público para compartir | iframe; `inert` para sólo ver |
| Notte | viewer «browser» (screencast), viewer CDP, viewer Jupyter; URL firmada 12 h | MP4 `session.replay()` (otra página dice WebP) | — |

## Técnicas (pros y contras)

1. **CDP `Page.startScreencast` empujado por WebSocket** (Steel headless, Notte, Browserbase). Steel open source lo hace así: `format:"jpeg", quality:75`, ack inmediato con `Page.screencastFrameAck`, y cada frame va como JSON `{pageId,url,title,favicon,data}`. El input regresa por `Input.dispatchMouseEvent`/`dispatchKeyEvent`. Código: [casting.handler.ts](https://github.com/steel-dev/steel-browser/blob/main/api/src/plugins/browser-socket/casting.handler.ts).
   - Pros: no requiere display X ni GPU, funciona en headless y es lo más cercano a lo que ya tenemos.
   - Contras: Chrome **sólo emite frames cuando algo cambia** y espera el ack, así que el fps es irregular y una página quieta no manda frames. Una vista que se alimenta sólo de esto se siente saltona y puede quedarse sin imagen. Steel lo considera **legado** y se mudó a WebRTC.
2. **WebRTC sobre un display virtual (neko + GStreamer)**: Kernel y Steel headful. [kernel-images](https://github.com/kernel/kernel-images): `ENABLE_WEBRTC=true`, «mucho más rápido que VNC», con resize y portapapeles; necesita TURN detrás de NAT ([neko](https://github.com/m1k1o/neko)).
   - Pros: video fluido a fps constante con latencia sub-segundo. El cursor real y las animaciones de la página se ven.
   - Contras: pide Chrome headful más Xvfb, y el encoder cuesta CPU. Browserbase descartó WebRTC por esa razón: el encoder le roba CPU a la automatización ([blog](https://www.browserbase.com/blog/session-recordings)). Además fija el tamaño del display mientras se graba.
3. **noVNC**: es el fallback de Kernel.
   - Pros: simple y probado.
   - Contras: más lento que WebRTC y con artefactos de compresión.
4. **Replay DOM con rrweb** (Hyperbrowser; Browserbase lo usó y lo retiró).
   - Pros: pesa poco, el texto queda nítido, se puede buscar, y el player interpola el mouse.
   - Contras: Browserbase reporta que se rompe con iframes anidados, shadow DOM, canvas, WebGL y video. Algunos replays «se veían bien pero mentían», y vuelven a pintar datos vivos con su estado posterior. Además sólo cubre la pestaña principal.
5. **Replay como video desde frames de screencast** (Browserbase). Toman frames PNG con timestamp sub-segundo, sólo cuando hay cambio, y los suben a object storage. Cada 10 s marcan un corte de segmento y unos workers codifican H.264 fMP4 en paralelo. Los primeros ~30 s se codifican al momento y el resto sólo cuando alguien lo ve: apenas el 8 % de las sesiones se reproduce ([blog](https://www.browserbase.com/blog/session-recordings), [docs](https://docs.browserbase.com/features/session-replay)).
   - Pros: el replay es fiel a lo que se pintó y no cuesta CPU dentro del navegador.
   - Contras: requiere un pipeline de encoding y un player HLS (hls.js), y los segmentos vencen a las 6 h.
6. **Video ffmpeg del display X** (Kernel, Anchor, Browser Use). Ofrecen MP4 con API start/stop/download, pausa para pasos sensibles y descarga aunque la grabación siga en curso ([Kernel replays](https://onkernel.substack.com/p/introducing-browser-session-replays)).
   - Pros: es lo más simple si ya hay display.
   - Contras: el MP4 sale hasta detener la sesión (en Browser Use). No tiene marcas por paso.
7. **Embebido = iframe en todos.** Sólo-ver se resuelve con `pointer-events:none` o `inert` + `tabindex=-1` (Browserbase, Anchor, Browser Use), o con un flag al crear la sesión (Hyperbrowser `viewOnlyLiveView`, Kernel). Browserbase avisa la desconexión con `postMessage('browserbase-disconnected')`.
   - Riesgo: todos advierten que la URL **es credencial**. Las mitigaciones son token con vencimiento (Hyperbrowser/Notte 12 h) o link de un solo uso (Anchor `one_time_url`).
8. **Cursor o clic animado: casi nadie lo da en la infra.** Los proveedores muestran el cursor del sistema (WebRTC/VNC) o ningún cursor (screencast). [Browser Use demo mode](https://github.com/browser-use/browser-use/blob/main/browser_use/browser/demo_mode.py) inyecta en la página un **panel de log** con razonamiento y acciones, pero no un cursor. El overlay de cursor queda a cargo de la app, ya sea dentro de la página (CDP `Overlay`, script inyectado) o encima del visor.
9. **Privacidad en el stream**: Anchor enmascara contraseñas, correos, tarjetas y API keys en el live view y en la grabación. Kernel y Anchor pausan la grabación en pasos sensibles.

## 3 ideas aplicables a nuestro panel

1. **Pasar de capturas por paso a screencast continuo mientras el turno corre.** Abrir `Page.startScreencast` (jpeg q≈70, `maxWidth` del panel) en render-svc y reenviar los frames por el WebSocket que ya usa «tomar el control», al estilo Steel. Hay que dar ack inmediato y repetir el último frame para que el visor nunca quede vacío. Así se arreglan el efecto saltón y el «sin imagen» sin pagar el costo de WebRTC. Si una página quieta no manda frames, se pide un `Page.captureScreenshot` cada ~2 s como latido.
2. **Cursor fantasma dibujado en el visor, no en la página.** Cada paso ya trae coordenadas `{x,y}` del clic. El visor anima un cursor SVG con una curva de ~300-500 ms y ripple al llegar entre el frame anterior y el siguiente. Con eso la captura «salta» pero el ojo sigue un movimiento continuo. Ningún proveedor lo trae, así que es un diferenciador. Sirve igual para el replay por pasos y combina con la idea de cursor agéntico del CLAUDE.md.
3. **Replay = los frames del screencast con timestamp más las marcas de paso; nada de rrweb.** Se guardan los JPEG con su `t` y los pasos como capítulos. El replay muestra los frames y salta de paso a paso, con crossfade corto entre frames, cursor interpolado y un fade de la última imagen mientras carga la siguiente. Si después se quiere video, se copia el truco de Browserbase: codificar en segmentos sólo cuando alguien lo abre. La URL de replay debe ser de vencimiento corto o un solo uso, y sin pasos sensibles (como Anchor).

## Fuentes
- Browserbase: [Live View](https://docs.browserbase.com/features/session-live-view) · [Session Replay](https://docs.browserbase.com/features/session-replay) · [blog de grabaciones](https://www.browserbase.com/blog/session-recordings) · [changelog](https://www.browserbase.com/changelog/session-recordings)
- Steel: [Live sessions](https://docs.steel.dev/overview/sessions-api/embed-sessions/live-sessions) · [Human-in-the-loop](https://docs.steel.dev/overview/sessions-api/human-in-the-loop) · [steel-browser (código)](https://github.com/steel-dev/steel-browser)
- Kernel: [kernel-images](https://github.com/kernel/kernel-images) · [post de replays](https://onkernel.substack.com/p/introducing-browser-session-replays)
- Hyperbrowser: [Live view](https://hyperbrowser.ai/docs/sessions/live-view) · [Recordings](https://docs.hyperbrowser.ai/sessions/recordings)
- Anchor: [Live view](https://docs.anchorbrowser.io/advanced/browser-live-view) · [Recording](https://docs.anchorbrowser.io/essentials/recording.md)
- Browser Use: [Live preview](https://docs.browser-use.com/cloud/browser/live-preview) · [demo_mode.py](https://github.com/browser-use/browser-use/blob/main/browser_use/browser/demo_mode.py)
- Notte: [Live view](https://docs.notte.cc/features/sessions/live-view) · [Recordings](https://docs.notte.cc/features/sessions/recordings)
- No encontré videos demo oficiales enlazables; las docs traen capturas, no video.
