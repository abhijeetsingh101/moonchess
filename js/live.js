/* MoonChess — live class: coach and students on video, sharing one board.
   Video and board moves go directly between browsers (WebRTC, through PeerJS).
   The free PeerJS cloud server only introduces the two browsers to each other.
   To use your own PeerServer instead, set window.MC_PEER = { host, port, path, secure } before this script. */
{
const M = window.MC, C = M.C, esc = M.esc;
const $ = id => document.getElementById(id);
const PFX = 'moonchess-class-', ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const cfg = () => Object.assign({ debug: 1 }, window.MC_PEER || {});
const clean = s => String(s || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 24);
const initials = n => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
let myName = ''; try { myName = localStorage.getItem('mc-name') || ''; } catch (e) { }
const saveName = n => { myName = n; try { localStorage.setItem('mc-name', n); } catch (e) { } };

/* ---------------- shared helpers ---------------- */
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/vendor/peerjs.min.js'; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
}
async function getMedia() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
  try { return await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } }, audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e2) { return null; } }
}
function silentStream() { try { return new AudioContext().createMediaStreamDestination().stream; } catch (e) { return new MediaStream(); } }
function whyFail(e) {
  const t = e && e.type;
  if (!window.isSecureContext) return 'Video needs a secure page. Open MoonChess from https:// or from localhost.';
  if (t === 'peer-unavailable') return 'No live class with that code right now. Check the code with your coach; they need to have started the class.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed' || (e && e.message === 'load'))
    return 'Couldn\'t reach the connection service. Check your internet. If you\'re viewing MoonChess inside Claude, open your own copy of the site instead: this preview blocks cameras and live connections.';
  if (t === 'browser-incompatible') return 'This browser can\'t do video calls. Try Chrome, Edge, Firefox or Safari.';
  return 'Something went wrong with the connection' + (t ? ' (' + t + ')' : '') + '. Try again.';
}
/* every few seconds, check how the call is doing */
function watch(o, call, onChange) {
  clearInterval(o.qt); let last = null;
  o.qt = setInterval(async () => {
    const pc = call.peerConnection; if (!pc) return;
    const st = pc.connectionState || pc.iceConnectionState; let q = 'good';
    if (st === 'disconnected' || st === 'failed') q = 'lost';
    else if (st === 'new' || st === 'connecting' || st === 'checking') q = 'wait';
    else {
      try {
        const r = await pc.getStats(); let rtt = 0, lost = 0, recv = 0;
        r.forEach(x => { if (x.type === 'candidate-pair' && x.nominated && x.currentRoundTripTime != null) rtt = x.currentRoundTripTime; if (x.type === 'inbound-rtp') { lost += x.packetsLost || 0; recv += x.packetsReceived || 0; } });
        const dl = last ? (lost - last.lost) / Math.max(1, (recv - last.recv) + (lost - last.lost)) : 0; last = { lost, recv };
        if (rtt > .6 || dl > .08) q = 'poor';
      } catch (e) { }
    }
    if (q !== o.q) { o.q = q; onChange(); }
  }, 2500);
}
const QTXT = { good: 'Good connection', poor: 'Poor connection', lost: 'Reconnecting', wait: 'Connecting' };
/* stop or restart sending my camera to one person (board-only mode) */
function sendVideo(call, on, stream) {
  const pc = call && call.peerConnection; if (!pc) return;
  const tr = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
  const v = stream && stream.getVideoTracks()[0];
  if (tr && tr.sender) tr.sender.replaceTrack(on && v ? v : null).catch(() => { });
}
function tile(id, name, self) { return `<div class="vt${self ? ' self' : ''}" id="${id}"><video autoplay playsinline ${self ? 'muted' : ''}></video><span class="av">${esc(initials(name))}</span><span class="nm">${esc(name)}${self ? ' (you)' : ''}</span><span class="q"></span></div>`; }
function attach(id, stream, hide) {
  const el = $(id); if (!el) return;
  const v = el.querySelector('video'), hasV = !!(stream && stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)) && !hide;
  if (v.srcObject !== stream) v.srcObject = stream || null;
  el.classList.toggle('novid', !hasV);
  if (stream) v.play().catch(() => { });
}
function setQ(id, q) { const el = $(id); if (!el) return; const b = el.querySelector('.q'); b.className = 'q ' + (q || ''); b.textContent = q && q !== 'good' ? QTXT[q] : ''; b.title = QTXT[q] || ''; }
function avBtns(L) {
  return `<div class="avb"><button class="btn small alt${L.mic ? '' : ' off'}" data-av="mic" aria-pressed="${!L.mic}">${L.mic ? '🎙 Mute' : '🎙 Unmute'}</button>
    <button class="btn small alt${L.cam ? '' : ' off'}" data-av="cam" aria-pressed="${!L.cam}" ${L.stream && L.stream.getVideoTracks().length ? '' : 'disabled'}>${L.cam ? '📷 Camera off' : '📷 Camera on'}</button>
    <button class="btn small alt${L.bo ? ' on' : ''}" data-av="bo" aria-pressed="${L.bo}" title="Stops video both ways to save data; voice and board keep working">${L.bo ? 'Board-only: on' : 'Board-only mode'}</button></div>`;
}
function wireAv(root, L, after) {
  root.querySelectorAll('[data-av]').forEach(b => b.onclick = () => {
    const k = b.dataset.av;
    if (k === 'mic') { L.mic = !L.mic; L.stream && L.stream.getAudioTracks().forEach(t => t.enabled = L.mic); }
    if (k === 'cam') { L.cam = !L.cam; L.stream && L.stream.getVideoTracks().forEach(t => t.enabled = L.cam); }
    if (k === 'bo') L.bo = !L.bo;
    after(k);
  });
}

