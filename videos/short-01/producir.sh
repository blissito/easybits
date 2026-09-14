#!/bin/bash
# Produce el short completo para una voz:  ./producir.sh voces/kokoro easybits-short-01
set -euo pipefail
VDIR="$1"; NAME="$2"
python3 build.py "$VDIR"
npm run check 2>&1 | grep -E "error\(s\)|Check " 
npx --yes hyperframes@0.8.36 render --quality high --fps 30 --output "renders/$NAME-raw.mp4" 2>&1 | grep -E "rendered|rror"
./mezclar-audio.sh "renders/$NAME-raw.mp4" "renders/$NAME.mp4" | tail -1
ffmpeg -v error -i "renders/$NAME.mp4" -vf "signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=/tmp/y.txt" -an -f null -
awk -F= '/YMAX/{if($2<150)n++} END{print "cuadros apagados:", n+0}' /tmp/y.txt
