/* MoonChess — coaching: classroom, board marks, Lesson Replay, Mistake Deck, homework, Parent Pulse, schedule, skill map. */
{
const M = window.MC, C = M.C, K = M.K, P = window.PGN, esc = M.esc, GLYPH = M.GLYPH, PNAME = M.PNAME;
const $ = id => document.getElementById(id);
const S = () => M.S;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtT = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayFromStr = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const niceDate = s => dayFromStr(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const sw = (id, on, label) => `<button class="sw" role="switch" aria-checked="${!!on}" id="${id}" aria-label="${esc(label)}"></button>`;
const seg = (name, opts, cur, label) => `<div class="seg glass" role="group" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button data-${name}="${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;

/* ---------------- audio store and voice notes ---------------- */
const IDB = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((res, rej) => { try { const r = indexedDB.open('moonchess', 1); r.onupgradeneeded = () => r.result.createObjectStore('audio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
    return this.db;
  },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('audio', mode), st = t.objectStore('audio'), q = fn(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); },
  put(k, v) { return this.tx('readwrite', s => s.put(v, k)).catch(() => null); },
  get(k) { return this.tx('readonly', s => s.get(k)).catch(() => null); },
  del(k) { return this.tx('readwrite', s => s.delete(k)).catch(() => null); }
};
async function startVoice() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.start();
  return { stop: () => new Promise(res => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); }; rec.stop(); }) };
}
/* a record / re-record button with a player; calls back with the blob */
function voiceWidget(el, onBlob) {
  let r = null, t0 = 0, tick = null;
  el.innerHTML = `<div class="voice"><button class="btn small alt" type="button">● Record voice note</button><span class="muted vt"></span><audio controls hidden></audio></div>`;
  const b = el.querySelector('button'), vt = el.querySelector('.vt'), au = el.querySelector('audio');
  b.onclick = async () => {
    if (r) { clearInterval(tick); const blob = await r.stop(); r = null; b.textContent = '● Record again'; b.classList.remove('rec'); vt.textContent = ''; au.src = URL.createObjectURL(blob); au.hidden = false; onBlob(blob); return; }
    try { r = await startVoice(); } catch (e) { vt.textContent = 'Microphone not available here. Type your note instead.'; return; }
    t0 = Date.now(); b.textContent = '■ Stop'; b.classList.add('rec');
    tick = setInterval(() => { vt.textContent = 'Recording ' + fmtT((Date.now() - t0) / 1000); if (Date.now() - t0 > 180000) b.click(); }, 250);
  };
}
async function playStored(key, el) {
  const blob = await IDB.get(key);
  el.innerHTML = blob ? `<audio controls src="${URL.createObjectURL(blob)}"></audio>` : '<span class="muted">Voice note not on this device.</span>';
}

/* ---------------- marks overlay: arrows, highlights, laser, candidates, poll heatmap ---------------- */
function arrowPath(a, b, w) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const hl = Math.min(.42, L * .5), hw = w * 2.6, s = { x: a.x + ux * .22, y: a.y + uy * .22 }, e = { x: b.x - ux * hl, y: b.y - uy * hl };
  const Q = (p, k) => (p.x + px * k).toFixed(3) + ',' + (p.y + py * k).toFixed(3);
  return `M${Q(s, w / 2)}L${Q(e, w / 2)}L${Q(e, hw / 2)}L${b.x.toFixed(3)},${b.y.toFixed(3)}L${Q(e, -hw / 2)}L${Q(e, -w / 2)}L${Q(s, -w / 2)}Z`;
}
class Marks {
  constructor(svg) {
    Object.assign(this, { svg, flip: false, tool: 'move', arrows: [], highs: [], cands: [], poll: null, engine: null, pending: null, laser: [], tmp: null, onChange: null, onCand: null, pos: null, raf: 0 });
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.addEventListener('pointerdown', e => this.down(e));
    svg.addEventListener('contextmenu', e => e.preventDefault());
    svg.addEventListener('pointermove', e => this.mv(e));
    svg.addEventListener('pointerup', e => this.up(e));
    svg.addEventListener('pointercancel', () => { this.tmp = null; this.drag = null; this.render(); });
  }
  setTool(t) { this.tool = t; this.svg.classList.toggle('draw', t !== 'move'); }
  xy(i) { const f = i & 7, r = i >> 3; return this.flip ? { x: 7 - f + .5, y: r + .5 } : { x: f + .5, y: 7 - r + .5 }; }
  pt(e) { const r = this.svg.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 8, y: (e.clientY - r.top) / r.height * 8 }; }
  sq(p) { if (p.x < 0 || p.y < 0 || p.x >= 8 || p.y >= 8) return null; let f = Math.floor(p.x), r = 7 - Math.floor(p.y); if (this.flip) { f = 7 - f; r = 7 - r; } return r * 8 + f; }
  down(e) {
    if (this.tool === 'move') return;
    e.preventDefault(); try { this.svg.setPointerCapture(e.pointerId); } catch (er) { }
    const p = this.pt(e); this.drag = { s: this.sq(p) };
    if (this.tool === 'laser') { this.laser.push({ x: p.x, y: p.y, t: performance.now(), brk: true }); this.loop(); this.onLaser && this.onLaser(p, true); }
  }
  mv(e) {
    if (!this.drag) return;
    const p = this.pt(e);
    if (this.tool === 'laser') { this.laser.push({ x: p.x, y: p.y, t: performance.now() }); this.onLaser && this.onLaser(p, false); return; }
    const s = this.sq(p);
    this.tmp = s != null && s !== this.drag.s && this.drag.s != null ? [this.drag.s, s] : null; this.render();
  }
  up(e) {
    const d = this.drag; this.drag = null; this.tmp = null; if (!d || this.tool === 'laser') return;
    const s = this.sq(this.pt(e)); if (d.s == null || s == null) return this.render();
    if (this.tool === 'cand') { if (s !== d.s) this.onCand && this.onCand(d.s, s); return this.render(); }
    if (s === d.s) { const k = this.highs.indexOf(s); k >= 0 ? this.highs.splice(k, 1) : this.highs.push(s); }
    else { const k = this.arrows.findIndex(a => a[0] === d.s && a[1] === s); k >= 0 ? this.arrows.splice(k, 1) : this.arrows.push([d.s, s, e.shiftKey ? 'r' : e.altKey ? 'b' : (e.ctrlKey || e.metaKey) ? 'y' : 'g']); }
    this.render(); this.onChange && this.onChange();
  }
  clear() { this.arrows.length = 0; this.highs.length = 0; this.render(); this.onChange && this.onChange(); }
  loop() {
    if (this.raf) return;
    const f = () => { const now = performance.now(); this.laser = this.laser.filter(p => now - p.t < 2600); this.render(); this.raf = this.laser.length ? requestAnimationFrame(f) : 0; };
    this.raf = requestAnimationFrame(f);
  }
  render() {
    let h = '';
    const box = (i, fill, op) => { const p = this.xy(i); return `<rect x="${p.x - .5}" y="${p.y - .5}" width="1" height="1" fill="${fill}" opacity="${op}"/>`; };
    const arr = (a, col, w, op, extra) => `<path d="${arrowPath(this.xy(a[0]), this.xy(a[1]), w)}" fill="${col}" opacity="${op}" ${extra || ''}/>`;
    this.highs.forEach(i => { h += box(i, '#ffd84a', .42); });
    if (this.poll) {
      const tot = Object.values(this.poll).reduce((a, b) => a + b, 0) || 1, to = {};
      for (const u in this.poll) { const t = C.sqIdx(u.slice(2, 4)); to[t] = (to[t] || 0) + this.poll[u]; }
      for (const t in to) h += box(+t, '#ff4fd8', (.18 + .62 * to[t] / tot).toFixed(2));
      Object.entries(this.poll).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([u, n]) => {
        const a = [C.sqIdx(u.slice(0, 2)), C.sqIdx(u.slice(2, 4))], q = this.xy(a[1]);
        h += arr(a, '#ff4fd8', .1 + .16 * n / tot, .85);
        h += `<text x="${q.x}" y="${q.y - .3}" class="mt">${Math.round(n / tot * 100)}%</text>`;
      });
    }
    const AC = { g: '#2fa86a', r: '#d9364a', b: '#2f6fe0', y: '#f0b400' };
    this.arrows.forEach(a => { h += arr(a, AC[a[2]] || '#ffd84a', .17, .88); });
    if (this.engine) h += arr(this.engine, '#3ef2ff', .14, .8);
    if (this.pending) h += arr(this.pending, '#8a5cff', .2, .95);
    this.cands.forEach((a, k) => { const q = this.xy(a[1]); h += arr(a, '#6dffc4', .15, .9) + `<circle cx="${q.x}" cy="${q.y}" r=".22" fill="#0b1240" stroke="#6dffc4" stroke-width=".05"/><text x="${q.x}" y="${q.y + .1}" class="mt">${k + 1}</text>`; });
    if (this.tmp) h += arr(this.tmp, this.tool === 'cand' ? '#6dffc4' : '#ffd84a', .15, .5);
    if (this.laser.length) {
      const now = performance.now(); let d = '';
      this.laser.forEach(p => { d += (p.brk ? 'M' : 'L') + p.x.toFixed(2) + ',' + p.y.toFixed(2); });
      const age = now - this.laser[this.laser.length - 1].t;
      h += `<path d="${d}" class="laser" opacity="${Math.max(0, 1 - age / 2600).toFixed(2)}"/>`;
    }
    this.svg.innerHTML = h;
  }
}
const boardHtml = (id, mid) => `<div class="bwrap"><div class="board" id="${id}" aria-label="Chess board"></div><svg class="marks" id="${mid}" aria-hidden="true"></svg></div>`;

/* ---------------- Lesson Replay ---------------- */
const DEMO_FEN = 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
const sq = C.sqIdx;
const DEMO = { id: 'demo', title: 'The bait on d4', coach: 'Sample lesson', date: '', dur: 60, demo: true, ev: [
  { t: 0, k: 'pos', fen: DEMO_FEN }, { t: 0, k: 'ch', x: 'The bait' },
  { t: 0, k: 'cap', x: 'Black has just played Nd4. It looks like a free pawn on e5 for White.' },
  { t: 3, k: 'mk', a: [[sq('f3'), sq('e5')]], h: [] }, { t: 6, k: 'mk', a: [[sq('f3'), sq('e5')]], h: [sq('e5')] },
  { t: 9, k: 'cap', x: 'Lots of students grab it straight away. Watch what happens next.' },
  { t: 12, k: 'mk', a: [], h: [] }, { t: 13, k: 'mv', u: 'f3e5' },
  { t: 16, k: 'ch', x: 'The trap springs' }, { t: 16, k: 'mv', u: 'd8g5' },
  { t: 17, k: 'cap', x: 'Qg5 attacks the knight on e5 and the pawn on g2 at the same time.' },
  { t: 18, k: 'mk', a: [[sq('g5'), sq('g2')], [sq('g5'), sq('e5')]], h: [] },
  { t: 23, k: 'mk', a: [], h: [] }, { t: 23, k: 'mv', u: 'e5f7' },
  { t: 24, k: 'cap', x: 'White keeps grabbing: Nxf7 forks the queen and the rook...' },
  { t: 27, k: 'mv', u: 'g5g2' }, { t: 28, k: 'cap', x: '...but Black ignores it. Qxg2 hits the rook on h1.' },
  { t: 31, k: 'mv', u: 'h1f1' }, { t: 33, k: 'mv', u: 'g2e4' }, { t: 34, k: 'cap', x: 'Qxe4 is check. Only Be2 or Qe2 can block.' },
  { t: 37, k: 'mv', u: 'c4e2' }, { t: 39, k: 'mv', u: 'd4f3' },
  { t: 40, k: 'cap', x: 'Nf3 is checkmate. The king is boxed in by its own pieces.' }, { t: 40, k: 'mk', a: [], h: [sq('e1')] },
  { t: 45, k: 'ch', x: 'The calm reply' }, { t: 45, k: 'pos', fen: DEMO_FEN }, { t: 45, k: 'mk', a: [[sq('f3'), sq('d4')]], h: [] },
  { t: 45, k: 'cap', x: 'Rewind. The calm move is Nxd4: swap off the knight that set the trap.' },
  { t: 50, k: 'mk', a: [], h: [] }, { t: 50, k: 'mv', u: 'f3d4' }, { t: 52, k: 'mv', u: 'e5d4' },
  { t: 53, k: 'cap', x: 'After exd4 White is comfortable. Rule of thumb: check every free piece before you take it.' },
  { t: 57, k: 'cap', x: 'Pause any time and try the moves yourself.' }
] };
/* turn an event list into snapshots: what the board looks like after each event */
function snapshots(rp) {
  const out = []; let pos = C.parse(C.START), last = null, a = [], h = [], cap = '', ch = '', sans = [];
  for (const e of rp.ev) {
    if (e.k === 'pos') { pos = C.parse(e.fen); last = null; sans = []; }
    else if (e.k === 'mv') { const m = C.fromUci(pos, e.u); if (m) { sans.push(C.san(pos, m)); pos = C.make(pos, m); last = [m.from, m.to]; } }
    else if (e.k === 'mk') { a = e.a || []; h = e.h || []; }
    else if (e.k === 'cap') cap = e.x;
    else if (e.k === 'ch') ch = e.x;
    out.push({ t: e.t, pos, last, a, h, cap, ch, sans: sans.slice() });
  }
  return out;
}
const chaptersOf = rp => rp.ev.filter(e => e.k === 'ch').map(e => ({ t: e.t, x: e.x }));
function player(el, rp, opts) {
  opts = opts || {};
  const snaps = snapshots(rp), chs = chaptersOf(rp), dur = rp.dur || (snaps.length ? snaps[snaps.length - 1].t + 3 : 10);
  const bid = 'rb' + uid(), mid = 'rm' + uid();
  el.innerHTML = `<div class="rp">
    <div class="boardbox glass">${boardHtml(bid, mid)}</div>
    <div class="rpbar glass">
      <button class="btn small rpplay" aria-label="Play">▶</button>
      <input type="range" min="0" max="${dur}" step="0.1" value="0" aria-label="Replay position">
      <span class="rpt">0:00 / ${fmtT(dur)}</span>
    </div>
    <p class="rpcap" aria-live="polite"></p>
    <div class="row rpch">${chs.map(c => `<button class="chipbtn" data-t="${c.t}">${esc(c.x)} <span class="muted">${fmtT(c.t)}</span></button>`).join('')}</div>
    <div class="row rpctl">${seg('sp', [['1', '1×'], ['1.5', '1.5×'], ['2', '2×']], '1', 'Speed')}<button class="btn small alt rptry">Try it yourself</button></div>
    <p class="muted rpexp" hidden></p>
  </div>`;
  const B = new M.Board($(bid), m => explore(m)), MK = new Marks($(mid));
  const q = s => el.querySelector(s), range = q('input'), playB = q('.rpplay');
  let t = 0, playing = false, speed = 1, raf = 0, prev = 0, idx = -2, exp = null, audio = null, logged = false;
  if (rp.audio) IDB.get('rp-' + rp.id).then(b => { if (b) { audio = new Audio(URL.createObjectURL(b)); } });
  const flip = opts.flip || false; MK.flip = flip;
  function at(tt) { let k = -1; for (let i = 0; i < snaps.length; i++) if (snaps[i].t <= tt) k = i; else break; return k; }
  function draw(force) {
    const k = at(t); range.value = t; q('.rpt').textContent = fmtT(t) + ' / ' + fmtT(dur);
    if (k === idx && !force) return; idx = k;
    const s = snaps[k] || { pos: C.parse(snaps.length ? C.fen(snaps[0].pos) : C.START), last: null, a: [], h: [], cap: '', ch: '' };
    B.set(s.pos, { mine: s.pos.turn, locked: true, flip, last: s.last, hint: [] });
    MK.arrows = s.a.map(x => x.slice()); MK.highs = s.h.slice(); MK.render();
    q('.rpcap').textContent = s.cap || ' ';
    el.querySelectorAll('.rpch button').forEach(b => b.classList.toggle('on', s.ch && b.textContent.startsWith(s.ch)));
    if (k >= 0 && snaps[k].t > t - .25 && rp.ev[k] && rp.ev[k].k === 'mv' && playing) M.C && window.FX.sfx('move');
  }
  function frame(now) { if (!playing) return; t = Math.min(dur, t + (now - prev) / 1000 * speed); prev = now; draw(); if (t >= dur) return pause(); raf = requestAnimationFrame(frame); }
  function play() {
    if (exp) back();
    if (t >= dur) t = 0;
    playing = true; playB.textContent = '❚❚'; playB.setAttribute('aria-label', 'Pause'); prev = performance.now(); raf = requestAnimationFrame(frame);
    if (audio) { try { audio.currentTime = t; audio.playbackRate = speed; audio.play().catch(() => { }); } catch (e) { } }
    if (!logged && !rp.demo) { logged = true; M.logAct('replay', { id: rp.id }); M.store(); }
  }
  function pause() { playing = false; cancelAnimationFrame(raf); playB.textContent = '▶'; playB.setAttribute('aria-label', 'Play'); if (audio) audio.pause(); }
  function seek(tt) { t = Math.max(0, Math.min(dur, tt)); if (audio) try { audio.currentTime = t; } catch (e) { } if (exp) back(); draw(true); }
  function explore(m) {
    const p = exp.pos, san = C.san(p, m), a = C.make(p, m); B.fx(m); exp.pos = a; exp.sans.push(san);
    B.set(a, { mine: a.turn, last: [m.from, m.to], locked: false });
    q('.rpexp').textContent = 'Your line: ' + exp.sans.join(' ') + '. Tap "Back to replay" to continue the lesson.';
  }
  function tryIt() {
    if (exp) return back();
    pause(); const s = snaps[at(t)]; const pos = s ? s.pos : B.pos;
    exp = { pos, sans: [] }; MK.arrows = []; MK.highs = []; MK.render();
    B.set(pos, { mine: pos.turn, locked: false, hint: [] });
    q('.rptry').textContent = 'Back to replay'; const ex = q('.rpexp'); ex.hidden = false; ex.textContent = 'Your turn: move either side from here. The replay waits for you.';
  }
  function back() { exp = null; q('.rptry').textContent = 'Try it yourself'; q('.rpexp').hidden = true; draw(true); }
  playB.onclick = () => playing ? pause() : play();
  range.oninput = () => { pause(); seek(+range.value); };
  el.querySelectorAll('.rpch button').forEach(b => b.onclick = () => { seek(+b.dataset.t); if (!playing) play(); });
  el.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { speed = +b.dataset.sp; if (audio) audio.playbackRate = speed; el.querySelectorAll('[data-sp]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
  q('.rptry').onclick = tryIt;
  draw(true);
  return { play, pause, destroy() { pause(); if (audio) audio.pause(); } };
}
let RP = null, rpView = null;
function openReplay(id) { RP = id; M.go('replay'); }
function allReplays() { return S().replays.slice().reverse(); }
function vReplay() {
  const rp = RP === 'demo' ? DEMO : S().replays.find(r => r.id === RP);
  const V = $('v-replay');
  if (!rp) { V.innerHTML = `<h2 class="title">Lesson replays</h2>${replayList()}`; wireReplayList(V); return; }
  V.innerHTML = `<div class="row"><a class="btn alt small" href="#puzzles">← Practice</a><span class="muted">${rp.demo ? 'Sample lesson' : 'Recorded ' + niceDate(rp.date)}</span></div>
    <h2 class="title" style="margin-top:12px">${esc(rp.title)}</h2>
    <p class="lede">Scrub through the lesson like a video. Pause anywhere and press "Try it yourself" to play the moves on the board. Chapters are bookmarks.${rp.audio ? ' The coach\'s voice plays along.' : ''}</p>
    <div id="rpBox" class="rpwide"></div>`;
  rpView && rpView.destroy(); rpView = player($('rpBox'), rp);
}
function replayList() {
  const list = allReplays();
  return `<div class="list">${[DEMO].concat(list).map(r => `<button class="li glass" data-rp="${r.id}"><span class="g">▶</span><span><b>${esc(r.title)}</b><small>${r.demo ? 'Sample lesson · 1 min' : niceDate(r.date) + ' · ' + fmtT(r.dur) + ' · ' + chaptersOf(r).length + ' chapter' + (chaptersOf(r).length === 1 ? '' : 's') + (r.audio ? ' · with voice' : '')}</small></span></button>`).join('')}</div>`;
}
const wireReplayList = V => V.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => openReplay(b.dataset.rp));
M.view('replay', vReplay, { app: true, nav: 'puzzles' });
M.leave.replay = () => { rpView && rpView.destroy(); rpView = null; };

/* ---------------- Mistake Deck ---------------- */
const BOXES = [0, 1, 3, 7, 14, 30];
const isDue = c => !c.done && c.due <= M.today();
let analysing = 0;
async function analyse(start, ucis, side, src) {
  analysing++; deckStatus();
  let pos = C.parse(start); const found = [];
  for (let i = 0; i < ucis.length; i++) {
    const m = C.fromUci(pos, ucis[i]); if (!m) break;
    if (pos.turn === side && C.legal(pos).length > 1) {
      const r = await M.think('scores', { fen: C.fen(pos), depth: 3 });
      const sc = r.scores || [], best = sc[0], pl = sc.find(x => x[0] === ucis[i]);
      if (best && pl && best[0] !== pl[0] && best[1] - pl[1] >= 150 && best[1] > -90000) {
        const ok = sc.filter(x => x[1] >= best[1] - 30).map(x => x[0]).slice(0, 4);
        if (!ok.includes(pl[0])) found.push({ fen: C.fen(pos), best: best[0], bestSan: C.san(pos, C.fromUci(pos, best[0])), played: pl[0], playedSan: C.san(pos, m), loss: best[1] - pl[1], mate: pl[1] < -90000, ok });
      }
    }
    pos = C.make(pos, m);
  }
  analysing--;
  const have = new Set(S().deck.map(c => c.fen + c.played));
  const add = found.sort((a, b) => b.loss - a.loss).slice(0, 4).filter(c => !have.has(c.fen + c.played))
    .map(c => Object.assign(c, { id: uid(), src, box: 0, due: M.today(), made: M.today(), seen: 0, done: false }));
  S().deck.push(...add); if (S().deck.length > 150) S().deck = S().deck.slice(-150);
  M.store(); deckStatus();
  return add.length;
}
function deckStatus() { const e = $('deckStatus'); if (e) e.textContent = analysing ? 'Looking through your game for mistakes…' : ''; }
M.onGameEnd = g => {
  if (g.friend || g.hist.length < 4) return;
  const bot = K.bots.find(b => b.id === g.bot);
  analyse(C.START, g.hist.map(h => C.uci(h.m)), g.mine, 'Your game vs ' + bot.name).then(n => {
    if (n) M.toast('Mistake Deck: ' + n + ' new card' + (n > 1 ? 's' : ''), 'Positions from your game are waiting in Practice.');
    if (location.hash === '#puzzles' || location.hash === '#deck') M.go(location.hash.slice(1));
  });
};
const SAMPLE_PGN = '[White "Student"]\n[Black "Club opponent"]\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1';
async function importGame(text, side, src) {
  const r = P.play(text);
  if (r.error) return { error: `Move ${Math.floor(r.error.ply / 2) + 1} ("${r.error.token}") isn't legal in that position.` };
  if (!r.moves.length) return { error: 'No moves found.' };
  const n = await analyse(r.start, r.moves.map(x => x.uci), side, src || 'Imported game');
  return { n, plies: r.moves.length };
}
let DK = null;
function vDeck() {
  const V = $('v-deck'), d = S().deck, due = d.filter(isDue), learning = d.filter(c => !c.done).length, mastered = d.filter(c => c.done).length;
  if (!DK || !DK.card) {
    V.innerHTML = `<div class="row"><a class="btn alt small" href="#puzzles">← Practice</a></div>
    <h2 class="title" style="margin-top:12px">Mistake Deck</h2>
    <p class="lede">Every card is a position from your own games where a better move was there. Solve it cleanly and it comes back later; miss it and it comes back tomorrow, until you've got it for good.</p>
    <div class="statgrid">${[[due.length, 'Due today'], [learning, 'Learning'], [mastered, 'Mastered']].map(([v, l]) => `<div class="stat glass"><b>${v}</b><small>${l}</small></div>`).join('')}</div>
    <div class="btns" style="margin-bottom:18px">${due.length ? `<button class="btn" id="dkGo">Practise ${due.length} card${due.length > 1 ? 's' : ''} →</button>` : `<span class="tag ok">${d.length ? 'All caught up for today' : 'No cards yet'}</span>`}<span class="muted" id="deckStatus"></span></div>
    <div class="card glass imp"><h3>Add a game</h3><p class="muted">Paste a PGN or a plain move list from a class game, Lichess, Chess.com or an over-the-board scoresheet. Games you finish against the bots are added automatically.</p>
      <textarea id="dkPgn" placeholder="1. e4 e5 2. Nf3 Nc6 ..." aria-label="Game moves (PGN)"></textarea>
      <div class="row"><span>You played</span>${seg('dside', [['w', 'White'], ['b', 'Black']], 'w', 'Your colour')}</div>
      <div class="btns"><button class="btn small" id="dkImp">Find my mistakes</button><button class="btn small alt" id="dkSample">Use a sample game</button><span class="muted" id="dkMsg"></span></div></div>
    ${d.length ? `<h3 class="sub">Your cards</h3><div class="pgrid">${d.slice().reverse().map(c => `<div class="pz glass${c.done ? ' solved' : ''}">${M.mini(c.fen)}<b>${esc(c.playedSan)} → ${esc(c.bestSan)}</b><small>${esc(c.src)}</small><span class="tag ${c.done ? 'ok' : ''}">${c.done ? 'Mastered' : isDue(c) ? 'Due now' : 'Back ' + niceDate(c.due)}</span></div>`).join('')}</div>` : ''}`;
    deckStatus();
    let side = 'w';
    V.querySelectorAll('[data-dside]').forEach(b => b.onclick = () => { side = b.dataset.dside; V.querySelectorAll('[data-dside]').forEach(x => x.classList.toggle('on', x === b)); });
    const run = async (txt, sd, src) => { $('dkMsg').textContent = 'Analysing…'; const r = await importGame(txt, sd, src); if (r.error) { $('dkMsg').textContent = r.error; return; } $('dkMsg').textContent = ''; M.toast(r.n ? r.n + ' new card' + (r.n > 1 ? 's' : '') : 'No big mistakes found', r.n ? 'Added to your Mistake Deck.' : 'Nice game! Nothing lost more than a pawn and a half.'); vDeck(); };
    $('dkImp').onclick = () => run($('dkPgn').value, side, 'Imported game');
    $('dkSample').onclick = () => { $('dkPgn').value = SAMPLE_PGN; run(SAMPLE_PGN, 'w', 'Sample game'); };
    const g = $('dkGo'); g && (g.onclick = () => { DK = { queue: due.map(c => c.id), card: null }; nextCard(); });
    return;
  }
  const c = DK.card, pos = C.parse(c.fen);
  V.innerHTML = `<div class="play"><div class="boardbox glass"><div class="board" id="dkBoard" aria-label="Chess board"></div></div>
    <div class="side"><div class="row"><button class="btn alt small" id="dkBack">← Deck</button><span class="muted">${DK.queue.length} more after this</span></div>
    <div class="pip">${M.pipSvg()}<div class="bubble glass" aria-live="polite"><h2>Your own position</h2><p id="dkSay">${esc(c.src)}: you played <b>${esc(c.playedSan)}</b> here${c.mate ? ', and it allowed checkmate' : `, which lost about ${Math.max(1, Math.round(c.loss / 100))} point${Math.round(c.loss / 100) > 1 ? 's' : ''} of material`}. ${pos.turn === 'w' ? 'White' : 'Black'} to move. Find a better move.</p></div></div>
    <div class="stats"><div class="chip glass">Box <span>${c.box + 1}/5</span></div><div class="chip glass">Seen <span>${c.seen}</span></div></div>
    <div class="win" id="dkWin" hidden></div>
    <div class="btns"><button class="btn" id="dkNext" hidden>Next card →</button><button class="btn alt" id="dkHint">Hint</button></div></div></div>`;
  const B = new M.Board($('dkBoard'), m => {
    const u = C.uci(m), good = c.ok.includes(u), after = C.make(pos, m);
    B.fx(m); B.set(after, { last: [m.from, m.to], locked: true });
    c.seen++;
    const w = $('dkWin'); w.hidden = false;
    if (good && !DK.hinted) {
      c.box++; if (c.box >= BOXES.length - 1) { c.done = true; w.textContent = `Yes! ${C.san(pos, m)}. Card mastered: it won't come back.`; }
      else { c.due = M.dayStr(addDays(new Date(), BOXES[c.box])); w.textContent = `Yes! ${C.san(pos, m)}. This card comes back on ${niceDate(c.due)}.`; }
      M.logAct('deck', { fen: c.fen }); M.mood('happy'); window.FX.party($('dkBoard')); window.FX.sfx('win'); M.S.xp += 15;
    } else {
      c.box = 0; c.due = M.dayStr(addDays(new Date(), 1));
      const bm = C.fromUci(pos, c.best);
      w.className = 'win' + (good ? '' : ' bad');
      w.textContent = good ? `That's it, ${C.san(pos, m)}. You used a hint, so it comes back tomorrow.` : `Not this time. The move was ${c.bestSan}: your ${PNAME[bm.piece[1]]} from ${C.sqName(bm.from)} to ${C.sqName(bm.to)}. It comes back tomorrow.`;
      if (!good) { B.set(after, { hint: [bm.from, bm.to] }); M.mood('oops', 1500); window.FX.sfx('wrong'); }
    }
    $('dkNext').hidden = false; $('dkHint').hidden = true; M.afterProgress();
  });
  B.set(pos, { mine: pos.turn, flip: pos.turn === 'b', last: null, hint: [], locked: false });
  $('dkBack').onclick = () => { DK = null; vDeck(); };
  $('dkNext').onclick = nextCard;
  $('dkHint').onclick = () => { DK.hinted = true; const bm = C.fromUci(pos, c.best); B.set(pos, { hint: [bm.from] }); $('dkSay').textContent = `Look at your ${PNAME[bm.piece[1]]} on ${C.sqName(bm.from)}.`; };
}
function nextCard() { const id = DK.queue.shift(); DK.card = S().deck.find(c => c.id === id) || null; DK.hinted = false; if (!DK.card) DK = null; vDeck(); scrollTo({ top: 0 }); }
M.view('deck', vDeck, { app: true, nav: 'puzzles' });
M.leave.deck = () => { DK = null; };

/* ---------------- homework (student side) ---------------- */
let HW = null;
function vHomework() {
  const V = $('v-homework'), h = S().hw.find(x => x.id === HW);
  if (!h) { V.innerHTML = `<h2 class="title">Homework</h2><p class="lede">No homework open. Your coach sets it from the classroom.</p><a class="btn alt" href="#puzzles">← Practice</a>`; return; }
  const pos0 = C.parse(h.fen); let pos = pos0; const line = [];
  V.innerHTML = `<div class="play"><div class="boardbox glass"><div class="board" id="hwBoard" aria-label="Chess board"></div></div>
  <div class="side"><div class="row"><a class="btn alt small" href="#puzzles">← Practice</a><span class="muted">Set ${niceDate(h.made)}</span></div>
    <div class="pip">${M.pipSvg()}<div class="bubble glass"><h2>${esc(h.title)}</h2><p>${esc(h.prompt || 'Your coach left you a voice note on this position.')}</p></div></div>
    ${h.audio ? '<div class="card glass"><b>Coach\'s voice note</b><div id="hwA"></div></div>' : ''}
    <div class="card glass"><b>Your answer</b><p class="muted" style="margin:4px 0 8px">Play your idea on the board (both sides, a few moves is plenty), then add a voice note or a sentence.</p>
      <div class="moves" id="hwLine" style="display:block"></div>
      <div class="btns" style="margin:8px 0"><button class="btn small alt" id="hwUndo">Undo</button><button class="btn small alt" id="hwReset">Start over</button></div>
      <textarea id="hwText" placeholder="Explain your plan in a sentence" aria-label="Your explanation">${esc(h.reply ? h.reply.text : '')}</textarea>
      <div id="hwV" style="margin-top:8px"></div>
      <div class="btns" style="margin-top:10px"><button class="btn" id="hwSend">${h.reply ? 'Send again' : 'Send to coach'}</button><span class="muted" id="hwMsg">${h.reply ? 'Sent ' + niceDate(h.reply.at) : ''}</span></div></div></div></div>`;
  if (h.audio) playStored('hw-' + h.id, $('hwA'));
  let blob = null; voiceWidget($('hwV'), b => blob = b);
  const B = new M.Board($('hwBoard'), m => { const san = C.san(pos, m), a = C.make(pos, m); B.fx(m); line.push({ u: C.uci(m), san, pos }); pos = a; sync(); });
  const sync = () => { const l = line.at(-1); B.set(pos, { mine: pos.turn, flip: pos0.turn === 'b', last: l ? [C.sqIdx(l.u.slice(0, 2)), C.sqIdx(l.u.slice(2, 4))] : null, locked: line.length >= 10 }); $('hwLine').textContent = line.length ? line.map(x => x.san).join(' ') : 'No moves yet. Your first move goes here.'; };
  sync();
  $('hwUndo').onclick = () => { const l = line.pop(); if (l) pos = l.pos; sync(); };
  $('hwReset').onclick = () => { line.length = 0; pos = pos0; sync(); };
  $('hwSend').onclick = async () => {
    const text = $('hwText').value.trim();
    if (!line.length && !text && !blob) { $('hwMsg').textContent = 'Play a move, write a sentence or record a note first.'; return; }
    if (blob) await IDB.put('hwr-' + h.id, blob);
    h.reply = { line: line.map(x => x.u), sans: line.map(x => x.san), text, audio: !!blob || !!(h.reply && h.reply.audio), at: M.today() };
    M.logAct('hw', { id: h.id }); M.S.xp += 20; M.afterProgress();
    M.toast('Sent to your coach', 'They\'ll hear your answer before the next class.'); M.go('puzzles');
  };
}
M.view('homework', vHomework, { app: true, nav: 'puzzles' });

/* ---------------- classroom ---------------- */
const CL = { ma: [], mh: [], tab: 'teach', pos: C.parse(C.START), hist: [], preset: 'guided', actor: 'coach', tool: 'move', engine: false, eng: null, think: false, stage: 'mark', poll: null, rec: null, pending: null, log: [], flip: false, msg: '' };
let cB = null, cM = null;
const PRESETS = { demo: 'Demonstrate: only the coach moves. Students watch and draw.', guided: 'Guided: students propose a move and the coach approves it.', free: 'Free: anyone can move. Good for practice games.' };
function recEv(e) { if (CL.rec) CL.rec.ev.push(Object.assign({ t: +((Date.now() - CL.rec.t0) / 1000).toFixed(1) }, e)); }
function recMarks() { recEv({ k: 'mk', a: cM.arrows.map(x => x.slice()), h: cM.highs.slice() }); }
function cLocked() {
  if (CL.poll) return false;
  if (CL.actor === 'coach') return false;
  if (CL.preset === 'demo') return true;
  if (CL.pending) return true;
  if (CL.think && CL.stage === 'mark') return true;
  return false;
}
function cSync() {
  if (!cB) return;
  const l = CL.hist.at(-1);
  cB.set(CL.pos, { mine: CL.pos.turn, flip: CL.flip, locked: cLocked(), last: l ? [l.m.from, l.m.to] : null, hint: [] });
  cM.flip = CL.flip; cM.pending = CL.pending ? [CL.pending.from, CL.pending.to] : null;
  cM.poll = CL.poll && CL.poll.show ? CL.poll.v : null;
  const tool = CL.actor === 'student' && CL.think && CL.stage === 'mark' && !CL.poll ? 'cand' : CL.tool;
  cM.setTool(tool);
  if (tool !== 'cand' && !(CL.think && CL.actor === 'student')) cM.cands = [];
  cM.render(); cPanel(); M.onClassSync && M.onClassSync();
}
function cSay(t) { CL.msg = t; const e = $('cSay'); if (e) e.textContent = t; M.onClassSync && M.onClassSync(); }
function cPlay(m, quiet, by) {
  const san = C.san(CL.pos, m), after = C.make(CL.pos, m);
  if (CL.think && CL.actor === 'student' && cM.cands.length) {
    const cands = cM.cands.map(a => { const mm = C.legal(CL.pos).find(x => x.from === a[0] && x.to === a[1]); return mm ? C.san(CL.pos, mm) : ''; }).filter(Boolean);
    const e = { cands, played: san, hit: cands.includes(san), d: M.today() };
    CL.log.unshift(e); S().thinks.push(e); if (S().thinks.length > 100) S().thinks = S().thinks.slice(-100); M.store();
    recEv({ k: 'cap', x: 'Thought about ' + cands.join(', ') + ', played ' + san + '.' });
  }
  CL.hist.push({ pos: CL.pos, m, san }); CL.pos = after; CL.pending = null; cM.cands = []; CL.stage = 'mark';
  cB.fx(m); if (C.inCheck(after)) window.FX.sfx('check');
  recEv({ k: 'mv', u: C.uci(m) });
  const st = C.status(after);
  if (!quiet) cSay(st ? { checkmate: 'Checkmate on the board!', stalemate: 'Stalemate.', fifty: 'Draw by the fifty-move rule.', insufficient: 'Draw: not enough material.' }[st] || st : `${by || (CL.actor === 'coach' ? 'Coach' : 'Student')} played ${san}.`);
  cSync(); cEngine();
}
function cMove(m) {
  if (CL.poll) {
    const u = C.uci(m); CL.poll.v[u] = (CL.poll.v[u] || 0) + 1; CL.poll.n++; window.FX.sfx('click');
    cSay(`Vote counted: ${C.san(CL.pos, m)}. ${CL.poll.n} vote${CL.poll.n > 1 ? 's' : ''} so far.`); cSync(); return;
  }
  if (CL.actor === 'student' && CL.preset === 'guided') { CL.pending = m; cSay(`Student proposes ${C.san(CL.pos, m)}. Coach: approve it or send it back.`); window.FX.sfx('click'); cSync(); return; }
  cPlay(m);
}
async function cEngine() {
  if (!CL.engine) { CL.eng = null; if (cM) { cM.engine = null; cM.render(); } cPanel(); return; }
  const fen = C.fen(CL.pos); CL.eng = { fen, busy: true }; cPanel();
  const r = await M.think('scores', { fen, depth: 3 });
  if (!CL.engine || C.fen(CL.pos) !== fen) return;
  const sc = (r.scores || []).slice(0, 3), p = CL.pos;
  CL.eng = { fen, lines: sc.map(([u, s]) => ({ u, san: C.san(p, C.fromUci(p, u)), w: p.turn === 'w' ? s : -s })) };
  const b = sc[0]; cM.engine = b ? [C.sqIdx(b[0].slice(0, 2)), C.sqIdx(b[0].slice(2, 4))] : null; cM.render(); cPanel();
}
const evalTxt = w => Math.abs(w) > 90000 ? (w > 0 ? 'White mates' : 'Black mates') : (w >= 0 ? '+' : '−') + (Math.abs(w) / 100).toFixed(1);
function cPanel() {
  const e = $('cPanel'); if (!e) return;
  const stu = CL.actor === 'student';
  let think = '';
  if (CL.think && stu && !CL.poll) think = CL.stage === 'mark'
    ? `<div class="note good">Think First: drag up to 3 candidate moves on the board (${cM.cands.length}/3). <button class="btn small" id="cLock" ${cM.cands.length ? '' : 'disabled'}>Lock in and move</button></div>`
    : '<div class="note good">Candidates locked. Now play the move you choose.</div>';
  const pend = CL.pending ? `<div class="note">${CL.pendingBy ? esc(CL.pendingBy) + ' proposes' : 'Proposed'}: <b>${esc(C.san(CL.pos, CL.pending))}</b> <button class="btn small" id="cOk">Approve</button> <button class="btn small alt" id="cNo">Send back</button></div>` : '';
  const eng = CL.engine ? (CL.eng && CL.eng.lines ? `<div class="evalrow"><span class="ev">${evalTxt(CL.eng.lines[0] ? CL.eng.lines[0].w : 0)}</span><span class="muted">Best: ${CL.eng.lines.map(l => `<b>${esc(l.san)}</b> ${evalTxt(l.w)}`).join(' · ')}</span></div>` : '<div class="evalrow muted thinking">Engine thinking</div>') : '';
  const poll = CL.poll ? (() => { const tot = CL.poll.n || 1, top = Object.entries(CL.poll.v).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return `<div class="note pink"><b>Class poll: what would you play?</b> ${CL.poll.n} vote${CL.poll.n === 1 ? '' : 's'}. Each move made on the board counts as one student's vote.
      ${CL.poll.show && top.length ? `<div class="pollres">${top.map(([u, n]) => `<div><span>${esc(C.san(CL.pos, C.fromUci(CL.pos, u)))}</span>${M.bar(Math.round(n / tot * 100))}<span>${Math.round(n / tot * 100)}%</span></div>`).join('')}</div>` : ''}
      <div class="btns"><button class="btn small alt" id="cSim">Add 8 simulated votes</button><button class="btn small alt" id="cShow" ${CL.poll.n ? '' : 'disabled'}>${CL.poll.show ? 'Hide heatmap' : 'Show heatmap'}</button><button class="btn small" id="cEnd">End poll</button></div></div>`; })() : '';
  e.innerHTML = `${think}${pend}${poll}${eng}
    ${CL.log.length ? `<div class="tlog"><b>Thinking log</b>${CL.log.slice(0, 4).map(l => `<div><span class="muted">Considered</span> ${esc(l.cands.join(', '))} <span class="muted">→ played</span> <b>${esc(l.played)}</b>${l.hit ? '' : ' <span class="tag">new idea</span>'}</div>`).join('')}</div>` : ''}`;
  const on = (id, f) => { const b = $(id); b && (b.onclick = f); };
  on('cLock', () => { CL.stage = 'move'; cSay('Candidates locked in. Play your move.'); cSync(); });
  on('cOk', () => { const m = CL.pending, by = CL.pendingBy; CL.pending = null; CL.pendingBy = null; cPlay(m, false, by); });
  on('cNo', () => { CL.pending = null; CL.pendingBy = null; cSay('Sent back. Have another look, then propose again.'); cSync(); });
  on('cSim', async () => {
    const r = await M.think('scores', { fen: C.fen(CL.pos), depth: 2 }); const sc = (r.scores || []).slice(0, 6); if (!sc.length) return;
    const top = sc[0][1], ws = sc.map(x => Math.exp(Math.max(-6, (x[1] - top) / 80)));
    for (let k = 0; k < 8; k++) { let x = Math.random() * ws.reduce((a, b) => a + b, 0), j = 0; while ((x -= ws[j]) > 0 && j < ws.length - 1) j++; const u = sc[j][0]; CL.poll.v[u] = (CL.poll.v[u] || 0) + 1; CL.poll.n++; }
    cSay(CL.poll.n + ' votes in. Show the heatmap when you\'re ready.'); cSync();
  });
  on('cShow', () => { CL.poll.show = !CL.poll.show; if (CL.poll.show) recEv({ k: 'cap', x: 'Class poll: ' + Object.entries(CL.poll.v).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, n]) => C.san(CL.pos, C.fromUci(CL.pos, u)) + ' ' + Math.round(n / CL.poll.n * 100) + '%').join(', ') }); cSync(); });
  on('cEnd', () => { CL.poll = null; cSay('Poll closed. Back to the lesson.'); cSync(); });
  const tb = $('cTabs'); if (tb) tb.querySelectorAll('[data-ctl]').forEach(b => b.classList.toggle('on', b.dataset.ctl === CL.tool));
}
function cLoad(fen, hist) {
  CL.pos = C.parse(fen); CL.hist = []; CL.pending = null; CL.poll = null; cM.cands = []; CL.stage = 'mark';
  if (hist) { let p = CL.pos; hist.forEach(x => { CL.hist.push({ pos: p, m: x.m, san: x.san }); p = C.make(p, x.m); }); CL.pos = p; }
  recEv({ k: 'pos', fen: C.fen(CL.pos) }); cSync(); cEngine();
}
function validFen(f) { const parts = f.trim().split(/\s+/); if (parts.length < 2 || parts[0].split('/').length !== 8 || !/^[wb]$/.test(parts[1])) return false;
  try { const p = C.parse(f); return p.b.filter(x => x === 'wK').length === 1 && p.b.filter(x => x === 'bK').length === 1 && !C.inCheck(p, C.opp(p.turn)); } catch (e) { return false; } }
