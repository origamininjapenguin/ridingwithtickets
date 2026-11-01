// Background music built with Tone.js (loaded as a global script). A jaunty banjo-and-bass railroad loop.
// Menu mode: pad + banjo + melody. Game mode adds the walking bass and the steam-train chug.
const state = { vol: Number(localStorage.ttr_vm ?? 40), mode: 'menu' };
let built = false, started = false, out = null;

const CHORDS = ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G'];
const ARP = { G: ['G4', 'B4', 'D5'], C: ['C4', 'E4', 'G4'], D: ['D4', 'F#4', 'A4'] };
const PAD = { G: ['G3', 'B3', 'D4'], C: ['C3', 'G3', 'E4'], D: ['D3', 'A3', 'F#4'] };
const BASS = { G: ['G2', 'D3'], C: ['C3', 'G3'], D: ['D3', 'A3'] };
const LEAD = [
  ['B4', null, 'D5', null, 'E5', 'D5', 'B4', null],
  ['C5', null, 'E5', null, 'G5', 'E5', 'C5', null],
  ['B4', 'D5', 'G5', null, 'E5', 'D5', 'B4', null],
  ['A4', null, 'D5', null, 'F#5', 'D5', 'A4', null],
  ['G4', 'B4', 'D5', null, 'E5', null, 'D5', 'B4'],
  ['C5', null, 'E5', 'G5', 'E5', null, 'C5', null],
  ['A4', 'D5', null, 'F#5', 'E5', 'D5', 'A4', null],
  ['G4', null, 'B4', null, 'G4', null, null, null]
].flat();

function apply() {
  if (!out) return;
  const v = state.vol;
  out.mute = v <= 0 || document.hidden;
  out.volume.value = v <= 0 ? -60 : 20 * Math.log10(Math.pow(v / 100, 1.5) * 0.9);
}

function build() {
  const Tone = window.Tone;
  if (!Tone) return false;
  out = new Tone.Volume(0).toDestination();
  apply();
  const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.28 }).connect(out);

  const banjo = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' }, envelope: { attack: 0.004, decay: 0.22, sustain: 0.02, release: 0.3 }
  }).connect(reverb);
  banjo.volume.value = -13;
  const lead = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3800, resonance: 0.93 }).connect(reverb);
  lead.volume.value = -5;
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' }, envelope: { attack: 1.1, decay: 0.4, sustain: 0.7, release: 2 }
  }).connect(reverb);
  pad.volume.value = -24;
  const bass = new Tone.Synth({
    oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.25, release: 0.15 }
  }).connect(out);
  bass.volume.value = -9;
  const chug = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.07, sustain: 0 } })
    .connect(new Tone.Filter(1600, 'highpass').connect(out));
  chug.volume.value = -26;

  const arp = [];
  CHORDS.forEach(c => [0, 2, 1, 2, 0, 2, 1, 2].forEach(i => arp.push(ARP[c][i])));
  new Tone.Sequence((t, n) => banjo.triggerAttackRelease(n, '16n', t), arp, '8n').start(0);
  new Tone.Sequence((t, n) => { if (n) lead.triggerAttack(n, t); }, LEAD, '8n').start(0);
  new Tone.Sequence((t, c) => pad.triggerAttackRelease(PAD[c], '1m', t), CHORDS, '1m').start(0);
  const bassNotes = [];
  CHORDS.forEach(c => bassNotes.push(BASS[c][0], BASS[c][1], BASS[c][0], BASS[c][1]));
  new Tone.Sequence((t, n) => { if (state.mode === 'game') bass.triggerAttackRelease(n, '8n', t); }, bassNotes, '4n').start(0);
  let k = 0;
  new Tone.Sequence((t) => { if (state.mode === 'game') chug.triggerAttackRelease('32n', t, k++ % 2 ? 0.45 : 1); }, new Array(64).fill(1), '8n').start(0);

  Tone.Transport.bpm.value = 104;
  Tone.Transport.swing = 0.22; Tone.Transport.swingSubdivision = '8n';
  document.addEventListener('visibilitychange', apply);
  return true;
}

export const music = {
  get volume() { return state.vol; },
  async start() {
    if (started || !window.Tone || state.vol <= 0) return;
    try {
      await window.Tone.start();
      if (!built) built = build();
      if (!built) return;
      started = true;
      window.Tone.Transport.start('+0.1');
    } catch (e) { /* needs a user gesture; will retry on the next click */ }
  },
  setVolume(v) {
    state.vol = Math.max(0, Math.min(100, Number(v) || 0));
    localStorage.ttr_vm = state.vol;
    apply();
    if (state.vol > 0 && !started) this.start();
  },
  setMode(m) { state.mode = m; }
};
