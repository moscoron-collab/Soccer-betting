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