async function recToggle() {
  if (CL.rec) {
    const r = CL.rec; CL.rec = null; clearInterval(r.tick);
    let blob = null; if (r.voice) { try { blob = await r.voice.stop(); } catch (e) { } }
    const dur = Math.max(1, (Date.now() - r.t0) / 1000);
    const title = ($('cTitle') && $('cTitle').value.trim()) || 'Lesson · ' + niceDate(M.today());
    const rp = { id: uid(), title, date: M.today(), dur: +dur.toFixed(1), ev: r.ev, audio: !!blob };
    if (blob) await IDB.put('rp-' + rp.id, blob);
    S().replays.push(rp);
    while (S().replays.length > 30) { const old = S().replays.shift(); IDB.del('rp-' + old.id); }
    M.logAct('class', { id: rp.id }); M.store();
    M.toast('Lesson saved as a replay', title + ' · ' + fmtT(dur)); vClass(); return;
  }
  const wantMic = $('cMic') && $('cMic').getAttribute('aria-checked') === 'true';
  CL.rec = { t0: Date.now(), ev: [], voice: null };
  if (wantMic) { try { CL.rec.voice = await startVoice(); } catch (e) { cSay('No microphone here, so this replay records the board and captions only.'); } }
  CL.rec.ev.push({ t: 0, k: 'pos', fen: C.fen(CL.pos) }, { t: 0, k: 'ch', x: 'Start' });
  recMarks();
  CL.rec.tick = setInterval(() => { const e = $('cRecT'); if (e && CL.rec) e.textContent = fmtT((Date.now() - CL.rec.t0) / 1000); }, 500);
  vClass();
}
function vClass() {
  const V = $('v-class');
  const tabs = seg('ct', [['teach', 'Teach'], ['homework', 'Homework'], ['pulse', 'Parent Pulse'], ['schedule', 'Schedule']], CL.tab, 'Classroom sections');
  V.innerHTML = `<div class="row" style="justify-content:space-between"><h2 class="title" style="margin:0">Classroom</h2>${tabs}</div>
    <p class="lede" style="margin-top:6px">This preview runs on one device: switch "Moving as" to see a student's side. In live classes the coach and students share one board, with video built in.</p>
    <div id="cBody"></div>`;
  V.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { CL.tab = b.dataset.ct; vClass(); });
  const body = $('cBody');
  if (CL.tab === 'homework') return cHomework(body);
  if (CL.tab === 'pulse') return cPulse(body);
  if (CL.tab === 'schedule') return cSchedule(body);
  body.innerHTML = `<div class="play cls">
    <div class="boardbox glass">${boardHtml('cBoard', 'cMarks')}</div>
    <div class="side">
      <div id="liveBox"></div>
      <div class="card glass ctl">
        <div class="row"><span class="lbl">Moving as</span>${seg('ca', [['coach', 'Coach'], ['student', 'Student']], CL.actor, 'Moving as')}</div>
        <div class="row"><span class="lbl">Permissions</span>${seg('cp', [['demo', 'Demonstrate'], ['guided', 'Guided'], ['free', 'Free']], CL.preset, 'Move permissions')}</div>
        <p class="muted small">${PRESETS[CL.preset]}</p>
        <div class="row" id="cTabs"><span class="lbl">Tool</span><div class="seg glass" role="group" aria-label="Board tool">${[['move', 'Move'], ['arrow', 'Draw'], ['laser', 'Laser']].map(([v, l]) => `<button data-ctl="${v}" class="${CL.tool === v ? 'on' : ''}">${l}</button>`).join('')}</div><button class="btn small alt" id="cClr">Clear marks</button></div>
        <p class="muted small">Right-click and drag for an arrow, right-click a square to highlight it (Shift, Alt or Ctrl for red, blue, yellow). Left-click clears. On touch screens use Draw. Laser: a pointer trail that fades.</p>
        <div class="toggle"><span><b>Think First</b> <small class="muted">students mark up to 3 candidates before moving</small></span>${sw('cThink', CL.think, 'Think First')}</div>
        <div class="toggle"><span><b>Engine</b> <small class="muted">hidden from students until you reveal it</small></span>${sw('cEng', CL.engine, 'Reveal engine')}</div>
        <div class="btns">${CL.poll ? '' : '<button class="btn small" id="cPoll">Ask the class: what would you play?</button>'}<button class="btn small alt" id="cHw">Set as homework</button></div>
      </div>
      <div class="pip">${M.pipSvg()}<div class="bubble glass" aria-live="polite"><p id="cSay">${esc(CL.msg || 'Make a move, draw an arrow, or start a poll. Everything you do can be recorded as a Lesson Replay.')}</p></div></div>
      <div id="cPanel" class="cpanel"></div>
      <div class="btns"><button class="btn small alt" id="cUndo">Undo</button><button class="btn small alt" id="cFlip">Flip</button><button class="btn small alt" id="cNew">New game</button></div>
      <div class="card glass rec${CL.rec ? ' on' : ''}">
        ${CL.rec ? `<div class="row"><span class="dot"></span><b>Recording</b><span id="cRecT" class="muted">${fmtT((Date.now() - CL.rec.t0) / 1000)}</span></div>
          <div class="row"><input id="cCap" placeholder="Add a caption students will read" aria-label="Caption"><button class="btn small alt" id="cCapB">Add</button></div>
          <div class="row"><input id="cChap" placeholder="Chapter name, e.g. The plan" aria-label="Chapter name"><button class="btn small alt" id="cChapB">Add chapter</button></div>
          <div class="row"><input id="cTitle" placeholder="Replay title" aria-label="Replay title"><button class="btn small" id="cRec">■ Stop and save</button></div>`
        : `<div class="toggle"><span><b>Lesson Replay</b> <small class="muted">records moves, arrows and captions${'MediaRecorder' in window ? ', plus your voice if you allow the microphone' : ''}</small></span></div>
          <div class="row"><span>Record voice</span>${sw('cMic', true, 'Record voice')}<button class="btn small" id="cRec">● Start recording</button></div>`}
      </div>
    </div></div>
    <div class="cgrid">
      <div class="card glass"><h3>Load a position or game</h3>
        <label class="drop small-drop" id="cDrop"><input type="file" accept="image/*,application/pdf,.pdf" id="cDropF" hidden><span class="ic"><svg><use href="#i-deck"/></svg></span>
          <span><b>From a picture or PDF</b><span class="muted small"> Drop a screenshot, photo or book page with a diagram, or tap to choose. MoonChess reads the position and you check it.</span></span></label>
        <p class="muted small">Or paste a FEN, a PGN, or moves from Lichess or Chess.com.</p>
        <textarea id="cImp" placeholder="FEN or PGN" aria-label="FEN or PGN"></textarea>
        <div class="btns"><button class="btn small" id="cLoad">Load on the board</button><button class="btn small alt" id="cToDeck">Add mistakes to Mistake Deck</button><span class="muted small" id="cImpMsg"></span></div></div>
      <div class="card glass"><h3>Lesson replays</h3>${replayList()}</div>
    </div>`;
  cB = new M.Board($('cBoard'), cMove); cM = new Marks($('cMarks')); cM.arrows = CL.ma; cM.highs = CL.mh;
  cB.onArrow = (a, b, c) => {
    if (a === b) { const k = cM.highs.indexOf(a); k >= 0 ? cM.highs.splice(k, 1) : cM.highs.push(a); }
    else { const k = cM.arrows.findIndex(x => x[0] === a && x[1] === b); if (k >= 0 && (cM.arrows[k][2] || 'g') === c) cM.arrows.splice(k, 1); else { if (k >= 0) cM.arrows.splice(k, 1); cM.arrows.push([a, b, c]); } }
    cM.render(); cM.onChange && cM.onChange();
  };
  cB.clearMarks = () => { if (!cM.arrows.length && !cM.highs.length) return false; cM.clear(); return true; };
  cM.onChange = () => recMarks();
  cM.onCand = (a, b) => {
    if (!C.legal(CL.pos).some(x => x.from === a && x.to === b)) { cSay('That isn\'t a legal move. Candidates must be moves you could really play.'); return; }
    const k = cM.cands.findIndex(x => x[0] === a && x[1] === b);
    if (k >= 0) cM.cands.splice(k, 1); else if (cM.cands.length < 3) cM.cands.push([a, b]); else { cSay('Three candidates is the limit. Tap-drag one again to remove it.'); return; }
    cPanel();
  };
  const W = V;
  W.querySelectorAll('[data-ca]').forEach(b => b.onclick = () => { CL.actor = b.dataset.ca; CL.pending = null; cSay(CL.actor === 'student' ? (CL.preset === 'demo' ? 'Student view: watching. Only the coach moves in Demonstrate.' : CL.think ? 'Student view: Think First is on, so mark your candidates first.' : 'Student view: your move.') : 'Coach view: you can move, draw and run polls.'); vClass(); });
  W.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { CL.preset = b.dataset.cp; CL.pending = null; recEv({ k: 'cap', x: PRESETS[CL.preset].split(':')[0] + ' mode' }); vClass(); });
  W.querySelectorAll('[data-ctl]').forEach(b => b.onclick = () => { CL.tool = b.dataset.ctl; cSync(); });
  $('cClr').onclick = () => cM.clear();
  $('cThink').onclick = () => { CL.think = !CL.think; CL.stage = 'mark'; cM.cands = []; vClass(); };
  $('cEng').onclick = () => { CL.engine = !CL.engine; $('cEng').setAttribute('aria-checked', CL.engine); cSay(CL.engine ? 'Engine revealed. Students now see the evaluation and best lines.' : 'Engine hidden again.'); cEngine(); };
  const pb = $('cPoll'); pb && (pb.onclick = () => { CL.poll = { v: {}, n: 0, show: false }; CL.pending = null; recEv({ k: 'cap', x: 'Class poll: what would you play here?' }); cSay('Poll open. Every student taps a move; each move on the board now counts as one vote.'); vClass(); });
  $('cHw').onclick = () => setHomework();
  $('cUndo').onclick = () => { const h = CL.hist.pop(); if (!h) return; CL.pos = h.pos; CL.pending = null; recEv({ k: 'pos', fen: C.fen(CL.pos) }); cSync(); cEngine(); };
  $('cFlip').onclick = () => { CL.flip = !CL.flip; cSync(); };
  $('cNew').onclick = () => cLoad(C.START);
  $('cRec').onclick = recToggle;
  const mic = $('cMic'); mic && (mic.onclick = () => mic.setAttribute('aria-checked', mic.getAttribute('aria-checked') !== 'true'));
  const capB = $('cCapB'); capB && (capB.onclick = () => { const v = $('cCap').value.trim(); if (!v) return; recEv({ k: 'cap', x: v }); $('cCap').value = ''; cSay('Caption added: ' + v); });
  const chB = $('cChapB'); chB && (chB.onclick = () => { const v = $('cChap').value.trim() || 'Chapter'; recEv({ k: 'ch', x: v }); $('cChap').value = ''; cSay('Chapter bookmark added: ' + v); });
  const fromPic = f => M.scanOpen(fen => { cLoad(fen); $('cImp').value = fen; cSay('Position loaded from your picture. It\'s ' + (CL.pos.turn === 'w' ? 'White' : 'Black') + ' to move.'); $('cBoard').scrollIntoView({ behavior: 'smooth', block: 'center' }); }, null, f);
  const dz = $('cDrop'), dzf = $('cDropF');
  dzf.onchange = () => { if (dzf.files[0]) fromPic(dzf.files[0]); dzf.value = ''; };
  dz.onclick = e => { if (e.target !== dzf) { e.preventDefault(); fromPic(null); } };
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) fromPic(f); };
  $('cLoad').onclick = () => {
    const v = $('cImp').value.trim(), msg = $('cImpMsg'); if (!v) return;
    if (validFen(v)) { cLoad(v); msg.textContent = 'Position loaded.'; return; }
    const r = P.play(v);
    if (r.error && !r.moves.length) { msg.textContent = 'That isn\'t a FEN or a move list I can read.'; return; }
    cLoad(r.start, r.moves); msg.textContent = r.error ? `Loaded ${r.moves.length} moves; stopped at "${r.error.token}", which isn't legal.` : `Loaded ${r.moves.length} moves. Use Undo to step back.`;
  };
  $('cToDeck').onclick = async () => {
    const v = $('cImp').value.trim(), msg = $('cImpMsg'); if (!v) { msg.textContent = 'Paste a game first.'; return; }
    const side = await M.ask('Whose mistakes?', 'Which side did your student play in this game?', 'White', 'Black');
    msg.textContent = 'Analysing…'; const r = await importGame(v, side ? 'w' : 'b', 'Game from class');
    msg.textContent = r.error || (r.n ? r.n + ' card' + (r.n > 1 ? 's' : '') + ' added to the Mistake Deck.' : 'No big mistakes in that game.');
  };
  wireReplayList(V);
  M.liveMount && M.liveMount($('liveBox'));
  cSync(); cEngine();
}
M.view('class', vClass, { app: true });
M.leave.class = () => { if (cM) cM.laser = []; };

