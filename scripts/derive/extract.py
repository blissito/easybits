#!/usr/bin/env python3
"""
derive/extract.py — Minería GROUNDED de un PDF institucional con PyMuPDF.

PARTE 1 del clone fiel. SIN IA. Devuelve, en un solo espacio de coordenadas, lo
determinista que el LLM solo acomodará (no redacta): bloques de texto con bbox y
estilo, e imágenes reales con alpha y su rect de colocación.

Estructura: `assets` (físicos, DEDUPLICADOS por contenido — el mismo logo en N
páginas = 1 archivo) + `pages[].placements` (dónde va cada asset, por página).
Así el dueño sube cada asset UNA vez y lo coloca las veces que haga falta.

Regla del brief: el texto sale de aquí (no se transcribe con visión → no alucina);
los assets son los reales (no se regeneran).

Uso:  python3 extract.py <pdf_path> <out_dir>   →  JSON a stdout, PNGs en out_dir
Dep:  PyMuPDF (AGPL aceptado como deuda temporal en v1; swap permisivo en GA).
"""
import sys, os, json, hashlib
import fitz  # PyMuPDF


def color_hex(c):
    try:
        return "#%06x" % (c & 0xFFFFFF)
    except Exception:
        return None


def load_png(doc, xref, smask):
    """Imagen embebida → PNG. Re-pega la /SMask como alpha (sin esto el cutout
    sale opaco: fotos sin recorte, máscaras blancas)."""
    pix = fitz.Pixmap(doc, xref)
    if pix.colorspace and pix.colorspace.name not in ("DeviceRGB", "DeviceGray"):
        pix = fitz.Pixmap(fitz.csRGB, pix)  # CMYK/sep → RGB
    if smask:
        try:
            if pix.alpha:
                pix = fitz.Pixmap(pix, 0)  # quita alpha previo para re-añadir
            pix = fitz.Pixmap(pix, fitz.Pixmap(doc, smask))
        except Exception:
            pass  # mejor opaco que reventar
    return pix.tobytes("png"), pix.width, pix.height, bool(pix.alpha)


def extract(pdf_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    assets = {}  # md5 → {file, native, alpha} — deduplicado por contenido
    pages = []

    for pno in range(doc.page_count):
        pg = doc[pno]

        # Texto: bloques con bbox + estilo del primer span (suficiente para acomodar)
        blocks = []
        for b in pg.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            spans = [s for l in b["lines"] for s in l["spans"]]
            txt = " ".join(s["text"] for s in spans).strip()
            if not txt:
                continue
            s0 = spans[0]
            blocks.append({
                "text": txt,
                "bbox": [round(v, 1) for v in b["bbox"]],
                "font": s0.get("font"),
                "size": round(s0.get("size", 0), 1),
                "color": color_hex(s0.get("color", 0)),
                "bold": "bold" in (s0.get("font", "") or "").lower(),
            })

        # Imágenes: dedup por contenido (md5) + un placement por aparición
        placements = []
        for img in pg.get_images(full=True):
            rects = pg.get_image_rects(img[0])
            if not rects:
                continue
            png, w, h, alpha = load_png(doc, img[0], img[1])
            aid = hashlib.md5(png).hexdigest()[:10]
            if aid not in assets:  # subir-una-vez: mismos bytes en cada página = 1 archivo
                f = os.path.join(out_dir, f"{aid}.png")
                with open(f, "wb") as fh:
                    fh.write(png)
                assets[aid] = {"file": f, "native": [w, h], "alpha": alpha}
            r = rects[0]
            placements.append({"asset": aid, "rect": [round(v, 1) for v in (r.x0, r.y0, r.x1, r.y1)]})

        pages.append({
            "index": pno,
            "size": [round(pg.rect.width, 1), round(pg.rect.height, 1)],
            "text_blocks": blocks,
            "placements": placements,
        })

    return {"page_count": doc.page_count, "assets": assets, "pages": pages}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("uso: python3 extract.py <pdf_path> <out_dir>")
    print(json.dumps(extract(sys.argv[1], sys.argv[2]), ensure_ascii=False))
