# OpenAI: Operator → ChatGPT agent → ChatGPT Work (cloud browser) · investigación UX

Fecha: 23-oct-2026. Fuentes crudas en `cu-research/raw/` (sacadas con BrightData; openai.com regresa 403 a WebFetch).

## Estado actual (hay que saberlo antes de copiar)
- **Operator murió** (se integró en agent mode en jul-2025; el sitio ya no abre).
- **ChatGPT agent mode ya no existe**: el help center dice «ChatGPT agent is no longer available. Use ChatGPT Work». El post de lanzamiento lleva el aviso «This launch post is outdated».
- **Atlas está retirado** («has been retired and no longer receives updates»).
- Hoy vive como **ChatGPT Work + cloud browser** (lanzado ~25-ago-2026): el usuario ya no elige el navegador; «ChatGPT chooses when to use it». OpenAI **sacó la computadora del centro**: el progreso se sigue en la conversación y el navegador sólo aparece cuando hace falta (permiso de sitio, sign-in, confirmación, takeover).

## Patrones concretos de UI
1. **Narración en pantalla, no comandos.** «As it performs your task, an on-screen narration provides visibility into exactly what ChatGPT is doing». Cada paso trae un renglón en lenguaje natural con intención, p. ej. «needs to scroll slightly to reach the desired 12:00 p.m. time slot» (captura NN/G). Debajo existe el «thinking» detallado, pero como segundo nivel.
2. **Capturas como evidencia dentro de la respuesta final.** El agente toma captura del dato (horarios del restaurante) y la usa como fuente junto a la tabla final. NN/G: «These screenshots are an effective sourcing technique… for trust building». El problema: si la fuente es una captura, al hacer clic abre la imagen y no el sitio (dice que es «unintuitive»).
3. **Decision gates.** Antes de una acción con consecuencias, el agente pregunta en el chat: «Shall I go ahead and submit [the reservation] now?», con la captura del formulario lleno arriba. Lo de pedir permiso para entrar a un sitio va aparte de lo de confirmar una acción: hoy son dos ajustes distintos («Always ask / Auto approve / Always allow»).
4. **Takeover con privacidad explícita.** El botón es «… → Take over browser». Mientras el usuario tiene el control **no se toman capturas**, y al devolver el control el agente retoma «from the prior workflow state». En Work el takeover es un **link** que se abre en el teléfono o la compu, y el login usa un **secure sign-in form** nativo (las credenciales no pasan por el modelo) con preview de la URL y del formulario.
5. **Watch mode.** En sitios sensibles (correo, banca) el agente exige supervisión activa: si el usuario deja de mirar, se pausa.
6. **Interrumpir y pedir resumen a medio turno.** «you can pause it, ask it for a progress summary, or stop it entirely and receive partial results». Lo que se corrige a medio camino entra sin perder lo avanzado.
7. **El replay como producto.** Al terminar queda un **replay acelerado** del turno que se puede compartir: NN/G publicó el suyo («sped up and does not depict the actual duration»). OpenAI enlaza «View the full task» en sus ejemplos.
8. **Trabajo en segundo plano y notificación.** Los turnos duran entre 5 y 30 minutos. «it will send you a notification when it's done», y en Work sigue trabajando aunque cierres la compu.
9. **La terminal casi no se ve.** La terminal es una herramienta más, al mismo nivel que el navegador visual y el de texto. Cuando el usuario no técnico le pidió una demo, el agente «opened its virtual desktop again and ran the code through its Python shell» y luego **explicó** lo que hizo: lo que se celebra es la explicación, no el log (Cybernews).
10. **Atlas: overlay sobre la página real.** En agent mode la página se cubre con un brillo («weird sparkle overlay», Willison) y aparece una pastilla flotante con «Take control» y «Stop».

*De memoria, sin fuente en esta búsqueda (verificar viendo el video):* en Operator el chat iba a la izquierda y el navegador en vivo a la derecha, con cada acción como un renglón que se expandía para mostrar el razonamiento. En agent mode la computadora era una miniatura en vivo dentro del chat que se expandía a pantalla completa, y al terminar quedaba colapsada como «Worked for N min».