/* ---------------- coach side ---------------- */
const H = { peer: null, code: '', stream: null, studs: new Map(), status: 'off', err: '', mic: true, cam: true, bo: false, box: null, t: 0 };
function coachName() { return (M.S.pulse.coach || '').trim() || 'Coach'; }
async function startClass() {
  H.status = 'starting'; H.err = ''; mountCoach();
  try { await loadPeer(); } catch (e) { H.status = 'off'; H.err = whyFail(e); return mountCoach(); }
  if (!window.isSecureContext) { H.status = 'off'; H.err = whyFail({}); return mountCoach(); }
  H.stream = await getMedia(); H.mic = true; H.cam = true;
  const open = tries => {
    H.code = newCode();
    const p = H.peer = new window.Peer(PFX + H.code, cfg());
    p.on('open', () => { H.status = 'live'; mountCoach(); M.toast('Live class started', 'Class code ' + H.code); });
    p.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 3) { p.destroy(); return open(tries + 1); }
      if (e.type === 'peer-unavailable') return;
      if (H.status === 'live' && (e.type === 'network' || e.type === 'socket-error' || e.type === 'socket-closed')) { H.err = 'Lost the connection service. New students can\'t join until it\'s back; classes already connected keep going.'; return mountCoach(); }
      if (H.status !== 'live') { endClass(true); H.err = whyFail(e); mountCoach(); }
    });
    p.on('disconnected', () => { if (H.status === 'live') setTimeout(() => { try { H.peer && !H.peer.destroyed && H.peer.reconnect(); } catch (er) { } }, 1500); });
    p.on('connection', conn => {
      conn.on('data', d => fromStudent(conn, d));
      conn.on('close', () => drop(conn.peer));
      conn.on('error', () => drop(conn.peer));
    });
  };
  open(0);
}
function endClass(silent) {
  H.studs.forEach(s => { try { s.conn.send({ t: 'end' }); } catch (e) { } clearInterval(s.qt); try { s.call && s.call.close(); } catch (e) { } });
  H.studs.clear();
  try { H.peer && H.peer.destroy(); } catch (e) { }
  H.stream && H.stream.getTracks().forEach(t => t.stop());
  Object.assign(H, { peer: null, stream: null, status: 'off', code: '', bo: false });
  if (!silent) { M.toast('Class ended', 'Everyone has been disconnected.'); mountCoach(); }
}
function drop(id) { const s = H.studs.get(id); if (!s) return; clearInterval(s.qt); try { s.call && s.call.close(); } catch (e) { } H.studs.delete(id); M.toast(s.name + ' left the class', ''); mountCoach(); }
function fromStudent(conn, d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'hello') {
    if (H.studs.size >= 6) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
    const s = { id: conn.peer, name: clean(d.name) || 'Student', conn, call: null, remote: null, q: 'wait', bo: false };
    H.studs.set(conn.peer, s);
    const call = H.peer.call(conn.peer, H.stream || silentStream(), { metadata: { name: coachName() } });
    s.call = call;
    call.on('stream', rs => { s.remote = rs; videos(); });
    call.on('close', () => { s.remote = null; videos(); });
    watch(s, call, () => { setQ('vt-' + s.id, s.q); });
    if (H.bo) { try { conn.send({ t: 'bo', on: true }); } catch (e) { } }
    send(s); M.toast(s.name + ' joined the class', 'They can see your board now.'); mountCoach();
    return;
  }
  const s = H.studs.get(conn.peer); if (!s) return;
  if (d.t === 'move' && typeof d.u === 'string') {
    const cands = Array.isArray(d.cands) ? d.cands.filter(x => typeof x === 'string').slice(0, 3).map(x => x.slice(0, 8)) : null;
    const r = M.classApi.remoteMove(d.u.slice(0, 5), cands, s.name);
    if (r === 'vote') conn.send({ t: 'voted' });
    else if (r !== 'ok' && r !== 'pending') conn.send({ t: 'nope', x: r });
  }
  if (d.t === 'bo') { s.bo = !!d.on; sendVideo(s.call, !s.bo && !H.bo, H.stream); videos(); }
  if (d.t === 'hand') { M.toast(s.name + ' raised a hand', ''); s.hand = Date.now(); mountCoach(); }
}
function stateMsg() {
  const A = M.classApi, CL = A.CL, l = CL.hist.at(-1), mk = A.marks;
  if (CL.poll && !CL.poll.id) CL.poll.id = Date.now();
  return { t: 'state', fen: C.fen(CL.pos), last: l ? [l.m.from, l.m.to] : null, a: CL.ma, h: CL.mh, preset: CL.preset, think: CL.think,
    poll: CL.poll ? { id: CL.poll.id, show: CL.poll.show, v: CL.poll.show ? CL.poll.v : null, n: CL.poll.n } : null,
    pending: CL.pending ? C.uci(CL.pending) : null, pendingBy: CL.pendingBy || null,
    eng: CL.engine && CL.eng && CL.eng.lines ? CL.eng.lines.map(x => [x.san, x.w]) : null, best: CL.engine && mk ? mk.engine : null,
    msg: CL.msg, flip: CL.flip, coach: coachName(), hist: CL.hist.slice(-12).map(h => h.san) };
}
function send(s) { try { s.conn.open && s.conn.send(stateMsg()); } catch (e) { } }
function broadcast() { if (H.status !== 'live' || !H.studs.size) return; clearTimeout(H.t); H.t = setTimeout(() => H.studs.forEach(send), 40); }
M.onClassSync = broadcast;
let lz = 0;
function laserOut(p, brk) { if (H.status !== 'live' || !H.studs.size) return; const now = Date.now(); if (!brk && now - lz < 35) return; lz = now; H.studs.forEach(s => { try { s.conn.send({ t: 'laser', x: +p.x.toFixed(2), y: +p.y.toFixed(2), b: brk }); } catch (e) { } }); }
function videos() {
  attach('vt-me', H.stream, H.bo || !H.cam);
  H.studs.forEach(s => { attach('vt-' + s.id, s.remote, H.bo || s.bo); setQ('vt-' + s.id, s.q); });
}
function mountCoach(box) {
  if (box) H.box = box; box = H.box; if (!box || !box.isConnected) return;
  const mk = M.classApi.marks;
  if (mk && !mk._live) { mk._live = true; const prev = mk.onChange; mk.onChange = () => { prev && prev(); broadcast(); }; mk.onLaser = laserOut; }
  if (H.status === 'off' || H.status === 'starting') {
    box.innerHTML = `<div class="card glass live"><div class="row" style="justify-content:space-between"><b>Live class with video</b>${H.status === 'starting' ? '<span class="muted thinking">Starting</span>' : ''}</div>
      <p class="muted small" style="margin:0">Students join from any browser with a 6-letter code. They see your board, arrows and laser, and their moves follow the permissions you set below.</p>
      ${H.err ? `<p class="note bad">${esc(H.err)}</p>` : ''}
      <div class="btns"><button class="btn small" id="lvStart" ${H.status === 'starting' ? 'disabled' : ''}>● Start live class</button></div></div>`;
    $('lvStart').onclick = startClass; return;
  }
  const link = location.href.split('#')[0] + '#join-' + H.code;
  const studs = [...H.studs.values()];
  box.innerHTML = `<div class="card glass live on">
    <div class="row" style="justify-content:space-between"><span class="row" style="gap:8px"><span class="dot"></span><b>Live</b><span class="muted small">${studs.length} student${studs.length === 1 ? '' : 's'} connected</span></span>
      <button class="btn small alt" id="lvEnd">End class</button></div>
    <div class="code"><span class="muted small">Class code</span><b>${H.code}</b><button class="btn small" id="lvCopy">Copy invite link</button>
      <a class="btn small alt" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Join my MoonChess class: ' + link + ' (code ' + H.code + ')')}">WhatsApp</a></div>
    ${H.err ? `<p class="note bad">${esc(H.err)}</p>` : ''}
    ${H.stream ? '' : '<p class="note">No camera or microphone available, so students see the board only. Check your browser\'s permission for this site.</p>'}
    <div class="vgrid">${tile('vt-me', coachName(), true)}${studs.map(s => tile('vt-' + s.id, s.name + (s.hand && Date.now() - s.hand < 60000 ? ' ✋' : ''))).join('')}${studs.length ? '' : '<div class="vt wait"><span class="muted small">Waiting for students. Share the code or the link.</span></div>'}</div>
    ${avBtns(H)}</div>`;
  $('lvEnd').onclick = async () => { if (await M.ask('End the live class?', 'Everyone will be disconnected. Your board stays as it is.', 'End class', 'Keep teaching')) endClass(); };
  $('lvCopy').onclick = async () => { try { await navigator.clipboard.writeText(link); $('lvCopy').textContent = 'Copied!'; } catch (e) { $('lvCopy').textContent = link; } };
  wireAv(box, H, k => {
    if (k === 'bo') { H.studs.forEach(s => { sendVideo(s.call, !H.bo && !s.bo, H.stream); try { s.conn.send({ t: 'bo', on: H.bo }); } catch (e) { } }); }
    mountCoach();
  });
  videos();
}
M.liveMount = mountCoach;
addEventListener('beforeunload', () => { if (H.peer) endClass(true); if (J.peer) leave(true); });

