/* MoonChess — read a chess position from a picture or a PDF page.
   1. Find the board (grid-line search, which you can adjust by hand).
   2. Read each square: empty or not, white or black, and which piece, by comparing its outline
      with outlines drawn from reference pieces.
   3. Show the result on an editable board so every square can be checked before it is used. */
{
const M = window.MC, C = M.C, esc = M.esc;
const $ = id => document.getElementById(id);
const TYPES = 'KQRBNP';
const NAME = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
const S = 48, G = 16; // pixels per square while reading; outline grid size

/* ---------------- loading pictures and PDF pages ---------------- */
function loadPdfLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'js/vendor/pdfjs/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdfjs/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => rej(new Error('pdf')); document.head.appendChild(s);
  });
}
async function openPdf(file) { const lib = await loadPdfLib(); return lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise; }
async function pdfPage(doc, n) {
  const page = await doc.getPage(n), v0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(3, 1800 / Math.max(v0.width, v0.height)) });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: cx, viewport: vp }).promise; return cv;
}
function imageCanvas(src) {
  return new Promise((res, rej) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src), im = new Image();
    im.onload = () => {
      const k = Math.min(1800 / Math.max(im.width, im.height), Math.max(1, 640 / Math.min(im.width, im.height)), 3);
      const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.imageSmoothingQuality = 'high'; cx.drawImage(im, 0, 0, cv.width, cv.height);
      if (typeof src !== 'string') URL.revokeObjectURL(url); res(cv);
    };
    im.onerror = () => { if (typeof src !== 'string') URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
  });
}

