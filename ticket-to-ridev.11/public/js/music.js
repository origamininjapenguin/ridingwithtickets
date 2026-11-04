// Background music: public/audio/AllTracks.mp3, looped. The file is ~16 MB, so it is only fetched
// once the player has clicked something (browsers block audio before that anyway) and has music turned up.
const SRC = '/audio/AllTracks.mp3';
const state = { vol: Number(localStorage.ttr_vm ?? 40) };
let el = null, started = false;

function apply() {
  if (!el) return;
  el.volume = state.vol <= 0 ? 0 : Math.min(1, Math.pow(state.vol / 100, 1.5)); // gentle curve: the slider feels even
  el.muted = document.hidden; // silent while the tab is in the background
}

export const music = {
  get volume() { return state.vol; },
  start() {
    if (started || state.vol <= 0) return;
    if (!el) {
      el = new Audio(SRC);
      el.loop = true; el.preload = 'auto';
      document.addEventListener('visibilitychange', apply);
    }
    apply();
    started = true;
    el.play().catch(() => { started = false; }); // not allowed yet (needs a click): retried on the next click
  },
  setVolume(v) {
    state.vol = Math.max(0, Math.min(100, Number(v) || 0));
    localStorage.ttr_vm = state.vol;
    if (state.vol <= 0) { if (el) { el.pause(); started = false; } return; } // stop streaming at zero
    apply();
    this.start();
  },
  setMode() { /* one track plays everywhere */ }
};