/* ---------------- student side ---------------- */
const J = { peer: null, conn: null, call: null, stream: null, remote: null, status: 'off', err: '', st: null, mic: true, cam: true, bo: false, coachBo: false, q: 'wait', stage: 'mark', voted: null, sent: false, B: null, MK: null, code: '' };
function leave(silent, why) {
  clearInterval(J.qt); clearTimeout(J.to);
  try { J.call && J.call.close(); } catch (e) { } try { J.peer && J.peer.destroy(); } catch (e) { }
  J.stream && J.stream.getTracks().forEach(t => t.stop());
  Object.assign(J, { peer: null, conn: null, call: null, stream: null, remote: null, status: 'off', st: null, B: null, MK: null, bo: false, coachBo: false });
  if (why) J.err = why;
  if (!silent && location.hash.startsWith('#join')) vJoin();
}
async function join(code, name) {
  J.err = ''; J.code = code; J.status = 'joining'; vJoin();
  try { await loadPeer(); } catch (e) { J.status = 'off'; J.err = whyFail(e); return vJoin(); }
  if (!window.isSecureContext) { J.status = 'off'; J.err = whyFail({}); return vJoin(); }
  J.stream = await getMedia(); J.mic = true; J.cam = true;
  const p = J.peer = new window.Peer(cfg());
  J.to = setTimeout(() => { if (J.status === 'joining') leave(false, 'The class didn\'t answer. Check the code, and that your coach has started the class.'); }, 20000);
  p.on('error', e => { if (J.status === 'joining' || e.type === 'peer-unavailable') leave(false, whyFail(e)); });
  p.on('open', () => {
    const c = J.conn = p.connect(PFX + code, { reliable: true });
    c.on('open', () => c.send({ t: 'hello', name }));
    c.on('data', fromCoach);
    c.on('close', () => { if (J.status !== 'off') leave(false, 'The class has ended, or the connection dropped. You can join again with the same code.'); });
  });
  p.on('call', call => {
    J.call = call; call.answer(J.stream || undefined);
    call.on('stream', rs => { J.remote = rs; jVideos(); });
    watch(J, call, () => { setQ('vt-coach', J.q); jStatus(); });
  });
}
function fromCoach(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'full') return leave(false, 'This class is full (6 students). Ask your coach.');
  if (d.t === 'end') return leave(false, 'Your coach ended the class. Well played today!');
  if (d.t === 'state') {
    const first = J.status !== 'in'; clearTimeout(J.to);
    if (J.st && (J.st.fen !== d.fen || (d.poll && J.st.poll && d.poll.id !== J.st.poll.id) || (!d.poll && J.st.poll))) { J.sent = false; J.stage = 'mark'; if (J.MK) J.MK.cands = []; }
    if (J.st && J.st.pending && !d.pending) J.sent = false;
    J.st = d; J.status = 'in';
    if (first) { vJoin(); M.toast('You\'re in the class', 'Say hello to ' + (d.coach || 'your coach') + '!'); } else jBoard();
    return;
  }
  if (d.t === 'voted') { J.voted = J.st && J.st.poll && J.st.poll.id; J.sent = false; jBoard(); return; }
  if (d.t === 'nope') { J.sent = false; jSay(d.x); jBoard(); return; }
  if (d.t === 'bo') { J.coachBo = !!d.on; sendVideo(J.call, !J.bo && !J.coachBo, J.stream); jVideos(); return; }
  if (d.t === 'laser' && J.MK) { const pt = { x: +d.x, y: +d.y, t: performance.now(), brk: !!d.b }; if (isFinite(pt.x) && isFinite(pt.y)) { if (J.st && J.st.flip !== jFlip()) { pt.x = 8 - pt.x; pt.y = 8 - pt.y; } J.MK.laser.push(pt); J.MK.loop(); } }
}
const jFlip = () => J.myFlip != null ? J.myFlip : !!(J.st && J.st.flip);
function canMove() {
  const s = J.st; if (!s || J.sent) return false;
  if (s.poll) return J.voted !== s.poll.id;
  if (s.preset === 'demo' || s.pending) return false;
  return !(s.think && J.stage === 'mark');
}
function jSay(t) { const e = $('jSay'); if (e) e.textContent = t; }
function jStatus() {
  const s = J.st, e = $('jState'); if (!e || !s) return;
  let t;
  if (J.sent) t = s.preset === 'guided' && !s.poll ? 'Move sent. Waiting for your coach to approve it.' : 'Sent!';
  else if (s.poll) t = J.voted === s.poll.id ? 'Vote in! Wait for the results.' : 'Class poll: what would you play? Make your move on the board to vote.';
  else if (s.preset === 'demo') t = 'Your coach is demonstrating. Watch the board.';
  else if (s.pending) t = (s.pendingBy || 'A student') + ' proposed a move. Waiting for the coach.';
  else if (s.think && J.stage === 'mark') t = 'Think First: drag up to 3 candidate moves, then lock them in.';
  else t = s.preset === 'guided' ? 'Your turn to suggest a move. Your coach approves it.' : 'You can move on the board.';
  e.textContent = t;
  const q = $('jQ'); if (q) { q.textContent = QTXT[J.q] || ''; q.className = 'tag ' + (J.q === 'good' ? 'ok' : ''); }
}
function jBoard() {
  const s = J.st; if (!s || !J.B) return;
  const pos = C.parse(s.fen), flip = jFlip();
  J.B.set(pos, { mine: pos.turn, flip, last: s.last, locked: !canMove(), hint: [] });
  const mk = J.MK; mk.flip = flip; mk.arrows = (s.a || []).map(x => x.slice()); mk.highs = (s.h || []).slice();
  mk.engine = s.best || null; mk.poll = s.poll && s.poll.show ? s.poll.v : null;
  mk.pending = s.pending ? [C.sqIdx(s.pending.slice(0, 2)), C.sqIdx(s.pending.slice(2, 4))] : null;
  const cand = s.think && !s.poll && !J.sent && J.stage === 'mark' && s.preset !== 'demo' && !s.pending;
  mk.setTool(cand ? 'cand' : 'move'); if (!s.think) mk.cands = [];
  mk.render();
  $('jMsg').textContent = s.msg || '';
  $('jMoves').textContent = s.hist && s.hist.length ? s.hist.join(' ') : 'No moves yet.';
  const pan = $('jPanel');
  pan.innerHTML = (cand ? `<div class="note good">Candidates: ${mk.cands.length}/3 <button class="btn small" id="jLock" ${mk.cands.length ? '' : 'disabled'}>Lock in and move</button></div>` : '') +
    (s.eng ? `<div class="evalrow"><span class="ev">${M.classApi.evalTxt(s.eng[0] ? s.eng[0][1] : 0)}</span><span class="muted">Engine: ${s.eng.map(([san, w]) => `<b>${esc(san)}</b> ${M.classApi.evalTxt(w)}`).join(' · ')}</span></div>` : '') +
    (s.poll && s.poll.show && s.poll.v ? `<div class="note pink"><b>Poll results</b> ${Object.entries(s.poll.v).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([u, n]) => { const m = C.fromUci(pos, u); return m ? `${esc(C.san(pos, m))} ${Math.round(n / s.poll.n * 100)}%` : ''; }).join(' · ')}</div>` : '');
  const lk = $('jLock'); lk && (lk.onclick = () => { J.stage = 'move'; jBoard(); });
  jStatus();
}
function jVideos() { attach('vt-coach', J.remote, J.bo || J.coachBo); attach('vt-me', J.stream, J.bo || J.coachBo || !J.cam); setQ('vt-coach', J.q); }
function vJoin() {
  const V = $('v-join');
  if (J.status !== 'in') {
    const code = (J.code || M.joinCode || '').toUpperCase();
    V.innerHTML = `<div class="joinbox glass">${M.pipSvg('pipm')}<h2 class="title">Join your class</h2>
      <p class="muted" style="margin:0">Type the 6-letter code from your coach. Allow the camera and microphone when your browser asks.</p>
      <label>Class code<input id="jCode" value="${esc(code)}" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7QM2P" class="codein"></label>
      <label>Your name<input id="jName" value="${esc(myName)}" maxlength="24" placeholder="First name is fine"></label>
      ${J.err ? `<p class="note bad">${esc(J.err)}</p>` : ''}
      <div class="btns"><button class="btn" id="jGo" ${J.status === 'joining' ? 'disabled' : ''}>${J.status === 'joining' ? 'Joining…' : 'Join class →'}</button></div>
      <p class="muted small" style="margin:0">Coach? Start a class from the <a class="lnk" href="#class">Classroom</a>.</p></div>`;
    $('jGo').onclick = () => {
      const c = $('jCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), n = clean($('jName').value);
      if (c.length !== 6) { J.err = 'The class code has 6 letters and numbers.'; return vJoin(); }
      if (!n) { J.err = 'Add your name so your coach knows who joined.'; return vJoin(); }
      saveName(n); join(c, n);
    };
    $('jCode').onkeydown = $('jName').onkeydown = e => { if (e.key === 'Enter') $('jGo').click(); };
    return;
  }
  V.innerHTML = `<div class="play cls">
    <div class="boardbox glass"><div class="bwrap"><div class="board" id="jBoard" aria-label="Class board"></div><svg class="marks" id="jMarks" aria-hidden="true"></svg></div></div>
    <div class="side">
      <div class="card glass live on"><div class="row" style="justify-content:space-between"><span class="row" style="gap:8px"><span class="dot"></span><b>${esc(J.st.coach || 'Coach')}'s class</b></span><span id="jQ" class="tag"></span></div>
        <div class="vgrid two">${tile('vt-coach', J.st.coach || 'Coach')}${tile('vt-me', myName || 'Me', true)}</div>
        ${J.stream ? '' : '<p class="note">No camera or microphone, so you\'re in board-only mode. You can still move and vote.</p>'}
        ${avBtns(J)}
        <div class="btns"><button class="btn small alt" id="jHand">✋ Raise hand</button><button class="btn small alt" id="jFlipB">Flip board</button><button class="btn small alt" id="jLeave">Leave</button></div></div>
      <div class="pip">${M.pipSvg()}<div class="bubble glass" aria-live="polite"><p id="jState"></p><p class="muted small" id="jSay" style="margin-top:4px"></p></div></div>
      <div id="jPanel" class="cpanel"></div>
      <div class="card glass"><b>From your coach</b><p id="jMsg" class="muted" style="margin:4px 0 0"></p><p class="small" style="margin:8px 0 0"><span class="muted">Moves:</span> <span id="jMoves"></span></p></div>
    </div></div>`;
  J.B = new M.Board($('jBoard'), m => {
    if (!canMove()) return;
    const pos = J.B.pos, cands = J.st.think && !J.st.poll ? J.MK.cands.map(a => { const mm = C.legal(pos).find(x => x.from === a[0] && x.to === a[1]); return mm ? C.san(pos, mm) : ''; }).filter(Boolean) : null;
    J.sent = true; J.conn.send({ t: 'move', u: C.uci(m), cands }); J.B.fx(m); jSay(''); jBoard();
  });
  J.MK = new M.Marks($('jMarks'));
  J.MK.onCand = (a, b) => {
    const pos = J.B.pos; if (!C.legal(pos).some(x => x.from === a && x.to === b)) { jSay('Candidates must be legal moves.'); return; }
    const k = J.MK.cands.findIndex(x => x[0] === a && x[1] === b);
    if (k >= 0) J.MK.cands.splice(k, 1); else if (J.MK.cands.length < 3) J.MK.cands.push([a, b]); else { jSay('Three is the limit. Drag one again to remove it.'); return; }
    jBoard();
  };
  wireAv(V, J, k => { if (k === 'bo') { sendVideo(J.call, !J.bo && !J.coachBo, J.stream); try { J.conn.send({ t: 'bo', on: J.bo }); } catch (e) { } } vJoinControls(); jVideos(); });
  $('jHand').onclick = () => { try { J.conn.send({ t: 'hand' }); jSay('Hand raised. Your coach can see it.'); } catch (e) { } };
  $('jFlipB').onclick = () => { J.myFlip = !jFlip(); jBoard(); };
  $('jLeave').onclick = async () => { if (await M.ask('Leave the class?', 'You can join again with the same code while the class is live.', 'Leave', 'Stay')) leave(false, ''); };
  jBoard(); jVideos();
}
function vJoinControls() { const a = document.querySelector('#v-join .avb'); if (!a) return; const d = document.createElement('div'); d.innerHTML = avBtns(J); a.replaceWith(d.firstElementChild); wireAv(document.querySelector('#v-join .live'), J, k => { if (k === 'bo') { sendVideo(J.call, !J.bo && !J.coachBo, J.stream); try { J.conn.send({ t: 'bo', on: J.bo }); } catch (e) { } } vJoinControls(); jVideos(); }); }
M.view('join', () => { if (J.status === 'in' && J.B && $('jBoard')) { jBoard(); jVideos(); } else vJoin(); }, { app: true, nav: 'class' });

/* ================= play a friend online, with video and voice ================= */
const DPFX = 'moonchess-duel-';
const TCS = [['none', 'No clock'], ['3+2', '3 + 2'], ['5+3', '5 + 3'], ['10+0', '10 + 0'], ['15+10', '15 + 10']];
const tcOf = k => { if (!k || k === 'none') return null; const [m, s] = k.split('+').map(Number); return { base: m * 60000, inc: s * 1000, k }; };
const fmtClock = ms => { ms = Math.max(0, ms); const s = ms / 1000; if (s < 10) return '0:0' + s.toFixed(1); const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); };
const D = { role: null, status: 'off', err: '', peer: null, conn: null, call: null, stream: null, remote: null, mic: true, cam: true, bo: false, oppBo: false, q: 'wait',
  code: '', me: 'w', pick: 'r', tcKey: '10+0', tc: null, oppName: '', pos: null, hist: [], keys: [], clock: null, t0: 0, over: null, offer: null, tbReq: null, rmReq: null, chat: [], view: null, B: null, tick: 0, game: 0, gone: 0 };
