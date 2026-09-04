# Sudoku

A sleek, client-side Sudoku web app — no build step, no dependencies, works fully offline (just open `index.html` in a browser).

## Features

- **Generated puzzles** with a local solver/generator (uniqueness-verified) at three difficulties: Easy (36 givens), Medium (30), Hard (25)
- **Candidates** — up to 9 per cell, toggled via the number pad in *Candidate* mode; 1 candidate renders as a large mark, 2+ as a mini 3×3 grid
- **Cell awareness** — selecting a cell highlights its row, column, and 3×3 box
- **Conflict highlighting** (toggleable) — selecting a number flags peer cells whose candidates clash; scans handle any number of candidates per cell
- **Error checking** — off by default; when enabled, duplicates are flagged red on entry. A **Check Board** button (active only when auto-check is off) scans the whole grid
- **Completed-digit lock** — once a digit has all 9 placements, its pad button is disabled
- **Timer + Pause/Resume** (timer display can be hidden from Settings), plus **Give Up** (with confirm) that records an abandoned game
- **Home screen** — difficulty picker, resumeable games, history (capped at 50, scrollable), and stats (games, wins, win rate, streak, play time, best time per difficulty)
- **Persistence** — every game gets a random key and is saved to `localStorage`, so mid-way games can be resumed later
- **Installable PWA** — web app manifest + service worker; install it to the home screen (iOS Safari: Share → *Add to Home Screen*) or taskbar/dock (Chrome/Edge: install icon in the address bar)
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
css/style.css     Glass design system, light & dark themes via CSS variables
js/sudoku.js      Solver + unique-solution puzzle generator
js/storage.js     localStorage (games, stats, settings) + shared formatters
js/sound.js       Web Audio click sounds (buttons + cells)
js/game.js        Board rendering, input, highlights, checks, timer
js/app.js         Home view, settings, theme, zoom, view routing
manifest.json     PWA manifest (name, icons, standalone display)
sw.js             Service worker (cache-first offline app shell)
icons/            PWA + apple-touch icons
```

## How the pieces fit

- **Data model per game** (`Storage.games`): `{ key, difficulty, puzzle[81], solution[81], entries[81], candidates[81][], startTime, playMs, status, ... }`
  - `puzzle[i]` = givens (nonzero), `entries[i]` = player values, `candidates[i]` = array of 1–9.
  - **Gotcha:** givens live in `puzzle`, not `entries`. Any scan over the board (`findErrors`, `scanConflicts`, `checkWin`, `updatePadState`) reads the value as `entries[i] || puzzle[i]`.
- **Input paths:** Value mode sets `entries[i]` (clearing candidates); Candidate mode toggles an entry in `candidates[i]`; Erase clears both.
- **Status flow:** `in_progress` → `paused` (pause), `completed` (win), `abandoned` (Give Up). Leaving via **← Menu** keeps the game resumeable; **Give Up** requires confirmation and records it as abandoned.
- **Storage keys:** `sudoku.games`, `sudoku.stats`, `sudoku.settings`, `sudoku.lastGameKey`.

## Verification

There is no in-repo test framework. Verification so far used headless-Chrome DOM harnesses (build a copy of `index.html` with absolute `file://` script paths + an injected test script, then `--dump-dom`). Quick sanity checks:

```sh
node --check js/sudoku.js js/storage.js js/game.js js/app.js
```

Manual flow to smoke test: new game at each difficulty → value + candidate entry → conflict highlight → duplicate error (auto-check on) → Check Board (auto-check off) → pause/resume → Menu + resume from list → Give Up confirm → win detection → theme toggle (both themes) → refresh to confirm persistence.
