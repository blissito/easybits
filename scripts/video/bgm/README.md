# Cama musical — de dónde sale y cómo se elige

Para **todos** los shorts y videos de este repo. Antes todo salía de Mixkit; el
catálogo se agotó (cinco pistas ya usadas: 155, 527, 593, 788, 899) y repetir
está prohibido. Este es el banco nuevo.

## El banco: Openverse

[Openverse](https://openverse.org/) es el buscador de Creative Commons. Su
catálogo de audio es sobre todo **Jamendo**. La API es pública, **sin key y sin
registro**, y filtra por licencia — que es lo que hace legal el uso comercial.

⚠️ **Ojo con la calidad**: lo que Openverse indexa de Jamendo bajo CC BY es un
subconjunto viejo y de aficionado (mucho "Techno Mix" de 2010; cero synthwave,
una sola pista de lofi). Sirve, pero no es un salto de calidad frente a Mixkit
— es un salto de *cantidad*. Si el short necesita algo realmente actual, ver
"Lo que falta" al final.

**Lo que cambia respecto a Mixkit: hay que dar crédito.** En la práctica todo
lo aprovechable de Jamendo es **CC BY** (CC0 no existe ahí). O sea: el nombre
del artista y la licencia van en la descripción del short. Es un renglón de
texto y a cambio se abre un catálogo de ~640 mil pistas que no se acaba.

⚠️ **Descartar covers y remixes de obra comercial.** El lote trae cosas como
"Club House RMX vs. Руки Вверх" o "With Arms Wide Open (Creed Cover)": que el
subidor las marque CC BY no limpia los derechos de la canción original, y en un
short monetizable eso es un reclamo esperando. Si el título trae *cover*,
*remix vs.* o el nombre de un tema conocido, se descarta — el script no puede
juzgarlo, esto se revisa a ojo antes de montar.

El crédito se arma solo con lo que deja `fetch-bgm.mjs` en `creditos.json`:

> Música: "Little Tomcat" de Josh Woodward — CC BY 4.0

## El flujo

```sh
# 1. Bajar candidatas (una palabra por término; se buscan por separado)
node scripts/bgm/fetch-bgm.mjs "techno house electronic" /tmp/bgm --n 30

# 2. Medirlas y quedarse con las de arriba
node scripts/bgm/medir-bgm.mjs /tmp/bgm

# 3. Registrar la elegida — SIEMPRE, es lo que evita repetirla
node scripts/bgm/registrar-bgm.mjs /tmp/bgm/06.mp3 videos/mi-short

# 4. Bajar completa solo la ganadora
node scripts/bgm/fetch-bgm.mjs "techno" /tmp/final --n 1 --full
```

`fetch-bgm.mjs` deja los mp3 numerados más un `creditos.json` (título, autor,
licencia, página de origen), que se guarda **después de cada descarga**: un mp3
sin su crédito es inservible, porque CC BY obliga a nombrar al artista y el
dato no se recupera del archivo. `medir-bgm.mjs` los ordena por puntaje y
muestra el título junto a las métricas.

**Solo se bajan los primeros 2.5 MB** de cada candidata (≈2.5 min): alcanza
para medir y baja 24 pistas en 17 s en vez de dos minutos. Para la ganadora,
`--full`.

**Se filtra instrumental, siempre.** Jamendo etiqueta cada pista como
`instrumental` o `vocal`, y el script descarta las cantadas: una canción con
voz compite con la narración palabra por palabra, y el medidor no la distingue
—mide energía, no voz—, así que la colaría al primer lugar. También se compara
el género declarado, porque Openverse busca sobre el texto y "house" trae
"Burnin Down the House". Con `--estricto` se descartan las que no declaran el
género pedido.

**Se elige midiendo, no de oído.** Cada candidata da BPM (autocorrelación sobre
el flujo de onsets), RMS y *punch* (qué tan marcado es el golpe). Se busca
**movida** —BPM alto y punch alto— con RMS moderado (~0.12) para que quepa
debajo de la voz. Un RMS de 0.35 suena bien solo y tapa la narración.

Después, como siempre: normalizar a **−20 LUFS** y meterla con
`sidechaincompress` para que se agache al hablar.

## Reglas que no cambian

- **Pista nueva cada video**, y no de memoria: `usadas.json` lleva el registro
  y `fetch-bgm.mjs` descarta solo lo ya usado. Registrar con `registrar-bgm.mjs`
  al elegir — Mixkit se agotó justamente porque esto se llevaba de cabeza.
- **No va al repo público.** El mp3 se queda en `assets/` del proyecto del
  video, igual que antes.
- Documentar la elección en el `BGM.md` del proyecto, con la tabla de siempre
  (archivo, fuente, largo, BPM, volumen) **más la línea de crédito**.

## Notas de la API

- `?q=` hace AND estricto: `"upbeat electronic"` da cero resultados. Por eso el
  script busca palabra por palabra y junta.
- El acceso anónimo tope a ~240 resultados por término. Suficiente para 30
  candidatas; si hace falta más variedad, más términos.
- `--source` acepta también `freesound` y `wikimedia_audio`, pero ahí hay
  sobre todo loops y grabaciones sueltas, no piezas. Jamendo es el default.

## Lo que falta

Openverse resuelve la urgencia —hay pistas nuevas y son legales— pero no la
ambición de sonar actual. Dos caminos, ninguno probado todavía:

1. **Jamendo API oficial** (`client_id` gratis, registro de dos minutos).
   Openverse indexa un subconjunto; la API directa da el catálogo completo,
   ordenado por popularidad, con filtros nativos de género, `speed` y
   `vocalinstrumental`. Es el mismo pipeline con otro `fetch`.
2. **Generar la cama** con un modelo (Eleven Music por API, o Stable Audio Open
   auto-hospedado): largo exacto, mood pedido, sin recortar y sin crédito que
   dar. Medir, normalizar y sidechain se aplican igual.

Si se prueba alguno, anotar aquí el resultado.
