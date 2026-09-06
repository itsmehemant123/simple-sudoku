# Sudoku

A sleek, client-side Sudoku web app — no build step, no dependencies, works fully offline (just open `index.html` in a browser).

## Features

- **Generated puzzles** with a local solver/generator (uniqueness-verified) at three difficulties: Easy (36 givens), Medium (30), Hard (25)
- **Import custom boards** — paste an 81-cell string (digits 1-9; `0`/`.` for empty) to play it as a *Custom* game; validated for exactly one solution
- **Share by link** — any game (generated or imported) has a copyable `#p=…&d=…` URL; opening it auto-starts the same puzzle (difficulty preserved for generated games)
- **Candidates** — up to 9 per cell, toggled via the number pad in *Candidate* mode; 1 candidate renders as a large mark, 2+ as a mini 3×3 grid. Placing a value auto-removes that digit from the candidates of its row, column, and 3×3 box
- **Cell awareness** — selecting a cell highlights its row, column, and 3×3 box
- **Conflict highlighting** (toggleable) — selecting a number flags peer cells whose candidates clash; scans handle any number of candidates per cell
- **In-game hints** — a *Hints* toggle in the game view; tapping a cell then highlights any detected technique involving it (Hidden/Naked Single, Locked Candidates, pairs/triples, X-Wing, Swordfish, Finned X-Wing, XY/XYZ-Wing, W-Wing, Skyscraper, Two-String Kite, Unique Rectangle) and explains the elimination in a line under the board. Detection is read-only and uses derived candidates, never your notes; highlights appear only on cells that already hold a value or your own candidates
- **Error checking** — off by default; when enabled, duplicates are flagged red on entry. A **Check Board** button (active only when auto-check is off) scans the whole grid
- **Completed-digit lock** — once a digit has all 9 placements, its pad button is disabled
- **Timer + Pause/Resume** (timer display can be hidden from Settings), plus **Give Up** (with confirm) that records an abandoned game
- **Home screen** — difficulty picker, resumeable games, history (capped at 50, scrollable), and stats (games, wins, win rate, streak, play time, best time per difficulty)
- **Persistence** — every game gets a random key and is saved to `localStorage`, so mid-way games can be resumed later
- **Installable PWA** — web app manifest + service worker; install it to the home screen (iOS Safari: Share → *Add to Home Screen*) or taskbar/dock (Chrome/Edge: install icon in the address bar)
- **Mobile-friendly** — on phones the board and number pad fit one screen with no scrolling; landscape puts them side-by-side. The compact layout is visual-viewport driven, so it also kicks in when an iPad or desktop browser is pinch-zoomed in — the 1–9 pad never runs off the screen
- **Light & dark glass themes**

## Run

No server required for the game itself:

```sh
open index.html
```

For **installable PWA** features (service worker, add-to-home-screen), serve over http(s)/localhost — service workers don't run on `file://`. Either a static host (GitHub Pages, etc.) or locally:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

## Project structure

```
index.html        Home + Game views, number pad, modals
css/style.css     Glass design system, light & dark themes via CSS variables, compact layout under html.compact
js/sudoku.js      Solver + unique-solution puzzle generator
js/techniques.js  Candidate derivation + technique detection (hint overlay)
js/storage.js     localStorage (games, stats, settings) + shared formatters
js/sound.js       Web Audio click sounds (buttons + cells)
js/game.js        Board rendering, input, highlights, checks, timer
js/app.js         Home view, settings, theme, zoom, view routing, visual-viewport compact layout
manifest.json     PWA manifest (name, icons, standalone display)
sw.js             Service worker (cache-first offline app shell)
icons/            PWA + apple-touch icons
```

## How the pieces fit

- **Data model per game** (`Storage.games`): `{ key, difficulty, puzzle[81], solution[81], entries[81], candidates[81][], startTime, playMs, status, ... }`
  - `puzzle[i]` = givens (nonzero), `entries[i]` = player values, `candidates[i]` = array of 1–9.
  - `difficulty` is `easy`/`medium`/`hard` for generated games, `custom` for imported/shared boards (stats get their own `custom` bucket).
  - **Gotcha:** givens live in `puzzle`, not `entries`. Any scan over the board (`findErrors`, `scanConflicts`, `checkWin`, `updatePadState`) reads the value as `entries[i] || puzzle[i]`.
- **Input paths:** Value mode sets `entries[i]` (clearing candidates); Candidate mode toggles an entry in `candidates[i]`; Erase clears both.
- **Status flow:** `in_progress` → `paused` (pause), `completed` (win), `abandoned` (Give Up). Leaving via **← Menu** keeps the game resumeable; **Give Up** requires confirmation and records it as abandoned.
- **Storage keys:** `sudoku.games`, `sudoku.stats`, `sudoku.settings`, `sudoku.lastGameKey`.

## Verification

There is no in-repo test framework. Verification so far used headless-Chrome DOM harnesses (build a copy of `index.html` with absolute `file://` script paths + an injected test script, then `--dump-dom`). Quick sanity checks:

```sh
node --check js/sudoku.js js/techniques.js js/storage.js js/sound.js js/game.js js/app.js sw.js
```

The `js/techniques.js` detectors are exercised in Node (`vm.runInContext`-load `sudoku.js` + `techniques.js`, then assert eliminations/anchoring against crafted candidate grids — X-Wing, Swordfish, Finned X-Wing, XY/XYZ-Wing, Skyscraper, Two-String Kite, Unique Rectangle). The hint UI (toggle, tap-to-inspect message, highlights, taps still placing values) is covered by the CDP harness below.

The compact layout is verified over CDP (not `--dump-dom`, since headless clamps `--window-size` to ~500px): `Emulation.setDeviceMetricsOverride` for phone widths, and `Page.addScriptToEvaluateOnNewDocument` stubbing `window.visualViewport` to simulate iPad pinch-zoom. Assert no horizontal overflow, the number pad stays inside the game-view, and portrait fits without scrolling.

Manual flow to smoke test: new game at each difficulty → value + candidate entry → conflict highlight → duplicate error (auto-check on) → Check Board (auto-check off) → pause/resume → Menu + resume from list → Give Up confirm → win detection → theme toggle (both themes) → refresh to confirm persistence. For import/share: paste a valid and an invalid board → copy a generated-game link and open it (difficulty preserved) → copy an imported-game link and open it (opens as Custom). On a real phone/iPad: play in portrait and landscape, and pinch-zoom an iPad browser to confirm the pad stays fully on screen.
