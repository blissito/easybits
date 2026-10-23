# Frente 2: «Manus's Computer» y las superficies de Anthropic

Investigación del 23-oct-2026. Clave: **[F]** = está en una fuente citada; **[O]** = lo observé en el producto o lo recuerdo y no lo pude confirmar en una fuente pública (hay que verificarlo abriendo una sesión compartida de Manus).

## Patrones concretos

1. **El chat cuenta la historia y la computadora es la evidencia.** En Manus el razonamiento va a la izquierda y los archivos y páginas a la derecha [F: malaymail/yicai sobre el lanzamiento]. Cada paso del chat lleva una frase en lenguaje humano y debajo una «pastilla» con icono + verbo: lupa «Searching», globo «Browsing», ojo «Viewing the page», documento «Reading file», lápiz «Creating/Editing file» [F: gist shrisukhani]. Al hacer clic en la pastilla la computadora salta a ese paso [O].
2. **El encabezado del panel dice qué herramienta está usando, no el comando.** Tiene una insignia de estado «Browser / Editor / Search» y un selector de app (VS Code / Browser) [F: gist]. Abajo va un subtítulo corto del tipo «Manus is using Terminal · Executing command …» [O]. Cada herramienta tiene su propia vista: el navegador muestra la página real, el editor el archivo con la diferencia y la terminal la salida.
3. **El timeline es como el de un video en vivo.** Botones de «Jump to beginning» y «Step through», una barra que se arrastra, un **punto verde de en vivo** y **«Jump to live / Return to real-time»** [F: gist]. Si la persona arrastra hacia atrás la vista se queda congelada en ese paso y no la jalan de regreso, hasta que pica «en vivo».
4. **Hay un modo minimizado que no estorba.** Un dock inferior de unos 80 px con una miniatura en vivo de 60×45, un punto de estado, un cronómetro, una etiqueta y un contador de pasos «1/3» [F: gist]. La computadora es opcional: el resultado no depende de que la persona la esté viendo.
5. **El plan visible es el ancla semántica.** Manus primero descompone la tarea y arma una lista de pendientes (to-do), y va palomeando cada paso [F: video de lanzamiento 01:40, gist renschni «todo.md as a live checklist»]. Los estados del paso son: pendiente con círculo gris, activo con círculo azul que pulsa y hecho con palomita verde [F: gist]. El progreso se cuenta en pasos del plan, no en llamadas a herramientas.
6. **Hay dos tipos de mensaje: «notify», que no bloquea, y «ask», que detiene el trabajo.** Antes de una operación sensible el agente le pide a la persona que tome el control [F: gist renschni]. Para un paywall o un CAPTCHA, la persona toma el control desde la misma ventana [F: MIT Tech Review].
7. **Lo que se comparte es la sesión completa.** El link público abre el replay paso a paso: capturas del navegador, logs, puntos de decisión y archivos [F: MIT TR «each session is replayable and shareable»; help.manus.im; joinleland]. Hay tres niveles de acceso: Only me / Team / Public. Un invitado ve los entregables, mira el replay, descarga y comenta, pero no puede darle instrucciones al agente [F: manus.im/team]. El replay compartido arranca solo y ofrece **«Skip to results»** [O].
8. **Lo que no gustó de Manus:**
   - La terminal con comandos crudos: *«could be confusing or intimidating to non-technical users… may create cognitive overload»* [F: Medium/Design Bootcamp].
   - La vista se congela: *«occasionally Manus's Computer froze on a certain page for a long period of time»* [F: MIT TR].
   - Una vez que arranca, es difícil corregirle el rumbo [F: trickle].
9. **Anthropic, Claude in Chrome: el agente trabaja en el navegador de la persona, no en un panel aparte.**
   - El lienzo es la pestaña real: un grupo de pestañas con un borde o resplandor naranja mientras Claude tiene el control [F: travis.media].
   - En el panel lateral clásico, Claude primero propone un **plan con los sitios y pasos**, que la persona aprueba («Approve plan») o rechaza («Make changes»). El panel nuevo de Cowork pregunta en cada acción: permitir en el sitio, permitir una vez o negar [F: promptoptimizer].
   - Hay tres modos: Manual, Auto y Skip [F: support 12902446]. Antes de publicar, comprar o compartir datos siempre pregunta [F: claude.com/blog/claude-for-chrome].
   - Lo que no gustó: es lento por el ciclo de una captura por paso, y cerró y renombró pestañas sin preguntar [F: ernestchiang].
10. **Anthropic, Claude.ai con ejecución de código y Cowork.**
    - Los pasos se agrupan en una línea plegada, tipo «Ran 3 commands, created a file», y cada uno lleva un titular en lenguaje humano. Al desplegar aparece el comando y su salida [O]. Lo técnico existe, pero sólo cuando la persona lo pide.
    - Al picar el nombre de un archivo en el paso, ese archivo se abre en el panel lateral [F: dev.to]. Los nombres de las herramientas *«are implementation details»* [F: dev.to].
    - Cowork tiene a la derecha tres paneles fijos: **Progress** (una lista que Claude va palomeando), **Working folders** y **Context** [F: codefinity]. Los artefactos guardan una versión en cada cambio y se pueden restaurar [F: support 14729249].
    - La demo de referencia de computer use es una ventana de chat con capturas en línea, más el escritorio en vivo por noVNC (puerto 8080, «agent chat + desktop view») [F: anthropic-quickstarts]. Es una vista cruda de desarrollador, no una UX de producto.

