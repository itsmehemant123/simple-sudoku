/* Sudoku technique detection: derives candidate pencil marks from the board
   and finds expert patterns (X-Wing, XY/XYZ-Wing, Unique Rectangle, ...).
   Hints are computed from the derived candidates and are read-only — they
   never mutate the board or the player's own note arrays. */
const Techniques = (function () {
  const N = 9;

  /* ---------- units ---------- */

  const ROWS = [...Array(9)].map((_, r) => [...Array(9)].map((_, c) => r * 9 + c));
  const COLS = [...Array(9)].map((_, c) => [...Array(9)].map((_, r) => r * 9 + c));
  const BOXES = [...Array(9)].map((_, b) => {
    const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
    const cells = [];
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++) cells.push((br + dr) * 9 + (bc + dc));
    return cells;
  });
  const ALL_UNITS = [...ROWS, ...COLS, ...BOXES];

  const UNITS = [];
  for (let r = 0; r < 9; r++) UNITS.push({ cells: ROWS[r], name: 'row ' + (r + 1) });
  for (let c = 0; c < 9; c++) UNITS.push({ cells: COLS[c], name: 'column ' + (c + 1) });
  for (let b = 0; b < 9; b++) UNITS.push({ cells: BOXES[b], name: 'box ' + (b + 1) });

  function boxOf(i) {
    return Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);
  }

  /* ---------- helpers ---------- */

  function cellName(i) {
    return 'R' + (Math.floor(i / 9) + 1) + 'C' + ((i % 9) + 1);
  }

  function nameList(list) {
    return list.map(cellName).join(', ');
  }

  /* Plain-language cell reference ("row 4, column 7") — matches the Indexes
     toggle labels so players can find cells without R/C jargon. */
  function friendlyCell(i) {
    return 'row ' + (Math.floor(i / 9) + 1) + ', column ' + ((i % 9) + 1);
  }

  function friendlyList(list) {
    return list.map(friendlyCell).join(', ');
  }

  function combos(arr, k) {
    const res = [];
    const n = arr.length;
    if (k < 1 || k > n) return res;
    const idx = [];
    (function rec(start) {
      if (idx.length === k) { res.push(idx.map((x) => arr[x])); return; }
      for (let i = start; i <= n - (k - idx.length); i++) {
        idx.push(i);
        rec(i + 1);
        idx.pop();
      }
    })(0);
    return res;
  }

  function commonPeers(x, y) {
    const s = new Set(Sudoku.PEERS[x]);
    return Sudoku.PEERS[y].filter((i) => s.has(i));
  }

  /* ---------- candidate derivation ---------- */

  /* Derived pencil marks: for each empty cell, digits 1-9 not present in its
     row, column, or box. Reads the board value as entries[i] || puzzle[i]. */
  function deriveCandidates(puzzle, entries) {
    const cands = [];
    const value = (i) => entries[i] || puzzle[i];
    for (let i = 0; i < 81; i++) {
      if (value(i)) { cands.push([]); continue; }
      const present = new Set();
      for (const p of Sudoku.PEERS[i]) {
        const v = value(p);
        if (v) present.add(v);
      }
      const list = [];
      for (let d = 1; d <= 9; d++) if (!present.has(d)) list.push(d);
      cands.push(list);
    }
    return cands;
  }

  /* ---------- detectors (each returns an array of hints) ---------- */

  function nakedSingles(cands) {
    const hints = [];
    for (let i = 0; i < 81; i++) {
      if (cands[i].length === 1) {
        const v = cands[i][0];
        hints.push({
          technique: 'Naked Single', cells: [i], digit: v, eliminations: [],
          keyCells: [i],
          text: 'Naked Single: ' + cellName(i) + ' must be ' + v + '.',
        });
      }
    }
    return hints;
  }

  function hiddenSingles(cands) {
    const hints = [];
    for (const { cells, name } of UNITS) {
      for (let d = 1; d <= 9; d++) {
        const spots = cells.filter((i) => cands[i].includes(d));
        if (spots.length === 1) {
          const i = spots[0];
          if (cands[i].length === 1) continue;
          hints.push({
            technique: 'Hidden Single', cells: [i], digit: d, eliminations: [],
            unit: name, keyCells: [i],
            text: 'Hidden Single: ' + cellName(i) + ' must be ' + d + ' (only place in ' + name + ').',
          });
        }
      }
    }
    return hints;
  }

  /* Locked candidates: pointing (a digit confined to one line within a box
     removes itself from the rest of that line) and claiming (the reverse). */
  function lockedCandidates(cands) {
    const hints = [];
    for (const box of BOXES) {
      for (let d = 1; d <= 9; d++) {
        const cells = box.filter((i) => cands[i].includes(d));
        if (cells.length < 2) continue;
        const rows = new Set(cells.map((i) => Math.floor(i / 9)));
        if (rows.size === 1) {
          const r = [...rows][0];
          const elims = [];
          for (let c = 0; c < 9; c++) {
            const i = r * 9 + c;
            if (box.includes(i)) continue;
            if (cands[i].includes(d)) elims.push(i);
          }
          if (elims.length) {
            hints.push({
              technique: 'Locked Candidates (Pointing)', cells, digit: d, eliminations: elims,
              unit: 'row ' + (r + 1), box: boxOf(cells[0]) + 1,
              text: 'Pointing: ' + d + ' confined to row ' + (r + 1) + ' in box ' + (boxOf(cells[0]) + 1) +
                ' \u2014 removes ' + d + ' from ' + nameList(elims) + '.',
            });
          }
        }
        const cols = new Set(cells.map((i) => i % 9));
        if (cols.size === 1) {
          const c = [...cols][0];
          const elims = [];
          for (let r = 0; r < 9; r++) {
            const i = r * 9 + c;
            if (box.includes(i)) continue;
            if (cands[i].includes(d)) elims.push(i);
          }
          if (elims.length) {
            hints.push({
              technique: 'Locked Candidates (Pointing)', cells, digit: d, eliminations: elims,
              unit: 'column ' + (c + 1), box: boxOf(cells[0]) + 1,
              text: 'Pointing: ' + d + ' confined to column ' + (c + 1) + ' in box ' + (boxOf(cells[0]) + 1) +
                ' \u2014 removes ' + d + ' from ' + nameList(elims) + '.',
            });
          }
        }
      }
    }
    for (const unit of [...ROWS, ...COLS]) {
      const isRow = Math.floor(unit[0] / 9) === Math.floor(unit[8] / 9);
      for (let d = 1; d <= 9; d++) {
        const cells = unit.filter((i) => cands[i].includes(d));
        if (cells.length < 2) continue;
        const boxes = new Set(cells.map(boxOf));
        if (boxes.size !== 1) continue;
        const b = [...boxes][0];
        const elims = [];
        for (const i of BOXES[b]) {
          if (unit.includes(i)) continue;
          if (cands[i].includes(d)) elims.push(i);
        }
        if (elims.length) {
          hints.push({
            technique: 'Locked Candidates (Claiming)', cells, digit: d, eliminations: elims,
            unit: 'box ' + (b + 1),
            lineUnit: (isRow ? 'row ' : 'column ') + ((isRow ? Math.floor(unit[0] / 9) : unit[0] % 9) + 1),
            text: 'Claiming: ' + d + ' confined to box ' + (b + 1) + ' in ' + (isRow ? 'row ' : 'column ') +
              ((isRow ? Math.floor(unit[0] / 9) : unit[0] % 9) + 1) + ' \u2014 removes ' + d + ' from ' + nameList(elims) + '.',
          });
        }
      }
    }
    return hints;
  }

  function nakedSubsets(cands, size, label) {
    const hints = [];
    for (const { cells, name } of UNITS) {
      for (const combo of combos(cells, size)) {
        if (combo.some((i) => cands[i].length === 0)) continue;
        if (combo.some((i) => cands[i].length > size)) continue;
        const union = new Set();
        for (const i of combo) for (const d of cands[i]) union.add(d);
        if (union.size !== size) continue;
        const elims = [];
        for (const j of cells) {
          if (combo.includes(j)) continue;
          if (cands[j].some((d) => union.has(d))) elims.push(j);
        }
        if (elims.length) {
          hints.push({
            technique: 'Naked ' + label, cells: combo, digit: [...union][0], eliminations: elims,
            unit: name, digits: [...union],
            text: 'Naked ' + label + ' in ' + name + ': ' + nameList(combo) + ' limited to {' +
              [...union].join(',') + '} \u2014 removes those from ' + nameList(elims) + '.',
          });
        }
      }
    }
    return hints;
  }

  function hiddenSubsets(cands, size, label) {
    const hints = [];
    for (const { cells, name } of UNITS) {
      for (const digitCombo of combos([1, 2, 3, 4, 5, 6, 7, 8, 9], size)) {
        const spots = new Set();
        for (const d of digitCombo) for (const i of cells) if (cands[i].includes(d)) spots.add(i);
        if (spots.size !== size) continue;
        const spotArr = [...spots];
        if (spotArr.some((i) => cands[i].length <= size)) continue;
        const elims = [];
        for (const i of spotArr) {
          if (cands[i].some((d) => !digitCombo.includes(d))) elims.push(i);
        }
        if (elims.length) {
          hints.push({
            technique: 'Hidden ' + label, cells: spotArr, digit: digitCombo[0], eliminations: elims,
            unit: name, digits: [...digitCombo],
            text: 'Hidden ' + label + ' in ' + name + ': digits {' + digitCombo.join(',') + '} only in ' +
              nameList(spotArr) + ' \u2014 removes other candidates from those cells.',
          });
        }
      }
    }
    return hints;
  }

  /* Basic fish: size 2 = X-Wing, size 3 = Swordfish. For each digit, find N
     lines whose occurrences of the digit all sit within exactly N cross-lines;
     the digit is then eliminated from those cross-lines' other lines. */
  function fish(cands, size, label) {
    const hints = [];
    for (let d = 1; d <= 9; d++) {
      for (const line of ['row', 'col']) {
        const occ = [];
        for (let li = 0; li < 9; li++) {
          const cross = [];
          for (let ci = 0; ci < 9; ci++) {
            const i = line === 'row' ? li * 9 + ci : ci * 9 + li;
            if (cands[i].includes(d)) cross.push(ci);
          }
          occ.push(cross);
        }
        const lines = occ
          .map((cross, li) => ({ li, cross }))
          .filter((o) => o.cross.length >= 2 && o.cross.length <= size);
        for (const combo of combos(lines, size)) {
          const union = [...new Set(combo.flatMap((o) => o.cross))];
          if (union.length !== size) continue;
          const elims = [];
          for (const ci of union) {
            for (let li = 0; li < 9; li++) {
              if (combo.some((o) => o.li === li)) continue;
              const i = line === 'row' ? li * 9 + ci : ci * 9 + li;
              if (cands[i].includes(d)) elims.push(i);
            }
          }
          if (elims.length) {
            const cells = combo.flatMap((o) =>
              o.cross.map((ci) => (line === 'row' ? o.li * 9 + ci : ci * 9 + o.li)));
            const lineWord = line === 'row' ? 'rows' : 'columns';
            const crossWord = line === 'row' ? 'columns' : 'rows';
            hints.push({
              technique: label, cells, digit: d, eliminations: elims,
              lines: combo.map((o) => o.li + 1),
              crossLines: union.map((c) => c + 1),
              lineWord: line === 'row' ? 'row' : 'column',
              crossWord: line === 'row' ? 'column' : 'row',
              text: label + ' on ' + d + ': ' + lineWord + ' ' +
                combo.map((o) => o.li + 1).join(',') + ' / ' + crossWord + ' ' +
                union.map((c) => c + 1).join(',') + ' \u2014 removes ' + d + ' from ' + nameList(elims) + '.',
            });
          }
        }
      }
    }
    return hints;
  }

  /* Finned X-Wing: an X-Wing base where one base line has exactly one extra
     "fin" cell in a box that also holds one of the base cells; the digit is
     removed from the other cells of that box in the aligned base column. */
  function finnedXWing(cands) {
    const hints = [];
    for (let d = 1; d <= 9; d++) {
      for (const line of ['row', 'col']) {
        const occ = [];
        for (let li = 0; li < 9; li++) {
          const cross = [];
          for (let ci = 0; ci < 9; ci++) {
            const i = line === 'row' ? li * 9 + ci : ci * 9 + li;
            if (cands[i].includes(d)) cross.push(ci);
          }
          occ.push(cross);
        }
        for (let lClean = 0; lClean < 9; lClean++) {
          if (occ[lClean].length !== 2) continue;
          const [ca, cb] = occ[lClean];
          for (let lFin = 0; lFin < 9; lFin++) {
            if (lFin === lClean) continue;
            if (occ[lFin].length !== 3) continue;
            if (!occ[lFin].includes(ca) || !occ[lFin].includes(cb)) continue;
            const cf = occ[lFin].find((c) => c !== ca && c !== cb);
            const finCell = line === 'row' ? lFin * 9 + cf : cf * 9 + lFin;
            const b = boxOf(finCell);
            const baseA = line === 'row' ? lFin * 9 + ca : ca * 9 + lFin;
            const baseB = line === 'row' ? lFin * 9 + cb : cb * 9 + lFin;
            const baseInBox = boxOf(baseA) === b ? ca : (boxOf(baseB) === b ? cb : -1);
            if (baseInBox === -1) continue;
            const baseCells = [
              line === 'row' ? lFin * 9 + ca : ca * 9 + lFin,
              line === 'row' ? lFin * 9 + cb : cb * 9 + lFin,
              line === 'row' ? lClean * 9 + ca : ca * 9 + lClean,
              line === 'row' ? lClean * 9 + cb : cb * 9 + lClean,
            ];
            const elims = [];
            const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
            for (let dr = 0; dr < 3; dr++) {
              for (let dc = 0; dc < 3; dc++) {
                const i = (br + dr) * 9 + (bc + dc);
                const aligned = line === 'row' ? i % 9 === baseInBox : Math.floor(i / 9) === baseInBox;
                if (!aligned) continue;
                if (baseCells.includes(i) || i === finCell) continue;
                if (cands[i].includes(d)) elims.push(i);
              }
            }
            if (elims.length) {
              hints.push({
                technique: 'Finned X-Wing', cells: [...baseCells, finCell], digit: d, eliminations: elims,
                baseCells, finCell,
                text: 'Finned X-Wing on ' + d + ': base at ' + nameList(baseCells) +
                  ' with fin ' + cellName(finCell) + ' \u2014 removes ' + d + ' from ' + nameList(elims) + '.',
              });
            }
          }
        }
      }
    }
    return hints;
  }

  function xyWing(cands) {
    const hints = [];
    for (let p = 0; p < 81; p++) {
      const pc = cands[p];
      if (pc.length !== 2) continue;
      const [a, b] = pc;
      const wing1 = [], wing2 = [];
      for (const w of Sudoku.PEERS[p]) {
        const wc = cands[w];
        if (wc.length !== 2) continue;
        if (wc.includes(a) && !wc.includes(b)) wing1.push(w);
        if (wc.includes(b) && !wc.includes(a)) wing2.push(w);
      }
      for (const w1 of wing1) {
        const z = cands[w1].find((d) => d !== a);
        for (const w2 of wing2) {
          if (cands[w2].find((d) => d !== b) !== z) continue;
          const elims = [];
          for (const x of commonPeers(w1, w2)) {
            if (cands[x].includes(z)) elims.push(x);
          }
          if (elims.length) {
            hints.push({
              technique: 'XY-Wing', cells: [p, w1, w2], digit: z, eliminations: elims,
              pivot: p, wings: [w1, w2],
              text: 'XY-Wing: pivot ' + cellName(p) + ' {' + a + ',' + b + '}, wings ' +
                cellName(w1) + ' & ' + cellName(w2) + ' \u2014 removes ' + z + ' from ' + nameList(elims) + '.',
            });
          }
        }
      }
    }
    return hints;
  }

  function xyzWing(cands) {
    const hints = [];
    for (let p = 0; p < 81; p++) {
      const pc = cands[p];
      if (pc.length !== 3) continue;
      for (const z of pc) {
        const [a, b] = pc.filter((d) => d !== z);
        for (const w1 of Sudoku.PEERS[p]) {
          const w1c = cands[w1];
          if (w1c.length !== 2) continue;
          if (!w1c.includes(a) || !w1c.includes(z)) continue;
          for (const w2 of Sudoku.PEERS[p]) {
            if (w2 === w1) continue;
            const w2c = cands[w2];
            if (w2c.length !== 2) continue;
            if (!w2c.includes(b) || !w2c.includes(z)) continue;
            const both = new Set(commonPeers(w1, w2));
            const elims = [];
            for (const x of Sudoku.PEERS[p]) {
              if (!both.has(x)) continue;
              if (cands[x].includes(z)) elims.push(x);
            }
            if (elims.length) {
              hints.push({
                technique: 'XYZ-Wing', cells: [p, w1, w2], digit: z, eliminations: elims,
                pivot: p, wings: [w1, w2],
                text: 'XYZ-Wing: pivot ' + cellName(p) + ' {' + pc.join(',') + '}, wings ' +
                  cellName(w1) + ' & ' + cellName(w2) + ' \u2014 removes ' + z + ' from ' + nameList(elims) + '.',
              });
            }
          }
        }
      }
    }
    return hints;
  }

  /* W-Wing: two cells with the same bivalue {x,y} joined by a strong link on y
     (a unit where y appears in exactly those two cells) eliminate x from any
     cell seeing both. */
  function wWing(cands) {
    const hints = [];
    const bivalues = [];
    for (let i = 0; i < 81; i++) if (cands[i].length === 2) bivalues.push(i);
    for (let i = 0; i < bivalues.length; i++) {
      for (let j = i + 1; j < bivalues.length; j++) {
        const a = bivalues[i], b = bivalues[j];
        const ca = cands[a], cb = cands[b];
        if (ca[0] !== cb[0] || ca[1] !== cb[1]) continue;
        const [x, y] = ca;
        if (!strongLink(cands, a, b, y)) continue;
        const elims = [];
        for (const t of commonPeers(a, b)) if (cands[t].includes(x)) elims.push(t);
        if (elims.length) {
          hints.push({
            technique: 'W-Wing', cells: [a, b], digit: x, eliminations: elims,
            pair: ca, linkDigit: y,
            text: 'W-Wing on {' + x + ',' + y + '}: ' + cellName(a) + ' & ' + cellName(b) +
              ' linked on ' + y + ' \u2014 removes ' + x + ' from ' + nameList(elims) + '.',
          });
        }
      }
    }
    return hints;
  }

  function strongLink(cands, a, b, y) {
    for (const unit of ALL_UNITS) {
      if (!unit.includes(a) || !unit.includes(b)) continue;
      const spots = unit.filter((i) => cands[i].includes(y));
      if (spots.length === 2 && spots.includes(a) && spots.includes(b)) return true;
    }
    return false;
  }

  /* Skyscraper: two lines each hold the digit in exactly two cross-lines,
     sharing one (the base); the digit is removed from the top columns' cells
     that see the opposite top. */
  function skyscraper(cands) {
    const hints = [];
    for (let d = 1; d <= 9; d++) {
      for (const line of ['row', 'col']) {
        const occ = [];
        for (let li = 0; li < 9; li++) {
          const cross = [];
          for (let ci = 0; ci < 9; ci++) {
            const i = line === 'row' ? li * 9 + ci : ci * 9 + li;
            if (cands[i].includes(d)) cross.push(ci);
          }
          occ.push(cross);
        }
        for (let l1 = 0; l1 < 9; l1++) {
          if (occ[l1].length !== 2) continue;
          for (let l2 = l1 + 1; l2 < 9; l2++) {
            if (occ[l2].length !== 2) continue;
            const [base, topA] = occ[l1];
            const [base2, topB] = occ[l2];
            if (base !== base2) continue;
            if (topA === topB) continue;
            const top1 = line === 'row' ? l1 * 9 + topA : topA * 9 + l1;
            const top2 = line === 'row' ? l2 * 9 + topB : topB * 9 + l2;
            const base1 = line === 'row' ? l1 * 9 + base : base * 9 + l1;
            const base2c = line === 'row' ? l2 * 9 + base : base * 9 + l2;
            const elims = [];
            for (let r = 0; r < 9; r++) {
              if (r === l1) continue;
              const i = line === 'row' ? r * 9 + topA : topA * 9 + r;
              if (i === top2) continue;
              if (!Sudoku.PEERS[top2].includes(i)) continue;
              if (cands[i].includes(d)) elims.push(i);
            }
            for (let r = 0; r < 9; r++) {
              if (r === l2) continue;
              const i = line === 'row' ? r * 9 + topB : topB * 9 + r;
              if (i === top1) continue;
              if (!Sudoku.PEERS[top1].includes(i)) continue;
              if (cands[i].includes(d)) elims.push(i);
            }
            if (elims.length) {
              hints.push({
                technique: 'Skyscraper', cells: [base1, base2c, top1, top2], digit: d, eliminations: elims,
                tops: [top1, top2],
                text: 'Skyscraper on ' + d + ': ' + cellName(top1) + ' & ' + cellName(top2) +
                  ' over base ' + (line === 'row' ? 'column ' : 'row ') + (base + 1) +
                  ' \u2014 removes ' + d + ' from ' + nameList(elims) + '.',
              });
            }
          }
        }
      }
    }
    return hints;
  }

  /* Two-String Kite: a box holds the digit on a diagonal pair; one string runs
     along the row of one cell and the other along the column of the other; the
     digit is removed from the crossing cell that sees both far ends. */
  function twoStringKite(cands) {
    const hints = [];
    for (let d = 1; d <= 9; d++) {
      for (const box of BOXES) {
        const inBox = box.filter((i) => cands[i].includes(d));
        if (inBox.length !== 2) continue;
        for (let i = 0; i < inBox.length; i++) {
          for (let j = i + 1; j < inBox.length; j++) {
            const A = inBox[i], B = inBox[j];
            const rA = Math.floor(A / 9), cA = A % 9;
            const rB = Math.floor(B / 9), cB = B % 9;
            if (rA === rB || cA === cB) continue;
            for (let cC = 0; cC < 9; cC++) {
              if (cC === cA) continue;
              const C = rA * 9 + cC;
              if (!cands[C].includes(d)) continue;
              if (box.includes(C)) continue;
              for (let rD = 0; rD < 9; rD++) {
                if (rD === rB) continue;
                const D = rD * 9 + cB;
                if (!cands[D].includes(d)) continue;
                if (box.includes(D)) continue;
                const target = rD * 9 + cC;
                if (target === C || target === D) continue;
                if (!cands[target].includes(d)) continue;
                hints.push({
                  technique: 'Two-String Kite', cells: [A, B, C, D], digit: d, eliminations: [target],
                  target,
                  text: 'Two-String Kite on ' + d + ': box ' + (boxOf(A) + 1) + ' diagonal ' +
                    cellName(A) + '/' + cellName(B) + ', strings ' + cellName(C) + ' & ' + cellName(D) +
                    ' \u2014 removes ' + d + ' from ' + cellName(target) + '.',
                });
              }
            }
          }
        }
      }
    }
    return hints;
  }

  /* Unique Rectangle (Type 1): four corners across two rows/columns and two
     boxes all share a pair {a,b}; three are bivalue {a,b}, so the fourth must
     take a non-{a,b} digit to avoid the deadly pattern. */
  function uniqueRectangle(cands) {
    const hints = [];
    for (let r1 = 0; r1 < 9; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        for (let c1 = 0; c1 < 9; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
            const boxes = cells.map(boxOf);
            if (new Set(boxes).size !== 2) continue;
            const sets = cells.map((i) => cands[i]);
            if (sets.some((s) => s.length === 0)) continue;
            const common = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) =>
              sets.every((s) => s.includes(d)));
            if (common.length !== 2) continue;
            const [a, b] = common;
            const pairCount = sets.filter((s) => s.length === 2).length;
            if (pairCount !== 3) continue;
            const extraIdx = sets.findIndex((s) => s.length !== 2);
            const e = cells[extraIdx];
            hints.push({
              technique: 'Unique Rectangle (Type 1)', cells, digit: a, eliminations: [e],
              extraCell: e, pair: [a, b],
              text: 'Unique Rectangle on {' + a + ',' + b + '}: ' + nameList(cells) +
                ' \u2014 removes ' + a + '/' + b + ' from ' + cellName(e) + '.',
            });
          }
        }
      }
    }
    return hints;
  }

  /* ---------- pipeline ---------- */

  const DETECTORS = [
    (c) => nakedSingles(c),
    (c) => hiddenSingles(c),
    (c) => lockedCandidates(c),
    (c) => nakedSubsets(c, 2, 'Pair'),
    (c) => hiddenSubsets(c, 2, 'Pair'),
    (c) => nakedSubsets(c, 3, 'Triple'),
    (c) => hiddenSubsets(c, 3, 'Triple'),
    (c) => fish(c, 2, 'X-Wing'),
    (c) => fish(c, 3, 'Swordfish'),
    (c) => finnedXWing(c),
    (c) => xyWing(c),
    (c) => xyzWing(c),
    (c) => wWing(c),
    (c) => skyscraper(c),
    (c) => twoStringKite(c),
    (c) => uniqueRectangle(c),
  ];

  /* All detected patterns, deduplicated, in difficulty order. */
  function allHints(cands) {
    const seen = new Set();
    const out = [];
    for (const detect of DETECTORS) {
      for (const hint of detect(cands)) {
        const key = hint.technique + '|' + hint.cells.join(',') + '|' + hint.eliminations.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(hint);
      }
    }
    return out;
  }

  /* Hints where the tapped cell is part of the pattern or is an elimination
     target — the "what can this cell do?" view used for tap-to-inspect. */
  function findHintsForCell(cands, i) {
    return allHints(cands).filter((h) => h.cells.includes(i) || h.eliminations.includes(i));
  }

  /* The easiest overall logical step, or null. */
  function findHint(cands) {
    for (const detect of DETECTORS) {
      const hints = detect(cands);
      if (hints.length) return hints[0];
    }
    return null;
  }

  /* ---------- friendly explanation ---------- */

  /* Plain-English glossary blurb per technique (progressive disclosure). */
  const TECHNIQUE_INFO = {
    'Naked Single': {
      name: 'Naked Single',
      blurb: 'This cell has only one possible digit left — the one shown.',
    },
    'Hidden Single': {
      name: 'Hidden Single',
      blurb: 'In a row, column, or box, this digit has only one place left to go.',
    },
    'Locked Candidates (Pointing)': {
      name: 'Pointing',
      blurb: 'Inside a box, a digit is limited to a single row or column, so it can be removed from the rest of that row or column.',
    },
    'Locked Candidates (Claiming)': {
      name: 'Claiming',
      blurb: 'Within a row or column, a digit is limited to a single box, so it can be removed from the rest of that box.',
    },
    'Naked Pair': {
      name: 'Naked Pair',
      blurb: 'Two cells in a unit share exactly the same two candidates; those digits can be removed from the rest of the unit.',
    },
    'Naked Triple': {
      name: 'Naked Triple',
      blurb: 'Three cells in a unit are limited to exactly three digits; those digits can be removed from the rest of the unit.',
    },
    'Hidden Pair': {
      name: 'Hidden Pair',
      blurb: 'Two digits in a unit appear only in the same two cells; other candidates can be removed from those cells.',
    },
    'Hidden Triple': {
      name: 'Hidden Triple',
      blurb: 'Three digits in a unit appear only in the same three cells; other candidates can be removed from those cells.',
    },
    'X-Wing': {
      name: 'X-Wing',
      blurb: 'A digit appears in two rows at exactly the same two columns (or the reverse), forming a rectangle — it is removed from the other cells in those columns (or rows).',
    },
    'Swordfish': {
      name: 'Swordfish',
      blurb: 'Like an X-Wing, but across three rows and three columns instead of two.',
    },
    'Finned X-Wing': {
      name: 'Finned X-Wing',
      blurb: 'An almost-X-Wing with one extra cell (the fin); the digit is removed from the aligned cells of the fin\u2019s box.',
    },
    'XY-Wing': {
      name: 'XY-Wing',
      blurb: 'A pivot cell sees two wings; the digit the wings share can be removed from any cell that sees both wings.',
    },
    'XYZ-Wing': {
      name: 'XYZ-Wing',
      blurb: 'A three-candidate pivot sees two bivalue wings; the pivot\u2019s extra digit can be removed from cells that see all three.',
    },
    'W-Wing': {
      name: 'W-Wing',
      blurb: 'Two cells share the same pair and are the only places for one of its digits in their unit; the other digit is removed from cells that see both.',
    },
    'Skyscraper': {
      name: 'Skyscraper',
      blurb: 'Two lines each hold a digit in exactly two cells; the digit is removed from cells that see both far ends.',
    },
    'Two-String Kite': {
      name: 'Two-String Kite',
      blurb: 'A box\u2019s diagonal pair plus two connecting strings form a kite; the digit is removed where the strings cross.',
    },
    'Unique Rectangle (Type 1)': {
      name: 'Unique Rectangle',
      blurb: 'Four rectangle corners share the same two digits; to avoid an unsolvable pattern, one corner must lose those digits.',
    },
  };

  /* Friendly, instance-specific explanation for a hint: { name, steps, blurb }. */
  function hintInfo(hint) {
    const meta = TECHNIQUE_INFO[hint.technique] || { name: hint.technique, blurb: '' };
    const d = hint.digit;
    let steps;
    switch (hint.technique) {
      case 'Naked Single':
        steps = ['This cell can only hold ' + d + '.'];
        break;
      case 'Hidden Single':
        steps = ['In ' + hint.unit + ', the digit ' + d + ' can only go in this cell.'];
        break;
      case 'Locked Candidates (Pointing)':
        steps = [
          'Inside box ' + hint.box + ', the digit ' + d + ' can only be in ' + hint.unit + '.',
          'So ' + d + ' is removed from the other cells in ' + hint.unit + '.',
        ];
        break;
      case 'Locked Candidates (Claiming)':
        steps = [
          'In ' + hint.lineUnit + ', the digit ' + d + ' only appears inside ' + hint.unit + '.',
          'So ' + d + ' is removed from the other cells in ' + hint.unit + '.',
        ];
        break;
      case 'Naked Pair':
      case 'Naked Triple':
        steps = [
          'These cells in ' + hint.unit + ' can only contain {' + hint.digits.join(', ') + '}.',
          'So those digits are removed from the other cells in ' + hint.unit + '.',
        ];
        break;
      case 'Hidden Pair':
      case 'Hidden Triple':
        steps = [
          'In ' + hint.unit + ', the digits {' + hint.digits.join(', ') + '} can only go in these cells.',
          'So the other candidates are removed from those cells.',
        ];
        break;
      case 'X-Wing':
      case 'Swordfish':
        steps = [
          'The digit ' + d + ' appears only in ' + hint.lineWord + 's ' + hint.lines.join(' and ') +
            ', and only in ' + hint.crossWord + 's ' + hint.crossLines.join(' and ') + '.',
          'So ' + d + ' is removed from the other cells in those ' + hint.crossWord + 's.',
        ];
        break;
      case 'Finned X-Wing':
        steps = [
          'There is almost an X-Wing on ' + d + ', with one extra cell (the fin) at ' + friendlyCell(hint.finCell) + '.',
          'So ' + d + ' is removed from the other cells in that box along the fin\u2019s line.',
        ];
        break;
      case 'XY-Wing':
        steps = [
          'The pivot at ' + friendlyCell(hint.pivot) + ' can be two digits.',
          'Both wings (' + friendlyList(hint.wings) + ') contain ' + d + '.',
          'So ' + d + ' is removed from any cell that sees both wings.',
        ];
        break;
      case 'XYZ-Wing':
        steps = [
          'The pivot at ' + friendlyCell(hint.pivot) + ' can be three digits.',
          'Both wings (' + friendlyList(hint.wings) + ') contain ' + d + '.',
          'So ' + d + ' is removed from cells that see both wings.',
        ];
        break;
      case 'W-Wing':
        steps = [
          'These two cells can only be {' + hint.pair.join(', ') + '}.',
          'They are the only cells holding ' + hint.linkDigit + ' in their shared unit.',
          'So ' + d + ' is removed from cells that see both.',
        ];
        break;
      case 'Skyscraper':
        steps = [
          'The digit ' + d + ' has exactly two places in each of these lines.',
          'The far ends (' + friendlyList(hint.tops) + ') rule each other out, so ' + d + ' is removed from cells that see both.',
        ];
        break;
      case 'Two-String Kite':
        steps = [
          'In this box, ' + d + ' sits on a diagonal.',
          'Strings extend from the diagonal through the row and column.',
          'So ' + d + ' is removed from ' + friendlyCell(hint.target) + ', where the strings meet.',
        ];
        break;
      case 'Unique Rectangle (Type 1)':
        steps = [
          'These four corners form a rectangle on {' + hint.pair.join(', ') + '}.',
          'If all four kept those digits the puzzle would be ambiguous.',
          'So ' + hint.pair.join(' or ') + ' is removed from ' + friendlyCell(hint.extraCell) + '.',
        ];
        break;
      default:
        steps = [];
    }
    return { name: meta.name, steps, blurb: meta.blurb };
  }

  return {
    deriveCandidates,
    findHintsForCell,
    findHint,
    allHints,
    hintInfo,
  };
})();
