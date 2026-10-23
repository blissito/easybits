# 3 · Agentes de código con workspace visible (Devin, Cursor, Codex, Copilot, Jules, Antigravity)

Investigación 23-oct-2026. Sólo web; no se tocó código.

## Patrones (lo que hacen bien)

1. **El paso es la unidad, la herramienta es secundaria (Devin).** La sesión es una lista de "progress steps" en el chat; cada paso es clicable y abre la herramienta (Shell/IDE/Browser) en el estado de ese momento. Devin "Progress tab" unifica comandos, ediciones y navegador en una sola vista. El usuario lee *pasos*, no terminal.
2. **Timeline sincronizado con el chat (Devin).** Barra inferior + Anterior/Siguiente; al arrastrar, el chat se desplaza al mensaje que provocó esa actividad. Un analista: "a very good addition to the UX patterns of AI assistants". Indicador (logo de Devin) junto a la pestaña que se usa ahora.
3. **«Following» como modo, con fricción.** Con el switch encendido el workspace salta solo entre pestañas. Crítica: venía apagado, la etiqueta no se entendía; pidió ON por default y mejor tooltip.
4. **Plan antes de actuar, editable (Devin 2.0 Interactive Planning, Jules, Antigravity, Cursor Plan Mode).** En segundos: archivos relevantes + hallazgos + plan preliminar que el usuario ajusta. El plan/checklist es lo que da sentido semántico a los pasos; los pasos cuelgan de un ítem del plan.
5. **Colapsar lo ruidoso con un HUD de "qué hace ahora" (Copilot, mar-2026).** La actividad de subagentes va colapsada por default con un "heads-up display" de la tarea actual; se expande si quieres el detalle. El setup (clonar repo, firewall) se muestra como fase con inicio/fin, no como log.
6. **Evidencia, no transmisión (Codex, Jules, Cursor cloud, Antigravity).** El valor no es ver el navegador en vivo, es la *prueba*: Codex muestra screenshots de su trabajo y cita logs de terminal/archivos para verificar; Jules (ago-2025) renderiza el front y regresa la captura junto con el cambio; Cursor cloud agents (24-feb-2026) adjuntan video demo + screenshots + logs al PR; Antigravity resume todo en "Walkthrough" con capturas y grabaciones.
7. **Artefactos con nombre en vez de logs (Antigravity).** Task List, Implementation Plan, Code Diffs, Walkthrough; se comentan inline estilo Google Docs. El usuario conversa sobre artefactos, no sobre comandos.
8. **Review dedicado al final (Cursor 2.0, Codex, Jules).** Vista de cambios para escanear y aceptar parcial o total; undo por agente. Codex: "review the proposed changes in the diff view".
9. **Tomar el control** (Devin Interactive Browser, Cursor remote desktop): el usuario entra a la máquina sólo cuando lo necesita; no es la vista por default.

## Lo que critican usuarios
- Devin: el navegador mostraba la *descripción* de la página que hizo Devin, no la página; diffs difíciles en área chica; Editor de sólo lectura; empezaba antes de la aprobación pedida (ppaolo).
- Cursor: capturas que desaparecen tras updates, screenshots que llenan el contexto, artefactos que no llegan al PR, videos rotos (foro). Lección: la captura tiene que ser un artefacto persistente con su propio almacenamiento, no un efecto secundario de la tool.

## Citas cortas
- Copilot: subagentes "collapsed by default, with a heads-up display showing what it's working on right now".
- Devin docs: "Follow Devin's work real-time and take over."
- Devin 2.0: "responds in seconds with relevant files, findings, and a preliminary plan".
- Codex system card: "verifiable evidence of its actions through citations of terminal logs and files".
- Jules changelog: "Jules can test web-apps and show you the results".

## Enlaces
- Devin docs intro: https://docs.devin.ai/get-started/devin-intro.md
- Devin Interactive Planning: https://docs.devin.ai/work-with-devin/interactive-planning
- Devin 2.0: https://cognition.ai/blog/devin-2
- Análisis UX de Devin (Following, timeline, críticas): https://ppaolo.substack.com/p/in-depth-product-analysis-devin-cognition-labs
- Guía de sesión Devin: https://fast.io/resources/devin-session-tools-guide/
- Copilot track sessions: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions
- Copilot changelog mar-2026: https://github.blog/changelog/2026-03-19-more-visibility-into-copilot-coding-agent-sessions/
- Cursor cloud agents + computer use: https://cursor.com/changelog/02-24-26 · https://cursor.com/docs/cloud-agent/capabilities · https://forum.cursor.com/t/cloud-agents-with-computer-use/152829
- Cursor quejas: https://forum.cursor.com/t/browser-screenshot-tool-now-missing/145855 · https://forum.cursor.com/t/cursor-cloud-agents-do-not-post-their-screenshots-or-videos-to-pr/152974 · https://forum.cursor.com/t/context-window-is-full-after-screenshot-with-browsing-tool/142774
- Codex upgrades (screenshots del trabajo): https://openai.com/index/introducing-upgrades-to-codex/ · system card: https://openai.com/index/o3-o4-mini-codex-system-card-addendum
- Jules verificación visual: https://jules.google/docs/changelog/2025-08-07
- Antigravity artefactos: https://blog.openreplay.com/google-antigravity-ide-guide/
- Video: demo original "Introducing Devin" (mar-2024) https://www.youtube.com/watch?v=fjHtjT7GO1c — muestra el workspace de 4 pestañas; **no verifiqué minutos**, falta revisarlo a mano.

## 3 ideas aplicables a EasyBits Sitios
1. **Pasos con frase humana colgados de un mini-plan.** Al iniciar el turno el agente emite 3-5 ítems ("Conocer tu marca", "Armar la portada", "Revisar en celular"). Cada paso técnico (comando, browser_open, write) se agrupa bajo su ítem con una frase de una línea; el comando crudo queda colapsado detrás de "ver detalle". La barra de pasos recorre ítems, no tool calls.
2. **La captura es evidencia persistente, no streaming.** Cada paso de navegador guarda su captura como archivo propio (Files/CDN) y al cierre del turno se arma un "Recorrido" (Antigravity Walkthrough / Cursor demo): 3-6 capturas clave con su frase, antes/después de la vista previa. Nunca un paso sin imagen; si no hay, se usa la última con etiqueta.
3. **Timeline atado al chat + HUD de "ahora".** Arrastrar la barra desplaza el chat al mensaje que causó el paso (Devin); mientras trabaja, una sola línea arriba dice qué hace ahora y el resto va colapsado (Copilot). «Seguir al agente» encendido por default; el usuario que cambia de pestaña lo apaga (ya alineado con el commit 1755428f).
