# Frente 4 — Constructores de apps/sitios con IA: cómo muestran el progreso del agente

Investigación web, 23-oct-2026. Fuentes: docs oficiales (Lovable, Replit, Base44, Bolt, v0, Figma), foro de Vercel y reseñas. Aviso: no encontré documentación útil de Same.new ni de Emergent. Las reseñas de terceros son de tono SEO, así que las uso sólo como opinión.

## Patrones (lo que muestran y lo que esconden)

1. **Una tarjeta de actividad en el chat, con el detalle detrás de un clic (Lovable).** Mientras trabaja, el chat muestra «el paso actual, los archivos que se modifican, las herramientas en uso y el avance». Al hacer clic en la tarjeta se abre «Details», que tiene dos pestañas: **Timeline** («cada paso que dio Lovable, incluidas las llamadas a herramientas») y **Changes** (los archivos cambiados). Lo crudo existe, pero no está en el camino principal.
2. **Las pruebas en navegador viven en su propia vista, no en el chat.** Lovable pone las capturas, las URL y «lo que funcionó y lo que no» dentro de Details. Base44 separa **Activity** («cada paso que dio el agente en el navegador, en orden», expandible), **Issues** («Critical» / «Warning») y un veredicto en lenguaje llano: «qué pasó, qué falló y por qué». Desde ahí siguen dos botones: **Fix with AI** y **Test Again**.
3. **Cursor visible más un video que se puede repasar (Replit App Testing).** Mientras prueba, se ve una vista previa dentro del panel del agente y se puede «ver el cursor del agente mientras hace clic en tu app». Al terminar queda un video con una barra para «saltar a secciones específicas de la prueba» y un resumen. Si el agente topa con un login o un CAPTCHA, aparece el botón «Begin take over» o «Skip». Si nadie responde en 10 minutos, el agente sigue solo.
4. **El plan se aprueba antes de construir.** Replit genera una «lista de tareas ordenada» con los botones «Accept tasks» y «Revise plan». Lovable hace algo parecido con su etapa de plan, de la que una reseña dice que «saca a la luz los malentendidos temprano» y le da vocabulario al no programador. Base44 tiene «Discuss Mode», un modo que no cuesta créditos y no toca la app.
5. **Un tablero de estados en lugar de un registro (Replit Agent 4).** El tablero tiene tres columnas: Drafts («planes esperando aprobación»), Active y Ready («listo para revisar»). El cambio entra a la app principal sólo con el botón «Apply changes to the main version». La persona ve en qué etapa está cada pedido, no los comandos.
6. **Puntos de restauración con nombre humano.** Replit crea checkpoints al completar una función, después de probar y antes de arreglar un error. Cada uno lleva una descripción generada por IA, la hora y el tamaño del cambio, y se puede volver a cualquiera desde el mensaje. En Lovable, cada restauración crea una tarjeta nueva en el historial.
7. **Cuánto código se muestra decide para quién es la herramienta.** Según una reseña de no programadores, Lovable «esconde el código», Bolt lo muestra a medias (árbol de archivos y terminal, «útil si quieres transparencia, abrumador si sólo quieres una app») y Replit lo muestra todo («la entrada más compleja… tantos paneles y pestañas que traban el avance»).
8. **La vista previa que espera es el momento más frágil.** v0 transmite «el pensamiento y la exploración de archivos del agente mientras la vista previa espera» y luego pone en el chat sus propias capturas de escritorio y móvil. En Figma Make, los hilos del foro sobre vistas previas en blanco son constantes. La respuesta del moderador es que «Thinking → Building» significa que terminó, y el remedio que da es «Refresh preview» o abrir el código. Bolt manda a la persona a la consola y a `npm run build`, es decir, la saca del flujo.
9. **Las quejas giran en torno a pausas sin explicación y repeticiones, no a la falta de detalle** (hilo de v0 Agent Mode). Citas: «el agente se pausa seguido sin explicación», «revisa lo mismo cinco veces», «se atoraba cada vez y no deja lo que llevaba hecho», «cambios que nunca pedí». También piden confirmar antes de cambiar archivos y tener un botón para revertir o cancelar.