## Videos (con minuto)

- **Introducing Manus: The General AI Agent**, https://www.youtube.com/watch?v=K27diMbCsuw
  - 00:38: «each Manus session has its own computer». Descomprime el zip y recorre los currículums página por página.
  - 00:52: trabaja asíncrono y avisa al terminar.
  - 00:59: se le pueden dar instrucciones nuevas a media tarea.
  - **01:40: «first breaks them down and creates a to-do list»**.
  - 01:44–02:10: busca → lee → escribe Python → filtra anuncios → hace el reporte, todo visible en el panel.
  - 02:51: despliega un sitio y entrega un link que se puede compartir.
- **Claude | Computer use for automating operations** (Anthropic, oct-2024), https://www.youtube.com/watch?v=ODaHJzOyVCQ
  - 00:54: «the first thing that's gonna happen» son las capturas de la pantalla.
  - 01:02: cambia de la hoja de cálculo al CRM.
  - 01:19: hace scroll buscando los datos.
  - 01:31–01:47: llena el formulario y lo envía.
  - El valor de la demo está en que se ve el cursor real sobre apps reales.
- **Manus AI – Complete Course for Developers** (freeCodeCamp), https://youtu.be/2-ZqK1GVQ5U. Dura unas 3 h; no encontré la lista de capítulos.
- **Full walkthrough (resumen)**, https://videohighlight.com/v/WM-2LzpmFRU
  - 05:54–06:15: Yelp le pone un CAPTCHA y Manus cambia de fuente.
  - 07:23: visita muchos sitios en paralelo.
  - 08:51: publica con dominio propio.

## Enlaces

- MIT Technology Review, prueba de Manus (mar-2025): https://www.technologyreview.com/2025/03/11/1113133/manus-ai-review/
- Desglose de la UI de Manus (dock, timeline, iconos, compartir): https://gist.github.com/shrisukhani/8be582bd748acf79de9c814bb557d950
- Arquitectura de Manus (todo.md, notify/ask, event stream): https://gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f
- Context engineering de Manus (todo.md como «recitation»): https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
- Compartir en Manus: https://help.manus.im/en/articles/11711198-how-can-i-share-a-task · Equipos e invitados: https://manus.im/team
- Crítica de la terminal cruda: https://medium.com/design-bootcamp/i-asked-an-manus-ai-to-evaluate-itself-heres-what-happened-69c90a148e80
- Reseña de Trickle (cuesta corregirle el rumbo): https://trickle.so/blog/manus-ai-review · Reseña de Cybernews (replay, «Jump to live»): https://cybernews.com/ai-tools/manus-ai-review/
- Claude in Chrome: https://claude.com/blog/claude-for-chrome · Permisos: https://support.claude.com/en/articles/12902446 · Prueba en mano: https://www.ernestchiang.com/en/posts/2025/claude-for-chrome/ · Plan y aprobación: https://promptoptimizer.tools/blog/how-to-use-claude-in-chrome
- Archivos en claude.ai: https://dev.to/h1gbosn/inside-claudes-sandbox-what-happens-when-claudeai-creates-a-file-4gna · Artefactos de Cowork: https://support.claude.com/en/articles/14729249
- Demo de computer use: https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo

## 3 ideas aplicables a EasyBits

1. **Titular humano arriba y comando crudo plegado abajo.**
   - Cada paso del panel abre con una frase del agente («Revisando qué secciones tiene tu sitio») y un icono de verbo: buscar, abrir página, leer, editar, publicar.
   - El comando y su salida quedan detrás de un «ver detalle».
   - El encabezado dice «Usando el navegador · tusitio.com», no `browser_open {...}`.
   - El titular lo puede escribir el modelo, como en Claude.ai, o salir de un mapa tool→verbo, como las pastillas de Manus.
2. **Plan palomeable como eje del timeline, más «En vivo» de verdad.**
   - La barra avanza por los pasos del plan (3/7), no por las llamadas a herramientas.
   - Cada marca es un pendiente con su estado: gris pendiente, pulso activo, palomita hecho.
   - Arrastrar hacia atrás congela la vista. Un botón con punto verde «Volver a en vivo» la regresa; nunca la jalamos solos mientras la persona está viendo el pasado.
   - Un paso sin captura propia hereda la última captura de su mismo pendiente, así la imagen nunca desaparece.
3. **Replay compartible con «Saltar al resultado».**
   - El link público arranca solo, a velocidad 2×, y ofrece un botón «Saltar al resultado» que lleva al sitio publicado.
   - Hay dos niveles de acceso, sólo yo o público. El invitado mira, pero no le puede dar instrucciones al agente.
   - Por defecto la terminal se oculta del replay; la persona la ve sólo si abre el detalle.
   - Encaja con el `publicStep` que ya tenemos (sin comandos ni query). Lo que falta es la capa de titulares y el plan.
