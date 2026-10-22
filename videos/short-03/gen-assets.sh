#!/bin/bash
# Genera las piezas ESTÁTICAS con Nano Banana 2.1 (llave de pago de ghosty-studio)
K=$(grep '^GOOGLE_GENERATIVE_AI_API_KEY=' ~/ghosty-studio/.env | cut -d= -f2- | tr -d '"')
STYLE="Flat brutalist cartoon illustration, thick uniform black outlines, solid flat fills only, no texture, no gradients, no shading except one hard offset black shadow, colors only purple #7c3aed, amber #fbbf24, off-white #f5f3ef and black, pure white background, absolutely no text or letters"
gen() { # nombre aspect prompt
  curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent" \
    -H "x-goog-api-key: $K" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys;print(json.dumps({"contents":[{"parts":[{"text":sys.argv[1]}]}],"generationConfig":{"responseModalities":["IMAGE"],"imageConfig":{"aspectRatio":sys.argv[2],"imageSize":"1K"}}}))' "$3. $STYLE" "$2")" > assets/$1.json
  python3 -c "
import json,base64,sys;d=json.load(open('assets/$1.json'))
if 'error' in d: print('$1',d['error']['message'][:200]); sys.exit()
p=[p for p in d['candidates'][0]['content']['parts'] if 'inlineData' in p][0]
open('assets/$1.raw.jpg','wb').write(base64.b64decode(p['inlineData']['data'])); print('$1 ok')"
}
gen fachada 3:4 "Front view of a flat cardboard storefront facade with a striped awning, a painted fake door and an empty blank sign board, propped from behind by a single wooden stick, corrugated cardboard edges visible, taped corners" &
gen mano 1:1 "A giant cartoon hand with open palm pushing forward, seen from the side, flat palm facing right, wrist entering from the left edge" &
gen edificio 3:4 "Front view of a solid sturdy brick storefront building with a striped awning, a wide open door with warm amber light pouring out, a blank sign board above, heavy stone foundation" &
wait
