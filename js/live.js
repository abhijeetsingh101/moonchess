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
}
