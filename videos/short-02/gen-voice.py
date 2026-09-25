#!/usr/bin/env python3
"""Regenera la narración: una frase por escena con em_santa (Kokoro, local) y sus tiempos de palabra
(whisper large-v3, español). Escribe voice/NN-escena.wav y actualiza voice/lines.json (dur + words).
Los anglicismos van escritos como se pronuncian para el motor («arroba bild», «pul ricuést», «prívíu»)."""
import json, os, subprocess
L = json.load(open("voice/lines.json"))
for i, l in enumerate(L):
    l["file"] = f"voice/{i:02d}-{l['scene']}.wav"
    subprocess.run(["npx", "hyperframes@0.8.77", "tts", "-v", "em_santa", "-l", "es", "-o", l["file"], l["text"]], check=True, capture_output=True)
    l["dur"] = round(float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", l["file"]], capture_output=True, text=True).stdout), 3)
    d = f"voice/tr-{l['scene']}"; os.makedirs(d, exist_ok=True)
    side = os.path.join(os.path.dirname(l["file"]), "transcript.json")
    if os.path.exists(side): os.remove(side)  # nunca leer uno viejo
    subprocess.run(["npx", "hyperframes@0.8.77", "transcribe", l["file"], "-m", "large-v3", "-l", "es", "--json"], check=True, capture_output=True)
    tp = f"{d}/transcript.json"; os.replace(side, tp)  # 0.8.77 lo deja junto al wav
    l["words"] = [{"w": x["text"], "s": x["start"], "e": x["end"]} for x in json.load(open(tp))]
    print(f"{l['scene']:10} {l['dur']:5.2f}s  {' '.join(w['w'] for w in l['words'])}")
json.dump(L, open("voice/lines.json", "w"), ensure_ascii=False, indent=1)
