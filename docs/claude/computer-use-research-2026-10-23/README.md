# La computadora del agente: qué experiencia ama la gente (23-oct-2026)

Siete investigaciones en paralelo para rediseñar el panel «Computadora» de Sitios
(`app/components/sitios/AgentComputer.tsx`). Cada archivo trae patrones, enlaces a videos y
capturas, citas y 3 ideas:

1. [OpenAI: Operator, agent mode, Atlas y ChatGPT Work](1-operator.md)
2. [Manus's Computer y Anthropic (Claude in Chrome, computer use)](2-manus-claude.md)
3. [Devin, Cursor, Codex, Copilot, Jules](3-devin-coding.md)
4. [Constructores de sitios: Lovable, Bolt, v0, Replit, Base44](4-site-builders.md)
5. [Código open source: Suna, bytebot, Surf, quickstarts de Anthropic](5-oss-code.md)
6. [Vista en vivo y replay: Browserbase, Steel, Kernel, Anchor](6-live-view-infra.md)
7. [Comunidad: qué se ama y qué se odia](7-community.md)

Las fuentes crudas (páginas, subtítulos, código ajeno) se quedaron fuera del repo.

## Conclusión

- **La más amada es Manus**, con Devin en segundo lugar. La gente valora poder ver al agente en vivo, tomar el control cuando quiere y compartir el replay por liga.
- **OpenAI ya sacó la computadora del centro.** El avance se sigue en el chat y el navegador sólo aparece para el login, una confirmación o tomar el control.
- **Lo que se odia:**
  - La terminal cruda («cognitive overload»).
  - Las pausas mudas.
  - El panel congelado.
  - Las capturas que se pierden.
  - Lo contrario también: la caja negra.

## Qué copiar, en orden

1. **Plan primero.** Una lista corta de tareas que se va palomeando. Cada paso es una frase de persona con icono y verbo (busca, abre, edita, prueba). El comando queda detrás de «ver detalle».
2. **Una vista por herramienta, con su resultado.** Es un registro estilo Suna (portable sólo hasta el commit `7ed29a4`, Apache; después cambia a KPSL y Elastic).
   - El navegador lleva un cursor fantasma que vuela al clic. Ningún proveedor lo trae.
   - La búsqueda se muestra como lista de resultados y la edición como antes y después.
   - La terminal va sólo en «Registro técnico».
   - Hoy `AgentStep` no guarda el resultado; ese es el hueco.
3. **Línea de tiempo amarrada al chat.** Picar un paso mueve el panel y el chat. «En vivo» va encendido por default. Ir atrás no regresa solo al último paso. Un paso sin captura usa la última (ya está desde `99c46cd2`).
4. **Cierre.** «Trabajó 3 min · 9 pasos», de 3 a 6 capturas como prueba y el replay para compartir. Si el agente probó la app en el navegador, cierra con un veredicto y los botones «Arreglar» y «Probar otra vez».

## Vivo hoy (23-oct)

- Las pestañas «Vista previa | Computadora» se abren solas al primer paso del navegador (`1755428f`).
- El chat se puede redimensionar (`0134158a`).
- Para conocer un sitio o una marca, Sitios usa su navegador y no WebFetch (`c0e1b56b`).