/* ---------------- finding the board ---------------- */
function lum(cv, w, h) {
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = .299 * d[j] + .587 * d[j + 1] + .114 * d[j + 2];
  return g;
}
function boxBlur(a, w, h) { const o = new Float32Array(a.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) { s += a[Y * w + X]; c++; } } o[y * w + x] = s / c; } return o; }
/* best set of 9 evenly spaced lines along one axis */
function fitLines(p, n) {
  const mean = p.reduce((a, b) => a + b, 0) / n || 1, at = x => { const i = Math.round(x); return Math.max(p[i - 1] || 0, p[i] || 0, p[i + 1] || 0); };
  let best = { s: 0, o: 0, per: n / 8 };
  for (let per = Math.max(6, n / 40); per <= n / 7.95; per += .5)
    for (let o = 0; o + 8 * per < n; o++) {
      let s = 0, lo = Infinity;
      for (let k = 0; k <= 8; k++) { const v = at(o + k * per); s += v; if (k > 0 && k < 8) lo = Math.min(lo, v); }
      s = (s / 9 + lo) / 2 / mean * (1 + per * 8 / n * .35);
      if (s > best.s) best = { s, o, per };
    }
  return best;
}
function findBoard(src) {
  const k = Math.min(1, 700 / Math.max(src.width, src.height)), w = Math.max(16, Math.round(src.width * k)), h = Math.max(16, Math.round(src.height * k));
  const sm = document.createElement('canvas'); sm.width = w; sm.height = h; sm.getContext('2d').drawImage(src, 0, 0, w, h);
  const g = boxBlur(boxBlur(lum(sm, w, h), w, h), w, h);
  // integral image for fast averages
  const W = w + 1, I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
  const avg = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(w, Math.round(x1)); y1 = Math.min(h, Math.round(y1)); const a = (x1 - x0) * (y1 - y0); return a > 0 ? (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / a : 0; };
  // how strongly an 8×8 grid at (ox, oy) with square size p alternates light and dark
  const score = (ox, oy, p) => {
    let a = 0, b = 0, m = p * .12;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const v = avg(ox + c * p + m, oy + r * p + m, ox + (c + 1) * p - m, oy + (r + 1) * p - m); if ((r + c) & 1) b += v; else a += v; }
    return Math.abs(a - b) / 32;
  };
  let best = { s: 0 };
  const minP = Math.max(5, Math.min(w, h) / 40), maxP = Math.min(w, h) / 8;
  for (let p = minP; p <= maxP; p *= 1.04) {
    const st = Math.max(1, p / 4);
    for (let oy = 0; oy + 8 * p <= h; oy += st) for (let ox = 0; ox + 8 * p <= w; ox += st) { const v = score(ox, oy, p) * (1 + p / maxP * .08); if (v > best.s) best = { s: v, ox, oy, p }; }
  }
  if (best.s) { // fine-tune position and size
    for (let pass = 0; pass < 3; pass++) {
      const b0 = Object.assign({}, best), dp = b0.p * .05, dd = b0.p / 4;
      for (let p = b0.p - dp; p <= b0.p + dp; p += Math.max(.25, dp / 6))
        for (let oy = b0.oy - dd; oy <= b0.oy + dd; oy += .5) for (let ox = b0.ox - dd; ox <= b0.ox + dd; ox += .5) {
          if (ox < -1 || oy < -1 || ox + 8 * p > w + 1 || oy + 8 * p > h + 1) continue;
          const v = score(ox, oy, p) * (1 + p / maxP * .08); if (v > best.s) best = { s: v, ox, oy, p };
        }
    }
  }
  if (best.s > 18) { // snap to the real square edges
    const x0 = Math.max(0, Math.floor(best.ox - best.p)), x1 = Math.min(w - 1, Math.ceil(best.ox + 9 * best.p)), y0 = Math.max(0, Math.floor(best.oy - best.p)), y1 = Math.min(h - 1, Math.ceil(best.oy + 9 * best.p));
    const cp = new Float32Array(w), rp = new Float32Array(h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; cp[x] += Math.abs(g[i + 1] - g[i]); rp[y] += Math.abs(g[i + w] - g[i]); }
    const pk = (pr, v) => { const i = Math.round(v); return Math.max(pr[i - 1] || 0, pr[i] || 0, pr[i + 1] || 0); };
    const line = (pr, o, p) => { let t = 0; for (let j = 0; j <= 8; j++) t += pk(pr, o + j * p); return t; };
    let bb = { v: -1 };
    for (let p = best.p * .95; p <= best.p * 1.05; p += .25) for (let d = -best.p / 3; d <= best.p / 3; d += .5) {
      const vx = line(cp, best.ox + d, p); if (vx > bb.v) bb = { v: vx, ox: best.ox + d, p };
    }
    let by = { v: -1 };
    for (let d = -best.p / 3; d <= best.p / 3; d += .5) { const vy = line(rp, best.oy + d, bb.p); if (vy > by.v) by = { v: vy, oy: best.oy + d }; }
    best = Object.assign(best, { ox: bb.ox, oy: by.oy, p: bb.p });
  }
  const ok = best.s > 18;
  const r = ok ? { x: best.ox / k, y: best.oy / k, w: 8 * best.p / k, h: 8 * best.p / k }
    : (() => { const m = Math.min(src.width, src.height) * .9; return { x: (src.width - m) / 2, y: (src.height - m) / 2, w: m, h: m }; })();
  return { r, ok, s: best.s };
}

