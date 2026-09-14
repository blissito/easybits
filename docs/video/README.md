# Videos de EasyBits — lineamientos

Traídos de `~/fixter2025` (2026-09-14) y ajustados a la marca. Los originales viven en `ref/`
(léelos solo si algo aquí no alcanza). Producción con HyperFrames; scripts de música/SFX en
`scripts/video/bgm` y `scripts/video/sfx` (copias de fixter2025, con `usadas.json` propio).

## Qué se vende y a quién (decisión 2026-09-14)

**Se promociona la flota, no el S3.** Archivos es un commodity (Tigris, R2, Backblaze cobran
centavos y no hay historia que contar). La flota sí tiene una historia real y con cliente pagando:
**Normi** (bitácora para gasolineras, $1,490–7,900/mes) le puso un asistente a cada estación en
web y WhatsApp sin operar un solo servidor de IA: un FleetAgent por estación, el MCP de Normi como
tools, EasyBits pone la caja, el modelo, la memoria y el canal.

La audiencia NO es la gasolinera: es **el integrador / dev que construye un SaaS vertical para PyMEs**
y quiere "asistente con mis datos, en WhatsApp y en mi app" sin armar la infraestructura. Es la
misma audiencia de FixterGeek (ver memoria "plataforma para ayudar a INTEGRADORES a vender").
El short muestra Normi como prueba, pero el CTA es a easybits.cloud.

Serie propuesta (un golpe por short):
1. **"Tu SaaS ya tiene asistente"** — el caso Normi: pregunta en WhatsApp → respuesta con dato de
   la consola. Cómo se cablea (MCP + FleetAgent) en una pantalla.
2. **"Él prepara, tú firmas"** — tools que preparan sin registrar: el patrón de borrador con link.
   Vende la idea de agente seguro para operaciones reguladas.
3. **"Una caja por cliente"** — aislamiento por tenant (microVM, token por estación, duerme cuando
   no habla). Argumento de costo: paga por conversación, no por servidor.
4. **"Sin operar nada"** — lo que NO hiciste: modelo, memoria, canal, cola, respaldos.

## Forma (resumen de `ref/estilo-short-motion-graphics.md`)

- 1080×1920, 30–45 s. **4–5 escenas, un golpe por escena.** Dos paneles por escena (A plantea,
  B demuestra) con deslizamiento duro 0.42 s `power4.inOut`, sin fundidos. Centrado vertical,
  padding 200px. Panel en espera: `opacity:0; translateX(100%)` en CSS.
- Titulares **Archivo Black** 90–120px, `line-height:.92`, `letter-spacing:-.03em`, una palabra en
  `<em>` de acento. Números 260–520px: **el número es la diapositiva** (en pesos o porcentaje).
  Resto **JetBrains Mono**, kickers mayúsculas `0.22em`.
- Bordes 5px sólidos + `box-shadow 14px 14px 0` del acento al 33%. Sin redondeados ni gradientes en
  bloques.
- Fondo nunca negro plano: retícula 60px que recorre una celda exacta, dos blobs `blur(120px)`
  respirando desfasados, viñeta radial. `repeat` finito y suficiente (`reps = total/4 + 1`).
- Transición: 6 columnas con retícula caen con stagger 35 ms (0.3 s cerrar / 0.32 s abrir).
- **Cuadro 0 completo** (asentamiento `from{y:26}`, reposo en CSS, nunca en `gsap.set`). Nada
  espera a la voz: entra con el panel y **pulsa** (scale 1.05–1.22, 0.18 s, yoyo) en la palabra
  exacta, medida con `hyperframes transcribe -m large-v3 -l es`. Cortes 0.4–0.6 s antes de la
  palabra bisagra. Nunca un fotograma negro (`signalstats` YMAX<150).
- Marco positivo, sin metáforas. Prohibidos: "no es X, es Y", anáfora de negación ("Sin X. Sin Y."),
  "y aquí viene lo bueno", remates "eso es X". Español mexicano, sin voseo. CTA con verbo + URL.

## Look (referencia aprobada 2026-09-14: cartel "Builders & Brews" de Nebius × Tavily)

Fondo **claro**, no oscuro: papel `#F3F0F5` con grano/halftone. Lima ácido `#D9FF3D` como color de
bloque (bandas giradas −6°, etiquetas, ráfagas de "impacto" con borde negro), negro `#111111` para
texto y contornos gruesos, morado `#9870ED` solo como tercer acento (logo, un dato). Titulares
**Archivo Black** en mayúsculas, apretadas, dentro de una banda lima inclinada; sub-etiqueta en
caja negra con texto lima ("HACK EDITION" → "CASO NORMI"). Ilustración: **una mascota o pieza de
hardware con halftone en B/N** (ojitos EasyBits como robot de hojalata, una microVM como cajita
metálica, una pipa/gasolinera para el caso Normi) que rompe la banda por delante; texturas de
grunge/punto, sin gradientes suaves. Listas largas en columna mono pequeña como ornamento (ciudades
→ nombres de tools: `vigencias · tanques · recepciones · …`). Puede llevar grano de impresión y
registro desplazado (offset) en los planos.

Cambios respecto al molde oscuro de fixter: mismo ritmo, mismos paneles y cortes, pero el fondo es
papel claro con retícula gris tenue; la transición son bandas lima giradas que barren en cascada;
los pulsos van con una ráfaga de impacto negra/lima detrás del elemento.

| | |
|---|---|
| Papel | `#F3F0F5` (+ grano) |
| Lima (bandas, bloques, CTA) | `#D9FF3D` |
| Negro (texto, bordes 5px, cajas de etiqueta) | `#111111` |
| Morado (logo, tercer acento) | `#9870ED` |
| Apagado | `#8391A1` |
| Malo (solo si hace falta) | `#AA4958` |
| WhatsApp (solo cuando aparece el canal) | `#25D366` |

Logo: ojitos `/logo-purple.svg` (variante negra para este look) + wordmark "EasyBits" en Jersey 10.
Ortografía: **Easybits** en prosa; el wordmark es el logo.

## Voz y audio

- Voz: ElevenLabs **Antonio** (`htFfPSZG`, stability 0.6, speed 1.08, loudnorm −19 LUFS, silencios
  recortados). Borrador de tiempos con Kokoro `em_santa`. Fonética en `lineas.txt` ("eme ce pe",
  "guasap" no: WhatsApp se pronuncia bien).
- El MP4 sale solo con voz; la cama entra después (`ref/mezclar-audio.sh`: sidechain 0.03/9/8/420,
  cama −11 dB, alimiter 0.95). Cama **nueva cada video** (CC BY, Openverse/Jamendo, ~110 BPM,
  punch alto): `fetch-bgm.mjs` → `medir-bgm.mjs` → `registrar-bgm.mjs` → crédito en `BGM.md` y
  en la descripción.
- SFX CC0 (`scripts/video/sfx`): soplo en cada corte 0.34 s antes (−1 dB), cuerpo en deslizamiento
  (−7 dB), suave en pulsos (−11 dB). Máx 2 sonidos por 0.9 s. Sin riser ni golpe grave.

## Producción

Copiar `~/bitacora-normi/videos/short-03` como plantilla viva (aprobada), cambiar paleta y
contenido. `build.py voces/<voz>` → `./producir.sh voces/<voz> easybits-short-NN-<voz>`.
Verificar el MP4 entregado, no el HTML. Capturas de la app: `_wrap.html` con iframe 390×844 y
`zoom 2` (ver `~/bitacora-normi/CLAUDE.md`, aprendizajes short-02).
