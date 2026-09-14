# Sacar un short de una entrega

Cómo se hizo el short de la entrega 2, y sobre todo **en qué me equivoqué**, que
es lo que hace falta recordar. La estructura y las reglas de la casa están en
`CLAUDE.md` → *Shorts*; esto es el cómo, con las trampas.

Proyecto de ejemplo: `videos/grok-interfaz-web/short/`.

---

## Lo primero: elegir el fragmento con el transcript delante

Se lee el transcript del video completo y **se le muestra a bliss el texto
literal** de lo que va a salir, con las marcas. Él decide dónde entra y dónde
sale. No al revés: un corte elegido por duración parte frases a la mitad.

Dos cosas al elegir:

- **Que el primer segundo enganche.** "Yo no estoy escribiendo código" funciona;
  "para pedirle modificaciones de un software" no, porque llega sin sujeto.
- **Que el cierre cierre.** Cortar en "…las herramientas adecuadas" cierra; dejar
  el "si te das cuenta, que pueden…" que venía después, no.

Y **comprobar que el fragmento no cruza un corte de la edición**, o se ve el
salto a media frase:

```bash
ffmpeg -v error -i clip.mp4 -vf "select='gt(scene,0.25)',showinfo" -an -f null - 2>&1 | grep pts_time
```

---

## Los subtítulos: el error que costó tres vueltas

**Transcribir EL CLIP, no reusar el transcript del video completo.**

```bash
ffmpeg -y -i clip.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le clip.wav
whisper-cli -m ~/.whisper-models/ggml-small.bin -f clip.wav -l es -ml 32 -sow -of clipsubs -otxt > w.log 2>&1
grep -E '^\[[0-9]{2}:' w.log     # las marcas salen aquí, no en el .txt
```

Con las marcas del propio clip no hay offset que calcular, y por lo tanto no hay
desfase que heredar. Además whisper afina más en 60 s que en 40 min: en el clip
apareció un "Gemini, por ejemplo" que en el transcript largo se había perdido.

### ⚠️ El desfase de verdad

Los subtítulos se queman **sobre el cuerpo, que empieza en 0**. Si se les suma la
duración de la intro "para que cuadren con el video final", salen tarde
exactamente esa cantidad. Pasó tres veces seguidas y cada vez parecía un
problema de las marcas.

> **Los tiempos del `.ass` son relativos al clip. Sin offset. Nunca.**
> El desplazamiento lo produce el concat, no el subtítulo.

Comprobar siempre sacando fotogramas y leyendo lo que dice el texto:

```bash
for t in 3.6 10 25 50 66; do ffmpeg -y -ss $t -i final.mp4 -frames:v 1 f$t.png; done
```

### Correcciones de oído

Las de siempre —"la gente" → "el agente"— más las de esta serie: **"veo 4.6" es
Grok 4.6**. Se corrigen en Node, nunca con `sed`: el de macOS no acepta la
bandera `I` y falla en silencio con estado de salida cero.

### Formato ASS, dos trampas

- El `Format:` declara los campos, y el `Dialogue:` debe traer **exactamente
  esos**. Con uno de menos, la coma sobrante entra al texto y sale un `,` al
  principio de cada línea.
- Con `BorderStyle: 3` (caja de fondo) el color de la caja es **`OutlineColour`**,
  no `BackColour`. Pintar `BackColour` no hace nada: el texto oscuro queda sobre
  negro y no se lee.

---

## El encuadre vertical

**Cara arriba, pantalla abajo, subtítulos EN MEDIO.** Los subtítulos abajo tapan
la parte útil de la pantalla; en el hueco entre los dos no estorban a ninguno.

- **La cara sale de la burbuja del propio montaje**, no del canal de webcam
  crudo. La grabación de Screen Studio tiene cortes internos, así que **no existe
  un desfase único** entre el crudo y el editado: la correlación de audio da un
  número, ese número no cuadra, y se pierde media hora. La burbuja mide ~225×280,
  así que se amplía a 540 de ancho y no más.
- **La pantalla se recorta por ABAJO**, donde están las últimas acciones y el
  campo donde se escribe. Recortada por arriba solo se ve la cabecera y nunca se
  ve lo que se le pidió al agente.
- **El fondo lleva color y movimiento**: la retícula y los blobs de la casa,
  recorridos en diagonal muy lento. Un fondo plano o la tarjeta desenfocada
  apagan la pieza a media reproducción.

---

## Transición y sonido

**No reusar la transición de otra pieza.** La del corte de YouTube ya se vio; el
short lleva la suya. En la entrega 4 salieron cuatro seguidas y ninguna se
repitió: bandas horizontales en cascada, columnas que se engranan, mosaicos que
se rehacen en diagonal y paneles que voltean en 3D. Cada una sale del contenido
de SU clip.