function setHomework() {
  const fen = C.fen(CL.pos); let blob = null;
  M.modal(`<h3>Voice-note homework</h3>${M.mini(fen)}<p class="muted" style="margin:0">Students get this position, your note and a board to answer on.</p>
    <input id="hwT" placeholder="Title, e.g. Find White's plan" aria-label="Homework title" value="Find the plan">
    <textarea id="hwP" placeholder="What should they look for?" aria-label="Instructions">Find the plan for ${CL.pos.turn === 'w' ? 'White' : 'Black'} here.</textarea>
    <div id="hwRec"></div>
    <div class="btns"><button class="btn" data-a="1">Send to students</button><button class="btn alt" data-a="0">Cancel</button></div>`, (m, close) => {
    voiceWidget(m.querySelector('#hwRec'), b => blob = b);
    m.querySelector('[data-a="0"]').onclick = close;
    m.querySelector('[data-a="1"]').onclick = async () => {
      const h = { id: uid(), fen, title: m.querySelector('#hwT').value.trim() || 'Homework', prompt: m.querySelector('#hwP').value.trim(), audio: !!blob, made: M.today(), reply: null };
      if (blob) await IDB.put('hw-' + h.id, blob);
      S().hw.push(h); if (S().hw.length > 40) S().hw.shift(); M.store(); close();
      M.toast('Homework sent', 'Students see it in Practice.');
    };
  });
}
function cHomework(body) {
  const list = S().hw.slice().reverse();
  body.innerHTML = `<p class="muted">Set homework from the Teach board with "Set as homework". Answers arrive here with the student's line, note and voice reply.</p>
  ${list.length ? `<div class="hwgrid">${list.map(h => `<div class="card glass hwc">${M.mini(h.fen)}<div><div class="row" style="justify-content:space-between"><b>${esc(h.title)}</b><span class="tag ${h.reply ? 'ok' : ''}">${h.reply ? 'Answered ' + niceDate(h.reply.at) : 'Waiting'}</span></div>
    <p class="muted small" style="margin:4px 0">${esc(h.prompt)}${h.audio ? ' · voice note attached' : ''}</p>
    ${h.reply ? `<div class="reply"><b>Answer:</b> ${h.reply.sans.length ? esc(h.reply.sans.join(' ')) : '<span class="muted">no moves</span>'}${h.reply.text ? `<p style="margin:4px 0">"${esc(h.reply.text)}"</p>` : ''}${h.reply.audio ? `<div data-au="hwr-${h.id}"></div>` : ''}</div>` : ''}
    <div class="btns"><button class="btn small alt" data-open="${h.id}">Open on the board</button><a class="btn small alt" href="#homework" data-stu="${h.id}">Student's view</a><button class="btn small alt" data-del="${h.id}">Delete</button></div></div></div>`).join('')}</div>`
    : '<div class="card glass"><b>No homework yet.</b><p class="muted">Go to Teach, set up a position and press "Set as homework".</p></div>'}`;
  body.querySelectorAll('[data-au]').forEach(e => playStored(e.dataset.au, e));
  body.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const h = S().hw.find(x => x.id === b.dataset.open); CL.tab = 'teach'; vClass();
    const pos = C.parse(h.fen); const mv = []; let p = pos; (h.reply ? h.reply.line : []).forEach(u => { const m = C.fromUci(p, u); if (m) { mv.push({ m, san: C.san(p, m) }); p = C.make(p, m); } }); cLoad(h.fen, mv); });
  body.querySelectorAll('[data-stu]').forEach(b => b.onclick = () => { HW = b.dataset.stu; });
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!await M.ask('Delete this homework?', 'The student\'s answer goes too.', 'Delete', 'Keep it')) return; S().hw = S().hw.filter(x => x.id !== b.dataset.del); IDB.del('hw-' + b.dataset.del); IDB.del('hwr-' + b.dataset.del); M.store(); vClass(); });
}

