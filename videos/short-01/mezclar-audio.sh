#!/bin/bash
# Monta cama musical y efectos sobre el video ya renderizado (la voz ya viene
# dentro del MP4). Convención de la casa: el audio va por fuera del render.
#   ./mezclar-audio.sh renders/video.mp4 renders/easybits-short-01.mp4
set -euo pipefail
IN="${1:-renders/video.mp4}"
OUT="${2:-renders/easybits-short-01.mp4}"
FX="/tmp/eb01-efectos.wav"

BGM="assets/bgm/cama-40s.wav"
# short-03: juego nuevo (CC0 Freesound): whoosh de bambú en cortes, cuerpo en deslizamientos,
# pop en pulsos, thud grave en los tres golpes del cierre, brillo en el logo final.
SOPLO="assets/sfx/whoosh-bambu.mp3"
CUERPO="assets/sfx/cuerpo-a.mp3"
SUAVE="assets/sfx/pop.mp3"
THUD="assets/sfx/suave-a.mp3"  # el thud grave perturbaba; golpe suave
BRILLO="assets/sfx/brillo.mp3"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")

# Cortes, deslizamientos y pulsos: los escribe build.py en cues.env
. ./cues.env  # CUTS SWAPS PULSES HITS BRILLO_T TOTAL

G_SOPLO=0; G_CUERPO=-7; G_SUAVE=-9; G_THUD=-8; G_BRILLO=-8; G_BGM=-11

inputs=(); filter=""; idx=0; mixins=""
place() { # archivo, segundo, ganancia dB
  local ms; ms=$(python3 -c "print(max(0,int($2*1000)))")
  inputs+=(-i "$1"); filter+="[${idx}:a]adelay=${ms}|${ms},volume=${3}dB,apad[s${idx}];"; mixins+="[s${idx}]"; idx=$((idx+1))
}
for t in "${CUTS[@]}";   do place "$SOPLO"  "$(python3 -c "print($t-0.34)")" "$G_SOPLO"; place "assets/sfx/thud.mp3" "$(python3 -c "print($t+0.28)")" -5; done
for t in "${SWAPS[@]}";  do place "$CUERPO" "$t" "$G_CUERPO"; done
for t in "${PULSES[@]}"; do place "$SUAVE"  "$t" "$G_SUAVE"; done
for t in "${HITS[@]}";   do place "$THUD"   "$(python3 -c "print($t-0.05)")" "$G_THUD"; done
# brillo quitado (sonaba a coro); place "$BRILLO" "$BRILLO_T" "$G_BRILLO"
echo "efectos: $idx sonidos"

ffmpeg -y -v error "${inputs[@]}" -filter_complex "${filter}${mixins}amix=inputs=${idx}:normalize=0[fx]" -map "[fx]" -t "$DUR" "$FX"

# Voz + cama agachada (sidechain contra la voz) + efectos. amix normalize=0.
ffmpeg -y -v error -i "$IN" -i "$BGM" -i "$FX" \
  -filter_complex "\
[0:a]volume=0dB,asplit=2[voz][sc];\
[1:a]volume=${G_BGM}dB[bed];\
[bed][sc]sidechaincompress=threshold=0.03:ratio=9:attack=8:release=420[cama];\
[voz][cama][2:a]amix=inputs=3:normalize=0[suma];\
[suma]alimiter=limit=0.95:level=disabled[mezcla]" \
  -map 0:v -map "[mezcla]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "$OUT"
echo "→ $OUT"
