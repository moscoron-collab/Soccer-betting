"use client";

// Synthesized sound effects (Web Audio API) for the Spin-the-Wheel mini-game,
// in a "realistic wheel" style: a ratchet that slows as it stops, a brass
// fanfare on a win, and a buzzer / sad "womp" on a loss.
//
// These are candidates auditioned on the /sounds page. Once chosen, the picked
// ones get wired into the wheel. Raw functions always play; the game checks
// isMuted() before calling them.

let ctx: AudioContext | null = null;
function ac(): AudioContext {
  if (typeof window === "undefined") throw new Error("no window");
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// A single shaped tone (with optional pitch glide). Used as a building block.
function tone(opts: {
  type: OscillatorType;
  f0: number;
  f1?: number;
  t0: number;
  dur: number;
  gain?: number;
  attack?: number;
  detune?: number;
}) {
  const c = ac();
  const { type, f0, f1, t0, dur, gain = 0.2, attack = 0.012, detune = 0 } = opts;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// A brassy note = two slightly-detuned sawtooths layered.
function brass(f: number, t0: number, dur: number, gain = 0.16) {
  tone({ type: "sawtooth", f0: f, t0, dur, gain, detune: -7 });
  tone({ type: "sawtooth", f0: f, t0, dur, gain, detune: +7 });
}

// A short ratchet "click".
function clickAt(when: number, gain = 0.28) {
  tone({ type: "square", f0: 1700, f1: 900, t0: when, dur: 0.028, gain, attack: 0.001 });
}

// A short filtered noise burst — drumrolls, cymbals, "escaping air" textures.
function noiseBurst(
  t0: number,
  dur: number,
  opts?: { gain?: number; type?: BiquadFilterType; freq?: number; q?: number }
) {
  const c = ac();
  const { gain = 0.2, type = "bandpass", freq = 1500, q = 0.7 } = opts ?? {};
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur / 2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/* ------------------------------- SPIN ------------------------------------- */

// Candidate A: pure ratchet — clicks that start fast and slow down, like a real
// prize wheel coming to rest.
export function spinRatchet(durMs = 4200) {
  const c = ac();
  const start = c.currentTime + 0.02;
  let t = 0;
  let gap = 0.045;
  const total = durMs / 1000;
  while (t < total) {
    clickAt(start + t, 0.3);
    t += gap;
    gap = Math.min(0.5, gap * 1.1); // each gap longer => slowing down
  }
}

// Candidate B: ratchet + a low whirring sweep that falls in pitch as it slows.
export function spinWhir(durMs = 4200) {
  const c = ac();
  const start = c.currentTime + 0.02;
  const total = durMs / 1000;
  tone({ type: "triangle", f0: 420, f1: 90, t0: start, dur: total, gain: 0.1, attack: 0.05 });
  let t = 0;
  let gap = 0.05;
  while (t < total) {
    clickAt(start + t, 0.2);
    t += gap;
    gap = Math.min(0.5, gap * 1.11);
  }
}

/* -------------------------------- WIN ------------------------------------- */

// Candidate A: short brass fanfare (~1s).
export function winFanfareShort() {
  const t = ac().currentTime + 0.02;
  brass(523, t + 0.0, 0.18); // C5
  brass(659, t + 0.12, 0.18); // E5
  brass(784, t + 0.24, 0.45); // G5
  brass(1046, t + 0.42, 0.6); // C6
}

// Candidate B: longer, triumphant fanfare with a held chord (~2.2s).
export function winFanfareTriumph() {
  const t = ac().currentTime + 0.02;
  brass(392, t + 0.0, 0.16); // G4
  brass(523, t + 0.12, 0.16); // C5
  brass(659, t + 0.24, 0.16); // E5
  brass(784, t + 0.36, 0.3); // G5
  brass(1046, t + 0.56, 0.7); // C6
  // Held major chord to finish.
  brass(523, t + 0.9, 1.3, 0.12);
  brass(659, t + 0.9, 1.3, 0.12);
  brass(784, t + 0.9, 1.3, 0.12);
  brass(1046, t + 0.95, 1.25, 0.12);
}

// Candidate C: a bright shower of coins tumbling down and back up.
export function winCoinCascade() {
  const t = ac().currentTime + 0.02;
  const notes = [1568, 1319, 1047, 1319, 1568, 1760, 2093];
  notes.forEach((f, i) => {
    tone({ type: "triangle", f0: f, t0: t + i * 0.07, dur: 0.18, gain: 0.16, attack: 0.002 });
    tone({ type: "sine", f0: f * 2, t0: t + i * 0.07, dur: 0.1, gain: 0.05, attack: 0.002 }); // sparkle
  });
}

// Candidate D: a quick bright arpeggio climbing to a high sparkle.
export function winArpeggio() {
  const t = ac().currentTime + 0.02;
  const notes = [523, 659, 784, 1047, 1319]; // C-E-G-C-E major climb
  notes.forEach((f, i) => tone({ type: "triangle", f0: f, t0: t + i * 0.09, dur: 0.22, gain: 0.18, attack: 0.004 }));
  tone({ type: "sine", f0: 2093, t0: t + 5 * 0.09, dur: 0.3, gain: 0.1, attack: 0.004 });
}

// Candidate E: slot-machine "ding-ding-ding" — three bright bell hits.
export function winSlotDing() {
  const t = ac().currentTime + 0.02;
  for (let i = 0; i < 3; i++) {
    const t0 = t + i * 0.18;
    tone({ type: "sine", f0: 1760, t0, dur: 0.22, gain: 0.2, attack: 0.002 }); // A6 bell
    tone({ type: "sine", f0: 2637, t0, dur: 0.18, gain: 0.08, attack: 0.002 }); // overtone
  }
}

/* ------------------------------ JACKPOT ----------------------------------- */

// Candidate A: an accelerating drumroll into a cymbal, bells and a held chord.
export function jackpotDrumroll() {
  const t = ac().currentTime + 0.02;
  let x = 0;
  let gap = 0.06;
  while (x < 0.9) {
    noiseBurst(t + x, 0.05, { gain: 0.18, type: "lowpass", freq: 400 });
    x += gap;
    gap = Math.max(0.022, gap * 0.9); // speeds up
  }
  noiseBurst(t + 0.9, 0.5, { gain: 0.22, type: "highpass", freq: 5000 }); // cymbal
  const hit = t + 0.92;
  [1047, 1568].forEach((f) => tone({ type: "sine", f0: f, t0: hit, dur: 0.5, gain: 0.16, attack: 0.002 }));
  brass(523, hit, 1.2, 0.12);
  brass(659, hit, 1.2, 0.12);
  brass(784, hit, 1.2, 0.12);
  brass(1047, hit + 0.05, 1.2, 0.12);
}

// Candidate B: a big ascending run landing on a cymbal + bright bells.
export function jackpotBigWin() {
  const t = ac().currentTime + 0.02;
  const run = [392, 523, 659, 784, 1047, 1319, 1568];
  run.forEach((f, i) => tone({ type: "sawtooth", f0: f, t0: t + i * 0.06, dur: 0.16, gain: 0.12, detune: 5 }));
  const land = t + run.length * 0.06;
  noiseBurst(land, 0.5, { gain: 0.2, type: "highpass", freq: 6000 }); // cymbal
  [1047, 1568, 2093].forEach((f) => tone({ type: "sine", f0: f, t0: land, dur: 0.7, gain: 0.14, attack: 0.002 }));
  brass(1047, land + 0.05, 1.0, 0.12);
}

/* -------------------------------- LOSE ------------------------------------ */

// Candidate A: short low buzzer ("wrong!").
export function loseBuzzer() {
  const c = ac();
  const t = c.currentTime + 0.02;
  // Two chopped low square tones for a buzzy feel.
  for (let i = 0; i < 2; i++) {
    tone({ type: "square", f0: 150, t0: t + i * 0.22, dur: 0.18, gain: 0.22, attack: 0.005 });
    tone({ type: "square", f0: 98, t0: t + i * 0.22, dur: 0.18, gain: 0.18, attack: 0.005 });
  }
}

// Candidate B: descending "womp womp" sad trombone (~1.2s).
export function loseWomp() {
  const t = ac().currentTime + 0.02;
  const notes = [311, 277, 233]; // Eb4 -> Db4 -> Bb3, each sliding down a bit
  notes.forEach((f, i) => {
    const t0 = t + i * 0.36;
    brass(f, t0, 0.34, 0.18);
    // slide each note down for that classic droop
    tone({ type: "sawtooth", f0: f, f1: f * 0.92, t0, dur: 0.34, gain: 0.14, detune: 6 });
  });
}

// Candidate C: a deflating balloon — a wobbly pitch sliding down as air escapes.
export function loseDeflate() {
  const c = ac();
  const t = c.currentTime + 0.02;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(700, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.9);
  const lfo = c.createOscillator(); // wobble
  const lfoG = c.createGain();
  lfo.frequency.value = 18;
  lfoG.gain.value = 40;
  lfo.connect(lfoG).connect(osc.detune);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 1.0);
  lfo.stop(t + 1.0);
}

// Candidate D: a gentle, sympathetic descending "aww".
export function loseAww() {
  const t = ac().currentTime + 0.02;
  const notes = [523, 466, 392]; // C5 -> Bb4 -> G4 soft descent
  notes.forEach((f, i) => {
    tone({ type: "sine", f0: f, t0: t + i * 0.2, dur: 0.34, gain: 0.16, attack: 0.02 });
    tone({ type: "triangle", f0: f, t0: t + i * 0.2, dur: 0.34, gain: 0.05, attack: 0.02 });
  });
}

// Candidate E: a cartoon "boing" — a quick springy wobble.
export function loseBoing() {
  const c = ac();
  const t = c.currentTime + 0.02;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(520, t + 0.08);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.3);
  const lfo = c.createOscillator();
  const lfoG = c.createGain();
  lfo.frequency.value = 12;
  lfoG.gain.value = 60;
  lfo.connect(lfoG).connect(osc.detune);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 0.5);
  lfo.stop(t + 0.5);
}

/* ------------------------------- MUTE ------------------------------------- */

const MUTE_KEY = "spg_sound_off";
export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}