/* ---------------- Parent Pulse ---------------- */
function weekStats() {
  const from = M.dayStr(addDays(new Date(), -6)), L = S().log.filter(x => x.d >= from), n = k => L.filter(x => x.k === k).length;
  const deckDone = L.filter(x => x.k === 'deck');
  let hl = null;
  if (deckDone.length) hl = { fen: deckDone.at(-1).fen, why: 'found the better move in a position from one of their own games' };
  else { const pz = L.filter(x => x.k === 'puzzle').at(-1); const p = pz && K.puzzles.find(q => q.id === pz.id); if (p) hl = { fen: p.fen, why: 'solved the "' + p.tag + '" checkmate puzzle' }; }
  if (!hl) { const m = L.filter(x => x.k === 'mission').at(-1); const mm = m && M.ALL.find(q => q.id === m.id); if (mm && mm.fen) hl = { fen: mm.fen, why: 'finished the "' + mm.name + '" mission' }; }
  return { from, classes: n('class'), replays: n('replay'), puzzles: n('puzzle'), deck: deckDone.length, missions: n('mission'), games: n('game'), hw: n('hw'), hl, any: L.length > 0 };
}
function pulseText(w) {
  const p = S().pulse, child = p.child.trim() || 'Your child', coach = p.coach.trim() || 'Your coach';
  const lines = [`MoonChess weekly update for ${child} (${niceDate(w.from)} to ${niceDate(M.today())})`, ''];
  lines.push(`• Classes: ${w.classes} live${w.replays ? `, plus ${w.replays} lesson replay${w.replays > 1 ? 's' : ''} watched` : ''}`);
  lines.push(`• Puzzles solved: ${w.puzzles + w.deck}${w.deck ? ` (${w.deck} from ${child === 'Your child' ? 'their' : child + '\'s'} own games)` : ''}`);
  if (w.missions) lines.push(`• Lessons finished in the app: ${w.missions}`);
  if (w.games) lines.push(`• Practice games played: ${w.games}`);
  if (w.hw) lines.push(`• Homework answered: ${w.hw}`);
  if (w.hl) lines.push('', `Highlight: ${child} ${w.hl.why}.`);
  if (p.note.trim()) lines.push('', `${coach}'s note: ${p.note.trim()}`);
  lines.push('', `— ${coach}, via MoonChess`);
  return lines.join('\n');
}
function cPulse(body) {
  const p = S().pulse, w = weekStats(), txt = pulseText(w), ok = p.sent === M.today();
  body.innerHTML = `<div class="pulse">
    <div class="card glass"><h3>This week's Pulse</h3><p class="muted small">Written automatically from the week's classes, puzzles and homework. Add your one-line note, check it, and approve.</p>
      <label>Student's name<input id="puC" value="${esc(p.child)}" placeholder="e.g. Aarav"></label>
      <label>Your name<input id="puK" value="${esc(p.coach)}" placeholder="e.g. Coach Meera"></label>
      <label>Your note (one line)<input id="puN" value="${esc(p.note)}" maxlength="140" placeholder="e.g. Calculating more carefully before captures."></label>
      ${w.any ? '' : '<p class="note">Nothing logged in the last 7 days on this device yet. Finish a mission, a puzzle or a class and the summary fills in.</p>'}
      <div class="btns"><button class="btn" id="puOk">${ok ? 'Approved today ✓' : 'Approve'}</button></div>
      <div id="puSend" ${ok ? '' : 'hidden'}><p class="muted small">Approved. Send it from your own WhatsApp or email (automatic weekly sending arrives with the WhatsApp Business connection):</p>
        <div class="btns"><a class="btn small" id="puWa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(txt)}">Open in WhatsApp</a><a class="btn small alt" id="puEm" href="mailto:?subject=${encodeURIComponent('MoonChess weekly update')}&body=${encodeURIComponent(txt)}">Email</a><button class="btn small alt" id="puCp">Copy text</button></div></div>
    </div>
    <div class="phone glass" aria-label="Preview of the parent's message"><div class="ph-top">Parent's phone · preview</div>
      <div class="msg"><pre id="puTxt">${esc(txt)}</pre>${w.hl ? `<div class="hl">${M.mini(w.hl.fen)}</div>` : ''}</div></div></div>`;
  const re = () => { const t = pulseText(weekStats()); $('puTxt').textContent = t; $('puWa').href = 'https://wa.me/?text=' + encodeURIComponent(t); $('puEm').href = 'mailto:?subject=' + encodeURIComponent('MoonChess weekly update') + '&body=' + encodeURIComponent(t); };
  [['puC', 'child'], ['puK', 'coach'], ['puN', 'note']].forEach(([id, k]) => $(id).oninput = e => { p[k] = e.target.value; M.store(); re(); });
  $('puOk').onclick = () => { p.sent = M.today(); M.store(); $('puOk').textContent = 'Approved today ✓'; $('puSend').hidden = false; };
  $('puCp').onclick = async () => { try { await navigator.clipboard.writeText($('puTxt').textContent); $('puCp').textContent = 'Copied!'; } catch (e) { $('puCp').textContent = 'Select the text to copy'; } };
}

