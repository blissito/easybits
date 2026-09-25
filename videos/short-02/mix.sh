#!/usr/bin/env bash
# Montaje: render mudo + voz (em_santa, frase por escena) + cama (bed.wav, se agacha con la voz) + efectos (sfx.wav, no se agachan).
# Voz −15 LUFS, cama −26 LUFS con sidechain (llave: la voz sola), efectos −19 LUFS; ganancia fija final, sin loudnorm al final.
set -euo pipefail
cd "$(dirname "$0")"
F=renders/easybits-short-02.mp4
DUR=$(python3 -c "import json;print(json.load(open('score.gen.json'))['duration'])")
TMP=$(mktemp -d)
# el render debe medir lo que dice la partitura: si no, es un mudo viejo o cortado
VD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 renders/mudo.mp4)
python3 -c "import sys; d=abs($VD-$DUR); sys.exit(0 if d<0.1 else f'mudo.mp4 mide {$VD} s y la partitura {$DUR} s')"
# pista de voz: cada frase en su tiempo de partitura
python3 - "$TMP" <<'PY'
import json, subprocess, sys
tmp = sys.argv[1]; s = json.load(open("score.gen.json")); v = s["voice"]
ins = sum([["-i", x["file"]] for x in v], [])
fc = "".join(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(round(x['t']*1000))}|{int(round(x['t']*1000))},apad=whole_dur={s['duration']}[v{i}];" for i, x in enumerate(v))
fc += "".join(f"[v{i}]" for i in range(len(v))) + f"amix=inputs={len(v)}:normalize=0:duration=longest[a]"
subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", fc, "-map", "[a]", "-t", str(s["duration"]), f"{tmp}/voz-raw.wav"], check=True)
PY
lufs() { ffmpeg -hide_banner -i "$1" -af ebur128 -f null - 2>&1 | awk '/^ +I:/{print $2}' | tail -1; }
gain() { python3 -c "print(round($1 - ($2), 2))"; }
GV=$(gain -15 "$(lufs $TMP/voz-raw.wav)"); GB=$(gain -26 "$(lufs bed.wav)"); GS=$(gain -19 "$(lufs sfx.wav)")
echo "ganancias: voz ${GV} dB · cama ${GB} dB · efectos ${GS} dB"
ffmpeg -v error -y -i $TMP/voz-raw.wav -i bed.wav -i sfx.wav -filter_complex "\
[0:a]volume=${GV}dB,apad=whole_dur=${DUR},asplit=2[v][key];\
[1:a]volume=${GB}dB,aresample=48000,apad=whole_dur=${DUR}[b];\
[b][key]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[bd];\
[2:a]volume=${GS}dB,aresample=48000,apad=whole_dur=${DUR}[x];\
[v][bd][x]amix=inputs=3:normalize=0:duration=longest[a]" -map "[a]" -t $DUR $TMP/pre.wav
G=$(gain -14.5 "$(lufs $TMP/pre.wav)")
ffmpeg -v error -y -i renders/mudo.mp4 -i $TMP/pre.wav -filter_complex "[1:a]volume=${G}dB,alimiter=limit=0.84:level=false,aresample=48000[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -movflags +faststart $F
echo "start $(ffprobe -v error -select_streams v:0 -show_entries stream=start_time -of csv=p=0 $F) · dur $(ffprobe -v error -show_entries format=duration -of csv=p=0 $F) · negros $(ffmpeg -hide_banner -i $F -vf blackdetect=d=0.05:pic_th=0.98 -an -f null - 2>&1 | grep -c black_start || true) · LUFS $(lufs $F)"
