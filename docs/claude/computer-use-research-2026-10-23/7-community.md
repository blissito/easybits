# 7 · Qué dice la gente: la experiencia de «ver al agente trabajar»

Fuentes: HN, reseñas hands-on (MIT Tech Review, NN/g, Simon Willison), blogs de diseño (Smashing) y un estudio de Apple/CMU (IUI '26).
Límite: reddit.com y x.com bloquean el crawler; las opiniones de Reddit sólo llegan citadas por terceros (eesel, The Register).

## Ranking (lo más amado arriba)

1. **Manus: la ventana «Manus's Computer» más el replay que se comparte.** Es la referencia del género. Se ve al agente navegar en vivo, se puede tomar el control en cualquier punto, y cada sesión queda como replay con link. Ese replay se volvió el material de marketing: en HN la gente juzgaba Manus viendo replays de otros (incluso existe una galería de terceros, manusreplay.net). Lo que se odia: se congela, se cae y es lento.
2. **Devin: modo «Following» más timelapse.** El workspace salta solo entre shell, editor, navegador y planner al ritmo del agente. La barra de timelapse se desliza y **el chat se desplaza al mensaje que originó cada paso**. Se le puede escribir sin esperar turno («won't interrupt Devin»). Se critica la etiqueta confusa del switch, el diff en un panel diminuto y que el agente *describía* el navegador sin mostrarlo.
3. **Comet (Perplexity).** Cuando el agente controla, la página lleva un borde visible y cada paso queda listado. Una reseña lo describe como «visible, interrumpible y sorprendentemente humano de ver». Se odia que se cicle, que se equivoque con seguridad y que sea lento.
4. **Claude for Chrome / Claude in Chrome.** Funciona en tu navegador real con permisos por acción. Simon Willison: «lo vigilé como halcón», y fue su primer éxito real con un agente de navegador. Se odia la lentitud (ciclo captura→pensar→actuar), que la conexión «se rompe mucho» y los permisos repetidos (2.8★ en la Chrome Web Store).
5. **Operator / ChatGPT agent.** El panel de navegador remoto con «takeover» se entiende bien, pero es el más criticado por lento. NN/g midió 11 min contra 2 de un humano, y encontró la ventana de takeover en baja resolución y el video de la demo acelerado.
6. **Fellou («shadow workspace»).** El agente trabaja en una ventana de fondo que puedes observar o intervenir sin perder tu pantalla. La idea gusta; la ejecución se traba en layouts complejos.
7. **Genspark.** Se elogia la velocidad para entregar el resultado, no la transparencia. La queja en r/genspark_ai es el consumo de créditos.
8. **Replit Agent / Lovable.** El valor visible es la **vista previa del producto** creciendo, no la computadora. Las quejas son de costo y checkpoints (Agent 3), no de la UX de observación. Lovable apuesta por el «Plan mode»: plan visible y editable antes de construir.

**Conclusión:** la experiencia más amada es la de Manus (ventana en vivo, takeover y replay compartible), y la mejor ejecutada para revisar es la de Devin (timelapse enlazado al chat).

## Lo que se odia

- **Lentitud a la vista.** Ver la lentitud la vuelve peor: «como ver a alguien que usa un mouse por primera vez» (Willison sobre ChatGPT agent).
- **Ruido técnico sin propósito:** contadores de archivos y tokens intermedios. «What am I supposed to do with this information?» (HN).
- **El extremo contrario, la caja negra.** Cuando Claude Code escondió las rutas de los archivos, la reacción fue fuerte: «turned the output into a black box».
- **Tener que vigilar todo el tiempo.** Nadie quiere «mirar fijamente», pero la seguridad depende de que lo hagas.
- **Interrumpir es difícil o tosco:** un botón de stop no alcanza si no estás mirando, y no hay forma de corregir sin reiniciar.
- **Spinners y esperas mudas:** no sabes si el agente está atorado o caído.
- **Congelado en una página sin aviso**, ciclos, y errores dichos con seguridad.
- **Takeover en baja resolución**; demos aceleradas que no reflejan la espera real.

## Citas (cortas, con URL)

- «allows users not only to observe what the agent is doing but also to intervene at any point» (MIT TR sobre Manus). https://www.technologyreview.com/2025/03/11/1113133/manus-ai-review/
- «Manus's working process feels relatively transparent and collaborative» / «each session is replayable and shareable» (ídem)
- «occasionally Manus's Computer froze on a certain page for a long period of time» (ídem)
- «have watched it's use case» + link `?replay=1`: así se evaluaba Manus en HN. https://news.ycombinator.com/item?id=43277827
- «it's actually fun and useful to see what Devin is working on» / «the chat is automatically scrolled to the messages exchanged before triggering the activities». https://ppaolo.substack.com/p/in-depth-product-analysis-devin-cognition-labs
- «The user doesn't have to wait to send the next message or click buttons to interrupt Devin» (ídem)
- «ChatGPT needed 11 minutes to navigate the restaurant's web forms» / «the web-browser window was seemingly low-resolution» (NN/g). https://www.nngroup.com/articles/impressions-chatgpt-agent/
- «like watching a first-time computer user painstakingly learn to use a mouse» (Willison). https://simonwillison.net/2025/Oct/21/introducing-chatgpt-atlas/
- «the main defense is expecting the user to carefully watch what agent mode is doing at all times!» (ídem)
- «I watched what it was doing here like a hawk» (Willison, Claude in Chrome). https://simonwillison.net/2025/Dec/22/claude-chrome-cloudflare/
- Comet: «the entire process is visible, interruptible, and surprisingly human-like to watch». https://www.eesel.ai/blog/perplexity-comet-reviews
- «I want Claude to tell me what it's reading in the first 3 seconds» (btown, HN) / «All we want is the file paths» (adastra22) / «turned the output into a black box» (jarjoura) / «If you're not imparting any useful information, claude may as well just show a spinner» (noodletheworld). https://news.ycombinator.com/item?id=46978710
- «This is helpful as I can interrupt the process and guide it» (trb, ídem)
- Estudio Apple/CMU, IUI '26 (Wizard-of-Oz, 20 personas). https://arxiv.org/html/2602.07283v1
  - «being able to watch it would tell me a lot about like how it has done» (P2), pero en uso real casi nadie miraría todo: «would not [be] saving a whole lot of time» (P3).
  - Detalle por capas: «progressive disclosure» (P15); «an option of don't report your intermediate status, just complete it» (P20).
  - «stopped it and say, hey, just ignore [it]… Move on» (P18): la interrupción es para **redirigir**, no para abortar.
  - «definitely not enough if we assume that the user is not staring at this» (P17, sobre el botón de stop).
  - Para el traspaso de control: «significant UI moments where your screen is kind of dimmed» (P3).
  - «I don't want you to do anything that's irreversible» (P2).
- «They watch a looping animation and can't tell if the system is stalled or crashed» / «the mere presence of the receipt tells the user that the system stands behind its work» (Smashing). https://smashingmagazine.com/2026/05/practical-interface-patterns-ai-transparency/
- Fellou: el usuario puede «observe or intervene with an Agent's actions in real-time, without taking direct control». https://fellou.ai/blog/fellou-first-launch/

## 3 principios para «la computadora del agente» de EasyBits

1. **Primero lo que hace, en una frase de persona; lo técnico se abre a pedido.** Por default: una línea viva («Abriendo tu sitio para revisar el menú») más la captura grande. La terminal y los logs quedan detrás de un clic (divulgación progresiva). Lo que se muestre por default debe servir para corregir pronto: qué página abrió, qué archivo toca. Nada de contadores. Ni caja negra ni muro de logs.
2. **Interrumpir es conversar, no abortar.** La persona escribe mientras el agente trabaja (estilo Devin), y el mensaje entra como corrección sin reiniciar el turno. El traspaso de control se marca con un cambio visual fuerte (oscurecer, borde de color tipo Comet). Antes de algo irreversible, como publicar o borrar, el agente pide permiso. Avisar cuando se atora o se congela, no dejar la última captura muda.
3. **El replay es el recibo y el anuncio.** Hay que poder recorrer los pasos con una línea de tiempo enlazada al chat: al tocar un paso se ve el mensaje que lo originó. Al final va un resumen de «qué cambió» y un link público para compartir (es lo que hizo viral a Manus). Esto compensa la lentitud: nadie tiene que mirar en vivo, puede revisar después en 20 segundos.