/* ---------------- schedule ---------------- */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function occurrences(days) {
  const out = [], now = new Date();
  for (let i = 0; i < days; i++) {
    const d = addDays(now, i), ds = M.dayStr(d);
    S().classes.forEach(c => { if (c.weekly ? c.day === d.getDay() && (!c.start || c.start <= ds) : c.date === ds) out.push({ c, d, ds }); });
  }
  return out.sort((a, b) => a.ds === b.ds ? a.c.time.localeCompare(b.c.time) : a.ds.localeCompare(b.ds));
}
function cSchedule(body) {
  const occ = occurrences(14);
  body.innerHTML = `<div class="sched">
    <div class="card glass"><h3>Add a class</h3>
      <label>Class name<input id="scT" placeholder="e.g. Beginners batch"></label>
      <label>Students<input id="scW" placeholder="e.g. Aarav, Diya, Kabir"></label>
      <div class="two"><label>Day<select id="scD">${DAYS.map((d, i) => `<option value="${i}" ${i === new Date().getDay() ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Time<input id="scH" type="time" value="17:00"></label></div>
      <div class="two"><label>Length<select id="scL"><option value="45">45 min</option><option value="60" selected>60 min</option><option value="90">90 min</option></select></label>
      <label class="chk"><input type="checkbox" id="scR" checked> Every week</label></div>
      <div class="btns"><button class="btn" id="scAdd">Add to calendar</button><span class="muted small" id="scMsg"></span></div></div>
    <div><h3 class="sub" style="margin-top:0">Next two weeks</h3>
      ${occ.length ? `<div class="agenda">${occ.map(o => { const rem = `Reminder: ${o.c.title} on ${o.d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })} at ${o.c.time} (${o.c.len} min). See you on MoonChess!`;
        return `<div class="ag glass"><div class="when"><b>${o.d.toLocaleDateString(undefined, { weekday: 'short' })}</b><span>${o.d.getDate()} ${o.d.toLocaleDateString(undefined, { month: 'short' })}</span></div>
        <div class="what"><b>${esc(o.c.time)} · ${esc(o.c.title)}</b><small class="muted">${esc(o.c.who || 'No students added')} · ${o.c.len} min${o.c.weekly ? ' · weekly' : ''}</small></div>
        <div class="btns"><a class="btn small alt" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(rem)}">WhatsApp reminder</a><button class="btn small alt" data-rm="${o.c.id}" aria-label="Remove ${esc(o.c.title)}">Remove</button></div></div>`; }).join('')}</div>`
      : '<div class="card glass"><b>No classes yet.</b><p class="muted">Add your first batch and it repeats every week.</p></div>'}</div></div>`;
  $('scAdd').onclick = () => {
    const t = $('scT').value.trim(); if (!t) { $('scMsg').textContent = 'Give the class a name.'; return; }
    const day = +$('scD').value, weekly = $('scR').checked;
    let date = null; if (!weekly) { let d = new Date(); while (d.getDay() !== day) d = addDays(d, 1); date = M.dayStr(d); }
    S().classes.push({ id: uid(), title: t, who: $('scW').value.trim(), day, time: $('scH').value || '17:00', len: +$('scL').value, weekly, date, start: M.today() });
    M.store(); cSchedule(body);
  };
  body.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (!await M.ask('Remove this class?', 'It comes off every week of the calendar.', 'Remove', 'Keep')) return; S().classes = S().classes.filter(c => c.id !== b.dataset.rm); M.store(); cSchedule(body); });
}

/* ---------------- skill map ---------------- */
function skills() {
  const s = S(), stars = id => { const ch = K.chapters.find(c => c.id === id); return ch.missions.reduce((a, m) => a + (s.done[m.id] || 0), 0) / (ch.missions.length * 3); };
  const solved = K.puzzles.filter(p => s.puzzles[p.id]);
  const endTags = ['King + rook', 'Two rooks', 'Rook ladder', 'Edge mate', 'Pawn helper', 'Avoid stalemate', 'Quiet king move', 'Cut off'];
  const end = solved.filter(p => endTags.includes(p.tag)).length, m2 = solved.filter(p => p.n > 1).length;
  const mastered = s.deck.filter(c => c.done).length, th = s.thinks.length;
  const tm = s.tm, calm = tm.length ? tm.filter(x => x >= 3).length / tm.length : 0;
  const cl = x => Math.round(Math.max(0, Math.min(1, x)) * 100);
  return [
    { k: 'Tactics', v: cl(stars('tactics') * .5 + Math.min(solved.length, 20) / 20 * .5), why: `${solved.length} puzzles solved, tactics missions ${Math.round(stars('tactics') * 100)}% starred`, next: 'Fork and pin puzzles, then the Tactics chapter.' },
    { k: 'Endgames', v: cl(stars('mates') * .6 + Math.min(end, 6) / 6 * .4), why: `${end} endgame puzzles, checkmate patterns ${Math.round(stars('mates') * 100)}% starred`, next: 'King and rook mates: the Checkmate patterns chapter.' },
    { k: 'Openings', v: cl(stars('openings') * .7 + Math.min(s.games, 10) / 10 * .3), why: `Smart starts ${Math.round(stars('openings') * 100)}% starred, ${s.games} games played`, next: 'The Smart starts chapter, then games against Cadet Bot.' },
    { k: 'Calculation', v: cl(Math.min(m2, 5) / 5 * .5 + Math.min(th, 10) / 10 * .25 + Math.min(mastered, 5) / 5 * .25), why: `${m2} mate-in-2s, ${th} Think First moves, ${mastered} Mistake Deck cards mastered`, next: 'Think First in class, plus mate-in-2 puzzles.' },
    { k: 'Time use', v: tm.length >= 5 ? cl(calm) : 0, why: tm.length >= 5 ? `${Math.round(calm * 100)}% of ${tm.length} game moves made after at least 3 seconds of thought` : 'Play a few bot games to measure this', next: 'Slow games: count to three and check every capture before moving.' }
  ];
}
function radar(sk) {
  const cx = 150, cy = 140, R = 100, n = sk.length, pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  let h = '';
  [.25, .5, .75, 1].forEach(f => { h += `<polygon points="${sk.map((_, i) => pt(i, R * f).join(',')).join(' ')}" fill="none" stroke="#5b3fd62e"/>`; });
  sk.forEach((s, i) => { const [x, y] = pt(i, R), [lx, ly] = pt(i, R + 22); h += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#5b3fd622"/><text x="${lx}" y="${ly + 4}" text-anchor="middle" class="rl">${s.k}</text>`; });
  h += `<polygon points="${sk.map((s, i) => pt(i, Math.max(6, R * s.v / 100)).join(',')).join(' ')}" fill="#c42d8f22" stroke="#c42d8f" stroke-width="2"/>`;
  sk.forEach((s, i) => { const [x, y] = pt(i, Math.max(6, R * s.v / 100)); h += `<circle cx="${x}" cy="${y}" r="4" fill="#5b3fd6"/>`; });
  return `<svg viewBox="0 0 300 280" class="radar" role="img" aria-label="Skill map: ${sk.map(s => s.k + ' ' + s.v).join(', ')}">${h}</svg>`;
}
M.meExtra = () => {
  const sk = skills(), low = sk.slice().sort((a, b) => a.v - b.v)[0];
  return `<h3 style="margin-bottom:10px">Skill map</h3>
  <div class="skill glass">${radar(sk)}
    <div><div class="sklist">${sk.map(s => `<div><div class="row" style="justify-content:space-between"><b>${s.k}</b><span class="muted">${s.v}</span></div>${M.bar(s.v)}<small class="muted">${esc(s.why)}</small></div>`).join('')}</div>
    <p class="note" style="margin-top:12px"><b>Teach next: ${low.k}.</b> ${esc(low.next)}</p></div></div>`;
};

