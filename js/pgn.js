/* MoonChess — reading and writing move lists (SAN / PGN), checked for legality with the engine. */
(function (root) {
  const C = root.Chess;
  const clean = s => String(s).replace(/[+#!?]/g, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O').replace(/=?([QRBN])$/i, (a, p) => '=' + p.toUpperCase());

  // find the legal move that a SAN token describes; null if none fits
  function fromSan(p, tok) {
    const want = clean(tok.trim());
    if (!want) return null;
    const ms = C.legal(p);
    let m = ms.find(x => clean(C.san(p, x)) === want);
    if (m) return m;
    // forgiving: lower-case piece letters, missing "x", pawn promotions without "="
    const loose = w => w.replace(/x/g, '').replace(/=/g, '');
    const w2 = loose(want.length > 1 && /^[kqrbn][a-h1-8]/.test(want) && !/^b[1-8]$/.test(want.slice(0, 2)) ? want[0].toUpperCase() + want.slice(1) : want);
    m = ms.find(x => loose(clean(C.san(p, x))) === w2);
    if (m) return m;
    // plain coordinates like e2e4
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(want)) return C.fromUci(p, want.toLowerCase()) || null;
    return null;
  }

  // split a PGN or a bare move list into header tags and SAN tokens
  function tokens(text) {
    const tags = {};
    let body = String(text).replace(/\[(\w+)\s+"([^"]*)"\]/g, (a, k, v) => { tags[k] = v; return ' '; });
    body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let prev; do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);
    body = body.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ');
    const toks = body.split(/\s+/).filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
    return { tags, toks };
  }

  // play a list of tokens; stops at the first one that is not legal
  function play(text, startFen) {
    const { tags, toks } = tokens(text);
    let pos = C.parse(tags.FEN || startFen || C.START);
    const start = C.fen(pos), moves = [];
    for (let i = 0; i < toks.length; i++) {
      const m = fromSan(pos, toks[i]);
      if (!m) return { tags, start, moves, error: { index: i, token: toks[i], ply: moves.length } };
      moves.push({ m, san: C.san(pos, m), uci: C.uci(m), before: pos });
      pos = C.make(pos, m);
    }
    return { tags, start, moves, end: pos };
  }

  function toPgn(start, sans, tags) {
    const p = C.parse(start);
    let n = p.full, white = p.turn === 'w', out = [];
    if (!white) out.push(n + '...');
    sans.forEach(s => { if (white) out.push(n + '.'); out.push(s); if (!white) n++; white = !white; });
    const t = Object.assign({ Event: 'MoonChess game', Result: '*' }, tags || {});
    if (start !== C.fen(C.parse(C.START))) { t.SetUp = '1'; t.FEN = start; }
    return Object.entries(t).map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n') + '\n\n' + out.join(' ') + ' ' + t.Result;
  }

  root.PGN = { fromSan, tokens, play, toPgn };
})(typeof window !== 'undefined' ? window : globalThis);
