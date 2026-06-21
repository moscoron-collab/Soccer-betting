// Bump VERSION and add an entry at the top whenever you ship something.
// Every change has both English (en) and Hebrew (he) text; the "What's new"
// modal shows the one matching the player's chosen language.

export const VERSION = "4.10";

export type Change = { en: string; he: string };
export type Release = { version: string; date: string; changes: Change[] };

export const CHANGELOG: Release[] = [
  {
    version: "4.10",
    date: "2026-06-21",
    changes: [
      {
        en: "🎡 Cleaner wheel: prize labels now run along each slice so longer names no longer overlap.",
        he: "🎡 גלגל נקי יותר: תוויות הפרסים מסודרות עכשיו לאורך כל פרוסה כך ששמות ארוכים כבר לא חופפים.",
      },
    ],
  },
  {
    version: "4.9",
    date: "2026-06-21",
    changes: [
      {
        en: "🎡 Bigger, better wheel: new 🪙25 and 🪙500 prizes, and the jackpot now pays a random amount up to 🪙2,000!",
        he: "🎡 גלגל גדול וטוב יותר: פרסים חדשים של 🪙25 ו-🪙500, והג'קפוט משלם עכשיו סכום אקראי עד 🪙2,000!",
      },
      {
        en: "🎟️ Free bet tokens: win one on the wheel, then place a bet on the house — if it wins you keep the full payout, if it loses it costs you nothing.",
        he: "🎟️ אסימוני הימור חינם: זכו באחד בגלגל, והמרו על חשבון הבית — אם תזכו תקבלו את כל הזכייה, ואם תפסידו זה לא עולה כלום.",
      },
      {
        en: "🎲 Double or nothing: after a coin win on the wheel you can gamble it on a 50/50 — double it or lose it!",
        he: "🎲 הכפלה או כלום: אחרי זכייה במטבעות בגלגל אפשר להמר עליה ב-50/50 — להכפיל או להפסיד!",
      },
    ],
  },
  {
    version: "4.8",
    date: "2026-06-21",
    changes: [
      {
        en: "🔥 Daily login bonus: coins just for opening the app, growing each day in a row (50 up to 200).",
        he: "🔥 בונוס כניסה יומי: מטבעות רק על פתיחת האפליקציה, שגדל בכל יום ברצף (מ-50 ועד 200).",
      },
      {
        en: "💸 Daily loss cashback: get 15% of a losing day's net losses back automatically (up to 1,000).",
        he: "💸 החזר יומי על הפסדים: מקבלים אוטומטית 15% מההפסדים של יום מפסיד (עד 1,000).",
      },
      {
        en: "🪙 Bigger safety net: low on coins? Top up to 500 once a day. Plus a new 'how to get more coins' panel that shows you every way to earn when you're running low.",
        he: "🪙 רשת ביטחון גדולה יותר: נגמרו המטבעות? מלאו ל-500 פעם ביום. ובנוסף פאנל חדש 'איך משיגים עוד מטבעות' שמציג את כל הדרכים להרוויח כשנגמר לכם.",
      },
      {
        en: "Every reward shows a clear message so you always know what you got and why.",
        he: "כל פרס מוצג עם הודעה ברורה כדי שתמיד תדעו מה קיבלתם ולמה.",
      },
    ],
  },
  {
    version: "4.7",
    date: "2026-06-21",
    changes: [
      {
        en: "The leaderboard ↻ Refresh button now shows a 'Refreshing…' state so you can see it working.",
        he: "כפתור הרענון ↻ בטבלה מציג עכשיו מצב 'מרענן…' כדי שתראו שהוא עובד.",
      },
    ],
  },
  {
    version: "4.5",
    date: "2026-06-21",
    changes: [
      {
        en: "Faster winnings: bets already decided pay out before the match ends — half-time leader (at the break), and 3+ goals / both teams score / 4+ goals the moment it happens — so you can reuse those coins right away. (Applies to matches kicking off from now on.)",
        he: "זכיות מהירות יותר: הימורים שכבר הוכרעו משולמים לפני סוף המשחק — מוביל במחצית (בהפסקה), ו-3+ גולים / שתי הקבוצות כובשות / 4+ גולים ברגע שזה קורה — כך שאפשר להשתמש במטבעות מיד. (חל על משחקים שמתחילים מעכשיו והלאה.)",
      },
    ],
  },
  {
    version: "4.4",
    date: "2026-06-21",
    changes: [
      {
        en: "What's New now reads in Hebrew too — every update is shown in your chosen language.",
        he: "«מה חדש» מופיע עכשיו גם בעברית — כל עדכון מוצג בשפה שבחרתם.",
      },
    ],
  },
  {
    version: "4.3",
    date: "2026-06-21",
    changes: [
      {
        en: "Tap a player's photo (at the top of their profile) to see it full-screen — and your own photo in Profile & settings too. Works for uploaded photos.",
        he: "הקישו על תמונת שחקן (בראש הפרופיל שלו) כדי לראות אותה במסך מלא — וגם על התמונה שלכם ב'פרופיל והגדרות'. עובד לתמונות שהועלו.",
      },
    ],
  },
  {
    version: "4.2",
    date: "2026-06-21",
    changes: [
      {
        en: "🎁 A warm welcome: every player gets a one-time +🪙500 gift for joining and playing — and so will new players when they sign up.",
        he: "🎁 קבלת פנים חמה: כל שחקן מקבל מתנה חד-פעמית של +🪙500 על ההצטרפות וההשתתפות — וגם שחקנים חדשים יקבלו אותה בהרשמה.",
      },
    ],
  },
  {
    version: "4.1",
    date: "2026-06-21",
    changes: [
      {
        en: "Fixed a white bar that could flicker at the bottom of the screen while scrolling on phones.",
        he: "תוקן פס לבן שהיה עלול להבהב בתחתית המסך בזמן גלילה בטלפון.",
      },
    ],
  },
  {
    version: "4.0",
    date: "2026-06-20",
    changes: [
      {
        en: "More reliable sign-in: a brief server hiccup or weak connection no longer logs you out or bounces you after a bet — you stay signed in and it just retries.",
        he: "התחברות יציבה יותר: תקלת שרת רגעית או חיבור חלש כבר לא ינתקו אתכם או יזרקו אתכם אחרי הימור — אתם נשארים מחוברים והמערכת פשוט מנסה שוב.",
      },
      {
        en: "You can now use Hebrew (or any language) letters in your username.",
        he: "אפשר עכשיו להשתמש באותיות עבריות (או בכל שפה) בשם המשתמש.",
      },
    ],
  },
  {
    version: "3.9",
    date: "2026-06-20",
    changes: [
      {
        en: "Fixed the daily challenges: removed 'Place 3 bets' and the 'Place a combo' one (combos weren't available to play, so it could never be completed).",
        he: "תוקנו האתגרים היומיים: הוסרו 'בצעו 3 הימורים' ו'בצעו קומבו' (קומבו לא היה זמין למשחק, ולכן אי אפשר היה להשלים אותו).",
      },
      {
        en: "New daily challenges everyone can actually finish: Place a bet, Spin the wheel, and Play the Penalty Shootout — 🪙50 each.",
        he: "אתגרים יומיים חדשים שאפשר באמת להשלים: בצעו הימור, סובבו את הגלגל, ושחקו דו-קרב פנדלים — 🪙50 כל אחד.",
      },
    ],
  },
  {
    version: "3.8",
    date: "2026-06-20",
    changes: [
      {
        en: "Your coin balance now floats in the bottom corner, so it's always visible while you scroll (and it counts up when you win).",
        he: "מאזן המטבעות שלכם מופיע עכשיו בפינה התחתונה, כך שהוא תמיד גלוי בזמן גלילה (והוא עולה בספירה כשזוכים).",
      },
    ],
  },
  {
    version: "3.7",
    date: "2026-06-20",
    changes: [
      {
        en: "Tap any player to see their stats: a Wins / Losses / Win-rate panel now sits at the top of their profile, above their bet log.",
        he: "הקישו על כל שחקן כדי לראות את הנתונים שלו: לוח ניצחונות / הפסדים / אחוז ניצחון מופיע עכשיו בראש הפרופיל, מעל יומן ההימורים.",
      },
    ],
  },
  {
    version: "3.6",
    date: "2026-06-20",
    changes: [
      { en: "Extra wheel spins now cost 🪙100.", he: "סיבוב נוסף בגלגל עולה עכשיו 🪙100." },
    ],
  },
  {
    version: "3.5",
    date: "2026-06-20",
    changes: [
      {
        en: "Cheaper spins! Extra wheel spins now cost 🪙75 (down from 🪙150).",
        he: "סיבובים זולים יותר! סיבוב נוסף עולה עכשיו 🪙75 (במקום 🪙150).",
      },
      {
        en: "Match of the Day is now ONE fixed match per day — the biggest game of your day — instead of always jumping to the next match. It's based on your own local day (works for any timezone), and the bonus matches the ⭐ exactly.",
        he: "משחק היום הוא עכשיו משחק אחד קבוע ליום — המשחק הגדול של היום שלכם — במקום לקפוץ תמיד למשחק הבא. הוא מבוסס על היום המקומי שלכם (עובד בכל אזור זמן), והבונוס תואם במדויק את ה-⭐.",
      },
    ],
  },
  {
    version: "3.4",
    date: "2026-06-20",
    changes: [
      {
        en: "Leveling up is faster and friendlier! You now earn a little XP for playing the mini-games too (spin & penalty), not just for winning bets.",
        he: "העלייה ברמות מהירה וידידותית יותר! מקבלים עכשיו קצת נק' ניסיון גם על משחק במיני-משחקים (גלגל ופנדלים), לא רק על הימורים מנצחים.",
      },
      {
        en: "Ranks come sooner: you reach Analyst at level 5, Scout at 15, Expert at 35, and Legend at 75 — so it doesn't take forever to leave Rookie.",
        he: "הדרגות מגיעות מהר יותר: מגיעים לאנליסט ברמה 5, סייר ב-15, מומחה ב-35, ואגדה ב-75 — כך שלא לוקח נצח לצאת מדרגת מתחיל.",
      },
    ],
  },
  {
    version: "3.3",
    date: "2026-06-20",
    changes: [
      {
        en: "When a new player joins, the chat now greets them automatically — '👋 Everyone welcome <name>!' — so it's easy to say hi.",
        he: "כששחקן חדש מצטרף, הצ'אט מקבל אותו עכשיו אוטומטית — '👋 כולם, קבלו את <שם>!' — כדי שיהיה קל לומר שלום.",
      },
      {
        en: "You can now see your own join date in Profile & settings ('Member since …').",
        he: "אפשר עכשיו לראות את תאריך ההצטרפות שלכם ב'פרופיל והגדרות' ('חבר מאז …').",
      },
    ],
  },
  {
    version: "3.2",
    date: "2026-06-20",
    changes: [
      {
        en: "A warm welcome! New players now get a friendly hello with quick how-to-play tips right after signing up.",
        he: "קבלת פנים חמה! שחקנים חדשים מקבלים עכשיו ברכת שלום עם טיפים קצרים על איך לשחק מיד אחרי ההרשמה.",
      },
      {
        en: "🌱 New players wear a sprout badge for their first week (on the leaderboard and their profile) — say hi to them!",
        he: "🌱 שחקנים חדשים עונדים תג נבט בשבוע הראשון (בטבלה ובפרופיל) — אמרו להם שלום!",
      },
      {
        en: "Tap a player's avatar to see when they joined ('Member since …').",
        he: "הקישו על תמונת שחקן כדי לראות מתי הצטרף ('חבר מאז …').",
      },
    ],
  },
  {
    version: "3.1",
    date: "2026-06-20",
    changes: [
      {
        en: "Penalty Shootout is a little easier now — the aim bar moves a bit slower, so it's simpler to time your shot.",
        he: "דו-קרב הפנדלים קצת יותר קל עכשיו — פס הכוונון זז מעט לאט יותר, כך שקל יותר לתזמן את הבעיטה.",
      },
    ],
  },
  {
    version: "3.0",
    date: "2026-06-20",
    changes: [
      {
        en: "💬 Chat! There's now a shared chat room on the Play tab — say hi, talk about the matches, cheer each other on. Tap a name or photo to see that player's log. To keep it safe for everyone: no links or phone numbers, bad words are filtered, and you can delete your own messages.",
        he: "💬 צ'אט! יש עכשיו חדר צ'אט משותף בלשונית המשחק — אמרו שלום, דברו על המשחקים ועודדו זה את זה. הקישו על שם או תמונה כדי לראות את היומן של השחקן. כדי לשמור על בטיחות לכולם: בלי קישורים או מספרי טלפון, מילים גסות מסוננות, ואפשר למחוק את ההודעות שלכם.",
      },
    ],
  },
  {
    version: "2.9",
    date: "2026-06-20",
    changes: [
      {
        en: "Hebrew! 🇮🇱 Tap the language button (top of the screen) to switch between English and עברית. The whole app flips to right-to-left in Hebrew, and your choice is remembered. New Hebrew-speaking players start in Hebrew automatically.",
        he: "עברית! 🇮🇱 הקישו על כפתור השפה (בראש המסך) כדי לעבור בין אנגלית לעברית. כל האפליקציה מתהפכת לימין-לשמאל בעברית, והבחירה שלכם נשמרת. שחקנים חדשים דוברי עברית מתחילים בעברית אוטומטית.",
      },
    ],
  },
  {
    version: "2.8",
    date: "2026-06-20",
    changes: [
      {
        en: "Daily features (Spin, Penalty Shootout, low-coin top-up) now reset at YOUR local midnight, in your own timezone — so 'come back tomorrow' means your tomorrow",
        he: "התכונות היומיות (גלגל, דו-קרב פנדלים, תוספת מטבעות) מתאפסות עכשיו בחצות לפי השעון המקומי שלכם — כך ש'חזרו מחר' באמת אומר המחר שלכם",
      },
    ],
  },
  {
    version: "2.5",
    date: "2026-06-20",
    changes: [
      {
        en: "Leaderboard now always shows live coin totals and profile pictures (no more stale cache), refreshes itself every 60s, and has a manual ↻ Refresh button",
        he: "הטבלה מציגה עכשיו תמיד סכומי מטבעות ותמונות פרופיל עדכניים (בלי מטמון ישן), מתרעננת לבד כל 60 שניות, ויש כפתור רענון ↻ ידני",
      },
      {
        en: "Tap any player's row to open their log (mobile fix); long names no longer push the coin total off-screen",
        he: "הקישו על שורת כל שחקן כדי לפתוח את היומן שלו (תיקון למובייל); שמות ארוכים כבר לא דוחפים את סכום המטבעות אל מחוץ למסך",
      },
    ],
  },
  {
    version: "2.4",
    date: "2026-06-20",
    changes: [
      {
        en: "⚡ Faster payouts — finished games now settle within about a minute while anyone is playing, instead of waiting on the hourly job",
        he: "⚡ תשלומים מהירים יותר — משחקים שהסתיימו מסולקים עכשיו תוך כדקה כל עוד מישהו משחק, במקום להמתין למשימה השעתית",
      },
    ],
  },
  {
    version: "2.3",
    date: "2026-06-20",
    changes: [
      {
        en: "👤 Tap any player's profile picture (leaderboard or picks list) to view their log",
        he: "👤 הקישו על תמונת הפרופיל של כל שחקן (בטבלה או ברשימת הניחושים) כדי לראות את היומן שלו",
      },
      {
        en: "🙈 The privacy option now hides YOUR OWN picks from others until kickoff",
        he: "🙈 אפשרות הפרטיות מסתירה עכשיו את הניחושים שלכם מאחרים עד תחילת המשחק",
      },
      {
        en: "🎡 Wheel update: spins now 🪙150 each, up to 4 per day (1 free + 3 paid), and a new 'no win' slice",
        he: "🎡 עדכון גלגל: סיבובים עולים עכשיו 🪙150, עד 4 ביום (1 חינם + 3 בתשלום), ופרוסת 'אין זכייה' חדשה",
      },
      {
        en: "🖼️ Fixed profile pictures not appearing on the leaderboard",
        he: "🖼️ תוקנו תמונות פרופיל שלא הופיעו בטבלה",
      },
      {
        en: "⚽ Penalty Shootout is harder — the bar moves much faster",
        he: "⚽ דו-קרב הפנדלים קשה יותר — הפס זז הרבה יותר מהר",
      },
    ],
  },
  {
    version: "2.2",
    date: "2026-06-20",
    changes: [
      {
        en: "🖼️ Profile pictures — upload your own photo or pick an emoji avatar (shows on the leaderboard and next to picks)",
        he: "🖼️ תמונות פרופיל — העלו תמונה משלכם או בחרו אימוג'י (מופיע בטבלה ולצד הניחושים)",
      },
      {
        en: "🙈 Privacy option — hide other players' picks until kickoff (toggle in ⚙️ Profile & settings)",
        he: "🙈 אפשרות פרטיות — הסתירו את הניחושים של שחקנים אחרים עד תחילת המשחק (מתג ב⚙️ פרופיל והגדרות)",
      },
      {
        en: "🎡 Spin the Wheel is now a real spinning wheel with power-ups: 2× payout boosts, streak shields and a jackpot",
        he: "🎡 גלגל המזל הוא עכשיו גלגל מסתובב אמיתי עם כוחות-על: בוסטים של הכפלת זכייה 2×, מגני רצף וג'קפוט",
      },
      {
        en: "⚡ Spend a 2× boost on any bet to double your winnings; 🛡️ a streak shield saves your win-streak from one loss",
        he: "⚡ השתמשו בבוסט 2× על כל הימור כדי להכפיל את הזכייה; 🛡️ מגן רצף מציל את רצף הניצחונות שלכם מהפסד אחד",
      },
      {
        en: "Extra spins available any time for 🪙75",
        he: "סיבובים נוספים זמינים בכל עת תמורת 🪙75",
      },
    ],
  },
  {
    version: "2.1",
    date: "2026-06-19",
    changes: [
      {
        en: "Welcome-back recap: open the app and see confetti + a banner of what your bets won/lost while you were away",
        he: "סיכום חזרה: פתחו את האפליקציה וראו קונפטי + באנר של מה שההימורים שלכם זכו/הפסידו בזמן שלא הייתם",
      },
    ],
  },
  {
    version: "2.0",
    date: "2026-06-19",
    changes: [
      {
        en: "🏅 Achievement rewards — unlock badges and claim coin prizes",
        he: "🏅 פרסי הישגים — שחררו תגים ואספו פרסי מטבעות",
      },
      {
        en: "🔥 Win-streak bonuses — extra coins for 3, 5 and 10 wins in a row",
        he: "🔥 בונוסים על רצף ניצחונות — מטבעות נוספים על 3, 5 ו-10 ניצחונות ברצף",
      },
      {
        en: "⚽ Penalty Shootout mini-game for daily bonus coins",
        he: "⚽ מיני-משחק דו-קרב פנדלים למטבעות בונוס יומיים",
      },
    ],
  },
  {
    version: "1.10",
    date: "2026-06-19",
    changes: [
      { en: "Removed Combo bets", he: "הוסרו הימורי קומבו" },
      {
        en: "Clearer payouts: each bet shows the full multiplier (e.g. ×4.5) so stake × it = winnings",
        he: "תשלומים ברורים יותר: כל הימור מציג את המכפיל המלא (למשל ×4.5) כך שהימור × מכפיל = זכייה",
      },
      {
        en: "Every bet market now shows a plain-English question",
        he: "כל סוג הימור מציג עכשיו שאלה ברורה בשפה פשוטה",
      },
    ],
  },
  {
    version: "1.9",
    date: "2026-06-19",
    changes: [
      {
        en: "Each game now shows a live who-wins vote split (Team A / Draw / Team B) with who picked what",
        he: "כל משחק מציג עכשיו פילוח הצבעות חי של מי ינצח (קבוצה א' / תיקו / קבוצה ב') עם מי ניחש מה",
      },
    ],
  },
  {
    version: "1.8",
    date: "2026-06-19",
    changes: [
      { en: "Removed the Beat the Crowd mini-game", he: "הוסר מיני-המשחק 'נצח את הקהל'" },
      {
        en: "My predictions now shows only your active bets, grouped one card per match",
        he: "'התחזיות שלי' מציג עכשיו רק את ההימורים הפעילים שלכם, מקובצים בכרטיס אחד לכל משחק",
      },
    ],
  },
  {
    version: "1.7",
    date: "2026-06-19",
    changes: [
      {
        en: "Winning celebrations: confetti, a stadium cheer, and animated coin count-up",
        he: "חגיגות ניצחון: קונפטי, תרועת אצטדיון, וספירת מטבעות מונפשת",
      },
      {
        en: "Levels & XP (Rookie → Legend) with a progress bar",
        he: "רמות ונק' ניסיון (מתחיל → אגדה) עם פס התקדמות",
      },
      {
        en: "Achievement badges and a win-streak counter in My Log",
        he: "תגי הישגים ומונה רצף ניצחונות ב'יומן שלי'",
      },
      { en: "Daily challenges that pay bonus coins", he: "אתגרים יומיים שמשלמים מטבעות בונוס" },
    ],
  },
  {
    version: "1.6",
    date: "2026-06-19",
    changes: [
      {
        en: "Combo (parlay) bets — pick several games, all must win, payout multiplies",
        he: "הימורי קומבו (פארלי) — בחרו כמה משחקים, כולם חייבים לנצח, והזכייה מוכפלת",
      },
      {
        en: "More markets per game: Both Teams To Score and Total goals",
        he: "עוד סוגי הימורים לכל משחק: שתי הקבוצות כובשות וסך הגולים",
      },
      {
        en: "Clearer winnings: shows the coins you'd win instead of ×2/×5",
        he: "זכיות ברורות יותר: מציג את המטבעות שתזכו בהם במקום ×2/×5",
      },
      {
        en: "Results & coins now update automatically every 15 minutes",
        he: "תוצאות ומטבעות מתעדכנים עכשיו אוטומטית כל 15 דקות",
      },
    ],
  },
  {
    version: "1.5",
    date: "2026-06-18",
    changes: [
      {
        en: "Smarter payouts: underdog picks pay more, plus a Match of the Day bonus",
        he: "תשלומים חכמים יותר: ניחושי אנדרדוג משלמים יותר, ובנוסף בונוס משחק היום",
      },
      { en: "Mini-games: Daily Spin and Beat the Crowd", he: "מיני-משחקים: סיבוב יומי ו'נצח את הקהל'" },
      {
        en: "My Log tab with your record and coins won/lost per game",
        he: "לשונית 'יומן שלי' עם המאזן שלכם ומטבעות שזכיתם/הפסדתם בכל משחק",
      },
      {
        en: "Place one of each bet type on the same match",
        he: "אפשר להניח הימור אחד מכל סוג על אותו משחק",
      },
    ],
  },
  {
    version: "1.4",
    date: "2026-06-18",
    changes: [
      { en: "New blue theme", he: "ערכת צבעים כחולה חדשה" },
      { en: "Two games per row on bigger screens", he: "שני משחקים בשורה במסכים גדולים" },
      { en: "Competition filters and a shorter match list", he: "מסנני ליגות ורשימת משחקים קצרה יותר" },
      { en: "Leaderboard moved to the top", he: "הטבלה הועברה לראש העמוד" },
    ],
  },
  {
    version: "1.3",
    date: "2026-06-18",
    changes: [
      {
        en: "Username + password login that works on any device",
        he: "התחברות עם שם משתמש וסיסמה שעובדת בכל מכשיר",
      },
    ],
  },
  {
    version: "1.2",
    date: "2026-06-18",
    changes: [
      {
        en: "“Who's betting?” — see everyone's picks and the Home/Draw/Away split",
        he: "«מי מהמר?» — ראו את הניחושים של כולם ואת הפילוח בית/תיקו/חוץ",
      },
    ],
  },
  {
    version: "1.1",
    date: "2026-06-18",
    changes: [
      { en: "Half-time leader and 3+ goals bets", he: "הימורים על מוביל במחצית ועל 3+ גולים" },
      { en: "Team flags and logos", he: "דגלים וסמלים של קבוצות" },
      { en: "Edit or cancel a bet before kickoff", he: "עריכה או ביטול של הימור לפני תחילת המשחק" },
    ],
  },
  {
    version: "1.0",
    date: "2026-06-18",
    changes: [
      {
        en: "Launch: predict real matches, win coins, climb the leaderboard",
        he: "השקה: נחשו משחקים אמיתיים, זכו במטבעות, טפסו בטבלה",
      },
      { en: "1,000 starting coins and a shareable link", he: "1,000 מטבעות התחלה וקישור לשיתוף" },
    ],
  },
];
