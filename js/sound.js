/* Click sounds for buttons and cells, synthesized with Web Audio (no assets). */
const Sound = (function () {
  let ctx = null;

  function ensure() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) ctx = new Ctx();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function click() {
    if (!Storage.settings().sound) return;
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1150, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.05);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.065);
  }

  function onDocClick(e) {
    if (e.target.closest('button, .cell')) click();
  }

  document.addEventListener('click', onDocClick);

  return { click };
})();