/* ---------------- hooks into the hub and practice pages ---------------- */
function practiceCards() {
  const due = S().deck.filter(isDue).length, hw = S().hw.filter(h => !h.reply), last = allReplays()[0];
  return `<div class="homegrid prac">
    <div class="card glass"><div class="row" style="justify-content:space-between"><h3>Homework</h3><span class="tag ${hw.length ? '' : 'ok'}">${hw.length ? hw.length + ' to do' : 'All done'}</span></div>
      ${hw.length ? hw.slice(0, 3).map(h => `<button class="li glass" data-hw="${h.id}"><span class="g">♞</span><span><b>${esc(h.title)}</b><small>${h.audio ? 'Voice note · ' : ''}set ${niceDate(h.made)}</small></span></button>`).join('') : '<p class="muted" style="margin:0">Nothing waiting. Your coach sets homework with a voice note on any position.</p>'}</div>
    <div class="card glass"><div class="row" style="justify-content:space-between"><h3>Mistake Deck</h3><span class="tag ${due ? '' : 'ok'}">${due ? due + ' due' : 'Caught up'}</span></div>
      <p class="muted" style="margin:0">${S().deck.length ? `${S().deck.length} cards from your own games. ${S().deck.filter(c => c.done).length} mastered.` : 'Finish a game against a bot, or import one, and your mistakes become puzzles here.'}</p>
      <div class="btns"><a class="btn small" href="#deck">${due ? 'Practise now' : 'Open the deck'}</a></div></div>
    <div class="card glass"><h3>Lesson replays</h3><p class="muted" style="margin:0">${last ? `Latest: ${esc(last.title)}, ${niceDate(last.date)}.` : 'Every recorded class lands here. Try the sample lesson.'}</p>
      <div class="btns"><button class="btn small alt" data-rp="${last ? last.id : 'demo'}">${last ? 'Watch latest' : 'Watch the sample'}</button><a class="btn small alt" href="#replay" data-rp-all="1">All replays</a></div></div></div>`;
}
M.practiceTop = practiceCards;
M.practiceWire = () => { const V = $('v-puzzles'); V.querySelectorAll('[data-hw]').forEach(b => b.onclick = () => { HW = b.dataset.hw; M.go('homework'); }); wireReplayList(V); V.querySelectorAll('[data-rp-all]').forEach(a => a.onclick = () => { RP = null; }); };
M.hubExtra = () => `<h3 class="sub">Between lessons</h3>${practiceCards()}`;
M.hubWire = () => { const V = $('v-hub'); V.querySelectorAll('[data-hw]').forEach(b => b.onclick = () => { HW = b.dataset.hw; M.go('homework'); }); wireReplayList(V); V.querySelectorAll('[data-rp-all]').forEach(a => a.onclick = () => { RP = null; }); };