## Enlaces

- Lovable Agent mode (tarjeta de actividad, Details, Timeline/Changes): https://docs.lovable.dev/features/agent-mode
- Lovable Browser testing: https://docs.lovable.dev/features/browser-testing · https://docs.lovable.dev/features/testing
- Lovable Versioning 2.0 (tarjetas de edición): https://lovable.dev/en/blog/versioning-with-lovable-two-point-zero
- Replit App Testing (cursor, video, take over): https://docs.replit.com/references/agent/app-testing
- Replit Agent (plan: Accept tasks / Revise plan): https://docs.replit.com/replitai/agent
- Replit Checkpoints: https://docs.replit.com/core-concepts/agent/checkpoints-and-rollbacks
- Replit Agent 4, tutorial con tablero Drafts/Active/Ready: https://creatoreconomy.so/p/replit-agent-4-is-here-plan-design-build-tutorial
  - **Video:** https://youtu.be/wpKQJnvy8tQ. En el min 00:34 aparece el lienzo de diseño. En el min 03:39 aparecen los agentes en paralelo y el tablero. En el min 05:52 se publica la app.
- Base44 Testing agent (Activity / Issues / Fix with AI): https://docs.base44.com/documentation/managing-app-data/testing-agent.md
- v0, patrón de chat con capturas: https://www.saasui.design/pattern/chat/v0 · opiniones: https://community.vercel.com/t/agent-mode-feedback-thread/18428
- Bolt, vista previa en blanco: https://support.bolt.new/troubleshooting/preview-issues
- Figma Make, vista previa en blanco: https://forum.figma.com/report-a-problem-6/my-figma-make-preview-is-empty-59084
- Reseña para no programadores (Bolt, Lovable, Replit): https://www.aitools-directory.com/blog/bolt-new-vs-lovable-vs-replit-non-coders/

## Citas cortas

- Lovable: «Timeline lists every step Lovable took, including tool calls» — vive *detrás* de la tarjeta.
- Base44: «tells you exactly what passed, what failed, and why».
- Replit: «Watch Agent's cursor as it clicks around your app».
- Reseña sobre Bolt: «useful if you want transparency but overwhelming if you just want an app».
- Hilo de v0: «the agent pauses frequently without explanation».

## 3 ideas aplicables a EasyBits (Sitios)

1. **Separar la vista en dos capas, como hace Lovable.** El chat muestra una sola tarjeta viva por turno, con frase humana, archivos tocados como pastillas y una barra de pasos. La pestaña «Computadora» queda como el «Details»: la terminal con comandos crudos baja a una sub-pestaña «Registro técnico» cerrada por defecto. Lo que se ve primero es lo que ve la persona: capturas del navegador y archivos con nombre amigable.
2. **Convertir cada paso del navegador en una prueba con veredicto, como Base44 y Replit.** Al terminar se muestra «Probé tu sitio: 4 cosas bien, 1 a revisar», con una captura por hallazgo y los botones «Arreglar» y «Probar otra vez». Al cerrar el turno queda un replay que se puede repasar por sección (ya hay capturas por paso; basta una tira de miniaturas en lugar de un video). Si topa con un login, se usa el botón «Tomar el control» que ya existe, con un tiempo límite visible.
3. **Nunca dejar una pausa muda ni la vista previa en blanco.** Si un paso tarda más de unos segundos, la tarjeta dice qué espera, en lenguaje llano («Instalando lo necesario para tu sitio, ~20 s»). La vista previa conserva la última versión buena, atenuada y con la etiqueta «actualizando», en vez de quedarse vacía. Cada turno cierra con un punto de restauración con nombre humano («Agregué la galería de fotos») y un botón para volver. Ésa es la queja número uno en el hilo de v0, y Replit y Lovable la resuelven con checkpoints.
