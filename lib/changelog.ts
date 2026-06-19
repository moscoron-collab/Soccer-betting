// Bump VERSION and add an entry at the top whenever you ship something.

export const VERSION = "2.0";

export type Release = { version: string; date: string; changes: string[] };

export const CHANGELOG: Release[] = [
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