/* ---------------- reading one square ---------------- */
function blur(a, n) { const o = new Float32Array(a.length); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < n && Y < n) { s += a[Y * n + X]; c++; } } o[y * n + x] = s / c; } return o; }
function median(v) { v.sort((a, b) => a - b); return v[v.length >> 1]; }
/* L: raw brightness of one S×S square. Returns null when empty, else outline features. */
function analyse(L, forceBg, edge) {
  const n = S, Lb = blur(blur(L, n), n), cs = [];
  if (forceBg != null) cs.push(forceBg);
  else for (const [cx, cy] of [[6, 6], [n - 11, 6], [6, n - 11], [n - 11, n - 11]]) for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) cs.push(Lb[(cy + y) * n + cx + x]);
  const bg = median(cs), mask = new Uint8Array(n * n);
  // how busy the square's own background is (plain colour, or hatching in printed books)
  let rlo = 255, rhi = 0;
  if (forceBg != null) { rlo = rhi = forceBg; } else for (const [cx, cy] of [[6, 6], [n - 11, 6], [6, n - 11], [n - 11, n - 11]]) for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const v = L[(cy + y) * n + cx + x]; rlo = Math.min(rlo, v); rhi = Math.max(rhi, v); }
  const raw = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) raw[i] = Math.abs(Lb[i] - bg) > 26 || (rhi - rlo < 60 && (L[i] < rlo - 60 || L[i] > rhi + 60)) ? 1 : 0;
  // thicken by one pixel so thin outlines have no gaps
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let v = 0; for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < n && Y < n && raw[Y * n + X]) { v = 1; break; } } mask[y * n + x] = v; }
  const mg = forceBg != null ? 1 : 4, cz = 10;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (x < mg || y < mg || x >= n - mg || y >= n - mg) mask[y * n + x] = 0;
    // coordinates are printed in the corners of edge squares
    else if (edge && (x < cz || x >= n - cz) && (y < cz || y >= n - cz)) mask[y * n + x] = 0;
  }
  // the outside is everything reachable from the edge without crossing the piece's outline
  const out = new Uint8Array(n * n), st = [];
  for (let i = 0; i < n; i++) st.push(i, (n - 1) * n + i, i * n, i * n + n - 1);
  while (st.length) { const i = st.pop(); if (out[i] || mask[i]) continue; out[i] = 1; const x = i % n, y = (i / n) | 0; if (x > 0) st.push(i - 1); if (x < n - 1) st.push(i + 1); if (y > 0) st.push(i - n); if (y < n - 1) st.push(i + n); }
  // keep the largest solid blob (drops coordinate letters and specks)
  const lab = new Int32Array(n * n); let best = 0, bestN = 0, id = 0;
  for (let s0 = 0; s0 < n * n; s0++) {
    if (out[s0] || lab[s0]) continue; id++; let cnt = 0; const q = [s0]; lab[s0] = id;
    while (q.length) { const i = q.pop(); cnt++; const x = i % n, y = (i / n) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, y > 0 ? i - n : -1, y < n - 1 ? i + n : -1]) if (j >= 0 && !out[j] && !lab[j]) { lab[j] = id; q.push(j); } }
    if (cnt > bestN) { bestN = cnt; best = id; }
  }
  const area = bestN / (n * n);
  if (area < .07) return null;
  let x0 = n, y0 = n, x1 = 0, y1 = 0, dark = 0, sum = 0;
  const inn = i => { const x = i % n, y = (i / n) | 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= n || Y >= n || lab[Y * n + X] !== best) return false; } return true; };
  for (let i = 0; i < n * n; i++) if (lab[i] === best) { const x = i % n, y = (i / n) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); if (inn(i)) { sum++; if (L[i] < 105) dark++; } }
  if (!sum) { for (let i = 0; i < n * n; i++) if (lab[i] === best) { sum++; if (L[i] < 105) dark++; } }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw < n * .18 || bh < n * .22) return null;
  // shape on a G×G grid, scaled by the larger side and centred
  const f = new Float32Array(G * G), sc = Math.max(bw, bh) / G, ox = (G * sc - bw) / 2, oy = (G * sc - bh) / 2;
  for (let i = 0; i < n * n; i++) if (lab[i] === best) { const gx = Math.min(G - 1, Math.floor((i % n - x0 + ox) / sc)), gy = Math.min(G - 1, Math.floor((((i / n) | 0) - y0 + oy) / sc)); f[gy * G + gx] += 1 / (sc * sc); }
  for (let i = 0; i < f.length; i++) f[i] = Math.min(1, f[i]);
  return { f, area, w: bw / n, h: bh / n, black: dark / sum > .5 };
}
function dist(a, t) { let d = 0; for (let i = 0; i < G * G; i++) d += Math.abs(a.f[i] - t.f[i]); return d / (G * G) + Math.abs(a.w / a.h - t.w / t.h) * .25 + (a.rh != null && t.rh != null ? Math.abs(a.rh - t.rh) * .9 : 0); }
const relHeights = list => { const hs = list.filter(Boolean).map(x => x.h).sort((p, q) => q - p); const top = hs.length ? hs[Math.min(1, hs.length - 1)] : 1; list.forEach(x => { if (x) x.rh = Math.min(1.1, x.h / top); }); };

