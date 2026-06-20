// Bump VERSION and add an entry at the top whenever you ship something.

export const VERSION = "3.0";

export type Release = { version: string; date: string; changes: string[] };

export const CHANGELOG: Release[] = [
  {
    version: "3.0",
    date: "2026-06-20",
    changes: [
      "💬 Chat! There's now a shared chat room on the Play tab — say hi, talk about the matches, cheer each other on. Tap a name or photo to see that player's log. To keep it safe for everyone: no links or phone numbers, bad words are filtered, and you can delete your own messages.",
    ],
  },
  {
    version: "2.9",
    date: "2026-06-20",
    changes: [
      "Hebrew! 🇮🇱 Tap the language button (top of the screen) to switch between English and עברית. The whole app flips to right-to-left in Hebrew, and your choice is remembered. New Hebrew-speaking players start in Hebrew automatically.",
    ],
  },
  {
    version: "2.8",
    date: "2026-06-20",
    changes: [
      "Daily features (Spin, Penalty Shootout, low-coin top-up) now reset at YOUR local midnight, in your own timezone — so 'come back tomorrow' means your tomorrow",
    ],
  },
  {
    version: "2.5",
    date: "2026-06-20",
    changes: [
      "Leaderboard now always shows live coin totals and profile pictures (no more stale cache), refreshes itself every 60s, and has a manual ↻ Refresh button",
      "Tap any player's row to open their log (mobile fix); long names no longer push the coin total off-screen",
    ],
  },
  {
    version: "2.4",
    date: "2026-06-20",
    changes: [
      "⚡ Faster payouts — finished games now settle within about a minute while anyone is playing, instead of waiting on the hourly job",
    ],
  },
  {
    version: "2.3",
    date: "2026-06-20",
    changes: [
      "👤 Tap any player's profile picture (leaderboard or picks list) to view their log",
      "🙈 The privacy option now hides YOUR OWN picks from others until kickoff",
      "🎡 Wheel update: spins now 🪙150 each, up to 4 per day (1 free + 3 paid), and a new 'no win' slice",
      "🖼️ Fixed profile pictures not appearing on the leaderboard",
      "⚽ Penalty Shootout is harder — the bar moves much faster",
    ],
  },
  {
    version: "2.2",
    date: "2026-06-20",
    changes: [
      "🖼️ Profile pictures — upload your own photo or pick an emoji avatar (shows on the leaderboard and next to picks)",
      "🙈 Privacy option — hide other players' picks until kickoff (toggle in ⚙️ Profile & settings)",
      "🎡 Spin the Wheel is now a real spinning wheel with power-ups: 2× payout boosts, streak shields and a jackpot",
      "⚡ Spend a 2× boost on any bet to double your winnings; 🛡️ a streak shield saves your win-streak from one loss",
      "Extra spins available any time for 🪙75",
    ],
  },
  {
    version: "2.1",
    date: "2026-06-19",
    changes: [
      "Welcome-back recap: open the app and see confetti + a banner of what your bets won/lost while you were away",
    ],
  },
  {
    version: "2.0",
    date: "2026-06-19",
    changes: [
      "🏅 Achievement rewards — unlock badges and claim coin prizes",
      "🔥 Win-streak bonuses — extra coins for 3, 5 and 10 wins in a row",
      "⚽ Penalty Shootout mini-game for daily bonus coins",
    ],
  },
  {
    version: "1.10",
    date: "2026-06-19",
    changes: [
      "Removed Combo bets",
      "Clearer payouts: each bet shows the full multiplier (e.g. ×4.5) so stake × it = winnings",
      "Every bet market now shows a plain-English question",
    ],
  },
  {
    version: "1.9",
    date: "2026-06-19",
    changes: [
      "Each game now shows a live who-wins vote split (Team A / Draw / Team B) with who picked what",
    ],
  },
  {
    version: "1.8",
    date: "2026-06-19",
    changes: [
      "Removed the Beat the Crowd mini-game",
      "My predictions now shows only your active bets, grouped one card per match",
    ],
  },
  {
    version: "1.7",
    date: "2026-06-19",
    changes: [
      "Winning celebrations: confetti, a stadium cheer, and animated coin count-up",
      "Levels & XP (Rookie → Legend) with a progress bar",
      "Achievement badges and a win-streak counter in My Log",
      "Daily challenges that pay bonus coins",
    ],
  },
  {
    version: "1.6",
    date: "2026-06-19",
    changes: [
      "Combo (parlay) bets — pick several games, all must win, payout multiplies",
      "More markets per game: Both Teams To Score and Total goals",
      "Clearer winnings: shows the coins you'd win instead of ×2/×5",
      "Results & coins now update automatically every 15 minutes",
    ],
  },
  {
    version: "1.5",
    date: "2026-06-18",
    changes: [
      "Smarter payouts: underdog picks pay more, plus a Match of the Day bonus",
      "Mini-games: Daily Spin and Beat the Crowd",
      "My Log tab with your record and coins won/lost per game",
      "Place one of each bet type on the same match",
    ],
  },
  {
    version: "1.4",
    date: "2026-06-18",
    changes: [
      "New blue theme",
      "Two games per row on bigger screens",
      "Competition filters and a shorter match list",
      "Leaderboard moved to the top",
    ],
  },
  {
    version: "1.3",
    date: "2026-06-18",
    changes: ["Username + password login that works on any device"],
  },
  {
    version: "1.2",
    date: "2026-06-18",
    changes: ["“Who's betting?” — see everyone's picks and the Home/Draw/Away split"],
  },
  {
    version: "1.1",
    date: "2026-06-18",
    changes: [
      "Half-time leader and 3+ goals bets",
      "Team flags and logos",
      "Edit or cancel a bet before kickoff",
    ],
  },
  {
    version: "1.0",
    date: "2026-06-18",
    changes: [
      "Launch: predict real matches, win coins, climb the leaderboard",
      "1,000 starting coins and a shareable link",
    ],
  },
];
