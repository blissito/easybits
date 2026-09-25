# Short-02 · «El diff de píxeles» (Easybits · compare_render)

Vertical 1080×1920, 31 s. Render: `renders/easybits-short-02.mp4` (y `-720.mp4` para chat).

## Pendiente — iteración del 26 sep 2026
El anuncio debe presentarlo como **nueva skill `easybits-clone-verify`** y explicarla a detalle
(qué mide, el lazo clona → compara → arregla `reasons` → repite, y cómo instalarla:
`npx skills add https://easybits.cloud`). Hoy el CTA sólo dice «Pruébalo en easybits.cloud».
Antes de renderizar: storytelling y guion aprobados, luego style frames.

## Cómo corre (pipeline de partitura, igual que ~/ghosty-reel/fabrica-reel)
```
python3 gen-voice.py          # voz em_santa + tiempos de palabra (voice/lines.json)
node score.mjs                # escenas, anclas, subtítulos, efectos y cama → score.gen.js / .json
python3 synth.py bed.wav bed && python3 synth.py sfx.wav sfx
npx --yes hyperframes@0.8.77 render . --experimental-fast-capture=false --low-memory-mode -o renders/mudo.mp4
bash mix.sh                   # falla si el mudo no mide lo que dice la partitura
```

## Material
- `assets/doc/cotizacion.pdf`: documento ficticio (no usar PDFs de terceros en redes).
- `assets/img/*-ldiff.png`: diffs de COMPOSICIÓN reales de compare_render (el diff a resolución
  completa pinta el antialias en rojo y contradice «el rojo desaparece»).
- Música sintetizada desde la partitura: no requiere crédito.
