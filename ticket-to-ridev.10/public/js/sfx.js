// Tiny WebAudio synth for sound effects: whistle, chug, card flip, fanfare. No audio files needed.
let ctx = null, master = null;
const state = { vol: Number(localStorage.ttr_vs ?? 70) };
const gainOf = (v) => Math.pow(v / 100, 1.5) * 1.3;
const ac = () => {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = gainOf(state.vol); master.connect(ctx.destination);
    } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};
function tone(freq, t0, dur, type = 'sine', vol = 0.12, slideTo) {
  const a = ac(); if (!a || state.vol <= 0) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, a.currentTime + t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, a.currentTime + t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
  o.connect(g).connect(master); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + 0.05);
}
function noise(t0, dur, vol = 0.1, hp = 1500) {
  const a = ac(); if (!a || state.vol <= 0) return;
  const buf = a.createBuffer(1, Math.max(1, a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(master); s.start(a.currentTime + t0);
}
export const sfx = {
  get volume() { return state.vol; },
  setVolume(v) {
    state.vol = Math.max(0, Math.min(100, Number(v) || 0)); localStorage.ttr_vs = state.vol;
    if (master) master.gain.value = gainOf(state.vol);
  },
  unlock() { ac(); },
  card() { noise(0, 0.07, 0.12, 2500); tone(520, 0.02, 0.05, 'triangle', 0.04); },
  tick() { tone(880, 0, 0.06, 'square', 0.05); },
  click() { tone(660, 0, 0.05, 'triangle', 0.05); },
  turn() { tone(660, 0, 0.18, 'sine', 0.13); tone(990, 0.14, 0.3, 'sine', 0.13); },
  tickets() { noise(0, 0.12, 0.1, 1200); tone(440, 0.05, 0.12, 'triangle', 0.06); },
  chug(n = 6) { for (let i = 0; i < n; i++) { noise(i * 0.16, 0.09, 0.14, 300); tone(70, i * 0.16, 0.08, 'square', 0.04); } },
  whistle() {
    tone(392, 0, 0.7, 'sawtooth', 0.05, 380); tone(494, 0, 0.7, 'sawtooth', 0.05, 480); tone(587, 0.02, 0.65, 'triangle', 0.04, 570);
  },
  claim() { tone(110, 0, 0.12, 'square', 0.08, 70); this.chug(5); setTimeout(() => this.whistle(), 520); },
  error() { tone(180, 0, 0.18, 'sawtooth', 0.07, 120); },
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.16, 0.3, 'triangle', 0.12)); }
};
