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
    silhouette3: { label: 'Silhouette (3 marcas)', marks: 3, gap: 3, maxW: 304.8 },
    silhouette4: { label: 'Silhouette (4 marcas)', marks: 4, gap: 3, maxW: 304.8 },
    cricut:      { label: 'Cricut',                marks: 0, gap: 3,    maxW: 215.9, area: { w: 7.55 * MM_PER_IN, h: 9.94 * MM_PER_IN } },
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

  // Área útil de la hoja (mm): margen en hojas grandes, área fija en Cricut y, con
  // marcas de registro, un anillo libre alrededor (inset + brazo + holgura) para que
  // ninguna pieza toque las marcas ni la banda que lee el sensor.
  function usableRect(sheet, mode) {
    const m = CUT_MODES[mode];
    let x = 0, y = 0, w = sheet.w, h = sheet.h;
    if (m.area) { w = Math.min(sheet.w, m.area.w); h = Math.min(sheet.h, m.area.h); x = (sheet.w - w) / 2; y = (sheet.h - h) / 2; }
    else if (sheet.big) { x = y = BIG_MARGIN; w -= 2 * BIG_MARGIN; h -= 2 * BIG_MARGIN; }
    // Con marcas no se recorta el área: se excluyen sólo las ESQUINAS (ver freeRects),
    // así el espacio entre marcas a lo largo de los bordes sí se aprovecha.
    return { x, y, w, h, marks: m.marks, corner: m.marks ? REG.inset + REG.len + REG.clearance : 0 };
  }
  // Rectángulos libres iniciales del área (coordenadas relativas al área, con +gap):
  // sin marcas es uno solo; con marcas, una cruz que deja fuera las esquinas ocupadas.
  function freeRects(area, gap) {
    const W = area.w + gap, H = area.h + gap;
    if (!area.marks) return [{ x: 0, y: 0, w: W, h: H }];
    const z = Math.max(0, area.corner - area.x); // lo que la esquina invade dentro del área
    const rects = [{ x: z, y: 0, w: W - 2 * z, h: H }, { x: 0, y: z, w: W, h: H - 2 * z }];
    if (area.marks === 3) rects.push({ x: z, y: z, w: W - z, h: H - z }); // abajo-derecha libre (sin marca)
    return rects;
  }

  // Empaque MaxRects (best short side fit): piezas de tamaños distintos sin desperdiciar
  // filas completas como el empaque por estantes. Cada página mantiene su lista de
  // rectángulos libres; al colocar una pieza se parten y se podan los contenidos.
  // items: {id, w, h, qty, shape, radius, path...}. Devuelve { pages, missing, area }.
  function layout(items, sheetKey, mode, gapOverride) {
    const sheet = SHEETS[sheetKey], gap = gapOverride != null ? gapOverride : CUT_MODES[mode].gap, area = usableRect(sheet, mode);
    const pieces = [];
    for (const it of items) for (let i = 0; i < it.qty; i++) pieces.push(it);
    // Primero las grandes (área), y a igual área las más altas: menos huecos.
    pieces.sort((a, b) => (b.w * b.h) - (a.w * a.h) || b.h - a.h);
    const pages = []; let missing = 0;
    const newPage = () => { const p = { sheet, sheetKey, mode, cells: [], free: freeRects(area, gap) }; pages.push(p); return p; };
    // Cada pieza ocupa (w+gap)×(h+gap); el área libre se amplía en gap para que la última
    // fila/columna no pierda el margen que no necesita.
    const tryPlace = (p, W, H) => {
      let best = null;
      for (const r of p.free) {
        if (W <= r.w + 1e-6 && H <= r.h + 1e-6) {
          const score = Math.min(r.w - W, r.h - H), tie = Math.max(r.w - W, r.h - H);
          if (!best || score < best.score || (score === best.score && tie < best.tie)) best = { x: r.x, y: r.y, score, tie };
        }
      }
      return best;
    };
    const place = (p, x, y, W, H) => {
      const used = { x, y, w: W, h: H }, next = [];
      for (const r of p.free) {
        if (!overlaps(r, used)) { next.push(r); continue; }
        if (used.x > r.x) next.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
        if (used.x + used.w < r.x + r.w) next.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - used.x - used.w, h: r.h });
        if (used.y > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
        if (used.y + used.h < r.y + r.h) next.push({ x: r.x, y: used.y + used.h, w: r.w, h: r.y + r.h - used.y - used.h });
      }
      // Podar rectángulos contenidos en otros.
      const inside = (a, b) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6;
      p.free = next.filter((r, i) => r.w > 1e-6 && r.h > 1e-6 && !next.some((o, j) => j !== i && (inside(r, o) && !(inside(o, r) && j > i))));
    };
    for (const it of pieces) {
      if (it.w > area.w + 1e-6 || it.h > area.h + 1e-6) { missing++; continue; }
      const W = it.w + gap, H = it.h + gap;
      let done = false;
      for (const p of pages) { const b = tryPlace(p, W, H); if (b) { place(p, b.x, b.y, W, H); p.cells.push({ x: b.x, y: b.y, w: it.w, h: it.h, item: it, shape: it.shape || 'rect', radius: it.radius || 0, path: it.path }); done = true; break; } }
      if (!done) { const p = newPage(); const b = tryPlace(p, W, H); place(p, b.x, b.y, W, H); p.cells.push({ x: b.x, y: b.y, w: it.w, h: it.h, item: it, shape: it.shape || 'rect', radius: it.radius || 0, path: it.path }); }
    }
    // Centrar el bloque de cada página dentro del área útil.
    for (const p of pages) {
      const maxX = Math.max(...p.cells.map(c => c.x + c.w)), maxY = Math.max(...p.cells.map(c => c.y + c.h));
      let dx = area.x + (area.w - maxX) / 2, dy = area.y + (area.h - maxY) / 2;
      if (area.marks) {
        // Centrar podría meter una pieza en una esquina con marca: en ese caso no se centra.
        const zones = markZones(p.sheet, area.marks);
        const hits = p.cells.some(c => zones.some(z => overlaps({ x: c.x + dx, y: c.y + dy, w: c.w, h: c.h }, z)));
        if (hits) { dx = area.x; dy = area.y; }
      }
      for (const c of p.cells) { c.x += dx; c.y += dy; }
      p.used = { w: maxX, h: maxY }; delete p.free;
    }
    return { pages, missing, area };
  }

  // ---- Raster -------------------------------------------------------------
  function shapePath(ctx, x, y, w, h, shape, radius, path) {
    ctx.beginPath();
    if (shape === 'contour' && path && path.length > 2) { path.forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo'](x + px * w, y + py * h)); ctx.closePath(); return; }
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
      shapePath(ctx, x, y, w, h, cell.shape, mm2px(cell.radius), cell.path);
      ctx.clip();
      opts.drawTile(cell, ctx, x, y, w, h);
      ctx.restore();
      // outline: sólo en la previsualización de pantalla (la línea de corte no se imprime).
      if (opts.outline) { ctx.save(); ctx.strokeStyle = 'rgba(184,69,42,.9)'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); shapePath(ctx, x, y, w, h, cell.shape, mm2px(cell.radius), cell.path); ctx.stroke(); ctx.restore(); }
      // Guías impresas (tijeras): tenues en rectángulos; en siluetas un poco más firmes (0.2 mm) porque son la línea que se sigue a mano.
      // Línea de corte impresa (opcional): gris tenue de 0.2 mm sobre el contorno de la pieza.
      if (opts.guides) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = mm2px(0.2); shapePath(ctx, x + .5, y + .5, w - 1, h - 1, cell.shape, mm2px(cell.radius), cell.path); ctx.stroke(); }
    }
    if (opts.marks) drawMarks(ctx, sheet, opts.marks);
    return c;
  }

  // ---- Silueta: contorno exterior de la imagen con borde extra ---------------------
  // Devuelve { path: [[x,y]...] normalizado al bbox del sticker, bbox: {x,y,w,h} en px
  // de la imagen original (ya incluye el borde) } o null si la imagen no tiene alfa.
  function traceContour(img, borderRatio) {
    const MAX = 320, k = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(2, Math.round(img.width * k)), h = Math.max(2, Math.round(img.height * k));
    const pad = Math.max(2, Math.ceil(borderRatio * Math.max(w, h)));
    const W = w + 2 * pad, H = h + 2 * pad;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, pad, pad, w, h);
    const d = ctx.getImageData(0, 0, W, H).data;
    let mask = new Uint8Array(W * H), opaque = 0;
    for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 40) { mask[i] = 1; opaque++; }
    if (!opaque || opaque > 0.97 * w * h) return null; // sin alfa útil: rectángulo normal
    // Dilatar con un disco de radio pad (borde blanco) usando transformada de distancia aproximada (dos pasadas).
    const INF = 1e9, dist = new Float32Array(W * H).fill(INF);
    for (let i = 0; i < W * H; i++) if (mask[i]) dist[i] = 0;
    const pass = (dir) => { for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) { const y = dir ? H - 1 - y0 : y0, x = dir ? W - 1 - x0 : x0, i = y * W + x; let m = dist[i]; const nb = dir ? [[1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]] : [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]]; for (const [dx, dy, cst] of nb) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) m = Math.min(m, dist[ny * W + nx] + cst); } dist[i] = m; } };
    pass(0); pass(1);
    const dil = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) dil[i] = dist[i] <= pad ? 1 : 0;
    // Rellenar huecos: todo lo no alcanzable desde el borde exterior es interior.
    const outside = new Uint8Array(W * H), st = [];
    for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); }
    while (st.length) { const i = st.pop(); if (i < 0 || i >= W * H || outside[i] || dil[i]) continue; outside[i] = 1; const x = i % W; st.push(i - W, i + W); if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); }
    const solid = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) solid[i] = outside[i] ? 0 : 1;
    // Contorno exterior por seguimiento de borde (Moore) sobre la componente que toca el primer píxel sólido en lectura.
    let start = -1; for (let i = 0; i < W * H; i++) if (solid[i]) { start = i; break; }
    if (start < 0) return null;
    const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && solid[y * W + x];
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    let x = start % W, y = (start / W) | 0, dir = 6, pts = [[x, y]], guard = W * H * 4;
    do {
      let found = false;
      for (let t = 0; t < 8; t++) { const nd = (dir + 6 + t) % 8, nx = x + dirs[nd][0], ny = y + dirs[nd][1]; if (at(nx, ny)) { x = nx; y = ny; dir = nd; pts.push([x, y]); found = true; break; } }
      if (!found) break;
    } while ((x !== pts[0][0] || y !== pts[0][1]) && --guard > 0);
    pts.pop();
    // Simplificar (Ramer–Douglas–Peucker) a ~0.6 px de tolerancia en la máscara.
    const rdp = (p, eps) => { if (p.length < 3) return p; let dmax = 0, idx = 0; const [ax, ay] = p[0], [bx, by] = p[p.length - 1]; const L = Math.hypot(bx - ax, by - ay) || 1; for (let i = 1; i < p.length - 1; i++) { const dd = Math.abs((by - ay) * p[i][0] - (bx - ax) * p[i][1] + bx * ay - by * ax) / L; if (dd > dmax) { dmax = dd; idx = i; } } if (dmax > eps) { const l = rdp(p.slice(0, idx + 1), eps), r = rdp(p.slice(idx), eps); return l.slice(0, -1).concat(r); } return [p[0], p[p.length - 1]]; };
    // Anillo cerrado: se simplifica en dos mitades (con inicio = fin, RDP colapsaría todo).
    const mid = pts.length >> 1;
    pts = rdp(pts.slice(0, mid + 1), 0.6).slice(0, -1).concat(rdp(pts.slice(mid).concat([pts[0]]), 0.6).slice(0, -1));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of pts) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    // +1 para incluir el píxel completo del borde
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const path = pts.map(([px, py]) => [(px + 0.5 - minX) / bw, (py + 0.5 - minY) / bh]);
    // bbox en coordenadas de la imagen original (píxeles): el sticker es más grande que la imagen por el borde.
    return { path, bbox: { x: (minX - pad) / k, y: (minY - pad) / k, w: bw / k, h: bh / k }, mask: { W, H, k, pad } };
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
    const poly = pts => { out.push('0\nPOLYLINE\n8\n0\n66\n1\n70\n1'); for (const [px, py] of pts) out.push('0\nVERTEX\n8\n0\n10\n' + f(px) + '\n20\n' + f(Y(py)) + '\n30\n0'); out.push('0\nSEQEND\n8\n0'); };
    for (const c of page.cells) {
      const { x, y, w, h } = c;
      if (c.shape === 'contour' && c.path) { poly(c.path.map(([px, py]) => [x + px * w, y + py * h])); continue; }
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

  global.SC = { DPI, MM_PER_IN, SHEETS, REG, CUT_MODES, BIG_MARGIN, mm2px, mm2in, layout, usableRect, renderPage, drawMarks, shapePath, traceContour, toPDF, toDXF, toPNG, download };
})(window);
