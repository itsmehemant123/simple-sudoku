/* localStorage persistence: games, stats, settings, last game key. */
const Storage = (function () {
  const GAMES_KEY = 'sudoku.games';
  const STATS_KEY = 'sudoku.stats';
  const SETTINGS_KEY = 'sudoku.settings';
  const LAST_KEY = 'sudoku.lastGameKey';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full / private mode */ }
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function defaultStats() {
    return {
      totalGames: 0,
      wins: 0,
      abandoned: 0,
      totalPlayMs: 0,
      winStreak: 0,
      bestWinStreak: 0,
      bestTimes: { easy: null, medium: null, hard: null },
      winsByDifficulty: { easy: 0, medium: 0, hard: 0 },
      completedGames: [], // { key, difficulty, playMs, completedAt, won }
    };
  }

  function defaultSettings() {
    return { theme: 'light', conflictHighlight: true, autoCheck: false, zoom: 1 };
  }

  const api = {
    /* ---- games ---- */
    games() { return read(GAMES_KEY, {}); },
    getGame(key) { return api.games()[key] || null; },
    saveGame(game) {
      game.updatedAt = Date.now();
      const all = api.games();
      all[game.key] = game;
      write(GAMES_KEY, all);
    },
    deleteGame(key) {
      const all = api.games();
      delete all[key];
      write(GAMES_KEY, all);
    },

    /* ---- last game ---- */
    lastGameKey() { return read(LAST_KEY, null); },
    setLastGameKey(key) { write(LAST_KEY, key); },

    /* ---- stats ---- */
    stats() { return Object.assign(defaultStats(), read(STATS_KEY, {})); },
    saveStats(s) { write(STATS_KEY, s); },

    recordNewGame(game) {
      const s = api.stats();
      s.totalGames++;
      api.saveStats(s);
    },

    recordWin(game) {
      const s = api.stats();
      s.wins++;
      s.winsByDifficulty[game.difficulty] = (s.winsByDifficulty[game.difficulty] || 0) + 1;
      s.totalPlayMs += game.playMs;
      s.winStreak++;
      s.bestWinStreak = Math.max(s.bestWinStreak, s.winStreak);
      const bt = s.bestTimes[game.difficulty];
      if (bt === null || game.playMs < bt) s.bestTimes[game.difficulty] = game.playMs;
      s.completedGames.unshift({
        key: game.key, difficulty: game.difficulty,
        playMs: game.playMs, completedAt: game.completedAt || Date.now(), won: true,
      });
      if (s.completedGames.length > 50) s.completedGames.length = 50;
      api.saveStats(s);
    },

    recordAbandon(game) {
      const s = api.stats();
      s.abandoned++;
      s.winStreak = 0;
      s.totalPlayMs += game.playMs;
      s.completedGames.unshift({
        key: game.key, difficulty: game.difficulty,
        playMs: game.playMs, completedAt: game.completedAt || Date.now(), won: false,
      });
      if (s.completedGames.length > 50) s.completedGames.length = 50;
      api.saveStats(s);
    },

    /* ---- settings ---- */
    settings() { return Object.assign(defaultSettings(), read(SETTINGS_KEY, {})); },
    saveSettings(s) { write(SETTINGS_KEY, s); },

    /* ---- shared formatters ---- */
    formatMs(ms) {
      const total = Math.floor((ms || 0) / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const mm = String(m).padStart(2, '0');
      const ss = String(s).padStart(2, '0');
      return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    },

    dateStr(ts) {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    cap(s) {
      return s ? s[0].toUpperCase() + s.slice(1) : '';
    },
  };

  return api;
})();
