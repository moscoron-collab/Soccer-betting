"use client";

// Self-contained celebration helpers — no assets or dependencies.

export function toast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("spg-toast", { detail: message }));
}

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = audioCtx || new AC();
    return audioCtx;
  } catch {
    return null;
  }
}

// A stadium-style cheer: a swelling burst of filtered noise (the crowd roar)
// plus a short triumphant fanfare. Synthesized live, so it always works.
export function playCheer() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const now = ctx.currentTime;

  const dur = 1.5;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1100;
  bp.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.45, now + 0.35);
  g.gain.exponentialRampToValueAtTime(0.22, now + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  noise.connect(bp).connect(g).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + dur);

  [660, 880, 1320].forEach((f, i) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    const t = now + 0.1 + i * 0.13;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.32);
  });
}

// A stadium-style groan: a duller, lower swell of crowd noise plus a short
// descending "aww" — the disappointed reaction to a missed/saved penalty. The
// mirror image of playCheer(). Synthesized live, so it always works.
export function playGroan() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const now = ctx.currentTime;

  const dur = 1.1;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 500; // lower & duller than the cheer's 1100
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.3, now + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  noise.connect(bp).connect(g).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + dur);

  // A descending three-note "aww".
  [392, 311, 247].forEach((f, i) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    const t = now + 0.06 + i * 0.14;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.34);
  });
}

export function confettiBurst() {
  if (typeof document === "undefined") return;
  const colors = ["#fbbf24", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#ffffff"];
  for (let i = 0; i < 70; i++) {
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;top:-12px;left:${Math.random() * 100}vw;width:8px;height:13px;background:${colors[i % colors.length]};z-index:9999;pointer-events:none;border-radius:2px;`;
    document.body.appendChild(el);
    const drift = (Math.random() - 0.5) * 240;
    const rot = Math.random() * 720;
    el.animate(
      [
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: `translate(${drift}px, 105vh) rotate(${rot}deg)`, opacity: 1 },
      ],
      { duration: 1900 + Math.random() * 900, easing: "cubic-bezier(.2,.6,.4,1)" }
    ).onfinish = () => el.remove();
  }
}

export function celebrate(message: string) {
  confettiBurst();
  playCheer();
  toast(message);
}
