# Efectos de los shorts del taller

Todos CC0 (Freesound) o sintetizados con ffmpeg: **no piden atribución**. Convertidos a WAV
48 kHz estéreo, silencio inicial recortado y pico normalizado a −3 dBFS para que las ganancias
de `mix.sh` sean predecibles.

| Archivo | Para qué | Dur. | Fuente | Licencia |
|---|---|---|---|---|
| `turn.wav` | persiana completa (riser + golpe), la que ya usa `mix.sh` | 1.10 s | (existente) | — |
| `riser.wav` | riser corto, mientras la cascada cierra | 0.68 s | ENERGY RISER 2 — magnuswaker, [freesound 523057](https://freesound.org/people/magnuswaker/sounds/523057) | CC0 |
| `hit-low.wav` | golpe grave de impacto, en el cuadro del corte | 0.75 s | Dull Decompression Punch Impact — qubodup, [freesound 71274](https://freesound.org/people/qubodup/sounds/71274) | CC0 |
| `hit-sub.wav` | golpe sub sintético (barrido 120→45 Hz), alternativa limpia al anterior | 0.50 s | ffmpeg `aevalsrc` | sin licencia |
| `whoosh-fly.wav` | elemento que vuela y cruza el cuadro | 0.89 s | hi speed electronic whoosh 1 — martian, [freesound 19307](https://freesound.org/people/martian/sounds/19307) | CC0 |
| `whoosh-short.wav` | morph entre paneles, vuelo corto | 0.49 s | Swosh swoosh whoosh air — qubodup, [freesound 60026](https://freesound.org/people/qubodup/sounds/60026) | CC0 |
| `land.wav` | acento de aterrizaje, cuando la pieza se asienta | 0.26 s | Arrow Impact — omerbhatti34, [freesound 521552](https://freesound.org/people/omerbhatti34/sounds/521552) | CC0 |
| `tick.wav` | tick seco del karaoke, una por palabra | 0.035 s | ffmpeg (seno 2.2 kHz, cola de 4 ms) | sin licencia |

El tick va sintetizado a propósito: lo más corto de Freesound eran 242 ms de tick metálico, y esa
cola se encima con la palabra siguiente. A esta duración cabe entre sílabas.

Para el karaoke, el tick pide bajarse otros 12-15 dB respecto al golpe: es un acento, no un evento.

## Sesión 4 · short 2 (lotería), 11 sep 2026 — generados con ffmpeg
- `card.wav` — ruido rosa con bandpass 1.8 kHz, 90 ms: una carta que azota la tabla.
- `bean.wav` — seno 420 Hz, 50 ms: un frijol que cae.
- `coin.wav` — dos senos (C7 + E7), 180 ms: moneda.
- `stamp.wav` — ruido café con lowpass 220 Hz, 220 ms: sello.
- `block.wav` — ruido café con lowpass 400 Hz, 120 ms: un bloque que se planta (short 3, brutalismo).
- `pop.wav` — seno con barrido, 90 ms: pieza de papel que se levanta (pop-up).
- `ding.wav` — dos senos (E7 + B7), 350 ms: campanita de caja.
- `pin.wav` — clic de ruido blanco, 25 ms: el seguro del gafete.
- `paper.wav` — ruido rosa 900 Hz, 160 ms: hoja de papel que se desliza.
