"use client";

// Sound Lab — a private preview page to audition Spin-the-Wheel sound candidates
// before wiring them into the game. Tap a button to hear each one.

import {
  spinRatchet,
  spinWhir,
  winFanfareShort,
  winFanfareTriumph,
  winCoinCascade,
  winArpeggio,
  winSlotDing,
  jackpotDrumroll,
  jackpotBigWin,
  loseBuzzer,
  loseWomp,
  loseDeflate,
  loseAww,
  loseBoing,
} from "@/lib/sounds";
import { useEffect, useState } from "react";
import { previewSfx } from "@/lib/sfx";

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
      {
        id: "win-c",
        label: "Win C — Coin cascade",
        note: "A bright shower of coins tumbling.",
        play: () => winCoinCascade(),
      },
      {
        id: "win-d",
        label: "Win D — Rising arpeggio",
        note: "A quick bright climb to a high sparkle.",
        play: () => winArpeggio(),
      },
      {
        id: "win-e",
        label: "Win E — Slot ding-ding",
        note: "Three bright slot-machine bell hits.",
        play: () => winSlotDing(),
      },
    ],
  },
  {
    title: "Jackpot (big win)",
    emoji: "💰",
    items: [
      {
        id: "jack-a",
        label: "Jackpot A — Drumroll",
        note: "Accelerating drumroll into a cymbal, bells + held chord.",
        play: () => jackpotDrumroll(),
      },
      {
        id: "jack-b",
        label: "Jackpot B — Big-win run",
        note: "An ascending run landing on a cymbal + bright bells.",
        play: () => jackpotBigWin(),
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
      {
        id: "lose-c",
        label: "Lose C — Deflating balloon",
        note: "A wobbly pitch sliding down as the air escapes.",
        play: () => loseDeflate(),
      },
      {
        id: "lose-d",
        label: "Lose D — Gentle 'aww'",
        note: "A soft, sympathetic descending sigh.",
        play: () => loseAww(),
      },
      {
        id: "lose-e",
        label: "Lose E — Cartoon boing",
        note: "A quick springy comedic boing.",
        play: () => loseBoing(),
      },
    ],
  },
];

// Real recorded files that can be dropped into /public/sfx (see that folder's
// README). Each row auditions /sfx/<name>.mp3 and shows whether the file is there.
type FileSfx = { name: string; label: string; note: string; core: boolean };
const FILE_SFX: FileSfx[] = [
  { name: "spin", label: "Wheel spinning", note: "Plays while the wheel turns (~3–4s, or a short loop).", core: true },
  { name: "win", label: "Win (small / medium)", note: "Any normal coin win on the wheel.", core: true },
  { name: "jackpot", label: "Jackpot", note: "The big 💰 jackpot win.", core: true },
  { name: "no-win", label: "No win", note: "Landed on the 😬 no-win slice.", core: true },
  { name: "coin", label: "Coin cha-ching", note: "Coins landing — payouts / winning a bet.", core: true },
  { name: "bet-placed", label: "Bet placed", note: "Confirmation when you place a bet.", core: false },
  { name: "bet-won", label: "Bet won", note: "A prediction settles as a win.", core: false },
  { name: "bet-lost", label: "Bet lost", note: "A prediction settles as a loss.", core: false },
  { name: "level-up", label: "Level up", note: "Reaching a new level.", core: false },
  { name: "penalty-goal", label: "Penalty goal", note: "Scoring in the Penalty Shootout.", core: false },
];

function FileSfxRow({ name, label, note }: { name: string; label: string; note: string }) {
  const [present, setPresent] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/sfx/${name}.mp3`, { method: "HEAD" })
      .then((r) => alive && setPresent(r.ok))
      .catch(() => alive && setPresent(false));
    return () => {
      alive = false;
    };
  }, [name]);

  const status = present === null ? "checking…" : present ? "✓ added" : "not added yet";
  return (
    <button
      onClick={() => previewSfx(name)}
      className="w-full rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{label}</span>
        <span className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold">▶ Play</span>
      </div>
      <p className="mt-1 text-xs text-blue-100/60">{note}</p>
      <p className="mt-1 text-[11px] text-blue-100/40">
        file: <code>/sfx/{name}.mp3</code> · {status}
      </p>
    </button>
  );
}

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

      <section className="mt-9">
        <h2 className="mb-1 text-lg font-bold">🎧 Real sound files (drop-ins)</h2>
        <p className="mb-3 text-xs text-blue-100/60">
          These play from <code>/sfx/</code>. Add an MP3 with the exact name shown (see the
          <code> public/sfx</code> folder) and it lights up “✓ added”. Send me the files and I’ll
          wire them into the game.
        </p>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-blue-200/80">Core</h3>
            <div className="space-y-2">
              {FILE_SFX.filter((f) => f.core).map((f) => (
                <FileSfxRow key={f.name} name={f.name} label={f.label} note={f.note} />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-blue-200/80">Optional extras</h3>
            <div className="space-y-2">
              {FILE_SFX.filter((f) => !f.core).map((f) => (
                <FileSfxRow key={f.name} name={f.name} label={f.label} note={f.note} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-blue-100/40">
        Preview page · nothing here changes the game yet.
      </p>
    </main>
  );
}
