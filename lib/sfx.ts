"use client";

// Playback for REAL recorded sound files dropped into /public/sfx (served at
// /sfx/<name>.mp3). Kept separate from the synthesized lib/sounds.ts.
//
// Files are optional: a name that isn't registered in SFX_FILES simply doesn't
// play, so callers can fall back to a synth sound and nothing ever breaks if a
// file hasn't been added yet.

import { isMuted } from "./sounds";

// The recorded effects the game knows how to use. (Filename = `${name}.mp3`.)
export type SfxName =
  | "spin"
  | "win"
  | "jackpot"
  | "no-win"
  | "coin"
  | "bet-placed"
  | "bet-won"
  | "bet-lost"
  | "level-up"
  | "penalty-goal";

// Names whose file is actually committed to /public/sfx. Add a name here when its
// file lands, so the game prefers the real recording over the synth fallback.
// Until then this stays empty and `playSfx` reports "no file" so callers fall back.
export const SFX_FILES = new Set<SfxName>([
  // "spin", "win", "jackpot", "no-win", "coin", ...
]);

// Play a recorded effect. Returns true if a real file is registered for `name`
// (so the caller should NOT also play its synth fallback), false otherwise.
// Respects the mute preference and never throws.
export function playSfx(name: SfxName, volume = 0.7): boolean {
  if (!SFX_FILES.has(name)) return false;
  if (!isMuted()) previewSfx(name, volume);
  return true; // registered — caller skips the synth fallback either way
}

// Audition a file directly, even if it isn't registered in SFX_FILES yet — used by
// the Sound Lab so a freshly-added file can be tested before it's wired in.
export function previewSfx(name: string, volume = 0.7): void {
  if (typeof window === "undefined") return;
  try {
    const a = new Audio(`/sfx/${name}.mp3`);
    a.volume = volume;
    void a.play().catch(() => {
      /* missing file or autoplay block — ignore */
    });
  } catch {
    /* ignore */
  }
}