/* moves, candidates and votes arriving from a student in a live class go through the same rules as on one device */
function remoteMove(u, cands, who) {
  const m = C.fromUci(CL.pos, u); if (!m) return 'That move isn\'t legal any more.';
  if (CL.poll) { CL.poll.v[u] = (CL.poll.v[u] || 0) + 1; CL.poll.n++; window.FX.sfx('click'); cSay(`${who} voted. ${CL.poll.n} vote${CL.poll.n > 1 ? 's' : ''} so far.`); cSync(); return 'vote'; }
  if (CL.preset === 'demo') return 'The coach is demonstrating. Watch for now.';
  if (CL.pending) return 'Another move is waiting for the coach.';
  if (cands && cands.length) {
    const san = C.san(CL.pos, m), e = { cands, played: san, hit: cands.includes(san), d: M.today(), who };
    CL.log.unshift(e); S().thinks.push(e); if (S().thinks.length > 100) S().thinks = S().thinks.slice(-100); M.store();
    recEv({ k: 'cap', x: who + ' thought about ' + cands.join(', ') + ', played ' + san + '.' });
  }
  if (CL.preset === 'guided') { CL.pending = m; CL.pendingBy = who; window.FX.sfx('click'); cSay(`${who} proposes ${C.san(CL.pos, m)}. Approve it or send it back.`); cSync(); return 'pending'; }
  cPlay(m, false, who); return 'ok';
}
M.classApi = { CL, remoteMove, load: f => cLoad(f), get marks() { return cM; }, evalTxt };

Object.assign(M, { player, DEMO, Marks, boardHtml, importGame, SAMPLE_PGN, openReplay, arrowPath, validFen });
}
