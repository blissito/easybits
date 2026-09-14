## Shorts (verticales de webinars y cursos)

**Código en inglés, comentarios en español** — como en todo el proyecto. Los identificadores en
español están prohibidos, incluidos los de scripts de video.

**Estructura fija**: intro (4 s) → clip con subtítulos → outro (6 s), 1080×1920, y cama musical de
fondo agachada bajo la voz. Nunca cortes secos ni crossfades: el fundido es la salida fácil y se
siente prestado de cualquier otro video. La transición sale del lenguaje de la pieza — en estos
shorts, la malla del fondo se cierra en cascada diagonal, tapa el corte y se abre del otro lado.
El sonido dura lo que dura el movimiento: riser mientras cierra, golpe grave en el impacto; un
whoosh corto contra un barrido de un segundo se siente adelantado.

**Nunca un fotograma negro ni vacío, en ningún punto del video** — ni de portada ni dentro de una
transición. Si aparece uno es un bug de composición, no una decisión estética; el montaje debe
verificarlo con `blackdetect` y fallar si lo encuentra. Ojo con los overlays: un render sin canal
alfa pinta negro donde debería ser transparente (usar MOV ProRes 4444, no WebM).

**El fotograma 0 en particular nunca va vacío.** Las tarjetas abren completas y lo que se anima es
movimiento sobre lo que ya está, no aparición desde la nada. Ese cuadro es la miniatura. Verificar
siempre en el **archivo entregado** (`ffprobe stream=start_time` debe dar 0 y el frame 0 debe traer
la tarjeta), no en los snapshots del renderizador.

**Subtítulos literales.** Palabra por palabra lo que se dijo, con las marcas del transcript.
Parafrasear distrae: el ojo lee una cosa y el oído escucha otra. Lo único que se corrige son los
errores de oído de whisper ("la gente" → "el agente", "actitud" → "latitud", "Ibal" → "eval").

**El copy dice qué es y qué hacer.** Un título no es un CTA. La intro explica de dónde salió el
fragmento y dónde está lo completo; el outro lleva fecha, tema, verbo ("Regístrate en"), URL y logo.

**Vocabulario técnico correcto en pantalla**, aunque en vivo se diga coloquial: en las tarjetas van
**sandboxes**, no "cajas".

**Nunca fondo negro plano**: patrón animado con la paleta de la casa (morado `#7c3aed`,
ámbar `#fbbf24`, fondo `#0b0b0f`), en bucle que cierre sin salto.

**La música sale de Openverse** (el buscador de Creative Commons, catálogo de Jamendo; API pública
sin key). Mixkit se agotó — sus cinco pistas ya se usaron y repetir está prohibido. Flujo completo,
scripts y reglas en **`scripts/bgm/README.md`**; leerlo antes de elegir cama musical:

```sh
node scripts/bgm/fetch-bgm.mjs "upbeat energetic techno" /tmp/bgm --n 30
node scripts/bgm/medir-bgm.mjs /tmp/bgm
```

**Ahora hay que dar crédito**: lo aprovechable de Jamendo es CC BY, así que el artista y la
licencia van en la descripción del short (`creditos.json` los deja listos). El script filtra solo
pistas **instrumentales** — una canción cantada compite con la narración y el medidor no la
distingue, porque mide energía y no voz. **Pistas nuevas cada
video**, nunca reciclar la del anterior, y el mp3 no va al repo público. Se eligen midiendo, no de
oído: BPM (autocorrelación sobre el flujo de onsets), RMS y punch; se busca movida —BPM alto y
punch alto— con RMS moderado (~0.12) para que quepa debajo de la voz. Luego se normaliza a −20 LUFS
y se mete con `sidechaincompress` para que se agache al hablar. Precedente de documentación en
`videos/hooks-deterministas/assets/BGM.md`.

Herramientas: HyperFrames para las tarjetas (SVG animado a mano, nunca imágenes generadas), ffmpeg
para el montaje. Ver `docs/webinar-sistemas-agenticos/SHORTS.md`.
