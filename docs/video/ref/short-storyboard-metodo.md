# El storyboard como método (y por qué no bastó)

Notas del 18 de agosto de 2026, produciendo un short vertical sobre el hipervisor propietario de
Docker. Quedó a medias a propósito: el aprendizaje útil está en lo que falló, no en lo que salió.

## De dónde salió

Contar una noticia técnica sin material grabado ya tenía flujo —
[short de una noticia](short-de-una-noticia.md) — pero el guion vivía en el chat. Cada corrección
("ese texto no era", "quita el monito") se perdía entre iteraciones, y la siguiente versión volvía
a traer el error anterior.

Se revisó qué hay en el mercado: Boords, Storyboarder, Storyflow, StoryboardHero, mStudio. Todas
sirven para **presentarle un board a un cliente**, con imágenes generadas. Ninguna alimenta un
render: el paso "board → video" ahí es volver a teclear todo. Por eso una propia.

## La herramienta

`videos/_shared/storyboard/` — sirve un `storyboard.json` en `localhost:4321`:

```sh
node videos/_shared/storyboard/build.mjs videos/<proyecto> --serve
```

Cada viñeta lleva voz, qué se ve, sonido, transición, nota para el agente y un boceto a mano
alzada (SVG con trazo tembloroso, sin librerías). Se edita en su lugar, se dibuja encima con el
mouse, se borra con goma, se reordena, y guarda solo. El **animatic** pasa los bocetos con sus
duraciones reales para oír el ritmo antes de animar nada.

Y `build-composition.mjs` en el proyecto de video genera el `index.html` de HyperFrames **desde el
board**: textos, orden y duraciones salen de ahí, no de la memoria de quien lo arma.

## Las dos trampas que costaron el día

**Nombrar por posición.** Las locuciones se llamaban `beat-06.wav`. Al borrar viñetas en el editor
la numeración se recorrió y cada tarjeta quedó hablando de otra cosa: la imagen decía una cosa y la
voz otra. Van por **id** (`id-79190.wav`), que no se mueve nunca. Lo mismo aplica a las escenas del
generador.

**Verificar el archivo intermedio.** Se escribieron los acuerdos en `ACUERDOS.md` y un
`verificar.mjs` que los comprueba antes de renderizar — buena idea, y atrapó de inmediato dos
fallos silenciosos reales: una cama musical puesta a volumen 0.13, inaudible bajo la voz, y un
logo centrado donde el board pedía "abajo". Un elemento presente en el HTML pero imperceptible en
el video es indistinguible de uno ausente, y ahí sí ayudó.

Pero el verificador lee el **HTML generado**. Dio los siete acuerdos en verde y el video entregado
seguía mostrando viñetas borradas y una sola cama musical. Una regla que aprueba algo falso es peor
que no tener regla: da permiso de entregar.

**La regla que queda:** una comprobación mide el archivo que se entrega. Para audio, eso significa
extraer la pista y medirla por tramos; para imagen, `blackdetect` y el fotograma 0 del mp4. Es la
misma lección de [publicar el video de una entrega](../videos/README.md), otra vez, con otra ropa.

## Lo que sigue pendiente

Reproducir el fallo antes de agregar una sola regla más. Y cuando el usuario dice que algo no se
cumplió, verificarlo antes de contestar: en este short, la música y el sonido de transición sí
estaban cableados, pero a un volumen que no se oía. Defenderse con "sí está puesto" cuando nadie lo
percibe es no haber entendido el reclamo.
