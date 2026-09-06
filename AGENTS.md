# AGENTS.md

Guidance for AI agents working in this codebase.

## Overview

A dependency-free, vanilla HTML/CSS/JS Sudoku app. Runs by opening `index.html` from the filesystem (`file://`) — **no build step, no bundler, no frameworks, no CDN**. Keep it that way.

Files are plain scripts loaded in order at the end of `index.html`:

```html
<script src="js/sudoku.js"></script>
<script src="js/techniques.js"></script>
<script src="js/storage.js"></script>
<script src="js/sound.js"></script>
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
| `js/sudoku.js` | Solver + unique-solution puzzle generator (`Sudoku.generatePuzzle`, `Sudoku.solve`, `Sudoku.PEERS`) + board parsing/encoding (`parseAndValidate`, `encodePuzzle`). |
| `js/techniques.js` | Candidate derivation (`deriveCandidates`) + technique detection for the hint overlay (`findHintsForCell`, `findHint`): singles, locked candidates, naked/hidden pairs+triples, X-Wing/Swordfish, finned X-Wing, XY/XYZ-Wing, W-Wing, Skyscraper, Two-String Kite, Unique Rectangle. Read-only. |
| `js/storage.js` | `localStorage` persistence + shared formatters (`cap`, `formatStatus`). |
| `js/sound.js` | Web Audio click sounds for buttons and cells (disabled by default). |
| `js/game.js` | Game controller: board render, input, highlights, checks, timer, win/pause/give-up, custom import (`importPuzzle`), share links (`shareLink`). |
| `js/app.js` | Home view, settings, theme, zoom, view routing, import modal, share-link auto-start, visual-viewport compact layout (`updateCompact`). |
| `css/style.css` | Glass design system. Themes are CSS variables under `html[data-theme="light"]` / `html[data-theme="dark"]`. Compact (mobile/zoomed) layout lives under `html.compact`. |
| `index.html` | Both views (home + game), number pad, modals. |
| `sw.js` | Cache-first service worker. `CACHE` constant is the cache version. |
| `manifest.json` / `icons/` | PWA manifest + install icons. |

## Critical invariants (do not break)

1. **Givens vs. entries.** `puzzle[i]` holds givens (nonzero); `entries[i]` holds player values. `entries[i]` is always `0` for givens. Any scan of a cell's value must use `entries[i] || puzzle[i]` — this matters in `findErrors`, `scanConflicts`, `checkWin`, and `updatePadState`.
2. **Candidates are arrays** (`candidates[i]` = `number[]`, up to 9, kept sorted). Toggling adds/removes; placing a value clears the cell's own candidates **and** removes that digit from the notes of its peers (row/column/box) via `clearPeerCandidates`; Erase clears both value and candidates.
3. **`enterGame()` must fully reset transient UI state** — `paused = false`, hide `#pause-overlay` and `#giveup-modal`, clear `errorCells`/`conflictCells`. This fixed two past bugs (new games opening "paused"; stale pause overlay showing while the clock ran).
4. **Timer accounting.** `saveNow()` snapshots `currentMs()` into `game.playMs` and resets `sessionStart` *without stopping the clock*. `stopTimer()` accumulates via `accumulate()`. Do not let `saveNow()` double-count.
5. **Pad state.** `updatePadState()` (called from `render()`) disables digits with 9 placements and highlights the selected cell's value/candidates (`pad-active`).
6. **Resume semantics.** Clicking Resume on the home screen auto-plays (overlay hidden, timer running). "Give Up" abandons the game (resets win streak) and requires the confirm modal.
7. **Theme parity.** New styling must work in both themes. Use CSS variables, not hard-coded colors. `--candidate` should stay visually distinct from value colors (smaller, lighter weight, muted gray).
8. **Persistence.** Every input path calls `saveNow()`; `beforeunload` also saves. Game state must survive reload for resume.
9. **Service worker cache version.** Whenever you change any file listed in `ASSETS` in `sw.js` (`index.html`, `css/`, `js/`, `manifest.json`, `favicon.svg`, `icons/`), bump the `CACHE` constant (e.g. `sudoku-v2` → `sudoku-v3`). The SW is cache-first and otherwise keeps serving stale app files. `app.js` auto-reloads once on `controllerchange`, so a normal refresh picks up the new version.
10. **Custom games (`difficulty: 'custom'`).** Imported/shared boards use difficulty `'custom'`, not easy/medium/hard. `Storage.cap('custom')` → "Custom"; stats land in the `custom` bucket of `bestTimes`/`winsByDifficulty`. All code that formats difficulty must keep working for `'custom'`.
11. **Import validation must not hang.** `Sudoku.parseAndValidate` requires exactly one solution and checks duplicates first, then calls `solve(puzzle, 2, maxNodes)` with a node budget. `solve(grid, limit, maxNodes)` sets `out.exhausted` when the budget is hit; `parseAndValidate` rejects that as "too sparse to validate". Never run an unbounded `solve(puzzle, 2)` on user input — a conflicting/sparse board forces exponential search and freezes the tab.
12. **Share links are givens-only** — `#p=<81-char>&d=<difficulty>` (`d` omitted for custom). Opening a link imports via `Game.importPuzzle(p, d)` and the hash is cleared with `history.replaceState` so refresh doesn't re-import. The hash auto-start must run **deferred** (`setTimeout(handleShareHash, 0)` in `App.init`): calling `Game.importPuzzle` synchronously from inside `App`'s own IIFE triggers `App.showView` while `App` is still in the temporal dead zone and throws. The import also saves a pending copy in `sessionStorage['sudoku.pendingShare']` (with a timestamp) so the reload triggered by the service worker's `controllerchange` right after first load can re-import and actually open the game — without it, the reloaded page has no hash and lands on Home with the puzzle merely sitting in Resume. Pending shares older than `PENDING_WINDOW` (20s) are ignored, so a later refresh never yanks the player back into a shared game.
13. **Difficulty-button binding.** Only buttons with `data-difficulty` get the `Game.startNew` handler — scope the selector to `.diff-btn[data-difficulty]` so non-difficulty buttons styled like `diff-btn` (e.g. `#import-btn`) don't start games.
14. **Compact layout is visual-viewport driven.** `js/app.js` `updateCompact()` reads `window.visualViewport` (falls back to `innerWidth`/`innerHeight`) and toggles `html.compact` when `min(w, h) <= 640` plus `html.compact-landscape` when `w > h`, publishing `--vvw`/`--vvh`/`--vvo-x`/`--vvo-y` CSS vars. In compact, `#game-view` is a `position: fixed` overlay pinned to the *visual* viewport (sized to `--vvw`/`--vvh`, translated by `--vvo-x`/`--vvo-y`). Never use `@media (max-width: …)` or `vw`/`vh` for the mobile one-screen layout — they follow the *layout* viewport and are unchanged by pinch-zoom (this is what previously pushed the 1–9 pad off-screen on a zoomed iPad). Any new game-view mobile styling must be scoped under `html.compact …` and sized off `--vvw`/`--vvh` (fonts included).
15. **Hints use derived candidates, not player notes.** The in-game hint overlay (`Game.updateHints`) runs `Techniques.deriveCandidates(game.puzzle, game.entries)` (values read as `entries[i] || puzzle[i]`) and `Techniques.findHintsForCell`. Detection never reads or mutates the player's `candidates` arrays, and the overlay never changes the board or notes — it is informational only (an on/off toggle in the game view; taps keep working as Value/Candidate). Highlight marks (`.hint-cell`/`.hint-elim`) are applied **only to cells that hold a value or the player's own candidates** — completely blank cells get no marks. Never add the bare `.hint` class to a board cell (it is the muted paragraph helper and sets `margin: 8px 0 0`); the pattern highlight class is `.hint-cell`. The `#hint-message` line always reserves vertical space (so the pinned compact board never shifts when a hint appears/clears), and `.cell` hover styling is scoped to `@media (hover: hover)` so touch taps don't trigger iOS compositing glitches.

