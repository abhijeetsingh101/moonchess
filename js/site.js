/* MoonChess — the public site: home, coaches, academies, parents, pricing, free tools, guides. */
{
const M = window.MC, C = M.C, P = window.PGN, esc = M.esc;
const $ = id => document.getElementById(id);
const sq = C.sqIdx;
const beta = '<span class="tag">In the beta</span>';
const ready = '<span class="tag ok">Try it now</span>';

/* a small board with arrows and heat squares that animate on a loop (pure CSS) */
function clip(fen, marks) {
  const xy = i => ({ x: (i & 7) + .5, y: 7 - (i >> 3) + .5 });
  let h = '';
  marks.forEach((k, n) => {
    const d = `style="animation-delay:${(k.at || 0).toFixed(1)}s"`;
    if (k.heat != null) { const p = xy(sq(k.sq)); h += `<g class="cl" ${d}><rect x="${p.x - .5}" y="${p.y - .5}" width="1" height="1" fill="#ff4fd8" opacity="${k.heat}"/>${k.pct ? `<text x="${p.x}" y="${p.y + .12}" class="mt">${k.pct}</text>` : ''}</g>`; }
    else { const a = xy(sq(k.a)), b = xy(sq(k.b)); h += `<g class="cl" ${d}><path d="${M.arrowPath(a, b, .15)}" fill="${k.col}" opacity=".9"/>${k.num ? `<circle cx="${b.x}" cy="${b.y}" r=".24" fill="#0b1240" stroke="${k.col}" stroke-width=".05"/><text x="${b.x}" y="${b.y + .1}" class="mt">${k.num}</text>` : ''}</g>`; }
  });
  return `<div class="clip">${M.mini(fen)}<svg viewBox="0 0 8 8" class="marks" aria-hidden="true">${h}</svg></div>`;
}
const ITAL = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
const thinkClip = () => clip(ITAL, [{ a: 'f3', b: 'g5', col: '#6dffc4', num: 1, at: .4 }, { a: 'd2', b: 'd3', col: '#6dffc4', num: 2, at: 1.4 }, { a: 'e1', b: 'g1', col: '#6dffc4', num: 3, at: 2.4 }, { heat: .45, sq: 'd3', at: 3.6 }]);
const pollClip = () => clip(ITAL, [{ heat: .7, sq: 'g5', pct: '50%', at: .4 }, { heat: .45, sq: 'd3', pct: '30%', at: 1.2 }, { heat: .25, sq: 'c3', pct: '13%', at: 2 }, { heat: .15, sq: 'g1', pct: '7%', at: 2.6 }]);

const FAQ = [
  ['Do students or parents pay anything?', 'No. Coaches and academies hold the subscription. Students and parents use MoonChess free, and pay their coach\'s fees directly.'],
  ['Does it work on phones and tablets?', 'Yes. The board was designed for touch first, with labelled buttons instead of tiny icons, and MoonChess installs from the browser like an app. A board-only mode keeps class going on a weak connection.'],
  ['Can students see the engine?', 'Not unless you want them to. The evaluation and best lines stay hidden from students by default, and you reveal them on purpose, for one position or the rest of the class.'],
  ['How long are lesson replays kept?', 'Seven days on the free plan. Paid plans keep them longer, so a student can rewatch last month\'s endgame lesson before a tournament.'],
  ['Can I bring in games from Lichess, Chess.com or a tournament?', 'Paste any PGN or move list today. Direct account imports and reading a photo of a paper scoresheet are coming in the beta; until then the free scoresheet tool checks every move you type for legality.'],
  ['What about children\'s data?', 'Accounts for children need a parent\'s consent, as India\'s DPDP Act requires. Every Parent Pulse is approved by the coach before it goes out.'],
  ['How do I collect fees?', 'On the Coach plan you collect fees from families by UPI inside MoonChess, for a small transaction fee. This is part of the beta; the payment partner and fee will be announced before launch.']
];
const faqHtml = list => `<div class="faq">${list.map(([q, a]) => `<details class="glass"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
const cta = (t, s, both) => `<section class="band"><div class="wrap ctab glass">${M.pipSvg('pipm')}<div><h2>${t}</h2><p class="muted">${s}</p><div class="btns">${both ? '<a class="btn" href="#hub">Start learning</a><a class="btn alt" href="#class">Open the classroom</a>' : '<a class="btn" href="#class">Open the classroom</a><a class="btn alt" href="#pricing">See pricing</a>'}</div></div></div></section>`;

const PLANS = [
  { id: 'free', name: 'Free', m: 0, y: 0, unit: '', note: 'For trying it with a few students', items: ['Up to 3 students', '45-minute classes', 'Lesson replays kept 7 days', 'Mistake Deck and puzzles for every student'] },
  { id: 'coach', name: 'Coach', m: 999, y: 9990, unit: '', note: 'For independent coaches', items: ['Unlimited students and class time', 'Every feature: Lesson Replay, Mistake Deck, Think First, Class Poll, voice homework, Parent Pulse, skill maps', 'Collect fees by UPI', 'Calendar with WhatsApp reminders'], pick: true },
  { id: 'academy', name: 'Academy', m: 599, y: 599 * 10, unit: ' per coach', note: 'For academies with 3 to 20 coaches', items: ['One live classroom per coach at the same time', 'Your academy\'s name, colours and web address', 'Admin dashboard for coaches, batches and fees', 'Minimum 3 coaches'] }
];
const inr = n => '₹' + n.toLocaleString('en-IN');
let yearly = false;
function planCards(compact) {
  return `<div class="plans">${PLANS.map(p => `<div class="plan glass${p.pick ? ' pick' : ''}">
    ${p.pick ? '<span class="tag ok">Most coaches start here</span>' : ''}<h3>${p.name}</h3><p class="muted small">${p.note}</p>
    <div class="price"><b>${inr(yearly && p.id === 'coach' ? p.y : p.m)}</b><span>${p.m ? (yearly && p.id === 'coach' ? '/year' : p.unit + '/month') : ' forever'}</span></div>
    ${p.id === 'coach' ? `<p class="muted small">${yearly ? 'Two months free compared with monthly.' : 'Or ' + inr(p.y) + ' a year.'}</p>` : ''}
    ${compact ? '' : `<ul>${p.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`}
    <a class="btn ${p.pick ? '' : 'alt'} small" href="${p.id === 'academy' ? '#academies' : '#class'}">${p.id === 'academy' ? 'Plan your academy' : 'Start free'}</a></div>`).join('')}</div>`;
}

/* ---------------- home ---------------- */
let homeRp = null;
const FEATS = [
  ['#learn', '<svg><use href="#i-learn"/></svg>', 'Learn the rules', 'Short, friendly lessons take you from "how does a knight move?" to your first checkmate.', 'Players'],
  ['#puzzles', '<svg><use href="#i-puz"/></svg>', 'Solve puzzles', 'A new puzzle every day, plus a collection of checkmate puzzles to work through.', 'Players'],
  ['#play', '<svg><use href="#botface"/></svg>', 'Play friendly bots', 'Three robot opponents, from Sleepy Bot for beginners to Captain Bot for brave players.', 'Players'],
  ['#deck', '<svg><use href="#i-deck"/></svg>', 'Fix your own mistakes', 'The Mistake Deck turns the slips from your own games into puzzles, until you stop making them.', 'Players'],
  ['#join', '<svg><use href="#i-video"/></svg>', 'Live classes on video', 'See and hear your coach while you both move pieces on the same board.', 'Players and coaches'],
  ['#replay', '<svg><use href="#i-replay"/></svg>', 'Rewatch every lesson', 'Each class is saved. Pause it at any moment and try the moves yourself.', 'Players and coaches'],
  ['#class', '<svg><use href="#i-mic"/></svg>', 'Homework with voice notes', 'Coaches record a question on a position. Players answer with moves, words or their own voice.', 'Coaches'],
  ['#parents', '<svg><use href="#i-chart"/></svg>', 'Progress you can see', 'Ranks, badges and a skill map for players, and a weekly note for parents.', 'Players and parents']
];
const featHtml = list => `<div class="feats">${list.map(([h, ic, t, d, who]) => `<a class="ft" href="${h}"><span class="ic">${ic}</span><span class="who">${who}</span><h3>${t}</h3><p>${d}</p><span class="go">Open →</span></a>`).join('')}</div>`;
const shead = (t, p, c) => `<div class="shead${c ? ' center' : ''}"><h2 class="title">${t}</h2>${p ? `<p>${p}</p>` : ''}</div>`;
const CLASS_FEATS = [
  ['<svg><use href="#i-video"/></svg>', 'Live video class', 'Students join with a 6-letter code. You see and hear each other while you teach on one board.'],
  ['<svg><use href="#i-class"/></svg>', 'You decide who moves', 'Demonstrate, Guided (you approve each student move) or Free. Switch any time.'],
  ['♞', 'Arrows, highlights, laser', 'Right-click to draw in four colours, or point with a laser that fades away.'],
  ['<svg><use href="#i-puz"/></svg>', 'Think First', 'Students mark up to three candidate moves before they play. You see how they think.'],
  ['<svg><use href="#i-users"/></svg>', 'Class Poll', '"What would you play?" Every student answers and a colour map appears on the board.'],
  ['<svg><use href="#i-chart"/></svg>', 'Engine on your terms', 'Evaluation and best lines stay hidden from students until you reveal them.'],
  ['<svg><use href="#i-replay"/></svg>', 'Every lesson recorded', 'Moves, arrows, captions, chapters and your voice become a replay students can pause and try.'],
  ['<svg><use href="#i-deck"/></svg>', 'Load anything', 'FEN, PGN, Lichess and Chess.com games, or a photo or PDF of a book diagram.'],
  ['<svg><use href="#i-mic"/></svg>', 'Voice-note homework', 'Record a question on any position. Students answer with moves, text or their voice.'],
  ['<svg><use href="#i-bell"/></svg>', 'Parent Pulse and schedule', 'A weekly update for parents you approve in one tap, plus weekly batches with WhatsApp reminders.']
];
function classMock() {
  const tiles = [['Coach', 'C', true], ['Aarav', 'A'], ['Diya', 'D'], ['Kabir', 'K']];
  return `<div class="cmock" aria-hidden="true">
    <div class="cm-top"><span class="cm-live"><span class="dot"></span>Live · 3 students</span><span class="cm-code">Class code <b>K7QM2P</b></span><span class="cm-rec">● Recording 12:04</span></div>
    <div class="cm-body">
      <div class="cm-vids">${tiles.map(([n, i, c]) => `<div class="cm-v${c ? ' coach' : ''}"><span>${i}</span><small>${n}</small></div>`).join('')}</div>
      <div class="cm-board">${clip(ITAL, [{ a: 'f3', b: 'g5', col: '#2fa86a', at: .2 }, { heat: .7, sq: 'g5', pct: '50%', at: 1 }, { heat: .45, sq: 'd3', pct: '30%', at: 1.4 }, { heat: .25, sq: 'c3', pct: '20%', at: 1.8 }])}</div>
      <div class="cm-side"><div class="cm-card"><b>Class Poll</b><div class="cm-bar"><i style="width:50%"></i></div><small>Ng5 50% · d3 30% · c3 20%</small></div>
        <div class="cm-card"><b>Aarav proposes</b><small>Nxe5. Approve or send back?</small><div class="cm-btns"><span>Approve</span><span class="alt">Send back</span></div></div>
        <div class="cm-card"><b>Think First</b><small>Diya: Ng5, d3, O-O → played d3</small></div></div>
    </div></div>`;
}
function vHome() {
  const n = M.ALL.length, pz = M.K.puzzles.length;
  $('v-home').innerHTML = `
  <section class="band hero2 coachhero"><div class="wrap">
    <div class="ch-copy"><span class="eyebrow">The online classroom for chess coaches</span>
      <h1>Teach chess live. Your students keep improving between lessons.</h1>
      <p class="big">Run your class on one shared board with video, polls and arrows. Every lesson is recorded, turns into practice built from each student's own mistakes, and ends with a weekly note to parents.</p>
      <div class="btns"><a class="btn" href="#class">Open the classroom, free</a><a class="btn alt" href="#coaches">See how coaches use it</a></div>
      <p class="muted small" style="margin-top:12px">Free for up to 3 students. No card needed. Students and parents never pay.</p></div>
    ${classMock()}
    <div class="ch-alt"><a href="#join"><b>Have a class code?</b> Join your class →</a><a href="#players"><b>Learning on your own?</b> Lessons, puzzles and bots →</a><a href="#parents"><b>A parent?</b> See what your child gets →</a></div>
  </div></section>
  <section class="band"><div class="wrap">
    ${shead('Everything you need to teach, on one board', 'The tools of a real chess classroom, built for teaching children and club players online.')}
    <div class="feats cfeats">${CLASS_FEATS.map(([ic, t, d]) => `<a class="ft" href="#class"><span class="ic">${ic}</span><h3>${t}</h3><p>${d}</p></a>`).join('')}</div>
    <div class="btns" style="margin-top:22px"><a class="btn" href="#class">Try the classroom now</a><a class="btn alt" href="#pricing">₹999/month after 3 students</a></div>
  </div></section>
  <section class="band tint"><div class="wrap">
    ${shead('One lesson, a whole week of progress', 'Most tools stop when the video call ends. MoonChess turns each class into practice and a parent update.')}
    <div class="loop">${[
      ['Teach live', 'Video, a shared board, polls and Think First. You choose who can move and when the engine appears.', '#class', 'Open the classroom'],
      ['Replay', 'The class is saved with every move, arrow and word. Students pause it and try the moves themselves.', '#replay', 'Watch a sample'],
      ['Practise', 'Each student\'s own blunders become puzzles in their Mistake Deck, until they stop happening.', '#deck', 'See a Mistake Deck'],
      ['Report', 'Parents get the Parent Pulse each week: classes, puzzles, a highlight and your note. You approve it in one tap.', '#parents', 'See a Pulse']
    ].map(([t, d, h, l], i) => `<div class="step glass"><span class="planet p${i}">${i + 1}</span><h3>${t}</h3><p class="muted">${d}</p><a href="${h}" class="lnk">${l} →</a></div>`).join('')}</div>
  </div></section>
  <section class="band"><div class="wrap tryrow">
    <div>${shead('Watch a one-minute lesson replay', 'This is what your students get after every class. Press play, jump between chapters, or pause and press "Try it yourself".')}
      <ul class="ticks"><li>Your arrows and notes appear right on the board</li><li>Chapters work like bookmarks</li><li>Students can pause and play the moves themselves</li></ul>
      <button class="btn" id="hWatch">▶ Play the lesson</button></div>
    <div class="glass demo"><div id="hRp"></div></div>
  </div></section>
  <section class="band tint"><div class="wrap">
    ${shead('Your students get a full chess app too', `Between classes they learn with Pip: ${n} lessons, ${pz} puzzles, friendly bots, online games with friends and a skill map. All free for them.`)}
    ${featHtml(FEATS.filter(f => f[4] !== 'Coaches').slice(0, 4))}
  </div></section>
  <section class="band"><div class="wrap beta glass"><div><h2>Built with coaches, not guessed at</h2><p class="muted">We're opening a private beta for 10 coaches teaching children and club players online. Their stories will go here once they've taught real classes with MoonChess, not before.</p></div><a class="btn" href="#coaches">Join the beta as a coach →</a></div></section>
  <section class="band tint"><div class="wrap"><div class="row" style="justify-content:space-between;align-items:flex-end">${shead('Simple, open prices', 'Start free with 3 students. Students and parents never pay.')}<a class="lnk" href="#pricing" style="margin-bottom:28px">Full pricing →</a></div>
    ${planCards(true)}</div></section>
  <section class="band"><div class="wrap narrow">${shead('Questions coaches ask', '', true)}${faqHtml(FAQ.slice(0, 5))}</div></section>
  ${cta('Teach your next class on MoonChess', 'Open the classroom, start a live class and share the code. Your first students can join in a minute.')}`;
  homeRp && homeRp.destroy(); homeRp = M.player($('hRp'), M.DEMO);
  $('hWatch').onclick = () => { $('hRp').scrollIntoView({ behavior: 'smooth', block: 'center' }); homeRp.play(); };
}
M.view('home', vHome);
M.leave.home = () => { homeRp && homeRp.destroy(); homeRp = null; };

/* ---------------- players ---------------- */
function vPlayers() {
  const s = M.S, done = M.ALL.filter(m => s.done[m.id]).length;
  $('v-players').innerHTML = `
  <section class="band hero2"><div class="wrap phero">
    <div><span class="eyebrow">For chess players of every age</span><h1>Everything you need to get better at chess</h1>
      <p class="big">Learn the rules with Pip, solve a puzzle a day, play bots that match your level, and practise the exact mistakes you made in your own games.</p>
      <div class="btns"><a class="btn" href="#hub">${done ? 'Continue learning' : 'Start learning, free'}</a><a class="btn alt" href="#join">Join my coach's class</a></div>
      <p class="muted small" style="margin-top:12px">No sign-up needed. Your progress is saved in this browser.</p></div>
    <div class="herofig" aria-hidden="true"><div class="boardcard">${M.mini('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1')}</div>${M.pipSvg('pipfig')}<div class="say">Find checkmate in one move!</div><div class="pill"><svg><use href="#star"/></svg>3 stars</div></div>
  </div></section>
  <section class="band"><div class="wrap">${shead('What you get', 'All of it is free for players.')}${featHtml(FEATS.filter(f => f[4] !== 'Coaches'))}</div></section>
  <section class="band tint"><div class="wrap">${shead('Your first week', 'Ten minutes a day is plenty. Here\'s a good way to begin.')}
    <div class="path">${[
      ['Day 1', 'Meet the pieces', 'Collect the stars with the rook, bishop, queen, king and knight.', '#learn'],
      ['Day 2', 'Rules of the game', 'Check, castling and the special pawn moves, one mission at a time.', '#learn'],
      ['Day 3', 'Your first puzzle', 'Solve the daily puzzle for bonus XP. Look at every check first!', '#puzzles'],
      ['Day 4', 'Play Sleepy Bot', 'A gentle first game. When it ends, your mistakes go into your Mistake Deck.', '#play'],
      ['Day 5', 'Fix a mistake', 'Open your Mistake Deck and find the better move from your own game.', '#deck']
    ].map(([d, t, x, h]) => `<a class="sto glass" href="${h}" style="text-decoration:none;color:inherit"><span class="day">${d}</span><h3>${t}</h3><p class="muted">${x}</p></a>`).join('')}</div></div></section>
  <section class="band"><div class="wrap two-up">
    <div class="glass sto"><h3>Ranks, badges and board themes</h3><p class="muted">Earn XP for every lesson, puzzle and game. Climb from Cadet to Admiral, collect 16 badges, unlock new boards and new outfits for Pip.</p><a class="lnk" href="#me">See your profile →</a></div>
    <div class="glass sto"><h3>A skill map, not just a number</h3><p class="muted">See how your tactics, endgames, openings, calculation and time use are growing, and what to practise next.</p><a class="lnk" href="#me">Open your skill map →</a></div>
  </div></section>
  ${cta('Start your first lesson', 'It takes less than a minute, and Pip will show you the way.', true)}`;
}
M.view('players', vPlayers);

/* ---------------- coaches ---------------- */
const TABLE = [
  ['Shared live board', 'Coach and students move on one board, built for phones and tablets with labelled controls.', ready],
  ['Video and audio', 'Built in, so there\'s no separate meeting link, with a board-only mode for weak connections.', beta],
  ['Move permissions', 'Three presets: Demonstrate, Guided and Free.', ready],
  ['Engine analysis', 'Hidden from students by default; you reveal it on purpose.', ready],
  ['Drawing tools', 'Arrows and highlights, plus a laser pointer that fades after a few seconds.', ready],
  ['Imports', 'FEN and PGN today; Lichess and Chess.com accounts and scoresheet photos in the beta.', ready],
  ['Puzzles and bots', 'Puzzles by theme and bots with their own personalities.', ready],
  ['Scheduling', 'Recurring classes and WhatsApp reminders.', ready],
  ['Student profiles', 'Progress tracked from games played on MoonChess too, shown as a skill map.', ready]
];
function vCoaches() {
  $('v-coaches').innerHTML = `
  <section class="band hero2"><div class="wrap phero">
    <div><span class="eyebrow">For independent coaches</span><h1>Teach once. Your students practise all week.</h1>
      <p class="big">You run the class. MoonChess keeps the replay, builds each student's practice from their own games, and drafts the note to their parents.</p>
      <div class="btns"><a class="btn" href="#class">Open the classroom</a><a class="btn alt" href="#pricing">₹999/month, or free for 3 students</a></div></div>
    <div class="glass demo">${clip(ITAL, [{ a: 'f3', b: 'g5', col: '#ffd84a', at: .3 }, { heat: .4, sq: 'f7', at: 1.2 }, { a: 'c4', b: 'f7', col: '#ffd84a', at: 2 }])}<p class="muted small" style="margin:10px 0 0">Arrows and highlights from a lesson on the weak f7 square.</p></div>
  </div></section>
  <section class="band"><div class="wrap">
    <h2 class="title">A week with MoonChess</h2>
    <div class="story">${[
      ['Monday: teach', 'Run your batch on the shared board. Switch to Guided so students propose moves you approve, turn on Think First for calculation drills, and drop a Class Poll when the position gets sharp.'],
      ['Tuesday: they rewatch', 'The class is already a Lesson Replay with chapters. A student who missed the knight fork scrubs back to it and plays the line themselves.'],
      ['Wednesday: you set homework', 'Record a 30-second voice note on any position: "find the plan for White here." Students answer with moves and their own voice note.'],
      ['Thursday: they fix their mistakes', 'Every blunder from class games, bot games and imported tournament games turns into a card in that student\'s Mistake Deck.'],
      ['Sunday: parents hear about it', 'The Parent Pulse is written for you. Add one line, approve it, and it goes out on WhatsApp or email.']
    ].map(([t, d]) => `<div class="glass sto"><h3>${t}</h3><p class="muted">${d}</p></div>`).join('')}</div></div></section>
  <section class="band"><div class="wrap"><h2 class="title">Everything you'd expect, done our way</h2><p class="lede">The basics every online chess classroom needs, with the details that make teaching children easier.</p>
    <div class="ftable glass">${TABLE.map(([a, b, c]) => `<div class="fr"><b>${a}</b><span class="muted">${b}</span>${c}</div>`).join('')}</div></div></section>
  <section class="band"><div class="wrap two-up">
    <div class="glass feat"><div><h3>Get paid without chasing ${beta}</h3><p class="muted">Send fee requests to families by UPI from MoonChess and see who has paid before class starts. Students and parents never pay MoonChess itself; a small transaction fee applies to fees you collect.</p></div></div>
    <div class="glass feat"><div><h3>Your calendar, with reminders ${ready}</h3><p class="muted">Recurring batches go on the calendar once. A WhatsApp reminder for each class is one tap away.</p><a class="lnk" href="#class" id="coSched">Open the schedule →</a></div></div>
  </div></section>
  ${cta('Try the classroom now', 'It runs right here in your browser. Make a move, draw an arrow, run a poll and record a replay.')}`;
}
M.view('coaches', vCoaches);

/* ---------------- academies ---------------- */
let coaches = 5;
function vAcademies() {
  const tot = () => 599 * Math.max(3, coaches);
  $('v-academies').innerHTML = `
  <section class="band hero2"><div class="wrap phero">
    <div><span class="eyebrow">For academies with 1 to 20 coaches</span><h1>Every classroom, every family, one place.</h1>
      <p class="big">Give each coach their own live classroom, keep batches and fees in one dashboard, and send every family a weekly Parent Pulse under your academy's name.</p>
      <div class="btns"><a class="btn" href="#class">Try a classroom</a><a class="btn alt" href="#pricing">₹599 per coach a month</a></div>
      <p class="muted small">The academy plan opens after launch, once the Coach plan is proven with real classes.</p></div>
    <div class="glass demo acad">${['Beginners · Coach A', 'Juniors · Coach B', 'Club · Coach C'].map((t, i) => `<div>${M.mini([C.START, ITAL, 'r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 4 8'][i])}<small>${t}</small><span class="dot"></span></div>`).join('')}</div>
  </div></section>
  <section class="band"><div class="wrap"><div class="grid4">${[
    ['Classrooms side by side', 'One live classroom per coach, all running at the same time.'],
    ['Coach accounts', 'Each coach has their own students, homework and replays. You see everything.'],
    ['Your brand', 'Your academy\'s name and colours on the classroom and every Parent Pulse, at your own web address.'],
    ['Admin dashboard', 'Batches, attendance, fee status and which Pulses have gone out, in one view.']
  ].map(([t, d]) => `<div class="glass sto"><h3>${t} ${beta}</h3><p class="muted">${d}</p></div>`).join('')}</div></div></section>
  <section class="band"><div class="wrap calc glass"><div><h2>What it costs</h2><p class="muted">₹599 per coach per month, with a minimum of three coaches.</p>
    <label class="rng">Coaches <b id="acN">${coaches}</b><input type="range" min="3" max="20" value="${coaches}" id="acR" aria-label="Number of coaches"></label></div>
    <div class="price big"><b id="acT">${inr(tot())}</b><span>/month</span><small class="muted" id="acY">${inr(tot() * 12)} a year</small></div></div></section>
  ${cta('Start with one coach today', 'Try the Coach plan free with up to 3 students, then bring the rest of your academy across.')}`;
  $('acR').oninput = e => { coaches = +e.target.value; $('acN').textContent = coaches; $('acT').textContent = inr(tot()); $('acY').textContent = inr(tot() * 12) + ' a year'; };
}
M.view('academies', vAcademies);

/* ---------------- parents ---------------- */
function vParents() {
  const s = M.S, p = s.pulse, child = p.child.trim() || 'your child';
  $('v-parents').innerHTML = `
  <section class="band hero2"><div class="wrap phero">
    <div><span class="eyebrow">For parents</span><h1>See your child's progress every week, without asking.</h1>
      <p class="big">When your child's coach teaches on MoonChess, you get a short weekly note on WhatsApp or email: classes attended, puzzles solved, one highlight position and a line from the coach.</p>
      <div class="btns"><a class="btn" href="#hub">See what your child sees</a></div>
      <p class="muted small">MoonChess is free for families. You pay your coach's fees, never us.</p></div>
    <div class="phone glass"><div class="ph-top">Parent Pulse · example</div><div class="msg"><pre>MoonChess weekly update for Diya

• Classes: 2 live, plus 1 lesson replay watched
• Puzzles solved: 14 (4 from her own games)
• Homework answered: 1

Highlight: Diya found the move that stopped a back-rank checkmate in a position from her tournament game.

Coach's note: Much calmer with captures this week.</pre>${M.mini('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1')}</div></div>
  </div></section>
  <section class="band"><div class="wrap two-up">
    <div class="glass sto"><h3>What your child sees</h3><ul class="ticks"><li>Pip, a friendly robot co-pilot, guiding short missions</li><li>Replays of each class to rewatch and try</li><li>A Mistake Deck built from their own games, not random puzzles</li><li>Voice-note homework from their coach</li><li>Ranks, badges and board themes to unlock</li></ul></div>
    <div class="glass sto"><h3>What you see</h3><ul class="ticks"><li>The weekly Parent Pulse, approved by the coach before it's sent</li><li>A skill map: tactics, endgames, openings, calculation and time use</li><li>Which classes your child attended, and what they practised</li></ul><a class="lnk" href="#me">Open the skill map →</a></div>
  </div></section>
  <section class="band"><div class="wrap narrow glass trust"><h3>Children's data</h3><p class="muted">A child's account needs a parent's consent, as India's Digital Personal Data Protection Act requires. Coaches see their own students only, and every message to a parent is checked by the coach first.</p></div></section>
  ${cta('Ask your coach about MoonChess', 'Share this page with them. The free plan covers up to 3 students, so they can try it with ' + esc(child) + ' first.')}`;
}
M.view('parents', vParents);

/* ---------------- pricing ---------------- */
function vPricing() {
  $('v-pricing').innerHTML = `
  <section class="band hero2"><div class="wrap">
    <h1 class="center">Simple prices, all on this page</h1>
    <p class="big center">Start free. Upgrade when you have more than 3 students. Students and parents never pay MoonChess.</p>
    <div class="center" style="margin:18px 0">${`<div class="seg glass" role="group" aria-label="Billing"><button data-bill="m" class="${yearly ? '' : 'on'}">Monthly</button><button data-bill="y" class="${yearly ? 'on' : ''}">Yearly</button></div>`}</div>
    ${planCards(false)}
    <p class="muted small center" style="margin-top:14px">Prices in Indian rupees. US dollar prices are being set for launch. These are launch proposals and may change after the beta.</p>
  </div></section>
  <section class="band"><div class="wrap two-up">
    <div class="glass sto"><h3>Collecting your fees</h3><p class="muted">On the Coach and Academy plans you can collect fees from families by UPI inside MoonChess. A small transaction fee applies to those payments, announced before launch along with the payment partner.</p></div>
    <div class="glass sto"><h3>Free means free</h3><p class="muted">Up to 3 students, 45-minute classes and every student's Mistake Deck, with no card needed and no time limit on the account.</p></div>
  </div></section>
  <section class="band"><div class="wrap narrow"><h2 class="title">Pricing questions</h2>${faqHtml([FAQ[0], FAQ[3], FAQ[6]])}</div></section>`;
  document.querySelectorAll('[data-bill]').forEach(b => b.onclick = () => { yearly = b.dataset.bill === 'y'; vPricing(); });
}
M.view('pricing', vPricing);

/* ---------------- free tools ---------------- */
let toolText = '', imgUrl = '';
function vTools() {
  const dp = M.dailyPuzzle(), done = !!M.S.daily[M.today()];
  $('v-tools').innerHTML = `
  <section class="band hero2"><div class="wrap">
    <h1>Free tools for every chess player</h1><p class="big">No account needed.</p>
    <div class="tool glass" id="ss" style="margin-top:8px">
      <div><h2>Scoresheet to PGN</h2><p class="muted">Turn a paper scoresheet from an over-the-board game into a PGN you can analyse. Add a photo to read from, type the moves as they're written, and every move is checked for legality as you go, so misreads show up straight away. ${beta.replace('In the beta', 'Automatic reading of handwriting: in the beta')}</p>
        <label class="file btn alt small">📷 Add a photo of the sheet<input type="file" accept="image/*" id="ssImg" hidden></label>
        <div class="ssimg" id="ssPrev">${imgUrl ? `<img src="${imgUrl}" alt="Your scoresheet">` : ''}</div></div>
      <div><label for="ssIn"><b>Moves</b> <span class="muted small">e.g. 1. e4 e5 2. Nf3 Nc6</span></label>
        <textarea id="ssIn" class="tall" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6">${esc(toolText)}</textarea>
        <div id="ssChk" class="chips"></div>
        <div class="two"><label>White<input id="ssW" placeholder="Player name"></label><label>Black<input id="ssB" placeholder="Player name"></label></div>
        <div class="two"><label>Event<input id="ssE" placeholder="Tournament"></label><label>Result<select id="ssR"><option>*</option><option>1-0</option><option>0-1</option><option>1/2-1/2</option></select></label></div>
        <div class="ssout">${M.mini(C.START).replace('class="mini"', 'class="mini" id="ssMini"')}<textarea id="ssOut" readonly aria-label="PGN output"></textarea></div>
        <div class="btns"><button class="btn small" id="ssCopy">Copy PGN</button><button class="btn small alt" id="ssDeck">Add my mistakes to my Mistake Deck</button><span class="muted small" id="ssMsg"></span></div></div>
    </div>
    <div class="tool glass" style="margin-top:22px"><div><h2>Picture to position</h2><p class="muted">Got a diagram in a book, a PDF or a screenshot? Upload it and MoonChess reads the position. You check every square, then open it on a board to study, or copy its FEN code.</p>
      <div class="btns"><button class="btn" id="ppGo">Upload a picture or PDF</button></div></div>
      <div id="ppOut" class="ppout"><p class="muted small" style="margin:0">Your position will appear here.</p></div></div>
    <div class="daily glass" style="margin-top:22px">${M.mini(dp.fen)}<div><span class="tag ${done ? 'ok' : ''}">${done ? 'Solved today' : 'Puzzle of the day'}</span>
      <h2 style="margin:10px 0 4px">${esc(dp.tag)}</h2><p class="muted" style="margin:0 0 14px">${dp.fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to move. Find checkmate in ${dp.n}. A new one every day.</p>
      <button class="btn" id="tdP">Solve it</button></div></div>
  </div></section>`;
  const upd = () => {
    toolText = $('ssIn').value; const r = P.play(toolText);
    $('ssChk').innerHTML = r.moves.map((m, i) => `<span class="mv">${i % 2 === 0 ? (Math.floor(i / 2) + C.parse(r.start).full) + '.' : ''}${esc(m.san)}</span>`).join('') +
      (r.error ? `<span class="mv bad">${esc(r.error.token)}</span><p class="note">Move ${Math.floor(r.error.ply / 2) + 1} for ${r.error.ply % 2 ? 'Black' : 'White'}: "${esc(r.error.token)}" isn't legal here. Check the sheet; common misreads are a knight (N) for a king (K), or a 6 for a b.</p>` : '');
    const end = r.moves.length ? C.make(r.moves.at(-1).before, r.moves.at(-1).m) : C.parse(r.start);
    $('ssMini').outerHTML = M.mini(C.fen(end)).replace('class="mini"', 'class="mini" id="ssMini"');
    $('ssOut').value = r.moves.length ? P.toPgn(r.start, r.moves.map(m => m.san), { White: $('ssW').value || '?', Black: $('ssB').value || '?', Event: $('ssE').value || 'Over-the-board game', Date: M.today().replace(/-/g, '.'), Result: $('ssR').value }) : '';
  };
  ['ssIn', 'ssW', 'ssB', 'ssE', 'ssR'].forEach(id => $(id).oninput = upd); upd();
  $('ssImg').onchange = e => { const f = e.target.files[0]; if (!f) return; imgUrl && URL.revokeObjectURL(imgUrl); imgUrl = URL.createObjectURL(f); $('ssPrev').innerHTML = `<img src="${imgUrl}" alt="Your scoresheet">`; };
  $('ssCopy').onclick = async () => { const t = $('ssOut').value; if (!t) return; try { await navigator.clipboard.writeText(t); $('ssMsg').textContent = 'Copied.'; } catch (e) { $('ssOut').select(); $('ssMsg').textContent = 'Selected: copy with your keyboard.'; } };
  $('ssDeck').onclick = async () => {
    if (!$('ssOut').value) { $('ssMsg').textContent = 'Type some moves first.'; return; }
    const w = await M.ask('Which side were you?', 'We\'ll look for your mistakes only.', 'White', 'Black');
    $('ssMsg').textContent = 'Analysing…'; const r = await M.importGame(toolText, w ? 'w' : 'b', 'Tournament game');
    $('ssMsg').innerHTML = r.error ? esc(r.error) : r.n ? `${r.n} card${r.n > 1 ? 's' : ''} added. <a href="#deck">Open the deck →</a>` : 'No big mistakes found. Well played!';
  };
  $('tdP').onclick = () => M.openPuzzle(dp, true);
  $('ppGo').onclick = () => M.scanOpen(fen => {
    $('ppOut').innerHTML = `${M.mini(fen)}<label>FEN<input id="ppFen" readonly value="${esc(fen)}"></label><div class="btns"><button class="btn small" id="ppOpen">Open on a board</button><button class="btn small alt" id="ppCopy">Copy FEN</button></div>`;
    $('ppCopy').onclick = async () => { try { await navigator.clipboard.writeText(fen); $('ppCopy').textContent = 'Copied!'; } catch (e) { $('ppFen').select(); } };
    $('ppOpen').onclick = () => { M.go('class'); setTimeout(() => M.classApi.load(fen), 60); };
  }, { cta: 'Use this position' });
}
M.view('tools', vTools);

/* ---------------- guides ---------------- */
const GUIDES = [
  ['Running a Class Poll every child answers', 'Polls work best on positions with three or four reasonable moves, not one obvious capture. Open the poll before you say anything about the position, give a fixed time (thirty seconds is plenty), and only then show the heatmap. Start the discussion with the second most popular answer: the children who chose it are usually close, and explaining why it falls short teaches more than praising the winner. Keep the replay running so absent students see the poll too.'],
  ['Using Think First to train calculation', 'Turn on Think First for one exercise per class, not the whole lesson. Ask for candidates in order of forcing-ness: checks, captures, threats. When a student keeps marking the same kind of move, say only defensive ones, point it out from the thinking log after class. Over a few weeks the "new idea" tags, moves they played that they hadn\'t listed, should become rarer. That\'s calculation improving.'],
  ['Turning a tournament into homework', 'After a weekend event, ask students to type their games with the free scoresheet tool, or photograph the sheet for you. Add the games to their Mistake Deck, then pick the one position you most want them to understand and set it as voice-note homework. Ask "what was the plan here?" rather than "what was the best move?", so the answer has to be explained, not guessed.']
];
function vGuides() {
  $('v-guides').innerHTML = `<section class="band hero2"><div class="wrap narrow"><h1>Teaching guides</h1><p class="big">Short, practical notes on teaching chess online with MoonChess. Guides from beta coaches will join these.</p>
    ${GUIDES.map(([t, b], i) => `<article class="glass guide"><span class="planet p${i}">${i + 1}</span><div><h2>${t}</h2><p>${b}</p><p class="muted small">MoonChess team</p></div></article>`).join('')}</div></section>
    ${cta('Put a guide to work', 'Open the classroom and try a poll or Think First on any position.')}`;
}
M.view('guides', vGuides);

M.boot();
}
