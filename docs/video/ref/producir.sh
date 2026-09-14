#!/bin/bash
# Produce el short completo para una voz:  ./producir.sh voces/marco normi-short-03-marco
set -euo pipefail
VDIR="$1"; NAME="$2"
python3 build.py "$VDIR"
BED=$(ffprobe -v error -show_entries format=duration -of csv=p=0 assets/bgm/cama-34s.wav 2>/dev/null || echo 0)
. ./cues.env
if python3 -c "import sys; sys.exit(0 if $BED < $TOTAL + 1 else 1)"; then
  ffmpeg -v error -y -ss 26 -t "$(python3 -c "print($TOTAL+1.5)")" -i assets/bgm/dont-stop-fragmento.mp3 -af "afade=t=in:d=1.2,afade=t=out:st=$(python3 -c "print($TOTAL-1.7)"):d=3.5,loudnorm=I=-20:TP=-2:LRA=11" -ar 48000 assets/bgm/cama-34s.wav
fi
npm run check 2>&1 | grep -E "error\(s\)|Check " 
npx hyperframes render --quality high --fps 30 --output "renders/$NAME-raw.mp4" 2>&1 | grep -E "rendered|rror"
./mezclar-audio.sh "renders/$NAME-raw.mp4" "renders/$NAME.mp4" | tail -1
ffmpeg -v error -i "renders/$NAME.mp4" -vf "signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=/tmp/y.txt" -an -f null -
awk -F= '/YMAX/{if($2<150)n++} END{print "cuadros apagados:", n+0}' /tmp/y.txt