/* ---------------- reference outlines ---------------- */
let TPL = null;
async function templates() {
  if (TPL) return TPL;
  TPL = [];
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d', { willReadFrequently: true });
  let set = [];
  const add = (t, draw) => { cx.fillStyle = '#fff'; cx.fillRect(0, 0, S, S); draw(); const a = analyse(lum(cv, S, S), 255); if (a) set.push(Object.assign(a, { t })); };
  const done = () => { relHeights(set); TPL.push(...set); set = []; };
  const img = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  for (const c of 'wb') { const ims = {}; for (const t of TYPES) ims[t] = await img('img/pieces/' + c + t + '.svg');
    for (const z of [.95, .8]) { for (const t of TYPES) if (ims[t]) add(t, () => cx.drawImage(ims[t], S * (1 - z) / 2, S * (1 - z) / 2, S * z, S * z)); done(); } }
  const glyph = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  for (const fam of ['"Noto Sans Symbols 2"', '"Segoe UI Symbol"', '"DejaVu Sans"', 'serif'])
    { for (const t of TYPES) add(t, () => { cx.fillStyle = '#000'; cx.font = `${S * .82}px ${fam}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(glyph[t] + '︎', S / 2, S * .52); }); done(); }
  return TPL;
}

/* ---------------- reading the whole board ---------------- */
async function readBoard(src, r) {
  const tpl = await templates(), N = 8 * S;
  const bc = document.createElement('canvas'); bc.width = bc.height = N;
  const bx = bc.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingQuality = 'high'; bx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, N, N);
  const all = lum(bc, N, N), cells = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const L = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) L[y * S + x] = all[(row * S + y) * N + col * S + x];
    const a = analyse(L, null, row === 0 || row === 7 || col === 0 || col === 7); if (a) Object.assign(a, { row, col });
    cells.push(a);
  }
  relHeights(cells);
  cells.forEach((a, k) => {
    if (!a) return;
    const per = {}; for (const t of tpl) { const d = dist(a, t); if (per[t.t] == null || d < per[t.t]) per[t.t] = d; }
    const rank = Object.entries(per).sort((x, y) => x[1] - y[1]);
    cells[k] = { c: a.black ? 'b' : 'w', per, t: rank[0][0], conf: rank.length > 1 ? (rank[1][1] - rank[0][1]) / rank[1][1] : 1, row: a.row, col: a.col };
  });
  // white usually sits at the bottom; if most white pieces are near the top, the diagram is from Black's side
  const avg = c => { const v = cells.filter(x => x && x.c === c).map(x => x.row); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 3.5; };
  const flipped = avg('w') < avg('b') - .5;
  return fix(cells, flipped);
}
/* turn the readings into a legal-looking position: one king each, no pawns on the first or last rank */
function fix(cells, flipped) {
  const b = new Array(64).fill(null), unsure = new Set(), at = [];
  cells.forEach((x, k) => { if (!x) return; let row = (k / 8) | 0, col = k % 8; if (flipped) { row = 7 - row; col = 7 - col; } const i = (7 - row) * 8 + col; at[i] = x; b[i] = x.c + x.t; if (x.conf < .08) unsure.add(i); });
  const nextBest = (x, not) => Object.entries(x.per).filter(([t]) => !not.includes(t)).sort((p, q) => p[1] - q[1])[0][0];
  for (const c of 'wb') {
    const ks = b.map((p, i) => p === c + 'K' ? i : -1).filter(i => i >= 0);
    if (ks.length > 1) { ks.sort((i, j) => at[i].per.K - at[j].per.K); ks.slice(1).forEach(i => { b[i] = c + nextBest(at[i], ['K']); unsure.add(i); }); }
    if (!ks.length) { const cand = b.map((p, i) => p && p[0] === c ? i : -1).filter(i => i >= 0).sort((i, j) => at[i].per.K - at[j].per.K)[0]; if (cand != null && at[cand].per.K < at[cand].per[b[cand][1]] * 1.35) { b[cand] = c + 'K'; unsure.add(cand); } }
  }
  for (let i = 0; i < 64; i++) if (b[i] && b[i][1] === 'P' && (i < 8 || i >= 56)) { b[i] = b[i][0] + nextBest(at[i], ['P', 'K']); unsure.add(i); }
  return { b, unsure, flipped };
}
function guessCastle(b) { return { wK: b[4] === 'wK' && b[7] === 'wR', wQ: b[4] === 'wK' && b[0] === 'wR', bK: b[60] === 'bK' && b[63] === 'bR', bQ: b[60] === 'bK' && b[56] === 'bR' }; }
function toFen(b, turn, castle) { return C.fen({ b, turn, castle, ep: null, half: 0, full: 1 }); }
function problems(b, turn) {
  const out = [], n = p => b.filter(x => x === p).length;
  if (n('wK') !== 1) out.push(n('wK') ? 'There are two white kings.' : 'White has no king.');
  if (n('bK') !== 1) out.push(n('bK') ? 'There are two black kings.' : 'Black has no king.');
  if (b.some((p, i) => p && p[1] === 'P' && (i < 8 || i >= 56))) out.push('A pawn is on the first or last rank.');
  if (!out.length) { const p = { b, turn, castle: {}, ep: null }; if (C.inCheck(p, turn === 'w' ? 'b' : 'w')) out.push((turn === 'w' ? 'Black' : 'White') + ' is in check but it\'s ' + (turn === 'w' ? 'White' : 'Black') + '\'s move. Check who is to move.'); }
  return out;
}

/* ---------------- the window ---------------- */
let U = null;
function open(onFen, opts, file) {
  U = { onFen, step: 'pick', src: null, doc: null, page: 1, pages: 1, r: null, found: false, b: null, unsure: new Set(), turn: 'w', castle: {}, tool: 'wK', view: false, msg: '', busy: false, title: (opts && opts.title) || 'Position from a picture or PDF', cta: (opts && opts.cta) || 'Load on the board' };
  const m = $('modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(U.title)}"><div class="box glass wide" id="scBox"></div></div>`;
  m.querySelector('.modal').addEventListener('click', e => { if (e.target.classList.contains('modal')) close(); });
  document.addEventListener('keydown', esc1); document.addEventListener('paste', onPaste);
  render();
  if (file) takeFile(file);
}
function close() { $('modal').innerHTML = ''; document.removeEventListener('keydown', esc1); document.removeEventListener('paste', onPaste); U = null; }
const esc1 = e => { if (e.key === 'Escape') close(); };
function onPaste(e) { if (!U || U.step !== 'pick') return; const f = [...(e.clipboardData || {}).files || []].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); takeFile(f); } }
async function takeFile(f) {
  if (!f) return;
  U.busy = true; U.msg = ''; render();
  try {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) { U.doc = await openPdf(f); U.pages = U.doc.numPages; U.page = 1; U.src = await pdfPage(U.doc, 1); }
    else if (/^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || '')) { U.doc = null; U.src = await imageCanvas(f); }
    else throw new Error('type');
    locate();
  } catch (e) { U.msg = e.message === 'type' ? 'Choose a picture (PNG, JPG, WebP) or a PDF.' : e.message === 'pdf' ? 'Couldn\'t open the PDF reader. Check your connection and try again.' : 'Couldn\'t open that file. Try a screenshot or another file.'; U.step = 'pick'; }
  U.busy = false; render();
}
function locate() { const f = findBoard(U.src); U.r = f.r; U.found = f.ok; U.step = 'crop'; }
async function goPage(n) { if (!U.doc || n < 1 || n > U.pages) return; U.busy = true; render(); U.page = n; U.src = await pdfPage(U.doc, n); locate(); U.busy = false; render(); }
async function read() {
  U.busy = true; render();
  const res = await readBoard(U.src, U.r);
  Object.assign(U, { b: res.b, unsure: res.unsure, view: res.flipped, turn: 'w', castle: guessCastle(res.b), step: 'review', busy: false });
  U.msg = res.flipped ? 'This diagram looks like it\'s drawn from Black\'s side, so it has been turned around.' : '';
  render();
}
function render() {
  const box = $('scBox'); if (!box || !U) return;
  const head = `<div class="row sc-head"><h3>${esc(U.title)}</h3><button class="btn small alt" id="scX" aria-label="Close">✕</button></div>
    <ol class="sc-steps">${[['pick', 'Choose a file'], ['crop', 'Check the board'], ['review', 'Fix and load']].map(([k, l], i) => `<li class="${U.step === k ? 'on' : ''}">${i + 1}. ${l}</li>`).join('')}</ol>`;
  if (U.step === 'pick') {
    box.innerHTML = head + `<label class="drop" id="scDrop"><input type="file" accept="image/*,application/pdf,.pdf" id="scFile" hidden>
      <span class="ic"><svg><use href="#i-deck"/></svg></span><b>${U.busy ? 'Opening…' : 'Drop a picture or PDF here'}</b>
      <span class="muted">or <u>choose a file</u> · you can also paste a screenshot (Ctrl+V)</span></label>
      ${U.msg ? `<p class="note bad">${esc(U.msg)}</p>` : ''}
      <ul class="ticks small"><li>Works best with a screenshot or a book diagram where the whole board is visible</li><li>For PDFs, pick the page with the diagram in the next step</li><li>You'll check every square before anything is loaded</li></ul>`;
    const dz = $('scDrop'), fi = $('scFile');
    fi.onchange = () => takeFile(fi.files[0]);
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); takeFile(e.dataTransfer.files[0]); };
  } else if (U.step === 'crop') {
    box.innerHTML = head + `<p class="muted" style="margin:0">${U.found ? 'Found the board. Check that the grid lines up with the squares, and drag the box or its corners if not.' : 'Drag the box over the board so its 8×8 grid lines up with the squares. Use the corners to resize.'}</p>
      ${U.doc ? `<div class="row"><button class="btn small alt" id="scPrev" ${U.page <= 1 ? 'disabled' : ''}>← Page</button><span class="muted">Page ${U.page} of ${U.pages}</span><button class="btn small alt" id="scNext" ${U.page >= U.pages ? 'disabled' : ''}>Page →</button></div>` : ''}
      <div class="cropwrap" id="scScroll"><div class="cropin" id="scWrap"><div class="crop" id="scCrop"><i class="h tl"></i><i class="h tr"></i><i class="h bl"></i><i class="h br"></i></div></div></div>
      <div class="btns"><button class="btn" id="scRead" ${U.busy ? 'disabled' : ''}>${U.busy ? 'Reading…' : 'Read the position →'}</button><button class="btn alt" id="scBack">Choose another file</button></div>`;
    const wrap = $('scWrap'); U.src.className = 'srcimg'; wrap.prepend(U.src);
    placeCrop(); wireCrop();
    requestAnimationFrame(() => { const sc = $('scScroll'), c = $('scCrop'); if (sc && c) sc.scrollTop = Math.max(0, c.offsetTop - 24); });
    $('scRead').onclick = read; $('scBack').onclick = () => { U.step = 'pick'; render(); };
    const pv = $('scPrev'), nx = $('scNext'); pv && (pv.onclick = () => goPage(U.page - 1)); nx && (nx.onclick = () => goPage(U.page + 1));
  } else {
    const probs = problems(U.b, U.turn), fen = toFen(U.b, U.turn, U.castle);
    box.innerHTML = head + `<div class="sc-review">
      <div><div class="boardbox"><div class="board" id="scBoard" aria-label="Position to check"></div></div>
        <p class="muted small" style="margin:8px 0 0">${U.unsure.size ? `<span class="unsure-key"></span> ${U.unsure.size} square${U.unsure.size > 1 ? 's' : ''} to double-check. ` : ''}Pick a piece below, then tap a square to place it. Tap again with the same piece to clear it.</p>
        <div class="palette" role="group" aria-label="Pieces">${['w', 'b'].map(c => TYPES.split('').map(t => `<button class="pal${U.tool === c + t ? ' on' : ''}" data-tool="${c + t}" aria-label="${c === 'w' ? 'White' : 'Black'} ${NAME[t]}"><span class="pc p-${c + t}"></span></button>`).join('')).join('')}<button class="pal${U.tool === 'x' ? ' on' : ''}" data-tool="x" aria-label="Eraser">⌫</button></div></div>
      <div class="sc-side">
        ${U.msg ? `<p class="note">${esc(U.msg)}</p>` : ''}
        <div class="row"><span class="lbl">To move</span><div class="seg" role="group" aria-label="Side to move"><button data-turn="w" class="${U.turn === 'w' ? 'on' : ''}">White</button><button data-turn="b" class="${U.turn === 'b' ? 'on' : ''}">Black</button></div></div>
        <div class="row"><span class="lbl">Castling</span>${[['wK', 'White O-O'], ['wQ', 'White O-O-O'], ['bK', 'Black O-O'], ['bQ', 'Black O-O-O']].map(([k, l]) => `<label class="chk small"><input type="checkbox" data-cs="${k}" ${U.castle[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <div class="btns"><button class="btn small alt" id="scFlip">Turn board around</button><button class="btn small alt" id="scClear">Clear</button><button class="btn small alt" id="scStart">Starting position</button></div>
        <label>Position code (FEN)<input id="scFen" value="${esc(fen)}" spellcheck="false"></label>
        ${probs.length ? `<p class="note bad">${probs.map(esc).join(' ')}</p>` : '<p class="note good">Looks like a legal position.</p>'}
        <div class="btns"><button class="btn" id="scGo" ${probs.length ? 'disabled' : ''}>${esc(U.cta)}</button><button class="btn alt" id="scRe">Back to the picture</button></div>
      </div></div>`;
    drawReview();
    box.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { U.tool = b.dataset.tool; box.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x === b)); });
    box.querySelectorAll('[data-turn]').forEach(b => b.onclick = () => { U.turn = b.dataset.turn; render(); });
    box.querySelectorAll('[data-cs]').forEach(b => b.onchange = () => { U.castle[b.dataset.cs] = b.checked; render(); });
    $('scFlip').onclick = () => { U.b = U.b.slice().reverse(); U.unsure = new Set([...U.unsure].map(i => 63 - i)); U.castle = guessCastle(U.b); U.msg = ''; render(); };
    $('scClear').onclick = () => { U.b = new Array(64).fill(null); U.unsure.clear(); U.castle = {}; render(); };
    $('scStart').onclick = () => { U.b = C.parse(C.START).b; U.unsure.clear(); U.castle = guessCastle(U.b); U.turn = 'w'; render(); };
    $('scFen').onchange = e => { try { const p = C.parse(e.target.value); if (p.b.length === 64) { U.b = p.b; U.turn = p.turn; U.castle = p.castle; U.unsure.clear(); } } catch (er) { } render(); };
    $('scRe').onclick = () => { U.step = 'crop'; render(); };
    $('scGo').onclick = () => { const f = toFen(U.b, U.turn, U.castle), cb = U.onFen; close(); cb(f); };
  }
  $('scX').onclick = close;
}
function drawReview() {
  const el = $('scBoard'); let h = '';
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const r = U.view ? row : 7 - row, f = U.view ? 7 - col : col, i = r * 8 + f, x = U.b[i];
    h += `<button type="button" class="sq${(r + f) % 2 === 0 ? ' d' : ''}${U.unsure.has(i) ? ' unsure' : ''}" data-i="${i}" aria-label="${C.sqName(i)}${x ? ', ' + (x[0] === 'w' ? 'white ' : 'black ') + NAME[x[1]] : ', empty'}">${col === 0 ? `<span class="c r">${r + 1}</span>` : ''}${row === 7 ? `<span class="c f">${'abcdefgh'[f]}</span>` : ''}${x ? `<span class="pc p-${x}"></span>` : ''}</button>`;
  }
  el.innerHTML = h;
  el.querySelectorAll('.sq').forEach(b => b.onclick = () => { const i = +b.dataset.i; U.b[i] = U.tool === 'x' || U.b[i] === U.tool ? null : U.tool; U.unsure.delete(i); U.castle = Object.assign(guessCastle(U.b), {}); render(); });
}
/* crop box: move it, or drag a corner to resize (kept square) */
function placeCrop() {
  const c = $('scCrop'), W = U.src.width, H = U.src.height, r = U.r;
  Object.assign(c.style, { left: r.x / W * 100 + '%', top: r.y / H * 100 + '%', width: r.w / W * 100 + '%', height: r.h / H * 100 + '%' });
}
function wireCrop() {
  const wrap = $('scWrap'), c = $('scCrop'); let d = null;
  const pt = e => { const b = wrap.getBoundingClientRect(), k = U.src.width / b.width; return { x: (e.clientX - b.left) * k, y: (e.clientY - b.top) * k }; };
  c.addEventListener('pointerdown', e => {
    e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (er) { }
    const h = e.target.classList.contains('h') ? [...e.target.classList].find(x => x.length === 2) : null;
    d = { p: pt(e), r: Object.assign({}, U.r), h };
  });
  c.addEventListener('pointermove', e => {
    if (!d) return; const p = pt(e), dx = p.x - d.p.x, dy = p.y - d.p.y, r0 = d.r, W = U.src.width, H = U.src.height;
    let r = Object.assign({}, r0);
    if (!d.h) { r.x = Math.max(-r0.w * .05, Math.min(W - r0.w * .95, r0.x + dx)); r.y = Math.max(-r0.h * .05, Math.min(H - r0.h * .95, r0.y + dy)); }
    else {
      const sx = d.h[1] === 'l' ? -1 : 1, sy = d.h[0] === 't' ? -1 : 1, size = Math.max(24, Math.max(r0.w + sx * dx, r0.h + sy * dy));
      r.w = r.h = size; r.x = sx < 0 ? r0.x + r0.w - size : r0.x; r.y = sy < 0 ? r0.y + r0.h - size : r0.y;
    }
    U.r = r; placeCrop();
  });
  const end = () => { d = null; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  c.tabIndex = 0; c.setAttribute('aria-label', 'Board area. Arrow keys move it; Shift with arrows resizes.');
  c.addEventListener('keydown', e => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!k) return; e.preventDefault();
    const st = Math.max(1, U.src.width / 300);
    if (e.shiftKey) { U.r.w = U.r.h = Math.max(24, U.r.w + (k[0] || k[1]) * st); } else { U.r.x += k[0] * st; U.r.y += k[1] * st; }
    placeCrop();
  });
}

M.scanOpen = open;
M.scanTest = { imageCanvas, findBoard, readBoard, toFen, templates, analyse, lum, S };
}
