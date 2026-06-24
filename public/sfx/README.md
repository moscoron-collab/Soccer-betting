# Drop-in sound effects

Real recorded sound effects live here, served at `/sfx/<name>.mp3`.

Add an MP3 with one of the exact names below and it becomes auditionable on the
`/sounds` page. Once its name is registered in `lib/sfx.ts` (`SFX_FILES`) the game
plays it in place of the synthesized fallback.

Guidelines:
- Format: **MP3**, named exactly as listed (lowercase, hyphens).
- Keep them short — a second or two (the spin can be ~3–4s or a short loop).
- Keep them small — ideally under ~200 KB each.
- Use only **royalty-free / properly licensed** audio (e.g. Pixabay, Mixkit).

## Core
- `spin.mp3` — wheel spinning
- `win.mp3` — normal coin win on the wheel
- `jackpot.mp3` — the big jackpot win
- `no-win.mp3` — landed on the "No win" slice
- `coin.mp3` — coin cha-ching (payouts / winning a bet)

## Optional extras
- `bet-placed.mp3` — placing a bet
- `bet-won.mp3` — a prediction settles as a win
- `bet-lost.mp3` — a prediction settles as a loss
- `level-up.mp3` — reaching a new level
- `penalty-goal.mp3` — scoring in the Penalty Shootout
