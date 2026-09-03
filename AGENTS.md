# AGENTS.md

Guidance for AI agents working in this codebase.

## Overview

A dependency-free, vanilla HTML/CSS/JS Sudoku app. Runs by opening `index.html` from the filesystem (`file://`) — **no build step, no bundler, no frameworks, no CDN**. Keep it that way.

Files are plain scripts loaded in order at the end of `index.html`:

```html
<script src="js/sudoku.js"></script>
<script src="js/storage.js"></script>
<script src="js/game.js"></script>
<script src="js/app.js"></script>
```

Scripts expose IIFE namespaces on `window`: `Sudoku`, `Storage`, `Game`, `App`.

## Conventions

- **No comments in new code** unless they explain non-obvious logic (existing files use a few short section comments — match that style).
- Match the existing style: 2-space indent, single quotes, trailing commas, `const`/`let` (no `var`).
- Do not introduce external dependencies (CDN, npm, frameworks) — offline capability is a core requirement.
- Prefer editing existing files over creating new ones.

## Architecture

| File | Responsibility |
|---|---|
| `js/sudoku.js` | Solver + unique-solution puzzle generator (`Sudoku.generatePuzzle(difficulty)`, `Sudoku.solve`, `Sudoku.PEERS`). |
| `js/storage.js` | `localStorage` persistence + shared formatters. |
| `js/game.js` | Game controller: board render, input, highlights, checks, timer, win/pause/give-up. |
| `js/app.js` | Home view rendering, settings toggles, theme, view routing. |
| `css/style.css` | Glass design system. Themes are CSS variables under `html[data-theme="light"]` / `html[data-theme="dark"]`. |
| `index.html` | Both views (home + game), number pad, modals. |

## Critical invariants (do not break)

1. **Givens vs. entries.** `puzzle[i]` holds givens (nonzero); `entries[i]` holds player values. `entries[i]` is always `0` for givens. Any scan of a cell's value must use `entries[i] || puzzle[i]` — this matters in `findErrors`, `scanConflicts`, `checkWin`, and `updatePadState`.
2. **Candidates are arrays** (`candidates[i]` = `number[]`, up to 9, kept sorted). Toggling adds/removes; placing a value clears them; Erase clears both value and candidates.
3. **`enterGame()` must fully reset transient UI state** — `paused = false`, hide `#pause-overlay` and `#giveup-modal`, clear `errorCells`/`conflictCells`. This fixed two past bugs (new games opening "paused"; stale pause overlay showing while the clock ran).
4. **Timer accounting.** `saveNow()` snapshots `currentMs()` into `game.playMs` and resets `sessionStart` *without stopping the clock*. `stopTimer()` accumulates via `accumulate()`. Do not let `saveNow()` double-count.
5. **Pad state.** `updatePadState()` (called from `render()`) disables digits with 9 placements and highlights the selected cell's value/candidates (`pad-active`).
6. **Resume semantics.** Clicking Resume on the home screen auto-plays (overlay hidden, timer running). "Give Up" abandons the game (resets win streak) and requires the confirm modal.
7. **Theme parity.** New styling must work in both themes. Use CSS variables, not hard-coded colors. `--candidate` should stay visually distinct from value colors (smaller, lighter weight, muted gray).
8. **Persistence.** Every input path calls `saveNow()`; `beforeunload` also saves. Game state must survive reload for resume.

## Difficulty tuning

Givens targets live in `DIFFICULTIES` in `js/sudoku.js`: easy 36, medium 30, hard 25. Generator removes cells at random while keeping a unique solution (via a 2-solution-limited solve).

## Verification

No test framework in the repo. Do these before finishing work:

```sh
node --check js/sudoku.js js/storage.js js/game.js js/app.js
```

For behavioral checks, manual testing in a browser (see README "Verification" for the flow). If writing automated checks, use the existing pattern: a temp copy of `index.html` with script/CSS `src` rewritten to absolute `file://` paths plus an injected test `<script>` that writes results into a `<pre id="results">`, then drive it with headless Chrome (`--headless=new --virtual-time-budget=8000 --dump-dom`) and read the `pre`. Note `virtual-time-budget` does not settle CSS transitions — disable `body` transition in the harness if reading computed styles.
