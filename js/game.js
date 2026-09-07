/* Game controller: board rendering, input, highlights, checks, timer. */
const Game = (function () {
  let game = null;
  let selected = -1;
  let inputMode = 'value';
  let paused = false;
  let sessionStart = 0;
  let timerHandle = null;
  let errorCells = [];
  let conflictCells = [];
  let hintsOn = false;
  let hintCells = [];
  let hintElims = [];

  const boardEl = document.getElementById('board');
  const timerEl = document.getElementById('timer');
  const pauseBtn = document.getElementById('pause-btn');
  const pauseOverlay = document.getElementById('pause-overlay');
  const pauseTimeEl = document.getElementById('pause-time');
  const resumeBtn = document.getElementById('resume-btn');
  const quitBtn = document.getElementById('quit-btn');
  const backBtn = document.getElementById('back-btn');
  const checkBtn = document.getElementById('check-board-btn');
  const checkHint = document.getElementById('check-hint');
  const eraseBtn = document.getElementById('erase-btn');
  const clearBtn = document.getElementById('clear-board-btn');
  const clearModal = document.getElementById('clear-modal');
  const clearConfirm = document.getElementById('clear-confirm');
  const clearCancel = document.getElementById('clear-cancel');
  const valueModeBtn = document.getElementById('value-mode-btn');
  const candidateModeBtn = document.getElementById('candidate-mode-btn');
  const winModal = document.getElementById('win-modal');
  const winDetails = document.getElementById('win-details');
  const giveupModal = document.getElementById('giveup-modal');
  const giveupConfirm = document.getElementById('giveup-confirm');
  const giveupCancel = document.getElementById('giveup-cancel');
  const difficultyLabel = document.getElementById('game-difficulty-label');
  const keyShortEl = document.getElementById('game-key-short');
  const modeHint = document.getElementById('mode-hint');
  const hintToggle = document.getElementById('hint-toggle');
  const hintMessage = document.getElementById('hint-message');
  const padBtns = [];

  function makeKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  const CUSTOM_DIFFICULTIES = ['easy', 'medium', 'hard', 'custom'];

  /* ---------- lifecycle ---------- */

  function buildGame({ difficulty, puzzle, solution, givens }) {
    game = {
      key: makeKey(),
      difficulty,
      puzzle,
      solution,
      givens,
      entries: new Array(81).fill(0),
      candidates: Array.from({ length: 81 }, () => []),
      startTime: Date.now(),
      playMs: 0,
      status: 'in_progress',
      completedAt: null,
    };
    Storage.saveGame(game);
    Storage.setLastGameKey(game.key);
    Storage.recordNewGame(game);
    enterGame();
  }

  function startNew(difficulty) {
    const gen = Sudoku.generatePuzzle(difficulty);
    buildGame({
      difficulty,
      puzzle: gen.puzzle,
      solution: gen.solution,
      givens: gen.givens,
    });
  }

  /* Start a game from a user-provided board. Returns an error string, or null
     on success (the game view opens automatically). */
  function importPuzzle(text, difficulty) {
    const parsed = Sudoku.parseAndValidate(text);
    if (!parsed.ok) return parsed.error;
    buildGame({
      difficulty: CUSTOM_DIFFICULTIES.includes(difficulty) ? difficulty : 'custom',
      puzzle: parsed.puzzle,
      solution: Sudoku.solve(parsed.puzzle, 1)[0],
      givens: parsed.givens,
    });
    return null;
  }

  /* Build a shareable #p=...&d=... link for the current game (givens only). */
  function shareLink() {
    if (!game) return null;
    let url = location.href.split('#')[0] + '#p=' + Sudoku.encodePuzzle(game.puzzle);
    if (game.difficulty !== 'custom') url += '&d=' + game.difficulty;
    return url;
  }

  function resume(key) {
    const g = Storage.getGame(key);
    if (!g) return false;
    game = g;
    if (game.status !== 'completed') {
      game.status = 'in_progress';
      Storage.saveGame(game);
    }
    enterGame();
    return true;
  }

  function enterGame() {
    selected = -1;
    inputMode = 'value';
    paused = false;
    errorCells = [];
    conflictCells = [];
    pauseOverlay.classList.add('hidden');
    giveupModal.classList.add('hidden');
    setModeUI();
    difficultyLabel.textContent = Storage.cap(game.difficulty);
    keyShortEl.textContent = '#' + game.key.slice(0, 6).toUpperCase();
    setCheckButtonState();
    applyTimerVisibility();
    updateHints();
    render();
    startTimer();
    App.showView('game');
  }

  /* Hide the live clock (and the elapsed line in the pause overlay) when the
     timer display is toggled off. Time is still tracked for saves and stats. */
  function applyTimerVisibility() {
    const show = Storage.settings().showTimer;
    timerEl.classList.toggle('hidden', !show);
    pauseTimeEl.classList.toggle('hidden', !show);
  }

  function currentDifficulty() {
    return game ? game.difficulty : 'easy';
  }

  /* Persist current play time and state without stopping the running clock. */
  function saveNow() {
    if (!game) return;
    game.playMs = currentMs();
    if (sessionStart) sessionStart = Date.now();
    Storage.saveGame(game);
  }

  /* ---------- timer ---------- */

  function currentMs() {
    return game.playMs + (sessionStart ? Date.now() - sessionStart : 0);
  }

  function accumulate() {
    if (sessionStart) {
      game.playMs += Date.now() - sessionStart;
      sessionStart = 0;
    }
  }

  function updateTimer() {
    timerEl.textContent = Storage.formatMs(currentMs());
  }

  function startTimer() {
    stopTimer();
    sessionStart = Date.now();
    timerHandle = setInterval(updateTimer, 250);
    updateTimer();
  }

  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    accumulate();
  }

  /* ---------- rendering ---------- */

  function inInfluence(i) {
    if (selected < 0) return false;
    const sr = Math.floor(selected / 9), sc = selected % 9;
    const r = Math.floor(i / 9), c = i % 9;
    if (sr === r || sc === c) return true;
    return Math.floor(sr / 3) === Math.floor(r / 3) && Math.floor(sc / 3) === Math.floor(c / 3);
  }

  function render() {
    boardEl.innerHTML = '';
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const r = Math.floor(i / 9), c = i % 9;
      if (c !== 8) {
        cell.classList.add('has-r');
        if (c % 3 === 2) cell.classList.add('thick-r');
      }
      if (r !== 8) {
        cell.classList.add('has-b');
        if (r % 3 === 2) cell.classList.add('thick-b');
      }

      const isGiven = game.puzzle[i] !== 0;
      const val = isGiven ? game.puzzle[i] : game.entries[i];
      const cands = game.candidates[i];

      if (isGiven) {
        cell.classList.add('given');
        const span = document.createElement('span');
        span.className = 'value';
        span.textContent = val;
        cell.appendChild(span);
      } else if (val) {
        cell.classList.add('filled');
        const span = document.createElement('span');
        span.className = 'value';
        span.textContent = val;
        cell.appendChild(span);
      } else if (cands.length) {
        const grid = document.createElement('div');
        grid.className = 'cand-grid';
        if (cands.length === 1) {
          const span = document.createElement('span');
          span.className = 'single';
          span.textContent = cands[0];
          grid.appendChild(span);
        } else {
          for (let d = 1; d <= 9; d++) {
            const span = document.createElement('span');
            span.textContent = cands.includes(d) ? d : '';
            grid.appendChild(span);
          }
        }
        cell.appendChild(grid);
      }

      if (i === selected) cell.classList.add('selected');
      else if (inInfluence(i)) cell.classList.add('hl');
      if (errorCells.includes(i)) cell.classList.add('error');
      if (conflictCells.includes(i)) cell.classList.add('conflict');
      if (hintElims.includes(i)) cell.classList.add('hint-elim');
      if (hintCells.includes(i)) cell.classList.add('hint-cell');

      cell.dataset.index = i;
      cell.addEventListener('click', () => selectCell(i));
      boardEl.appendChild(cell);
    }
    updatePadState();
  }

  /* Keep the number pad in sync with the board:
     - digits fully placed (9 cells = every row, column and box) are disabled,
     - pad numbers matching the selected cell's value or candidates are
       highlighted so toggling candidates (up to 9) is easy to follow. */
  function updatePadState() {
    for (const b of padBtns) {
      b.classList.remove('pad-active');
      b.disabled = false;
    }
    if (!game) return;

    const counts = new Array(10).fill(0);
    for (let i = 0; i < 81; i++) {
      const v = game.entries[i] || game.puzzle[i];
      if (v) counts[v]++;
    }
    for (let v = 1; v <= 9; v++) {
      if (counts[v] >= 9) padBtns[v - 1].disabled = true;
    }

    if (selected < 0) return;
    const v = game.entries[selected] || game.puzzle[selected];
    if (v) {
      padBtns[v - 1].classList.add('pad-active');
      return;
    }
    for (const c of game.candidates[selected]) padBtns[c - 1].classList.add('pad-active');
  }

  function selectCell(i) {
    if (paused) return;
    selected = i;
    recomputeConflicts();
    updateHints();
    render();
  }

  function setModeUI() {
    valueModeBtn.classList.toggle('active', inputMode === 'value');
    candidateModeBtn.classList.toggle('active', inputMode === 'candidate');
    modeHint.textContent = inputMode === 'value'
      ? 'Pick a number to place it in the selected cell.'
      : 'Tap numbers to toggle candidates \u2014 up to 9 per cell, tap again to remove.';
  }

  function setCheckButtonState() {
    const autoOn = Storage.settings().autoCheck;
    checkBtn.disabled = autoOn;
    checkHint.classList.remove('hidden');
    setHintText();
  }

  function setHintText() {
    checkHint.textContent = Storage.settings().autoCheck
      ? 'Auto-check is on \u2014 invalid entries are flagged red as you type.'
      : 'Auto-check is off \u2014 use Check Board to review the grid.';
  }

  /* ---------- hints ---------- */

  /* With hints on, the selected cell's detected configurations (and any
     eliminations they imply) are highlighted and explained. Highlights are
     limited to cells that hold a value or the player's own candidates, and
     detection reads derived candidates only — it never touches the notes. */
  function hasContent(i) {
    return !!((game.entries[i] || game.puzzle[i]) || game.candidates[i].length);
  }

  function updateHints() {
    if (!hintsOn || !game || selected < 0) {
      hintCells = [];
      hintElims = [];
      hintMessage.textContent = '';
      return;
    }
    const cands = Techniques.deriveCandidates(game.puzzle, game.entries);
    const hints = Techniques.findHintsForCell(cands, selected);
    hintCells = [];
    hintElims = [];
    for (const h of hints) {
      hintCells.push(...h.cells.filter(hasContent));
      hintElims.push(...h.eliminations.filter(hasContent));
    }
    hintCells = [...new Set(hintCells)];
    hintElims = [...new Set(hintElims)];
    const visible = hints.find((h) =>
      h.cells.some(hasContent) || h.eliminations.some(hasContent));
    if (visible) {
      hintMessage.textContent = visible.text +
        (hints.length > 1 ? ' (+' + (hints.length - 1) + ' more)' : '');
    } else if (hasContent(selected)) {
      hintMessage.textContent = 'No technique found involving this cell yet.';
    } else {
      hintMessage.textContent = '';
    }
  }

  function toggleHints() {
    hintsOn = !hintsOn;
    hintToggle.classList.toggle('on', hintsOn);
    hintToggle.setAttribute('aria-pressed', String(hintsOn));
    hintToggle.textContent = hintsOn ? 'Hints: On' : 'Hints: Off';
    updateHints();
    render();
  }

  /* ---------- input ---------- */

  function setValue(i, v) {
    if (paused || !game) return;
    if (game.puzzle[i] !== 0) return;
    game.entries[i] = v;
    game.candidates[i] = [];
    if (v) clearPeerCandidates(i, v);
    afterInput(i);
  }

  /* Auto-clear: placing a digit removes it from the candidate notes of every
     peer (row, column, and 3x3 box) so the notes stay in sync with the board. */
  function clearPeerCandidates(i, v) {
    for (const p of Sudoku.PEERS[i]) {
      const cands = game.candidates[p];
      const idx = cands.indexOf(v);
      if (idx >= 0) cands.splice(idx, 1);
    }
  }

  function toggleCandidate(i, v) {
    if (paused || !game) return;
    if (game.puzzle[i] !== 0) return;
    if (game.entries[i]) return;
    const cands = game.candidates[i];
    const idx = cands.indexOf(v);
    if (idx >= 0) cands.splice(idx, 1);
    else cands.push(v);
    cands.sort((a, b) => a - b);
    afterInput(i);
  }

  function afterInput(i) {
    saveNow();
    errorCells = Storage.settings().autoCheck ? findErrors() : [];
    recomputeConflicts();
    updateHints();
    render();
    if (checkWin()) win();
  }

  /* ---------- highlight scans ---------- */

  /* Candidate conflicts: peers of `i` whose candidates clash with the value
     placed there (or whose value clashes with this cell's candidates). */
  function scanConflicts(i) {
    const conflicts = new Set();
    const v = game.entries[i] || game.puzzle[i];
    const cands = game.candidates[i];
    if (v) {
      for (const p of Sudoku.PEERS[i]) {
        if (game.candidates[p].includes(v)) conflicts.add(p);
      }
    } else {
      for (const c of cands) {
        for (const p of Sudoku.PEERS[i]) {
          if (game.entries[p] === c) conflicts.add(p);
        }
      }
    }
    return [...conflicts];
  }

  function recomputeConflicts() {
    if (!Storage.settings().conflictHighlight || selected < 0 || !game) {
      conflictCells = [];
      return;
    }
    conflictCells = scanConflicts(selected);
  }

  /* Duplicate-based error scan: any filled cell whose value repeats in its
     row, column, or box. Givens (puzzle) are included in the comparison. */
  function findErrors() {
    const err = new Set();
    for (let i = 0; i < 81; i++) {
      const v = game.entries[i] || game.puzzle[i];
      if (!v) continue;
      for (const p of Sudoku.PEERS[i]) {
        if ((game.entries[p] || game.puzzle[p]) === v) { err.add(i); err.add(p); }
      }
    }
    return [...err];
  }

  /* ---------- win / check ---------- */

  function checkWin() {
    for (let i = 0; i < 81; i++) {
      if (game.puzzle[i] === 0 && game.entries[i] !== game.solution[i]) return false;
    }
    return true;
  }

  function win() {
    if (game.status === 'completed') return;
    stopTimer();
    game.status = 'completed';
    game.completedAt = Date.now();
    saveNow();
    Storage.recordWin(game);
    winDetails.textContent =
      `${Storage.cap(game.difficulty)} · Time ${Storage.formatMs(game.playMs)}`;
    winModal.classList.remove('hidden');
  }

  function manualCheck() {
    if (paused || !game) return;
    errorCells = findErrors();
    render();
    const msg = errorCells.length
      ? `${errorCells.length} cell${errorCells.length === 1 ? '' : 's'} with duplicate conflicts.`
      : 'No errors found. The board is valid so far.';
    document.getElementById('check-message').textContent = msg;
    document.getElementById('check-modal').classList.remove('hidden');
  }

  /* ---------- pause / resume / quit ---------- */

  function pauseGame() {
    if (paused || !game) return;
    stopTimer();
    paused = true;
    game.status = 'paused';
    saveNow();
    pauseTimeEl.textContent = 'Elapsed ' + Storage.formatMs(game.playMs);
    pauseOverlay.classList.remove('hidden');
  }

  function resumeGame() {
    if (!game) return;
    if (game.status === 'completed') return;
    game.status = 'in_progress';
    paused = false;
    pauseOverlay.classList.add('hidden');
    startTimer();
    saveNow();
  }

  function confirmQuit() {
    if (!game || game.status === 'completed') return;
    giveupModal.classList.remove('hidden');
  }

  function doQuit() {
    if (!game || game.status === 'completed') return;
    stopTimer();
    game.status = 'abandoned';
    game.completedAt = Date.now();
    saveNow();
    Storage.recordAbandon(game);
    pauseOverlay.classList.add('hidden');
    giveupModal.classList.add('hidden');
    App.showHome();
  }

  function cancelQuit() {
    giveupModal.classList.add('hidden');
  }

  function backToMenu() {
    if (!game) return;
    saveNow();
    App.showHome();
  }

  /* ---------- clear board ---------- */

  function confirmClear() {
    if (paused || !game) return;
    clearModal.classList.remove('hidden');
  }

  /* Wipe every player entry and candidate, keeping the givens and the running
     clock. The game continues from a blank board. */
  function clearBoard() {
    if (!game) return;
    for (let i = 0; i < 81; i++) {
      if (game.puzzle[i] === 0) {
        game.entries[i] = 0;
        game.candidates[i] = [];
      }
    }
    clearModal.classList.add('hidden');
    errorCells = [];
    conflictCells = [];
    saveNow();
    updateHints();
    render();
  }

  function cancelClear() {
    clearModal.classList.add('hidden');
  }

  /* ---------- events ---------- */

  function bind() {
    pauseBtn.addEventListener('click', pauseGame);
    resumeBtn.addEventListener('click', resumeGame);
    quitBtn.addEventListener('click', confirmQuit);
    giveupConfirm.addEventListener('click', doQuit);
    giveupCancel.addEventListener('click', cancelQuit);
    backBtn.addEventListener('click', backToMenu);
    eraseBtn.addEventListener('click', () => { if (selected >= 0) setValue(selected, 0); });
    clearBtn.addEventListener('click', confirmClear);
    clearConfirm.addEventListener('click', clearBoard);
    clearCancel.addEventListener('click', cancelClear);
    checkBtn.addEventListener('click', manualCheck);
    valueModeBtn.addEventListener('click', () => { inputMode = 'value'; setModeUI(); });
    candidateModeBtn.addEventListener('click', () => { inputMode = 'candidate'; setModeUI(); });
    hintToggle.addEventListener('click', toggleHints);
    document.getElementById('win-play-again').addEventListener('click', () => {
      winModal.classList.add('hidden');
      startNew(currentDifficulty());
    });
    document.getElementById('win-menu').addEventListener('click', () => {
      winModal.classList.add('hidden');
      App.showHome();
    });

    const pad = document.getElementById('number-pad');
    for (let v = 1; v <= 9; v++) {
      const b = document.createElement('button');
      b.className = 'pad-btn';
      b.textContent = v;
      b.addEventListener('click', () => {
        if (paused || !game) return;
        if (selected < 0) { flashHint(); return; }
        if (inputMode === 'value') setValue(selected, v);
        else toggleCandidate(selected, v);
      });
      padBtns.push(b);
      pad.appendChild(b);
    }

    window.addEventListener('beforeunload', saveNow);
  }

  function flashHint() {
    checkHint.textContent = 'Select a cell first, then pick a number.';
    setTimeout(setHintText, 1800);
  }

  bind();

  return {
    startNew,
    importPuzzle,
    shareLink,
    resume,
    saveNow,
    currentDifficulty,
  };
})();