## Difficulty tuning

Givens targets live in `DIFFICULTIES` in `js/sudoku.js`: easy 36, medium 30, hard 25. Generator removes cells at random while keeping a unique solution (via a 2-solution-limited solve).

## Verification

No test framework in the repo. Do these before finishing work:

```sh
node --check js/sudoku.js js/techniques.js js/storage.js js/sound.js js/game.js js/app.js sw.js
```

For behavioral checks, manual testing in a browser (see README "Verification" for the flow). If writing automated checks, use the existing pattern: a temp copy of `index.html` with script/CSS `src` rewritten to absolute `file://` paths plus an injected test `<script>` that writes results into a `<pre id="results">`, then drive it with headless Chrome (`--headless=new --virtual-time-budget=8000 --dump-dom`) and read the `pre`. Note `virtual-time-budget` does not settle CSS transitions — disable `body` transition in the harness if reading computed styles.

For the compact layout, drive the harness over CDP instead of `--dump-dom` (headless clamps `--window-size` to ~500px minimum): connect via the DevTools WebSocket and use `Emulation.setDeviceMetricsOverride` for exact phone widths (375/402/430 portrait, 812 landscape), and `Page.addScriptToEvaluateOnNewDocument` to stub `window.visualViewport` via `Object.defineProperty` (e.g. visual 384×512 @ offset 192,200 over a 768×1024 layout) to simulate iPad pinch-zoom. Assert no horizontal page overflow, the number pad stays fully inside the game-view, and portrait fits without vertical scroll.

Headless Chrome can be flaky/hang in some environments. A dependency-free fallback is a Node script that stubs `document`/`window`/`localStorage`/`location` (elements with `classList`, `addEventListener`, `style.setProperty`, etc.), loads the IIFE scripts with `vm.runInThisContext`, and flushes deferred callbacks (`setTimeout(..., 0)`) — this reproduces load-time flow including the deferred share-hash import. Pure logic (`parseAndValidate`, `encodePuzzle`, `solve` budget) can be exercised directly in Node by `vm.runInThisContext`-loading `js/sudoku.js`.
