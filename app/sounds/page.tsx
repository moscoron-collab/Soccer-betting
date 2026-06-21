"use client";

// Sound Lab — a private preview page to audition Spin-the-Wheel sound candidates
// before wiring them into the game. Tap a button to hear each one.

import {
  spinRatchet,
  spinWhir,
  winFanfareShort,
  winFanfareTriumph,
  loseBuzzer,
  loseWomp,
} from "@/lib/sounds";

type Candidate = { id: string; label: string; note: string; play: () => void };

const GROUPS: { title: string; emoji: string; items: Candidate[] }[] = [
  {
    title: "Wheel spinning",
    emoji: "🎡",
    items: [
      {
        id: "spin-a",
        label: "Spin A — Ratchet",
        note: "Clicky prize-wheel ratchet that slows as it stops.",
        play: () => spinRatchet(),
      },
      {
        id: "spin-b",
        label: "Spin B — Ratchet + whir",
        note: "Same ratchet plus a low whir that falls in pitch.",
        play: () => spinWhir(),
      },
    ],
  },
  {
    title: "You WON",
    emoji: "🎉",
    items: [
      {
        id: "win-a",
        label: "Win A — Short fanfare",
        note: "Quick brass flourish (~1s).",
        play: () => winFanfareShort(),
      },
      {
        id: "win-b",
        label: "Win B — Triumphant",
        note: "Longer brass fanfare with a held chord (~2s).",
        play: () => winFanfareTriumph(),
      },
    ],
  },
  {
    title: "No win / lost",
    emoji: "😬",
    items: [
      {
        id: "lose-a",
        label: "Lose A — Buzzer",
        note: "Short low 'wrong!' buzzer.",
        play: () => loseBuzzer(),
      },
      {
        id: "lose-b",
        label: "Lose B — Sad womp",
        note: "Descending 'womp womp' sad trombone (~1.2s).",
        play: () => loseWomp(),
      },
    ],
  },
];

export default function SoundLab() {
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <h1 className="text-2xl font-extrabold">🔊 Sound Lab</h1>
      <p className="mt-2 text-sm text-blue-100/70">
        Tap each button to hear it. Turn your volume up. Then tell me your picks (e.g.
        “Spin B, Win A, Lose B”) and I’ll add them to the wheel.
      </p>

      {GROUPS.map((g) => (
        <section key={g.title} className="mt-7">
          <h2 className="mb-2 text-lg font-bold">
            {g.emoji} {g.title}
          </h2>
          <div className="space-y-2">
            {g.items.map((c) => (
              <button
                key={c.id}
                onClick={c.play}
                className="w-full rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{c.label}</span>
                  <span className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold">▶ Play</span>
                </div>
                <p className="mt-1 text-xs text-blue-100/60">{c.note}</p>
              </button>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-8 text-center text-xs text-blue-100/40">
        Preview page · nothing here changes the game yet.
      </p>
    </main>
  );
}
