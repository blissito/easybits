#!/usr/bin/env python3
"""
extract-photos.py — extrae fotos de una página de PDF DIGITAL emparejadas con su
nombre POR POSICIÓN (la data embebida del PDF), no por reconocimiento facial.

Uso:  python3 extract-photos.py <pdf> <pagina_1based> <outdir>

Imprime JSON [{file, bbox, name}]. Determinista. Para PDF digital esto clava el
match foto<->nombre. (Para PDFs ESCANEADOS usa un detector ML: Surya / PaddleOCR PP-Structure.)
"""
import sys, os, json, subprocess

try:
    import fitz  # PyMuPDF
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "--break-system-packages", "-q", "pymupdf"], check=False)
    import fitz

def norm_name(t):
    t = t.strip()
    # descartar etiquetas de sección comunes (no son nombres de persona)
    return t

def main():
    path, page1, outdir = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    os.makedirs(outdir, exist_ok=True)
    doc = fitz.open(path)
    page = doc[page1 - 1]

    spans = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if t:
                    spans.append({"text": t, "bbox": s["bbox"], "size": s["size"]})

    out = []
    seen_xref = set()
    idx = 0
    for im in page.get_image_info(xrefs=True):
        bb = im["bbox"]; xref = im.get("xref", 0)
        w, h = bb[2]-bb[0], bb[3]-bb[1]
        ar = w/h if h else 0
        if not (0.6 <= ar <= 1.6 and 25 <= w <= 200):  # foto retrato
            continue
        if xref in seen_xref:
            continue
        cy = (bb[1]+bb[3])/2
        # nombre = span de mayor fuente a la DERECHA, y solapada verticalmente
        cands = [s for s in spans if s["bbox"][0] >= bb[2]-6 and s["bbox"][1] <= cy <= s["bbox"][3]+16 and s["size"] >= 9]
        cands.sort(key=lambda s: (s["bbox"][0]-bb[2], -s["size"]))
        name = norm_name(cands[0]["text"]) if cands else "(sin nombre)"
        file = None
        if xref:
            seen_xref.add(xref)
            try:
                d = doc.extract_image(xref)
                # saltar máscaras/índices diminutos (la versión color es la grande)
                if len(d["image"]) >= 3000:
                    file = os.path.join(outdir, f"p{page1}_{idx:02d}.{d['ext']}")
                    open(file, "wb").write(d["image"])
            except Exception:
                pass
        if file:
            out.append({"file": os.path.basename(file), "bbox": [round(v) for v in bb], "name": name})
            idx += 1

    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