## Videos y capturas
- OpenAI, «Introduction to Operator & Agents» (ene-2025): https://www.youtube.com/watch?v=CSE77wAdDLg. La demo de UI arranca en los primeros minutos (minuto exacto sin verificar).
- OpenAI, «Introduction to ChatGPT agent» (17-jul-2025, ~25 min): https://www.youtube.com/watch?v=1jn_RpbPbEc
- NN/G, «ChatGPT Agent First Impressions»: el replay real de la reserva, unos 5 min acelerados: https://youtu.be/bDks0GVceQY
- Capturas de NN/G: narración sobre la captura https://media.nngroup.com/media/editor/2025/07/30/chatgptagentscrolling.jpg · decision gate https://media.nngroup.com/media/editor/2025/07/30/chatgptagentdecisiongate.jpg · takeover https://media.nngroup.com/media/editor/2025/07/30/chatgptagentusercontrol.jpg · captura como fuente https://media.nngroup.com/media/editor/2025/07/30/chatgptagentdietaryrestrictions.jpg
- Vista en vivo (Cybernews): https://media.cybernews.com/2025/08/live.png
- MacStories, Work cloud browser (ago-2026): https://www.macstories.net/?p=198275 (capturas del login sheet en el iPhone y del takeover con CAPTCHA)
- Artículos: NN/G https://www.nngroup.com/articles/impressions-chatgpt-agent/ · Cybernews https://cybernews.com/ai-tools/chatgpt-agent-review/ · Artificial Corner https://artificialcorner.com/p/my-honest-review-of-chatgpt-agent · Willison sobre Atlas https://simonwillison.net/2025/Oct/21/introducing-chatgpt-atlas/ · Help: https://help.openai.com/en/articles/11752874-chatgpt-agent · https://help.openai.com/en/articles/20001280

## Lo que dice la gente
- «like watching a first-time computer user painstakingly learn to use a mouse for the first time» (Simon Willison sobre Atlas).
- «ChatGPT needed 11 minutes to navigate the restaurant's web forms, whereas it took me about 2 minutes» (NN/G).
- «the web-browser window was seemingly low-resolution. I couldn't find a way to resize it» (NN/G sobre el takeover). Cybernews también dice que el escritorio se ve «fuzzy».
- «After 14 minutes, I took control of the site and did it myself» (Artificial Corner, el agente se trabó en un dropdown).
- «You can even see it pause to think before clicking», lo dice como algo bueno (Artificial Corner).
- «I really appreciated how clearly it explained everything» (Cybernews, que no programa, sobre la demo de código).
- «The agent mainly doesn't provide actual sources, just screenshots» (Cybernews, en «lo que no me gusta»).
- «the UI was frozen or login panels didn't appear» (MacStories sobre el takeover en Work).
- «You can pause mid-run, ask "where are you at?" or redirect it without losing progress» (AI blew my mind).

**Lectura:** ver la computadora engancha al principio y aburre después. OpenAI respondió quitándola del centro (Work), y lo que la gente valora es la explicación, las capturas como prueba y los puntos de decisión, no el stream de acciones.

## 3 ideas para nuestro panel
1. **Narración por paso, con los comandos escondidos.** Cada paso se titula con una frase de intención en lenguaje del usuario («Revisé tu sitio actual para copiar colores», «Instalé lo necesario para la galería»). El comando crudo de la terminal sólo aparece detrás de un «ver detalle». Encima de la barra de pasos va un resumen vivo de 1 a 2 renglones («Voy en 3 de 5: armando la portada»), que también contesta el «¿en qué vas?».
2. **Las capturas como evidencia, no como stream.** Cada paso del navegador fija **una** captura clave con su frase. Al terminar el turno, las capturas útiles suben al mensaje final del chat como fuentes clicables (que abran el sitio y no sólo la imagen, porque eso es lo que NN/G criticó). Así no se pierden aunque se cierre el panel.
3. **Decision gates y takeover dentro del panel, y al final un replay compartible.** Cuando el agente necesita algo (login, confirmar publicar, elegir), el panel se enciende con una tarjeta clara de «Te toca: …» y su botón. «Tomar el control» deja de tomar capturas y lo dice. Al cerrar el turno, el panel se colapsa a «Trabajó 4 min · 12 pasos · ver replay», con un replay acelerado por momentos clave que se puede compartir (ya tenemos `publicStep`/replay público).
