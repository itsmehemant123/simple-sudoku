/* Home view, settings, themes, and view routing. */
const App = (function () {
  const homeView = document.getElementById('home-view');
  const gameView = document.getElementById('game-view');
  const ZOOM_STEPS = [1, 1.1, 1.2, 1.3, 1.4, 1.5];

  function init() {
    const s = Storage.settings();
    applyTheme(s.theme);
    applyZoom(s.zoom);
    bindViewport();
    bindControls();
    renderHome();
    showView('home');
    /* Defer so Game can call App.showView after App is fully initialized. */
    setTimeout(handleShareHash, 0);
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
    }
  }

  /* ---------- views ---------- */

  function showView(v) {
    const home = v === 'home';
    homeView.classList.toggle('hidden', !home);
    gameView.classList.toggle('hidden', home);
  }

  function showHome() {
    renderHome();
    showView('home');
  }

  /* ---------- theme ---------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const isDark = theme === 'dark';
    const colorMeta = document.getElementById('theme-color-meta');
    if (colorMeta) colorMeta.content = isDark ? '#0a0f1e' : '#eef1f8';
    const barMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (barMeta) barMeta.content = isDark ? 'black-translucent' : 'default';
  }

  function toggleTheme() {
    const s = Storage.settings();
    s.theme = s.theme === 'light' ? 'dark' : 'light';
    Storage.saveSettings(s);
    applyTheme(s.theme);
  }

  /* ---------- zoom ---------- */

  function zoomIndex(z) {
    let best = 0;
    let bestDist = Infinity;
    ZOOM_STEPS.forEach((step, i) => {
      const d = Math.abs(z - step);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function applyZoom(z) {
    const i = zoomIndex(z);
    const value = ZOOM_STEPS[i];
    document.documentElement.style.setProperty('--zoom', String(value));
    const label = Math.round(value * 100) + '%';
    document.getElementById('zoom-label').textContent = label;
    document.getElementById('zoom-label-game').textContent = label;
    document.getElementById('zoom-out').disabled = i === 0;
    document.getElementById('zoom-in').disabled = i === ZOOM_STEPS.length - 1;
    document.getElementById('zoom-out-game').disabled = i === 0;
    document.getElementById('zoom-in-game').disabled = i === ZOOM_STEPS.length - 1;
  }

  function setZoom(z) {
    const s = Storage.settings();
    s.zoom = z;
    Storage.saveSettings(s);
    applyZoom(z);
  }

  function shiftZoom(delta) {
    const s = Storage.settings();
    setZoom(ZOOM_STEPS[zoomIndex(s.zoom) + delta]);
  }

  /* ---------- compact / visual viewport ---------- */

  /* Track the *visual* viewport (what is actually on screen) so phones,
     iPad-browser pinch-zoom, and zoomed desktop windows all get the compact
     one-screen layout. Media queries alone can't do this: vw/vh and @media
     follow the layout viewport, which is unchanged by pinch-zoom. */
  function updateCompact() {
    const vv = window.visualViewport;
    const w = vv ? vv.width : window.innerWidth;
    const h = vv ? vv.height : window.innerHeight;
    const ox = vv ? (vv.offsetLeft || 0) : 0;
    const oy = vv ? (vv.offsetTop || 0) : 0;
    document.documentElement.style.setProperty('--vvw', w + 'px');
    document.documentElement.style.setProperty('--vvh', h + 'px');
    document.documentElement.style.setProperty('--vvo-x', ox + 'px');
    document.documentElement.style.setProperty('--vvo-y', oy + 'px');
    const compact = Math.min(w, h) <= 640;
    document.documentElement.classList.toggle('compact', compact);
    document.documentElement.classList.toggle('compact-landscape', compact && w > h);
  }

  function bindViewport() {
    updateCompact();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateCompact);
      vv.addEventListener('scroll', updateCompact);
    }
    window.addEventListener('resize', updateCompact);
  }

  /* ---------- import / share ---------- */

  function copyText(text, btn) {
    const done = () => {
      const old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  /* navigator.clipboard needs a secure context; fall back for file:// usage. */
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  function shareUrl(puzzleText) {
    return location.href.split('#')[0] + '#p=' + String(puzzleText || '').replace(/\s+/g, '');
  }

  function handleShareHash() {
    const hash = location.hash;
    if (hash.indexOf('#p=') !== 0) return;
    const params = new URLSearchParams(hash.slice(1));
    const p = params.get('p');
    if (p) {
      const err = Game.importPuzzle(p, params.get('d') || undefined);
      if (err) {
        document.getElementById('import-input').value = p;
        document.getElementById('import-error').textContent = err;
        document.getElementById('import-modal').classList.remove('hidden');
      }
    }
    history.replaceState(null, '', location.pathname + location.search);
  }

  /* ---------- home rendering ---------- */

  function renderHome() {
    const s = Storage.settings();
    document.getElementById('conflict-highlight-toggle').checked = !!s.conflictHighlight;
    document.getElementById('auto-check-toggle').checked = !!s.autoCheck;
    document.getElementById('sound-toggle').checked = !!s.sound;
    document.getElementById('timer-toggle').checked = !!s.showTimer;

    const games = Storage.games();
    const resumeable = Object.values(games)
      .filter((g) => g.status === 'in_progress' || g.status === 'paused')
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    renderResumeList(resumeable);
    renderHistory();
    renderStats();
  }

  function renderResumeList(list) {
    const ul = document.getElementById('resume-list');
    const card = document.getElementById('resume-card');
    ul.innerHTML = '';
    card.classList.toggle('hidden', list.length === 0);
    for (const g of list) {
      const li = document.createElement('li');
      const info = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = `${Storage.cap(g.difficulty)} \u00b7 ${Storage.formatStatus(g.status)}`;
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent =
        `${Storage.formatMs(g.playMs)} elapsed \u00b7 started ${Storage.dateStr(g.startTime)}`;
      info.appendChild(title);
      info.appendChild(sub);

      const row = document.createElement('div');
      row.className = 'row-actions';
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'primary';
      resumeBtn.textContent = 'Resume';
      resumeBtn.addEventListener('click', () => Game.resume(g.key));
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        Storage.deleteGame(g.key);
        renderHome();
      });
      row.appendChild(resumeBtn);
      row.appendChild(delBtn);

      li.appendChild(info);
      li.appendChild(row);
      ul.appendChild(li);
    }
  }

  function renderHistory() {
    const st = Storage.stats();
    const ul = document.getElementById('history-list');
    const card = document.getElementById('history-card');
    ul.innerHTML = '';
    card.classList.toggle('hidden', st.completedGames.length === 0);
    for (const g of st.completedGames) {
      const li = document.createElement('li');
      const info = document.createElement('div');
      const title = document.createElement('div');
      title.textContent =
        `${Storage.cap(g.difficulty)} \u00b7 ${g.won ? 'Won' : 'Abandoned'}`;
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = `${Storage.formatMs(g.playMs)} \u00b7 ${Storage.dateStr(g.completedAt)}`;
      info.appendChild(title);
      info.appendChild(sub);
      li.appendChild(info);
      ul.appendChild(li);
    }
  }

  function renderStats() {
    const st = Storage.stats();
    const rate = st.totalGames ? Math.round((st.wins / st.totalGames) * 100) : 0;
    const best = ['easy', 'medium', 'hard']
      .map((d) => `${Storage.cap(d)} ${st.bestTimes[d] != null ? Storage.formatMs(st.bestTimes[d]) : '\u2014'}`)
      .join(' \u00b7 ');

    document.getElementById('stat-games').textContent = st.totalGames;
    document.getElementById('stat-wins').textContent = st.wins;
    document.getElementById('stat-rate').textContent = rate + '%';
    document.getElementById('stat-streak').textContent = st.winStreak;
    document.getElementById('stat-total-time').textContent = Storage.formatMs(st.totalPlayMs);
    document.getElementById('stat-best-time').textContent = best;
  }

  /* ---------- controls ---------- */

  function bindControls() {
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('theme-toggle-game').addEventListener('click', toggleTheme);

    document.getElementById('zoom-in').addEventListener('click', () => shiftZoom(1));
    document.getElementById('zoom-out').addEventListener('click', () => shiftZoom(-1));
    document.getElementById('zoom-in-game').addEventListener('click', () => shiftZoom(1));
    document.getElementById('zoom-out-game').addEventListener('click', () => shiftZoom(-1));

    document.querySelectorAll('.diff-btn[data-difficulty]').forEach((b) => {
      b.addEventListener('click', () => Game.startNew(b.dataset.difficulty));
    });

    document.getElementById('conflict-highlight-toggle').addEventListener('change', (e) => {
      const s = Storage.settings();
      s.conflictHighlight = e.target.checked;
      Storage.saveSettings(s);
    });

    document.getElementById('auto-check-toggle').addEventListener('change', (e) => {
      const s = Storage.settings();
      s.autoCheck = e.target.checked;
      Storage.saveSettings(s);
    });

    document.getElementById('sound-toggle').addEventListener('change', (e) => {
      const s = Storage.settings();
      s.sound = e.target.checked;
      Storage.saveSettings(s);
    });

    document.getElementById('timer-toggle').addEventListener('change', (e) => {
      const s = Storage.settings();
      s.showTimer = e.target.checked;
      Storage.saveSettings(s);
    });

    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('import-input').value = '';
      document.getElementById('import-error').textContent = '';
      document.getElementById('import-modal').classList.remove('hidden');
    });

    document.getElementById('import-cancel').addEventListener('click', () => {
      document.getElementById('import-modal').classList.add('hidden');
    });

    document.getElementById('import-start').addEventListener('click', () => {
      const err = Game.importPuzzle(document.getElementById('import-input').value);
      if (err) document.getElementById('import-error').textContent = err;
      else document.getElementById('import-modal').classList.add('hidden');
    });

    document.getElementById('import-copy').addEventListener('click', () => {
      copyText(shareUrl(document.getElementById('import-input').value), document.getElementById('import-copy'));
    });

    document.getElementById('share-btn').addEventListener('click', () => {
      const url = Game.shareLink();
      if (url) copyText(url, document.getElementById('share-btn'));
    });

    document.getElementById('check-close').addEventListener('click', () => {
      document.getElementById('check-modal').classList.add('hidden');
    });
  }

  init();

  return {
    showView,
    showHome,
  };
})();
