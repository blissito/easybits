// StickerCut — motor de layout y exportación (sin dependencias).
// Unidades internas: milímetros. El canvas se rasteriza a DPI (300) sólo al exportar.
// Referencia de marcas de registro: silhouette-card-maker (MIT), validado en
// Cameo 3/4/5 y Portrait por su comunidad.
(function (global) {
  const DPI = 300;
  const MM_PER_IN = 25.4;
  const mm2px = mm => Math.round(mm / MM_PER_IN * DPI);
  const mm2pt = mm => mm / MM_PER_IN * 72;
  const mm2in = mm => mm / MM_PER_IN;

  // Hojas: dimensiones en mm. `big` = deja margen y rejilla libre; 6x4 es papel foto.
  const SHEETS = {
    '6x4':    { w: 152.4, h: 101.6, label: 'Papel foto 6 × 4"',  file: '6x4',    big: false },
    'carta':  { w: 215.9, h: 279.4, label: 'Carta 8.5 × 11"',    file: 'carta',  big: true },
    'a4':     { w: 210,   h: 297,   label: 'A4 21 × 29.7 cm',    file: 'a4',     big: true },
    'oficio': { w: 215.9, h: 340,   label: 'Oficio 21.6 × 34 cm', file: 'oficio', big: true },
    'legal':  { w: 215.9, h: 355.6, label: 'Legal 8.5 × 14"',    file: 'legal',  big: true },
  };

  // Marcas de registro Silhouette (mínimos de Studio): inset 10 mm a la esquina de la
  // "L" / centro del cuadro, brazos 5 mm, grosor 1 mm, cuadro 5×5 mm. 3 marcas =
  // cuadro arriba-izq + L arriba-der y abajo-izq. 4 marcas (Cameo 5 Alpha) = L en las 4.
  const REG = { inset: 10, len: 5, thick: 1, square: 5, clearance: 3 };

  // Modos de corte: qué marcas lleva la hoja y qué separación entre piezas.
  const CUT_MODES = {
    scissors:    { label: 'Tijeras / guillotina', marks: 0, gap: 0,    maxW: Infinity },
    silhouette3: { label: 'Silhouette (3 marcas)', marks: 3, gap: 1.25, maxW: 304.8 },
    silhouette4: { label: 'Silhouette (4 marcas)', marks: 4, gap: 1.25, maxW: 304.8 },
    cricut:      { label: 'Cricut',                marks: 0, gap: 2,    maxW: 215.9, area: { w: 7.55 * MM_PER_IN, h: 9.94 * MM_PER_IN } },
  };

  const BIG_MARGIN = 6.35; // 0.25" en hojas grandes

  // Rectángulos (mm) que ninguna pieza puede tocar: cada marca más su holgura.
  function markZones(sheet, marks) {
    if (!marks) return [];
    const s = REG.inset + REG.len + REG.clearance; // lado de la zona desde la esquina
    const z = [
      { x: 0, y: 0, w: s, h: s },                         // arriba-izq
      { x: sheet.w - s, y: 0, w: s, h: s },               // arriba-der
      { x: 0, y: sheet.h - s, w: s, h: s },               // abajo-izq
    ];
    if (marks === 4) z.push({ x: sheet.w - s, y: sheet.h - s, w: s, h: s });
    return z;
  }
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // Rejilla centrada de celdas w×h (mm) con separación gap; recorta columnas/filas
  // hasta que ninguna celda toque una zona de marca. Devuelve { cols, rows, x0, y0 }.
  function gridFor(sheet, cell, mode) {
    const m = CUT_MODES[mode];
    const gap = m.gap;
    let areaW = sheet.w, areaH = sheet.h, ax = 0, ay = 0;
    if (m.area) { areaW = Math.min(sheet.w, m.area.w); areaH = Math.min(sheet.h, m.area.h); ax = (sheet.w - areaW) / 2; ay = (sheet.h - areaH) / 2; }
    else if (sheet.big) { areaW -= 2 * BIG_MARGIN; areaH -= 2 * BIG_MARGIN; ax = ay = BIG_MARGIN; }
    let cols = Math.max(0, Math.floor((areaW + gap) / (cell.w + gap)));
    let rows = Math.max(0, Math.floor((areaH + gap) / (cell.h + gap)));
    const zones = markZones(sheet, m.marks);
    const place = () => {
      const totalW = cols * cell.w + (cols - 1) * gap, totalH = rows * cell.h + (rows - 1) * gap;
      return { cols, rows, x0: ax + (areaW - totalW) / 2, y0: ay + (areaH - totalH) / 2, totalW, totalH };
    };
    // Si el bloque toca una marca, quitar la dimensión que más sobra hasta librar.
    for (let guard = 0; guard < 50 && cols > 0 && rows > 0; guard++) {
      const g = place();
      const block = { x: g.x0, y: g.y0, w: g.totalW, h: g.totalH };
      if (!zones.some(z => overlaps(block, z))) break;
      if (g.totalW / areaW > g.totalH / areaH) cols--; else rows--;
    }
    return place();
  }

  // Reparte items {id, w, h, qty, shape, radius} en páginas. Todas las piezas de una
  // página comparten tamaño (rejilla uniforme, como recomienda SCM); si hay tamaños
  // distintos, cada tamaño ocupa sus propias páginas.
  function layout(items, sheetKey, mode) {
    const sheet = SHEETS[sheetKey];
    const pages = [];
    const bySize = new Map();
    for (const it of items) {
      const k = it.w + 'x' + it.h;
      if (!bySize.has(k)) bySize.set(k, { w: it.w, h: it.h, queue: [] });
      for (let i = 0; i < it.qty; i++) bySize.get(k).queue.push(it);
    }
    let missing = 0;
    for (const { w, h, queue } of bySize.values()) {
      const g = gridFor(sheet, { w, h }, mode);
      const per = g.cols * g.rows;
      if (!per) { missing += queue.length; continue; }
      const gap = CUT_MODES[mode].gap;
      while (queue.length) {
        const cells = [];
        for (let r = 0; r < g.rows && queue.length; r++) for (let c = 0; c < g.cols && queue.length; c++) {
          const it = queue.shift();
          cells.push({ x: g.x0 + c * (w + gap), y: g.y0 + r * (h + gap), w, h, item: it, shape: it.shape || 'rect', radius: it.radius || 0 });
        }
        pages.push({ sheet, sheetKey, mode, cells, grid: g });
      }
    }
    return { pages, missing };
  }

  // ---- Raster -------------------------------------------------------------
  function shapePath(ctx, x, y, w, h, shape, radius) {
    ctx.beginPath();
    if (shape === 'circle') { const r = Math.min(w, h) / 2; ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2); }
    else if (shape === 'rounded' && radius > 0) { const r = Math.min(radius, w / 2, h / 2); ctx.roundRect(x, y, w, h, r); }
    else ctx.rect(x, y, w, h);
    ctx.closePath();
  }

  function drawMarks(ctx, sheet, marks) {
    if (!marks) return;
    const I = mm2px(REG.inset), L = mm2px(REG.len), T = mm2px(REG.thick), S = mm2px(REG.square);
    const W = mm2px(sheet.w), H = mm2px(sheet.h);
    ctx.fillStyle = '#000';
    // "L": esquina en (cx, cy), brazos hacia adentro (dx, dy = ±1).
    const ell = (cx, cy, dx, dy) => {
      ctx.fillRect(dx > 0 ? cx : cx - L, dy > 0 ? cy : cy - T, L, T); // brazo horizontal
      ctx.fillRect(dx > 0 ? cx : cx - T, dy > 0 ? cy : cy - L, T, L); // brazo vertical
    };
    if (marks === 3) ctx.fillRect(I - S / 2, I - S / 2, S, S); else ell(I, I, 1, 1);
    ell(W - I, I, -1, 1);
    ell(I, H - I, 1, -1);
    if (marks === 4) ell(W - I, H - I, -1, -1);
  }

  // Dibuja una página a 300 dpi. `tile(cell, ctx, x, y, w, h)` pinta la imagen de la
  // celda (la app la provee; en calibración pinta un número). opts: { transparent,
  // guides, marks, drawTile, labelCells }.
  function renderPage(page, opts) {
    const { sheet } = page;
    const c = document.createElement('canvas');
    c.width = mm2px(sheet.w); c.height = mm2px(sheet.h);
    const ctx = c.getContext('2d');
    if (!opts.transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    for (const cell of page.cells) {
      const x = mm2px(cell.x), y = mm2px(cell.y), w = mm2px(cell.w), h = mm2px(cell.h);
      ctx.save();
      shapePath(ctx, x, y, w, h, cell.shape, mm2px(cell.radius));
      ctx.clip();
      opts.drawTile(cell, ctx, x, y, w, h);
      ctx.restore();
      if (opts.guides) { ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; shapePath(ctx, x + .5, y + .5, w - 1, h - 1, cell.shape, mm2px(cell.radius)); ctx.stroke(); }
    }
    if (opts.marks) drawMarks(ctx, sheet, opts.marks);
    return c;
  }

  // ---- PDF a mano: una imagen JPEG por página, MediaBox exacto en puntos --------
  async function toPDF(canvases, sheet) {
    const jpegs = [];
    for (const c of canvases) {
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      jpegs.push(new Uint8Array(await blob.arrayBuffer()));
    }
    const W = mm2pt(sheet.w).toFixed(3), H = mm2pt(sheet.h).toFixed(3);
    const enc = new TextEncoder();
    const parts = []; const offsets = []; let len = 0;
    const push = s => { const b = typeof s === 'string' ? enc.encode(s) : s; parts.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); if (typeof body === 'string') push(body); else body(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const n = jpegs.length;
    // 1 catálogo, 2 páginas; por página i: page=3+3i, contents=4+3i, image=5+3i
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`);
    jpegs.forEach((jpg, i) => {
      const p = 3 + 3 * i, cs = p + 1, im = p + 2, c = canvases[i];
      obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${cs} 0 R >>`);
      const stream = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
      obj(cs, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
    });
    const xref = len, total = 3 + 3 * n;
    push(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let i = 1; i < total; i++) push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  // ---- DXF R12 ASCII en pulgadas (Studio asume 1 unidad = 1"); Y hacia arriba ------
  function toDXF(page) {
    const { sheet } = page;
    const f = v => mm2in(v).toFixed(5);
    const Y = y => sheet.h - y; // mm, origen abajo-izq
    const out = [];
    const line = (x1, y1, x2, y2, layer = '0') => out.push('0\nLINE\n8\n' + layer + '\n10\n' + f(x1) + '\n20\n' + f(Y(y1)) + '\n30\n0\n11\n' + f(x2) + '\n21\n' + f(Y(y2)) + '\n31\n0');
    const circle = (cx, cy, r) => out.push('0\nCIRCLE\n8\n0\n10\n' + f(cx) + '\n20\n' + f(Y(cy)) + '\n30\n0\n40\n' + f(r));
    // Arco en grados CCW en coordenadas DXF (Y arriba). Centro (cx,cy) en mm-papel.
    const arc = (cx, cy, r, a1, a2) => out.push('0\nARC\n8\n0\n10\n' + f(cx) + '\n20\n' + f(Y(cy)) + '\n30\n0\n40\n' + f(r) + '\n50\n' + a1 + '\n51\n' + a2);
    for (const c of page.cells) {
      const { x, y, w, h } = c;
      if (c.shape === 'circle') { circle(x + w / 2, y + h / 2, Math.min(w, h) / 2); continue; }
      const r = c.shape === 'rounded' ? Math.min(c.radius, w / 2, h / 2) : 0;
      if (!r) { line(x, y, x + w, y); line(x + w, y, x + w, y + h); line(x + w, y + h, x, y + h); line(x, y + h, x, y); continue; }
      line(x + r, y, x + w - r, y); line(x + w, y + r, x + w, y + h - r); line(x + w - r, y + h, x + r, y + h); line(x, y + h - r, x, y + r);
      // En DXF (Y arriba) la esquina superior del papel es la de mayor Y.
      arc(x + w - r, y + r, r, 0, 90);        // arriba-der
      arc(x + r, y + r, r, 90, 180);          // arriba-izq
      arc(x + r, y + h - r, r, 180, 270);     // abajo-izq
      arc(x + w - r, y + h - r, r, 270, 360); // abajo-der
    }
    // Contorno de la hoja en capa PAGE: fija la extensión para que "Centrar en página"
    // no desplace los cortes. El usuario lo borra o lo deja sin corte.
    line(0, 0, sheet.w, 0, 'PAGE'); line(sheet.w, 0, sheet.w, sheet.h, 'PAGE'); line(sheet.w, sheet.h, 0, sheet.h, 'PAGE'); line(0, sheet.h, 0, 0, 'PAGE');
    const header = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$EXTMIN\n10\n0\n20\n0\n30\n0\n9\n$EXTMAX\n10\n' + f(sheet.w) + '\n20\n' + f(sheet.h) + '\n30\n0\n0\nENDSEC\n';
    const tables = '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n2\n0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nPAGE\n70\n0\n62\n8\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n';
    return new Blob([header + tables + '0\nSECTION\n2\nENTITIES\n' + out.join('\n') + '\n0\nENDSEC\n0\nEOF\n'], { type: 'application/dxf' });
  }

  // ---- PNG con chunk pHYs (300 dpi); canvas.toBlob no lo escribe -----------------
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  async function toPNG(canvas, dpi = DPI) {
    const buf = new Uint8Array(await (await new Promise(r => canvas.toBlob(r, 'image/png'))).arrayBuffer());
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(4 + 4 + 9 + 4); const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    // Recorrer chunks: quitar cualquier pHYs previo (Chrome a veces escribe 72 dpi)
    // e insertar el nuestro justo después de IHDR.
    const parts = [buf.subarray(0, 8)]; let i = 8; const view = new DataView(buf.buffer, buf.byteOffset);
    while (i < buf.length) {
      const n = view.getUint32(i), type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]), end = i + 12 + n;
      if (type !== 'pHYs') parts.push(buf.subarray(i, end));
      if (type === 'IHDR') parts.push(chunk);
      i = end;
    }
    return new Blob(parts, { type: 'image/png' });
  }

  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }

  global.SC = { DPI, MM_PER_IN, SHEETS, REG, CUT_MODES, BIG_MARGIN, mm2px, mm2in, layout, gridFor, renderPage, drawMarks, shapePath, toPDF, toDXF, toPNG, download };
})(window);
