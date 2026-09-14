# Short de una noticia — el híbrido Blender + HyperFrames

Cómo se hizo el short del **arnés de DeepSeek** (17 ago 2026, 75 s, 1080×1920),
y qué reutilizar la próxima vez que haya que contar una noticia técnica sin
material grabado. Proyecto: `videos/deepseek-harness/`.

Es el hermano del [short de una entrega](short-de-una-entrega.md), pero al revés:
allá se parte de una grabación y se recorta; aquí **no hay imagen de origen**.
Todo lo que se ve lo dibujamos nosotros, así que lo único que hay que decidir de
verdad es qué se dibuja.

---

## 1. Primero los hechos, con fuente

Una noticia se cuenta con cifras o no se cuenta. Antes de tocar nada, una tabla
de dato → fuente, y **todo número en pantalla sale de ahí**. En el README del
proyecto queda la tabla completa; para este short fueron siete filas: estrellas
en 28 horas, plugins en dos días, integraciones compatibles contra rotas, tokens
de entrada sin caché.

Las cifras del *pero* valen más que las del entusiasmo. Un short que solo aplaude
se lee como anuncio; el que además mide lo que falla se lee como criterio, y es
el que la gente manda a un amigo.

## 2. La voz, antes que cualquier imagen

**Las duraciones de la voz fijan todos los beats.** Escribir tiempos primero y
grabar después garantiza retimear el video entero.

Y se genera **frase por frase**, con silencios concatenados de 0.2 a 0.45 s.
Kokoro leído de un tirón sale de corrido: las comas apenas respiran y una línea
de quince segundos se siente como un párrafo dicho sin aire. Nunca más de 0.45 —
pausas largas suenan a lectura escolar.

```bash
export HYPERFRAMES_PYTHON=~/.venvs/kokoro/bin/python
python3 gen-voz.py     # imprime en qué segundo cae cada frase
```

Ese listado de marcas es el que se copia a los timelines de las escenas. Cada vez
que cambia una frase, hay que releerlo.

Los anglicismos van escritos fonéticamente **solo en el texto que lee el motor**:
"plóguins", "tuls", "tóquens", "sándboks", "préviu", "fixterguic". En pantalla se
quedan en su grafía original. Ojo con las que suenan casi bien: "prívius" por
*preview* pasó el primer corte y hubo que rehacerla.

## 3. Qué va en 3D y qué va plano

**Plano (HyperFrames) por defecto.** Cifras, tipografía y tarjetas se leen mejor
en 2D y renderizan en minutos.

**Blender solo cuando el argumento es volumen.** En este short la tesis era "todo
es plugin": capas que se sacan y se meten. En 2D eso queda como diagrama; en 3D
la pieza de verdad *sale* de la torre. Una escena de diez segundos lo justificó;
las otras cuatro no.

La escena 3D sale con alfa a **MOV ProRes 4444** —nunca WebM, que pinta negro
donde debería ser transparente— y se compone encima del fondo de la casa.

## 4. Ninguna escena de puro texto

Cada tarjeta lleva **ilustración SVG animada**, dibujada a mano, objeto concreto
y en bucle permanente. En este short: un frasco que se llena de estrellas, una
matricial escupiendo papel continuo, un medidor cuya aguja se clava en el tope, y
el *sandbox* dibujado literal como un arenero con la terminal del agente dentro.

Y los tramos donde la ilustración todavía no entra **también son frames muertos**.
Se les da movimiento propio: la caja "clavada" vibra sin moverse de su sitio, los
plugins flotan cada uno a su ritmo, el papel sigue saliendo a tirones.

## 5. La cama musical

Openverse, midiendo, nunca de oído. El flujo está en `scripts/bgm/`.

```bash
node scripts/bgm/fetch-bgm.mjs "techno driving electro beat" /tmp/bgm --n 30
node scripts/bgm/medir-bgm.mjs /tmp/bgm
```

**El puntaje mide dinámica, no género.** La primera búsqueda fue "upbeat energetic
electronic" y devolvió puro folk acústico que puntea altísimo —RMS 0.102, punch
50— y en el video suena a sala de espera. Hay que **forzar el género en los
términos** y solo entonces ordenar por puntaje. Si el lote entero sale del mismo
artista, la búsqueda está mal, no las métricas.

La cama no va en la línea de tiempo: el render sale solo con voz y `mezclar.sh`
mete la música con `sidechaincompress` contra la propia voz. Y **deja un solo mp4
en `renders/`** — el intermedio se borra, porque dos archivos casi idénticos solo
sirven para abrir el equivocado.

Jamendo es CC BY: el crédito va en la descripción del short.

---

## Las trampas, en orden de lo que costaron

**`transformOrigin` en px miente dentro de un SVG.** GSAP lo mide contra el bbox
del elemento, no contra el viewBox, así que la aguja del medidor pivotaba fuera
del dibujo. Va `svgOrigin: "230 220"`. El mismo bug estaba en otras tres
ilustraciones sin que se notara.

**Una aguja va ancha en el pivote y afilada en la punta.** Al revés se lee como
error aunque el movimiento sea correcto.

**En Blender, la escala en el OBJETO obliga a cada hijo a deshacerla** con una
escala inversa no uniforme — y ahí es donde las etiquetas se descentran. Aplicar
la escala a la malla (`transform_apply`) y dejar el objeto en 1,1,1.

**`solo_entre` no puede esconder en el cuadro 1** lo que ya vive desde el
arranque, o el primer cuadro sale vacío. Y el cuadro 0 es la miniatura.

**`cam.data.angle` aplica a la dimensión mayor**, que en vertical es la altura:
sin `sensor_fit = 'HORIZONTAL'` el encuadre se rompe sin avisar.

**Cámara de frente = losas como rayas.** Sin el tres cuartos el 3D no se lee y la
escena deja de justificar Blender.

**Mirar el render, no el preview.** Varias correcciones fueron cosas visibles en
un solo cuadro que no se volvieron a revisar después de cambiar el encuadre. El
preview al 40% sirve para iterar, no para aprobar.

## Verificación antes de entregar

```bash
npm run check
ffmpeg -v info -i renders/*.mp4 -vf blackdetect=d=0.05:pix_th=0.10 -an -f null -
ffprobe -v error -show_entries stream=start_time -of csv=p=0 renders/*.mp4
```

Nunca un fotograma negro, `start_time` en 0, y el cuadro 0 con la tarjeta puesta
—verificado **en el archivo entregado**, no en los snapshots del renderizador.
