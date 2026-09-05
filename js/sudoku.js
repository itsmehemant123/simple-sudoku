/* Sudoku solver + puzzle generator. */
const Sudoku = (function () {
  const N = 9;

  const DIFFICULTIES = {
    easy: { targetGivens: 36 },
    medium: { targetGivens: 30 },
    hard: { targetGivens: 25 },
  };

  /* PEERS[i] = indices sharing a row, column, or 3x3 box with cell i. */
  const PEERS = (function () {
    const peers = [];
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9;
      const set = new Set();
      for (let cc = 0; cc < 9; cc++) if (cc !== c) set.add(r * 9 + cc);
      for (let rr = 0; rr < 9; rr++) if (rr !== r) set.add(rr * 9 + c);
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) {
          const idx = (br + dr) * 9 + (bc + dc);
          if (idx !== i) set.add(idx);
        }
      peers.push([...set]);
    }
    return peers;
  })();

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function canPlace(grid, i, v) {
    for (const p of PEERS[i]) if (grid[p] === v) return false;
    return true;
  }

  /* Pick the empty cell with the fewest legal digits (MRV heuristic). */
  function bestEmpty(grid) {
    let best = -1, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i] !== 0) continue;
      let count = 0;
      for (let v = 1; v <= 9; v++) if (canPlace(grid, i, v)) count++;
      if (count < bestCount) {
        bestCount = count;
        best = i;
        if (count <= 1) break;
      }
    }
    return best;
  }

  /* Solve the grid. Returns up to `limit` solutions as copies of the grid.
     When `maxNodes` > 0, the search stops after that many visited cells and
     `out.exhausted` signals the budget was hit (prevents hangs on bad input). */
  function solve(grid, limit = 1, maxNodes = 0) {
    const out = [];
    out.exhausted = false;
    const g = grid.slice();
    const budgeted = maxNodes > 0;
    let nodes = 0;
    (function rec() {
      if (budgeted && ++nodes > maxNodes) { out.exhausted = true; return; }
      if (out.length >= limit) return;
      const i = bestEmpty(g);
      if (i === -1) { out.push(g.slice()); return; }
      for (let v = 1; v <= 9; v++) {
        if (canPlace(g, i, v)) {
          g[i] = v;
          rec();
          if (out.length >= limit) return;
          g[i] = 0;
        }
      }
    })();
    return out;
  }

  /* Generate a fully filled, valid solution. */
  function generateSolution() {
    const g = new Array(81).fill(0);
    (function fill() {
      const i = bestEmpty(g);
      if (i === -1) return true;
      for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (canPlace(g, i, v)) {
          g[i] = v;
          if (fill()) return true;
          g[i] = 0;
        }
      }
      return false;
    })();
    return g;
  }

  /*
   * Generate a puzzle: start from a full solution, remove cells at random,
   * keeping only removals that preserve a unique solution.
   */
  function generatePuzzle(difficulty) {
    const { targetGivens } = DIFFICULTIES[difficulty] || DIFFICULTIES.easy;
    let best = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const solution = generateSolution();
      const puzzle = solution.slice();
      let givens = 81;
      for (const i of shuffle([...Array(81).keys()])) {
        if (givens <= targetGivens) break;
        const backup = puzzle[i];
        puzzle[i] = 0;
        if (solve(puzzle, 2).length !== 1) {
          puzzle[i] = backup;
        } else {
          givens--;
        }
      }
      if (!best || givens < best.givens) best = { puzzle, solution, givens };
      if (givens <= targetGivens) break;
    }
    return best;
  }

  /*
   * Parse an 81-cell row-major string into a puzzle. Digits 1-9 are givens,
   * 0 and . are empty cells; whitespace is ignored. Requires exactly one
   * solution so the board is a valid puzzle.
   */
  function parseAndValidate(text) {
    const cleaned = String(text || '').replace(/\s+/g, '');
    if (cleaned.length !== 81) {
      return { ok: false, error: `Board must be exactly 81 cells (found ${cleaned.length}).` };
    }
    const puzzle = [];
    for (let i = 0; i < 81; i++) {
      const ch = cleaned[i];
      if (ch === '0' || ch === '.') puzzle.push(0);
      else if (ch >= '1' && ch <= '9') puzzle.push(+ch);
      else {
        return {
          ok: false,
          error: `Invalid character "${ch}" at position ${i + 1}. Use digits 1-9 and 0 or . for empty cells.`,
        };
      }
    }
    for (let i = 0; i < 81; i++) {
      const v = puzzle[i];
      if (!v) continue;
      for (const p of PEERS[i]) {
        if (puzzle[p] === v) {
          return { ok: false, error: `Duplicate ${v} in the same row, column, or box.` };
        }
      }
    }
    const solved = solve(puzzle, 2, 100000);
    if (solved.exhausted) {
      return { ok: false, error: 'This board is too sparse to validate; add more givens or remove conflicts.' };
    }
    if (solved.length === 0) return { ok: false, error: 'This board has no solution.' };
    if (solved.length > 1) return { ok: false, error: 'This board has multiple solutions; a valid puzzle must have exactly one.' };
    const givens = puzzle.reduce((n, v) => n + (v ? 1 : 0), 0);
    return { ok: true, puzzle, givens };
  }

  /* Inverse of parseAndValidate: number[81] -> 81-char string (0 -> .). */
  function encodePuzzle(puzzle) {
    return puzzle.map((v) => (v ? String(v) : '.')).join('');
  }

  return {
    PEERS,
    solve,
    generateSolution,
    generatePuzzle,
    parseAndValidate,
    encodePuzzle,
    DIFFICULTIES,
  };
})();