const opp = c => c === 'w' ? 'b' : 'w';
function dsend(m) { try { D.conn && D.conn.open && D.conn.send(m); } catch (e) { } }
function dReset() {
  clearInterval(D.tick); clearInterval(D.qt);
  try { D.call && D.call.close(); } catch (e) { } try { D.peer && D.peer.destroy(); } catch (e) { }
  D.stream && D.stream.getTracks().forEach(t => t.stop());
  Object.assign(D, { role: null, status: 'off', peer: null, conn: null, call: null, stream: null, remote: null, over: null, offer: null, tbReq: null, rmReq: null, chat: [], view: null, B: null, gone: 0, bo: false, oppBo: false });
}
/* ---------- setting up ---------- */
async function dCreate() {
  D.err = ''; D.status = 'creating'; vDuel();
  try { await loadPeer(); } catch (e) { D.status = 'off'; D.err = whyFail(e); return vDuel(); }
  if (!window.isSecureContext) { D.status = 'off'; D.err = whyFail({}); return vDuel(); }
  D.stream = await getMedia(); D.mic = D.cam = true; D.role = 'host'; D.tc = tcOf(D.tcKey);
  const open = tries => {
    D.code = newCode(); const p = D.peer = new window.Peer(DPFX + D.code, cfg());
    p.on('open', () => { D.status = 'waiting'; vDuel(); });
    p.on('error', e => { if (e.type === 'unavailable-id' && tries < 3) { p.destroy(); return open(tries + 1); } if (e.type === 'peer-unavailable') return; if (D.status === 'creating') { dReset(); D.err = whyFail(e); vDuel(); } });
    p.on('disconnected', () => { if (D.peer && !D.peer.destroyed) setTimeout(() => { try { D.peer.reconnect(); } catch (er) { } }, 1500); });
    p.on('connection', conn => {
      conn.on('data', d => {
        if (conn === D.conn) return fromOpp(d);
        if (!d || d.t !== 'hello') return;
        const name = clean(d.name) || 'Friend';
        const back = D.status === 'playing' && name.toLowerCase() === (D.oppName || '').toLowerCase();
        if (D.status === 'waiting' || back) {
          const old = D.conn; D.conn = conn; conn.on('close', () => oppGone(conn));
          if (old) try { old.close(); } catch (e) { }
          fromOpp(d);
        } else { try { conn.send({ t: 'busy' }); } catch (e) { } setTimeout(() => conn.close(), 300); }
      });
    });
  };
  open(0);
}
async function dJoin(code, name) {
  D.err = ''; D.code = code; D.status = 'joining'; vDuel();
  try { await loadPeer(); } catch (e) { D.status = 'off'; D.err = whyFail(e); return vDuel(); }
  if (!window.isSecureContext) { D.status = 'off'; D.err = whyFail({}); return vDuel(); }
  D.stream = await getMedia(); D.mic = D.cam = true; D.role = 'guest';
  const p = D.peer = new window.Peer(cfg());
  const to = setTimeout(() => { if (D.status === 'joining') { dReset(); D.err = 'Your friend\'s game didn\'t answer. Check the code, and that they\'re still on the waiting screen.'; vDuel(); } }, 20000);
  p.on('error', e => { if (D.status === 'joining' || e.type === 'peer-unavailable') { clearTimeout(to); dReset(); D.err = e.type === 'peer-unavailable' ? 'No game with that code is waiting. Ask your friend for the code again.' : whyFail(e); vDuel(); } });
  p.on('open', () => { const c = D.conn = p.connect(DPFX + code, { reliable: true }); c.on('open', () => c.send({ t: 'hello', name })); c.on('data', d => { clearTimeout(to); fromOpp(d); }); c.on('close', () => oppGone(c)); });
  p.on('call', call => { D.call = call; call.answer(D.stream || undefined); call.on('stream', rs => { D.remote = rs; dVideos(); }); watch(D, call, () => { setQ('dv-opp', D.q); }); });
}
function callOpp() {
  try { D.call && D.call.close(); } catch (e) { }
  const call = D.peer.call(D.conn.peer, D.stream || silentStream(), { metadata: { name: myName } });
  D.call = call; call.on('stream', rs => { D.remote = rs; dVideos(); }); watch(D, call, () => { setQ('dv-opp', D.q); });
}
/* ---------- game state ---------- */
function newGame(hostColor) {
  D.seen = Date.now(); D.gone = 0;
  D.pos = C.parse(C.START); D.hist = []; D.keys = [C.fen(D.pos, true)]; D.over = null; D.offer = null; D.tbReq = null; D.rmReq = null; D.view = null;
  D.clock = D.tc ? { w: D.tc.base, b: D.tc.base } : null; D.t0 = Date.now(); D.game++;
  D.me = D.role === 'host' ? hostColor : opp(hostColor); D.status = 'playing';
  clearInterval(D.tick); D.tick = setInterval(tick, 200);
}
function hostStart(again) {
  const hostColor = again ? opp(D.me) : (D.pick === 'r' ? (Math.random() < .5 ? 'w' : 'b') : D.pick);
  newGame(hostColor);
  dsend({ t: 'start', hostColor, tc: D.tcKey, name: myName });
  vDuel(); M.toast(again ? 'Rematch!' : 'Game on!', D.me === 'w' ? 'You have White. Your move.' : 'You have Black. ' + D.oppName + ' moves first.');
}
const running = () => D.status === 'playing' && !D.over && D.clock && D.hist.length >= 2;
const left = c => !D.clock ? null : D.clock[c] - (running() && D.pos.turn === c ? Date.now() - D.t0 : 0);
function tick() {
  if (D.status !== 'playing' || D.over || !D.clock) return;
  const c = D.pos.turn, l = left(c);
  ['w', 'b'].forEach(x => { const e = $('dclk-' + x); if (e) { const v = left(x); e.textContent = fmtClock(v); e.classList.toggle('run', running() && D.pos.turn === x); e.classList.toggle('low', v < 20000); } });
  if (l <= 0 && running()) {
    if (c === D.me) { dsend({ t: 'flag', c }); endGame(opp(c), 'on time'); }
    else if (l < -2500) { dsend({ t: 'flag', c }); endGame(D.me, 'on time'); }
  }
}
function playMove(m, mine, clk) {
  if (D.view != null) D.view = null;
  const p = D.pos, san = C.san(p, m), after = C.make(p, m), mover = p.turn;
  if (D.clock && D.hist.length >= 2) { if (mine) { D.clock[mover] = Math.max(0, D.clock[mover] - (Date.now() - D.t0)) + D.tc.inc; } else if (clk != null) D.clock[mover] = clk; }
  else if (D.clock && clk != null && !mine) D.clock[mover] = clk;
  D.t0 = Date.now();
  D.hist.push({ pos: p, m, san }); D.keys.push(C.fen(after, true)); D.pos = after; D.offer = D.offer === (mine ? 'opp' : 'me') ? null : D.offer; D.tbReq = null;
  if (mine) dsend({ t: 'move', u: C.uci(m), ply: D.hist.length, clk: D.clock ? D.clock[mover] : null });
  if (D.B) { D.B.fx(m); if (C.inCheck(after)) window.FX.sfx('check'); }
  const st = C.status(after, D.keys.slice(0, -1));
  if (st === 'checkmate') endGame(mover, 'by checkmate');
  else if (st) endGame(null, { stalemate: 'by stalemate', fifty: 'by the fifty-move rule', insufficient: 'with not enough material to mate', repetition: 'by repetition' }[st]);
  dBoard();
}
function endGame(winner, how) {
  if (D.over) return;
  D.over = { winner, how }; D.offer = null; D.tbReq = null;
  const res = winner == null ? 'draw' : winner === D.me ? 'win' : 'loss';
  M.S.games++; M.S.xp += res === 'win' ? 40 : 20; M.logAct('game', { res, bot: 'online' }); M.afterProgress();
  if (res === 'win') { window.FX.party($('dBoard')); window.FX.sfx('win'); } else window.FX.sfx(res === 'draw' ? 'move' : 'lose');
  M.mood(res === 'loss' ? 'oops' : 'happy');
  if (D.hist.length >= 6) M.importGame(pgnText(), D.me, 'Online game vs ' + (D.oppName || 'a friend')).then(r => { if (r && r.n) M.toast('Mistake Deck: ' + r.n + ' new card' + (r.n > 1 ? 's' : ''), 'Positions from this game are waiting in Practice.'); });
  dBoard();
}
function pgnText() {
  const res = !D.over ? '*' : D.over.winner == null ? '1/2-1/2' : D.over.winner === 'w' ? '1-0' : '0-1';
  const names = D.me === 'w' ? [myName, D.oppName] : [D.oppName, myName];
  return window.PGN.toPgn(C.fen(C.parse(C.START)), D.hist.map(h => h.san), { Event: 'MoonChess online game', Date: M.today().replace(/-/g, '.'), White: names[0] || '?', Black: names[1] || '?', TimeControl: D.tc ? D.tc.base / 1000 + '+' + D.tc.inc / 1000 : '-', Result: res });
}
function undo(n) { for (let i = 0; i < n && D.hist.length; i++) { const h = D.hist.pop(); D.keys.pop(); D.pos = h.pos; } D.t0 = Date.now(); D.view = null; dBoard(); }
function sync() { dsend({ t: 'sync', hostColor: D.role === 'host' ? D.me : opp(D.me), tc: D.tcKey, name: myName, moves: D.hist.map(h => C.uci(h.m)), clock: D.clock, over: D.over, chat: D.chat.slice(-30) }); }
function fromOpp(d) {
  if (!d || typeof d !== 'object') return;
  D.seen = Date.now();
  if (D.gone && d.t !== 'bye' && d.t !== 'hello') { D.gone = 0; dVideos(); dBoard(); }
  if (d.t === 'ping') return;
  const say = t => { const e = $('dSay'); if (e) e.textContent = t; };
  switch (d.t) {
    case 'hello': {
      const name = clean(d.name) || 'Friend';
      if (D.status === 'playing') { D.gone = 0; D.oppName = name; callOpp(); sync(); vDuel(); M.toast(name + ' is back', 'The game continues.'); return; }
      D.oppName = name; callOpp(); hostStart(false); return;
    }
    case 'busy': dReset(); D.err = 'That game already has two players.'; return vDuel();
    case 'start': D.oppName = clean(d.name) || 'Friend'; D.tcKey = TCS.some(x => x[0] === d.tc) ? d.tc : 'none'; D.tc = tcOf(D.tcKey); newGame(d.hostColor === 'b' ? 'b' : 'w'); vDuel();
      M.toast('Game on!', D.me === 'w' ? 'You have White. Your move.' : 'You have Black. ' + D.oppName + ' moves first.'); return;
    case 'sync': {
      D.oppName = clean(d.name) || D.oppName; D.tcKey = TCS.some(x => x[0] === d.tc) ? d.tc : 'none'; D.tc = tcOf(D.tcKey); newGame(d.hostColor === 'b' ? 'b' : 'w');
      for (const u of (d.moves || []).slice(0, 600)) { const m = C.fromUci(D.pos, String(u)); if (!m) break; const after = C.make(D.pos, m); D.hist.push({ pos: D.pos, m, san: C.san(D.pos, m) }); D.keys.push(C.fen(after, true)); D.pos = after; }
      if (d.clock && D.tc) D.clock = { w: +d.clock.w || 0, b: +d.clock.b || 0 }; D.t0 = Date.now();
      if (d.over) D.over = { winner: d.over.winner === 'w' || d.over.winner === 'b' ? d.over.winner : null, how: String(d.over.how || '').slice(0, 40) };
      D.chat = Array.isArray(d.chat) ? d.chat.slice(-30).map(x => ({ who: x.who === 'me' ? 'opp' : 'me', x: String(x.x).slice(0, 300) })) : D.chat;
      vDuel(); return;
    }
    case 'move': {
      if (D.over || D.status !== 'playing') return;
      const m = typeof d.u === 'string' && C.fromUci(D.pos, d.u);
      if (!m || D.pos.turn === D.me || d.ply !== D.hist.length + 1) { dsend({ t: 'resync' }); return; }
      playMove(m, false, typeof d.clk === 'number' ? d.clk : null); return;
    }
    case 'resync': if (D.role === 'host') sync(); return;
    case 'resign': if (!D.over) endGame(D.me, 'by resignation'); return;
    case 'flag': if (!D.over && (d.c === 'w' || d.c === 'b')) endGame(opp(d.c), 'on time'); return;
    case 'draw-offer': if (!D.over) { D.offer = 'opp'; dBoard(); window.FX.sfx('click'); } return;
    case 'draw-yes': if (!D.over && D.offer === 'me') endGame(null, 'by agreement'); return;
    case 'draw-no': D.offer = null; dBoard(); say(D.oppName + ' declined the draw. Play on!'); return;
    case 'tb-req': if (!D.over) { D.tbReq = { n: Math.max(1, Math.min(2, d.n | 0)) }; dBoard(); window.FX.sfx('click'); } return;
    case 'tb-yes': if (D.tbReq && D.tbReq.mine) { const n = D.tbReq.n; D.tbReq = null; undo(n); say('Take-back accepted.'); } return;
    case 'tb-no': D.tbReq = null; dBoard(); say(D.oppName + ' said no to the take-back.'); return;
    case 'rm-req': D.rmReq = 'opp'; dBoard(); return;
    case 'rm-yes': if (D.role === 'host') hostStart(true); return;
    case 'chat': { const x = String(d.x || '').slice(0, 300).trim(); if (x) { D.chat.push({ who: 'opp', x }); dChat(); window.FX.sfx('click'); } return; }
    case 'bo': D.oppBo = !!d.on; sendVideo(D.call, !D.bo && !D.oppBo, D.stream); dVideos(); return;
    case 'bye': D.gone = Date.now(); dBoard(); return;
  }
}
function oppGone(conn) {
  if (conn !== D.conn || D.status === 'off') return;
  if (D.status === 'waiting' || D.status === 'joining') return;
  D.gone = Date.now(); D.remote = null; dVideos(); dBoard();
}
/* ---------- screens ---------- */
function vDuel() {
  const V = $('v-duel');
  if (D.status === 'off' || D.status === 'creating' || D.status === 'joining') {
    const code = (D.code || M.duelCode || '').toUpperCase();
    V.innerHTML = `<div class="row"><a class="btn alt small" href="#play">← Play</a></div>
      <h2 class="title" style="margin-top:12px">Play a friend online</h2>
      <p class="lede">See and hear each other while you play. One of you creates a game and shares the link; the other joins with it.</p>
      ${D.err ? `<p class="note bad" style="max-width:760px;margin-bottom:16px">${esc(D.err)}</p>` : ''}
      <div class="duelsetup">
        <div class="card glass"><h3>Create a game</h3>
          <label>Your name<input id="dName" value="${esc(myName)}" maxlength="24" placeholder="First name is fine"></label>
          <div><span class="lbl">Your colour</span><div class="seg" role="group" aria-label="Your colour">${[['w', 'White'], ['r', 'Random'], ['b', 'Black']].map(([v, l]) => `<button data-dc="${v}" class="${D.pick === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <div><span class="lbl">Clock</span><div class="seg wrapseg" role="group" aria-label="Time control">${TCS.map(([v, l]) => `<button data-tc="${v}" class="${D.tcKey === v ? 'on' : ''}">${l}</button>`).join('')}</div><p class="muted small" style="margin:6px 0 0">Minutes each, plus seconds added per move. Clocks start after both first moves.</p></div>
          <div class="btns"><button class="btn" id="dCreate" ${D.status === 'creating' ? 'disabled' : ''}>${D.status === 'creating' ? 'Creating…' : 'Create game and get a link →'}</button></div></div>
        <div class="card glass"><h3>Join a game</h3>
          <label>Game code<input id="dCode" class="codein" value="${esc(code)}" maxlength="6" autocomplete="off" placeholder="K7QM2P"></label>
          <label>Your name<input id="dName2" value="${esc(myName)}" maxlength="24" placeholder="First name is fine"></label>
          <div class="btns"><button class="btn" id="dJoin" ${D.status === 'joining' ? 'disabled' : ''}>${D.status === 'joining' ? 'Joining…' : 'Join game →'}</button></div>
          <p class="muted small" style="margin:0">Allow the camera and microphone when the browser asks. No camera? You can still play.</p></div>
      </div>`;
    $('dName').oninput = e => { myName = e.target.value; }; $('dName2').oninput = e => { myName = e.target.value; }; $('dCode').oninput = e => { D.code = e.target.value; };
    V.querySelectorAll('[data-dc]').forEach(b => b.onclick = () => { D.pick = b.dataset.dc; vDuel(); });
    V.querySelectorAll('[data-tc]').forEach(b => b.onclick = () => { D.tcKey = b.dataset.tc; vDuel(); });
    $('dCreate').onclick = () => { const n = clean($('dName').value); if (!n) { D.err = 'Add your name so your friend knows it\'s you.'; return vDuel(); } saveName(n); dCreate(); };
    $('dJoin').onclick = () => { const c = $('dCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), n = clean($('dName2').value); if (c.length !== 6) { D.err = 'The game code has 6 letters and numbers.'; return vDuel(); } if (!n) { D.err = 'Add your name so your friend knows it\'s you.'; return vDuel(); } saveName(n); dJoin(c, n); };
    return;
  }
  if (D.status === 'waiting') {
    const link = location.href.split('#')[0] + '#duel-' + D.code;
    V.innerHTML = `<div class="joinbox glass"><h2 class="title">Waiting for your friend</h2>
      <p class="muted" style="margin:0">Send them this link or code. The game starts as soon as they join.</p>
      <div class="code" style="justify-content:center"><b>${D.code}</b></div>
      <div class="btns" style="justify-content:center"><button class="btn small" id="dCopy">Copy link</button><a class="btn small alt" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Play chess with me on MoonChess: ' + link + ' (code ' + D.code + ')')}">Send on WhatsApp</a></div>
      <div class="vgrid">${tile('dv-me', myName || 'You', true)}</div>
      <p class="muted small" style="margin:0;text-align:center">${D.tc ? 'Clock: ' + D.tc.k.replace('+', ' + ') : 'No clock'} · Your colour: ${{ w: 'White', b: 'Black', r: 'random' }[D.pick]}</p>
      <div class="btns" style="justify-content:center"><button class="btn small alt" id="dCancel">Cancel</button></div></div>`;
    $('dCopy').onclick = async () => { try { await navigator.clipboard.writeText(link); $('dCopy').textContent = 'Copied!'; } catch (e) { $('dCopy').textContent = link; } };
    $('dCancel').onclick = () => { dReset(); vDuel(); };
    dVideos(); return;
  }
  V.innerHTML = `<div class="play duel">
    <div><div class="boardbox glass"><div class="board" id="dBoard" aria-label="Chess board"></div></div></div>
    <div class="side">
      <div class="pl glass"><div class="vgrid one">${tile('dv-opp', D.oppName || 'Friend')}</div><div class="plrow"><b>${esc(D.oppName || 'Friend')}</b><span class="muted small">${opp(D.me) === 'w' ? 'White' : 'Black'}</span>${D.clock ? `<span class="clk" id="dclk-${opp(D.me)}"></span>` : ''}</div></div>
      <div class="pip">${M.pipSvg()}<div class="bubble glass" aria-live="polite"><p id="dSay"></p></div></div>
      <div id="dPanel" class="cpanel"></div>
      <div class="card glass mlist"><div class="row" style="justify-content:space-between"><b>Moves</b><span class="muted small" id="dPly"></span></div><div class="cmoves" id="dMoves"></div>
        <div class="navbtns" role="group" aria-label="Step through moves"><button class="btn small alt" data-dn="first" aria-label="First position">⏮</button><button class="btn small alt" data-dn="prev" aria-label="Previous move">◀</button><button class="btn small alt" data-dn="next" aria-label="Next move">▶</button><button class="btn small alt" data-dn="last" aria-label="Back to the game">⏭</button></div>
        <div class="btns" id="dActs"></div></div>
      <div class="pl glass me"><div class="plrow"><b>${esc(myName || 'You')}</b><span class="muted small">${D.me === 'w' ? 'White' : 'Black'} · you</span>${D.clock ? `<span class="clk" id="dclk-${D.me}"></span>` : ''}</div><div class="vgrid one sm">${tile('dv-me', myName || 'You', true)}</div>${avBtns(D)}</div>
      <div class="card glass chat"><b>Chat</b><div class="msgs" id="dChat" aria-live="polite"></div><form class="row" id="dChatF"><input id="dChatIn" maxlength="300" placeholder="Say something nice" aria-label="Chat message" autocomplete="off"><button class="btn small">Send</button></form></div>
    </div></div>`;
  D.B = new M.Board($('dBoard'), m => { if (D.over || D.view != null || D.pos.turn !== D.me) return; playMove(m, true); });
  V.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => { const at = D.view == null ? D.hist.length : D.view; dView({ first: 0, prev: at - 1, next: at + 1, last: D.hist.length }[b.dataset.dn]); });
  const avAfter = k => { if (k === 'bo') { sendVideo(D.call, !D.bo && !D.oppBo, D.stream); dsend({ t: 'bo', on: D.bo }); } const a = V.querySelector('.pl.me .avb'); if (a) { const t = document.createElement('div'); t.innerHTML = avBtns(D); a.replaceWith(t.firstElementChild); wireAv(V.querySelector('.pl.me'), D, avAfter); } dVideos(); };
  wireAv(V.querySelector('.pl.me'), D, avAfter);
  $('dChatF').onsubmit = e => { e.preventDefault(); const x = $('dChatIn').value.trim().slice(0, 300); if (!x) return; D.chat.push({ who: 'me', x }); dsend({ t: 'chat', x }); $('dChatIn').value = ''; dChat(); };
  dBoard(); dChat(); dVideos(); tick();
}
function dView(i) { i = Math.max(0, Math.min(D.hist.length, i)); D.view = i === D.hist.length ? null : i; dBoard(); }
function dBoard() {
  if (!D.B || !$('dBoard')) return;
  const at = D.view == null ? D.hist.length : D.view, pos = at < D.hist.length ? D.hist[at].pos : D.pos, l = at ? D.hist[at - 1] : null;
  D.B.set(pos, { mine: D.me, flip: D.me === 'b', last: l ? [l.m.from, l.m.to] : null, hint: [], locked: !!D.over || D.view != null || D.pos.turn !== D.me || !!D.gone });
  let h = ''; D.hist.forEach((x, k) => { if (k % 2 === 0) h += `<span class="no">${k / 2 + 1}.</span>`; h += `<button class="mvb${at === k + 1 ? ' on' : ''}${k + 1 > at ? ' later' : ''}" data-ply="${k + 1}">${esc(x.san)}</button>`; });
  const mv = $('dMoves'); mv.innerHTML = h || '<span class="muted small" style="grid-column:1/-1">No moves yet.</span>';
  mv.querySelectorAll('[data-ply]').forEach(b => b.onclick = () => dView(+b.dataset.ply)); const on = mv.querySelector('.on'); mv.scrollTop = on ? Math.max(0, on.offsetTop - 60) : 1e6;
  document.querySelectorAll('[data-dn]').forEach(b => { const n = b.dataset.dn; b.disabled = (n === 'first' || n === 'prev') ? at === 0 : at === D.hist.length; });
  $('dPly').textContent = D.view != null ? 'Looking back' : '';
  // status line
  let t;
  if (D.over) t = (D.over.winner == null ? 'Draw ' : D.over.winner === D.me ? 'You won ' : D.oppName + ' won ') + D.over.how + '.';
  else if (D.gone) t = D.oppName + ' lost connection. Waiting for them to come back…';
  else if (D.view != null) t = 'Looking back at an earlier move. Press ⏭ to return to the game.';
  else t = D.pos.turn === D.me ? (C.inCheck(D.pos) ? 'You\'re in check! Your move.' : 'Your move.') : (D.oppName || 'Your friend') + ' is thinking…';
  $('dSay').textContent = t;
  // offers and buttons
  const pan = $('dPanel');
  pan.innerHTML = (D.offer === 'opp' && !D.over ? `<div class="note">${esc(D.oppName)} offers a draw. <button class="btn small" id="dDy">Accept</button> <button class="btn small alt" id="dDn">Decline</button></div>` : '') +
    (D.offer === 'me' && !D.over ? '<div class="note">Draw offered. Waiting for an answer…</div>' : '') +
    (D.tbReq && !D.tbReq.mine && !D.over ? `<div class="note">${esc(D.oppName)} asks to take back ${D.tbReq.n === 2 ? 'their last move' : 'the last move'}. <button class="btn small" id="dTy">Allow</button> <button class="btn small alt" id="dTn">No</button></div>` : '') +
    (D.tbReq && D.tbReq.mine ? '<div class="note">Take-back requested…</div>' : '') +
    (D.rmReq === 'opp' && D.over ? `<div class="note good">${esc(D.oppName)} wants a rematch! <button class="btn small" id="dRy">Play again</button></div>` : '') +
    (D.gone && !D.over && Date.now() - D.gone > 30000 ? '<div class="note bad">Still no sign of them. <button class="btn small alt" id="dClaim">Claim the win</button></div>' : '');
  const acts = $('dActs');
  acts.innerHTML = D.over ? `<button class="btn small" id="dRm" ${D.rmReq === 'me' ? 'disabled' : ''}>${D.rmReq === 'me' ? 'Rematch asked…' : 'Rematch'}</button><button class="btn small alt" id="dPgn">Copy PGN</button><button class="btn small alt" id="dLeave">Leave</button>`
    : `<button class="btn small alt" id="dDraw" ${D.offer || D.hist.length < 2 ? 'disabled' : ''}>Offer draw</button><button class="btn small alt" id="dTb" ${D.tbReq || !D.hist.length ? 'disabled' : ''}>Take back</button><button class="btn small alt" id="dRes">Resign</button>`;
  const on1 = (id, f) => { const b = $(id); b && (b.onclick = f); };
  on1('dDy', () => { dsend({ t: 'draw-yes' }); endGame(null, 'by agreement'); });
  on1('dDn', () => { dsend({ t: 'draw-no' }); D.offer = null; dBoard(); });
  on1('dTy', () => { const n = D.tbReq.n; dsend({ t: 'tb-yes' }); D.tbReq = null; undo(n); });
  on1('dTn', () => { dsend({ t: 'tb-no' }); D.tbReq = null; dBoard(); });
  on1('dRy', () => { D.rmReq = null; if (D.role === 'host') hostStart(true); else dsend({ t: 'rm-yes' }); });
  on1('dClaim', () => { dsend({ t: 'resign' }); endGame(D.me, 'because the other player left'); });
  on1('dDraw', () => { D.offer = 'me'; dsend({ t: 'draw-offer' }); dBoard(); });
  on1('dTb', () => { const n = D.pos.turn === D.me ? 2 : 1; if (n > D.hist.length) return; D.tbReq = { n, mine: true }; dsend({ t: 'tb-req', n }); dBoard(); });
  on1('dRes', async () => { if (await M.ask('Resign this game?', 'Your friend wins. You can ask for a rematch straight away.', 'Resign', 'Keep playing')) { dsend({ t: 'resign' }); endGame(opp(D.me), 'by resignation'); } });
  on1('dRm', () => { if (D.rmReq === 'opp') { if (D.role === 'host') hostStart(true); else dsend({ t: 'rm-yes' }); D.rmReq = null; } else { D.rmReq = 'me'; dsend({ t: 'rm-req' }); dBoard(); } });
  on1('dPgn', async () => { const t = pgnText(); try { await navigator.clipboard.writeText(t); $('dPgn').textContent = 'Copied!'; } catch (e) { M.modal(`<h3>Game record</h3><textarea readonly style="min-height:160px">${esc(t)}</textarea><div class="btns"><button class="btn alt" data-a="x">Close</button></div>`, (m, close) => m.querySelector('[data-a]').onclick = close); } });
  on1('dLeave', () => { dsend({ t: 'bye' }); dReset(); M.go('play'); });
  tick();
}
function dChat() { const el = $('dChat'); if (!el) return; el.innerHTML = D.chat.slice(-40).map(c => `<div class="cm ${c.who}"><span>${esc(c.x)}</span></div>`).join('') || '<span class="muted small">Messages appear here.</span>'; el.scrollTop = 1e6; }
function dVideos() { attach('dv-me', D.stream, D.bo || D.oppBo || !D.cam); attach('dv-opp', D.remote, D.bo || D.oppBo || !!D.gone); setQ('dv-opp', D.q); }
setInterval(() => {
  if (D.status !== 'playing') return;
  dsend({ t: 'ping' });
  if (!D.gone && D.seen && Date.now() - D.seen > 10000) { D.gone = Date.now(); D.remote = null; dVideos(); dBoard(); }
  if (D.gone && !D.over && location.hash.startsWith('#duel') && D.B) dBoard();
}, 3000);
addEventListener('beforeunload', () => { if (D.peer) { dsend({ t: 'bye' }); } });
addEventListener('keydown', e => {
  if (!location.hash.startsWith('#duel') || !D.B || e.target.closest('input,textarea,select') || document.querySelector('#modal .modal')) return;
  const at = D.view == null ? D.hist.length : D.view, to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: D.hist.length }[e.key];
  if (to == null) return; e.preventDefault(); dView(to);
});
M.view('duel', vDuel, { app: true, nav: 'play' });
M.duelState = D;
}
