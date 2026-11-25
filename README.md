# MoonChess

A chess learning and coaching platform where students keep improving between lessons.
Players learn with Pip through short missions, puzzles and friendly bots. Coaches teach
live classes on video, and every lesson turns into practice and a weekly update for parents.

The whole site is static HTML, CSS and JavaScript: no build step and no server code.

## Features

**For players**
- Training missions from "how does a knight move?" to checkmate patterns
- Daily puzzle and a set of checkmate puzzles
- Three bots (Sleepy, Cadet, Captain) or two players on one device
- Mistake Deck: mistakes from your own games come back as puzzles on a spaced-repetition schedule
- Lesson Replays you can scrub, pause and play from
- Voice-note homework from your coach
- Ranks, badges, board themes and a skill map

**For coaches**
- Classroom board with Demonstrate / Guided / Free move permissions
- Arrows, highlights and a fading laser pointer
- Think First (students mark candidate moves before moving) and Class Poll with a heatmap
- Engine hidden from students until the coach reveals it
- Lesson recording with captions, chapters and voice
- Live video classes with a 6-letter class code (WebRTC through PeerJS)
- Load positions from FEN, PGN, or a picture / PDF of a diagram
- Homework inbox, Parent Pulse (weekly summary for WhatsApp or email) and a class schedule

**Public site**: home, for players, for coaches, academies, parents, pricing, free tools
(scoresheet to PGN, picture to position, puzzle of the day) and teaching guides.

## Run it locally

Any static file server works. From this folder:

```
python -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk mostly works too,
but the bot worker and live video need the page served over http(s).

## Publish with GitHub Pages

In the repository on GitHub: Settings → Pages → Source: "Deploy from a branch" →
branch `main`, folder `/ (root)`. The site appears at `https://<your-username>.github.io/<repo-name>/`.
Live video needs https, which GitHub Pages provides.

## Live video

Video goes directly between browsers. The free PeerJS cloud server only introduces them.
For dependable classes, run your own PeerServer and set
`window.MC_PEER = { host, port, path, secure }` before `js/live.js` loads (see the top of that file).

## Data

Progress, replays, homework and settings are stored in the browser (localStorage and IndexedDB).
Nothing is sent to a server, except live-video connections between class members.

## Third-party components

| Component | Where | Licence |
|---|---|---|
| PeerJS 1.5.5 | `js/vendor/peerjs.min.js` | MIT (`js/vendor/PEERJS-LICENSE.txt`) |
| PDF.js 3.11.174 | `js/vendor/pdfjs/` | Apache-2.0 (`js/vendor/pdfjs/LICENSE.txt`) |
| Cburnett chess pieces | `img/pieces/` | BSD, by Colin M.L. Burnett (`img/pieces/LICENSE.txt`) |
| Google Fonts (Orbitron, Exo 2, Nunito, Noto Sans Symbols 2) | loaded from fonts.googleapis.com | SIL Open Font License |

The piece outlines were thinned and the white pieces' outline colour changed for MoonChess.

Note: PDF.js 3.11 has a known security issue with crafted PDF fonts (fixed in 4.2.67).
MoonChess opens PDFs with `isEvalSupported: false`, which avoids it, but upgrading PDF.js is recommended.