⚠️ **Van muy rápidas a 18 cuadros (0.6 s).** Feedback de bliss el 25 de agosto:
se sienten atropelladas. Usar ~0.9–1.2 s —27 a 36 cuadros— y alargar el riser y
el golpe con ellas, porque el sonido dura lo que dura el movimiento.

⚠️ **El cierre tiene que SOSTENER la cobertura tres cuadros.** Si termina exacto
en el corte se cuela un cuadro de la tarjeta limpia antes de que entre el cuerpo:
parece un error de sincronía y es de montaje.

⚠️ **La forma que cubre el cuadro entero no puede ser un plano oscuro liso.** Con
ocho paneles de `#15121f` tapando todo, `blackdetect` lo marca como fotograma
negro — que está prohibido. Se sube el tono (`#241d33`) y se le mete la retícula
de la casa. Para el vertical, las columnas caen desde arriba con un
retraso por columna, que hace la diagonal.

Se renderiza cuadro por cuadro con el estado en `?t=`, nunca animando en el
tiempo del navegador —eso no es reproducible—, y el reverso se hace
**renumerando los archivos al revés**, porque `reverse` sobre una secuencia de
imágenes devuelve un solo cuadro.

El sonido dura lo que dura el movimiento: **riser mientras cierra, golpe grave en
el impacto**. Se sintetizan (barrido exponencial + ruido para el riser; seno
descendente con envolvente corta para el golpe) y se verifica que **suenen**,
midiendo el pico en esa ventana contra el pico de la voz:

```bash
ffmpeg -y -i final.mp4 -ac 1 -ar 8000 -f f32le mix.raw   # y medir con numpy
```

---

## La música

**Pista nueva cada video** — se compara por hash contra las que ya se usaron en
el proyecto, no de memoria. Se bajan ~30 candidatas con
`scripts/bgm/fetch-bgm.mjs` (Openverse/Jamendo; Mixkit ya se agotó — ver
`scripts/bgm/README.md`, y ojo que ahora hay que dar crédito CC BY), se
miden BPM
(autocorrelación del flujo de onsets), RMS y punch, y se elige con RMS ~0.12 para
que quepa bajo la voz. Para 60 s de voz continua conviene una pista **pausada**:
a 178 BPM la cama cansa aunque esté baja.

Va con `sidechaincompress` usando la voz como llave, y todo normalizado a
−16 LUFS.

⚠️ **`loudnorm` de una pasada no garantiza el pico**: con `TP=-1.5` dejó un short
en −0.2 dBFS. Rematar con `alimiter=limit=0.84:level=disabled` y comprobar con
`ebur128=peak=true`.

**La mezcla que aprobó bliss** (entrega 4): música a `volume=0.20`, voz a `1.33`
antes de mezclar, y el agachado con `threshold=0.03:ratio=12`. Con la música a
0.34 se sentía agresiva.

---

## El montaje

```
intro (3.5 s) → transición → cuerpo → transición → outro (5 s)
```

- **Las tarjetas necesitan pista de audio silenciosa.** Sin ella, el concat
  descarta el audio del cuerpo y el short sale mudo, sin avisar.
- Los tiempos de las transiciones se recalculan si cambia el largo del clip.
- El **fotograma 0 lleva la tarjeta completa** y se verifica en el archivo
  entregado: `start_time` en 0 y `blackdetect` sin resultados.

---

## Los textos

- **El título dice de qué va ESTA entrega.** El arnés es la entrega 1; la 2 es
  que el agente construye su interfaz. Confundirlas es el error más caro porque
  se propaga a la miniatura, al correo y al short.
- El cierre lleva **el nombre de la secuencia** ("Introducción a los agentes de
  IA"), no una etiqueta genérica, y la URL completa: `fixtergeek.com/cursos`.

---

## Checklist

- [ ] Fragmento elegido con el texto literal a la vista, y aprobado
- [ ] Sin cortes de edición dentro del fragmento
- [ ] Transcripción **del clip**, marcas del log, correcciones de oído aplicadas
- [ ] `.ass` **sin offset**, campos completos, caja en `OutlineColour`
- [ ] Cara arriba · subtítulos en medio · pantalla abajo recortada por abajo
- [ ] Fondo con color y movimiento
- [ ] Transición propia, no reciclada · riser y golpe medidos
- [ ] Pista nueva, elegida midiendo, pausada si el clip es largo
- [ ] Tarjetas con audio silencioso antes del concat
- [ ] Título correcto de la entrega · nombre de la secuencia en el cierre
- [ ] Verificado en el archivo final: sincronía por fotogramas, `start_time` 0,
      `blackdetect` limpio
