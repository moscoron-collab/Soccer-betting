"use client";

// Bilingual (English / Hebrew) support. One dictionary is the single source of
// truth; components read strings through the `t()` helper from `useLang()`.
// Hebrew is right-to-left, so the provider also flips <html dir> to "rtl".

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "he";

const STORAGE_KEY = "spg_lang";

// Flat key -> { en, he }. Use {tokens} for interpolation (see translate()).
const DICT: Record<string, { en: string; he: string }> = {
  // Common / shared
  "common.close": { en: "Close", he: "סגירה" },
  "common.ok": { en: "OK", he: "אישור" },
  "common.tryAgain": { en: "Try again.", he: "נסו שוב." },
  "common.loading": { en: "Loading…", he: "טוען…" },
  "common.yes": { en: "Yes", he: "כן" },
  "common.no": { en: "No", he: "לא" },
  "common.draw": { en: "Draw", he: "תיקו" },
  "common.home": { en: "Home", he: "בית" },
  "common.away": { en: "Away", he: "חוץ" },
  "common.vs": { en: "vs", he: "נגד" },
  "common.match": { en: "Match", he: "משחק" },
  "common.pending": { en: "Pending", he: "ממתין" },
  "common.won": { en: "Won", he: "זכייה" },
  "common.lost": { en: "Lost", he: "הפסד" },

  // Language toggle (shows the OTHER language you can switch to)
  "lang.switch": { en: "🇮🇱 עברית", he: "🇬🇧 EN" },

  // Auth screen
  "app.title": { en: "⚽ Soccer Predictor", he: "⚽ חיזוי כדורגל" },
  "app.tagline": {
    en: "Predict real matches. Win coins. Top the leaderboard.",
    he: "נחשו תוצאות אמיתיות. צברו מטבעות. עלו לראש הטבלה.",
  },
  "auth.login": { en: "Log in", he: "התחברות" },
  "auth.newPlayer": { en: "New player", he: "שחקן חדש" },
  "auth.username": { en: "Username", he: "שם משתמש" },
  "auth.usernamePlaceholder": { en: "e.g. GoalMachine", he: "למשל GoalMachine" },
  "auth.password": { en: "Password", he: "סיסמה" },
  "auth.passwordChoose": { en: "choose a password", he: "בחרו סיסמה" },
  "auth.passwordYour": { en: "your password", he: "הסיסמה שלכם" },
  "auth.start": { en: "Start playing (1,000 coins)", he: "התחילו לשחק (1,000 מטבעות)" },
  "auth.somethingWrong": { en: "Something went wrong.", he: "משהו השתבש." },
  "auth.loginHint": {
    en: "New here? Tap “New player” above to create an account.",
    he: "חדשים כאן? לחצו על «שחקן חדש» למעלה כדי ליצור חשבון.",
  },
  "auth.signupHint": {
    en: "Pick any username + password. Use the same ones to log in on your phone.",
    he: "בחרו שם משתמש וסיסמה. השתמשו באותם פרטים כדי להתחבר מהטלפון.",
  },
  "auth.footer": {
    en: "Free to play • Virtual coins only • No real money",
    he: "חינם לחלוטין • מטבעות וירטואליים בלבד • בלי כסף אמיתי",
  },

  // New-player welcome (shown once, right after signup)
  "welcomeNew.title": { en: "Welcome, {name}! 🎉", he: "ברוכים הבאים, {name}! 🎉" },
  "welcomeNew.subtitle": {
    en: "You've joined the Soccer Prediction Game.",
    he: "הצטרפתם למשחק חיזוי הכדורגל.",
  },
  "welcomeNew.coins": {
    en: "You start with 🪙1,000 coins — here's how to play:",
    he: "אתם מתחילים עם 🪙1,000 מטבעות — ככה משחקים:",
  },
  "welcomeNew.tip1": {
    en: "🔮 Predict real matches to win coins.",
    he: "🔮 נחשו תוצאות של משחקים אמיתיים כדי לזכות במטבעות.",
  },
  "welcomeNew.tip2": {
    en: "🎡 Spin the wheel every day for prizes and power-ups.",
    he: "🎡 סובבו את הגלגל כל יום לפרסים וכוחות-על.",
  },
  "welcomeNew.tip3": {
    en: "🏆 Climb the leaderboard and beat your friends!",
    he: "🏆 טפסו בטבלה ונצחו את החברים!",
  },
  "welcomeNew.start": { en: "Let's play! ⚽", he: "בואו נשחק! ⚽" },

  // Warm-welcome coin gift
  "gift.title": { en: "🎁 Warm welcome!", he: "🎁 ברוכים הבאים!" },
  "gift.body": {
    en: "Here's 🪙500 for joining and playing — have fun!",
    he: "קבלו 🪙500 על ההצטרפות וההשתתפות — תיהנו!",
  },
  "gift.ok": { en: "Thanks! 🎉", he: "תודה! 🎉" },

  "photo.view": { en: "View photo", he: "צפו בתמונה" },

  // Join date / new-player badge
  "profile.memberSince": { en: "Member since {date}", he: "חבר מאז {date}" },
  "badge.new": { en: "New player", he: "שחקן חדש" },

  // Welcome-back recap
  "welcome.title": { en: "Welcome back!", he: "ברוכים השובים!" },
  "welcome.subtitle": {
    en: "While you were away, your bets settled:",
    he: "בזמן שלא הייתם, ההימורים שלכם הוכרעו:",
  },
  "welcome.wonOne": { en: "✅ Won {n} bet (+🪙{g})", he: "✅ זכיתם ב-{n} הימור (+🪙{g})" },
  "welcome.wonMany": { en: "✅ Won {n} bets (+🪙{g})", he: "✅ זכיתם ב-{n} הימורים (+🪙{g})" },
  "welcome.lostOne": { en: "❌ Lost {n} bet", he: "❌ הפסדתם {n} הימור" },
  "welcome.lostMany": { en: "❌ Lost {n} bets", he: "❌ הפסדתם {n} הימורים" },
  "welcome.net": { en: "Net", he: "סך הכול" },
  "welcome.go": { en: "Let's go! 🚀", he: "קדימה! 🚀" },
  "welcome.liveWin": { en: "🎉 You won 🪙{g}!", he: "🎉 זכיתם ב-🪙{g}!" },

  // Game header / shell
  "game.playingAs": { en: "Playing as", he: "משחק בתור" },
  "game.coins": { en: "Coins", he: "מטבעות" },
  "game.inPlay": { en: "{n} in play", he: "{n} בהימור" },
  "game.whatsNew": { en: "What's new", he: "מה חדש" },
  "game.invite": { en: "🔗 Invite a friend", he: "🔗 הזמינו חבר" },
  "game.settings": { en: "⚙️ Profile & settings", he: "⚙️ פרופיל והגדרות" },
  "game.signOut": { en: "Sign out", he: "התנתקות" },
  "game.lowCoins": {
    en: "You're low on coins! Grab a free daily top-up.",
    he: "נגמרים לכם המטבעות! קבלו תוספת יומית חינם.",
  },
  "game.getCoins": { en: "Get 100 coins", he: "קבלו 100 מטבעות" },

  // Daily rewards popup (login bonus + loss cashback)
  "rewards.title": { en: "🎁 Daily rewards", he: "🎁 פרסים יומיים" },
  "rewards.login": {
    en: "Daily login — Day {n}: +🪙{amount}",
    he: "כניסה יומית — יום {n}: +🪙{amount}",
  },
  "rewards.cashback": {
    en: "Loss cashback (15% of yesterday): +🪙{amount}",
    he: "החזר על הפסדים (15% מאתמול): +🪙{amount}",
  },
  "rewards.ok": { en: "Nice! 🎉", he: "מעולה! 🎉" },
  "topup.done": { en: "Topped up! +🪙{amount}", he: "מילאנו! +🪙{amount}" },

  // Low-on-coins helper panel
  "lowcoins.title": {
    en: "Low on coins? Here's how to get more 👇",
    he: "נגמרים המטבעות? ככה משיגים עוד 👇",
  },
  "lowcoins.topup": { en: "🪙 Daily top-up to 500", he: "🪙 מילוי יומי ל-500" },
  "lowcoins.spin": { en: "🎡 Spin the wheel", he: "🎡 סובבו את הגלגל" },
  "lowcoins.penalty": { en: "⚽ Penalty Shootout (up to 🪙500)", he: "⚽ דו-קרב פנדלים (עד 🪙500)" },
  "lowcoins.challenges": { en: "🎯 Daily challenges", he: "🎯 אתגרים יומיים" },
  "lowcoins.loginHint": {
    en: "🔥 Open the app every day for a growing login bonus",
    he: "🔥 היכנסו כל יום לבונוס כניסה שהולך וגדל",
  },
  "lowcoins.cashbackHint": {
    en: "💸 You automatically get 15% of your daily losses back",
    he: "💸 אתם מקבלים אוטומטית 15% מההפסדים היומיים בחזרה",
  },
  "game.tabPlay": { en: "🎮 Play", he: "🎮 משחק" },
  "game.tabLog": { en: "📊 My Log", he: "📊 היומן שלי" },
  "game.tabBracket": { en: "🏆 Road to Final", he: "🏆 הדרך לגמר" },
  "game.new": { en: "NEW", he: "חדש" },

  // Road to the Final — knockout bracket tab (read-only, live results)
  "rtf.title": { en: "Road to the Final", he: "הדרך לגמר" },
  "rtf.subtitle": { en: "2026 World Cup knockouts", he: "נוקאאוט מונדיאל 2026" },
  "rtf.r32": { en: "Round of 32", he: "שלב ה-32" },
  "rtf.r16": { en: "Round of 16", he: "שמינית הגמר" },
  "rtf.qf": { en: "Quarter-finals", he: "רבע גמר" },
  "rtf.sf": { en: "Semi-finals", he: "חצי גמר" },
  "rtf.final": { en: "Final", he: "הגמר" },
  "rtf.thirdPlace": { en: "3rd place", he: "מקום שלישי" },
  "rtf.champion": { en: "Champion", he: "אלופה" },
  "rtf.tbd": { en: "TBD", he: "ייקבע" },
  "rtf.live": { en: "● LIVE", he: "● שידור חי" },
  "rtf.scrollHint": { en: "← swipe to see the whole bracket →", he: "← החליקו לצדדים לכל העץ →" },
  "rtf.empty": {
    en: "The bracket lights up once the World Cup knockout fixtures are in. Check back soon!",
    he: "העץ יתמלא ברגע שמשחקי הנוקאאוט של המונדיאל ייכנסו. חזרו בקרוב!",
  },
  // Hint under the tabs explaining the Play dot when it's lit by unclaimed challenge
  // rewards (so it doesn't read as "more games to play"). Taps through to the challenges.
  "game.goClaim": { en: "🎁 Go claim your reward! →", he: "🎁 לכו לאסוף את הפרס! ←" },
  "game.leaderboard": { en: "🏆 Leaderboard", he: "🏆 טבלת מובילים" },
  "game.refresh": { en: "↻ Refresh", he: "↻ רענון" },
  "game.refreshing": { en: "↻ Refreshing…", he: "↻ מרענן…" },
  "game.viewLog": { en: "View {name}'s log", he: "צפו ביומן של {name}" },
  "game.myPredictions": { en: "My predictions", he: "התחזיות שלי" },
  "game.noActiveBets": {
    en: "No active bets right now. Pick a match below! (Finished bets are in 📊 My Log.)",
    he: "אין כרגע הימורים פעילים. בחרו משחק למטה! (הימורים שהסתיימו נמצאים ב-📊 היומן שלי.)",
  },
  "game.dailyChallenges": { en: "🎯 Daily challenges", he: "🎯 אתגרים יומיים" },
  "game.miniGames": { en: "🎮 Mini-games", he: "🎮 מיני-משחקים" },
  "game.upcoming": { en: "Upcoming matches", he: "משחקים קרובים" },
  "game.noMatches": {
    en: "No open matches right now. Check back soon — new fixtures load automatically.",
    he: "אין משחקים פתוחים כרגע. חזרו עוד מעט — משחקים חדשים נטענים אוטומטית.",
  },
  "game.showMore": { en: "Show more ({n} more)", he: "הצגת עוד ({n} נוספים)" },
  "game.footer": {
    en: "Free to play • Virtual coins only • No real money gambling",
    he: "חינם לחלוטין • מטבעות וירטואליים בלבד • בלי הימורים בכסף אמיתי",
  },
  "game.updated": { en: "Updated!", he: "עודכן!" },
  "game.all": { en: "All", he: "הכול" },
  "share.text": {
    en: "Play the Soccer Prediction Game with me! ⚽",
    he: "בואו לשחק איתי במשחק חיזוי הכדורגל! ⚽",
  },
  "share.copied": { en: "Link copied! Send it to your friends.", he: "הקישור הועתק! שלחו אותו לחברים." },

  // Chat
  "chat.title": { en: "💬 Chat", he: "💬 צ'אט" },
  "chat.placeholder": { en: "Write a message…", he: "כתבו הודעה…" },
  "chat.send": { en: "Send", he: "שליחה" },
  "chat.empty": { en: "No messages yet. Say hi! 👋", he: "אין עדיין הודעות. תגידו שלום! 👋" },
  "chat.rules": {
    en: "Be kind to each other. No links or phone numbers.",
    he: "להיות נחמדים אחד לשני. בלי קישורים או מספרי טלפון.",
  },
  "chat.delete": { en: "Delete", he: "מחיקה" },
  "chat.joined": { en: "👋 Everyone welcome {name}!", he: "👋 כולם, קבלו את {name}!" },
  "chat.errEmpty": { en: "Type a message first.", he: "הקלידו הודעה קודם." },
  "chat.errLong": { en: "Message too long (max 200).", he: "ההודעה ארוכה מדי (עד 200)." },
  "chat.errLinks": {
    en: "Links and phone numbers aren't allowed.",
    he: "קישורים ומספרי טלפון אסורים.",
  },
  "chat.errRate": { en: "Slow down a moment 🙂", he: "רגע, לאט יותר 🙂" },
  "chat.errSend": { en: "Couldn't send. Try again.", he: "השליחה נכשלה. נסו שוב." },

  // Settings modal
  "settings.profilePic": { en: "Profile picture", he: "תמונת פרופיל" },
  "settings.upload": { en: "Upload your own photo", he: "העלו תמונה משלכם" },
  "settings.pickEmoji": { en: "Or pick an emoji", he: "או בחרו אימוג'י" },
  "settings.removePic": { en: "Remove picture", he: "הסרת תמונה" },
  "settings.hideTitle": { en: "Hide my picks from others", he: "הסתרת הניחושים שלי מאחרים" },
  "settings.hideDesc": {
    en: "When on, other players can't see your picks until a match kicks off.",
    he: "כשמופעל, שחקנים אחרים לא יראו את הניחושים שלכם עד שהמשחק מתחיל.",
  },
  "settings.saving": { en: "Saving…", he: "שומר…" },
  "settings.save": { en: "Save", he: "שמירה" },
  "settings.errImage": { en: "Please choose an image file.", he: "אנא בחרו קובץ תמונה." },
  "settings.errRead": { en: "Could not read that image.", he: "לא הצלחנו לקרוא את התמונה." },
  "settings.errSave": { en: "Could not save.", he: "השמירה נכשלה." },

  // Player log modal
  "playerLog.title": { en: "Player log", he: "יומן שחקן" },
  "playerLog.errLoad": { en: "Could not load player.", he: "לא הצלחנו לטעון את השחקן." },
  "playerLog.coins": { en: "🪙 {coins}", he: "🪙 {coins}" },
  "playerLog.record": {
    en: "🪙 {coins} · ✅ {w} W · ❌ {l} L",
    he: "🪙 {coins} · ✅ {w} נצ' · ❌ {l} הפ'",
  },
  "playerLog.hides": {
    en: "🙈 This player hides their upcoming picks until kickoff.",
    he: "🙈 השחקן הזה מסתיר את הניחושים הקרובים שלו עד תחילת המשחק.",
  },
  "playerLog.noBets": { en: "No bets to show.", he: "אין הימורים להצגה." },

  // Coin loans (lend to a friend, manual repay)
  "loan.lendTitle": { en: "🤝 Lend coins to {name}", he: "🤝 הלוואת מטבעות ל-{name}" },
  "loan.amountPlaceholder": { en: "Amount", he: "סכום" },
  "loan.lendBtn": { en: "Lend", he: "הלוואה" },
  "loan.sending": { en: "Sending…", he: "שולח…" },
  "loan.sent": { en: "Sent 🪙{amount} to {name}!", he: "נשלחו 🪙{amount} ל-{name}!" },
  "loan.tooSmall": { en: "Loans start at 🪙{min}.", he: "הלוואות מתחילות מ-🪙{min}." },
  "loan.errGeneric": { en: "Could not send the loan. Try again.", he: "לא הצלחנו לשלוח את ההלוואה. נסו שוב." },
  "loan.panelTitle": { en: "🤝 Loans", he: "🤝 הלוואות" },
  "loan.oweLine": { en: "You owe 🪙{amount} to {name}", he: "אתם חייבים 🪙{amount} ל-{name}" },
  "loan.owedToMeLine": { en: "{name} owes you 🪙{amount}", he: "{name} חייב/ת לכם 🪙{amount}" },
  "loan.repayBtn": { en: "Repay", he: "החזר" },
  "loan.repaying": { en: "Repaying…", he: "מחזיר…" },
  "loan.repaidToast": { en: "Loan repaid — 🪙{amount} sent back!", he: "ההלוואה הוחזרה — נשלחו 🪙{amount}!" },
  "loan.historyTitle": { en: "History", he: "היסטוריה" },
  "loan.repaidOweLine": { en: "You repaid 🪙{amount} to {name}", he: "החזרתם 🪙{amount} ל-{name}" },
  "loan.repaidOwedToMeLine": { en: "{name} repaid you 🪙{amount}", he: "{name} החזיר/ה לכם 🪙{amount}" },

  // Changelog
  "changelog.title": { en: "🆕 What's new", he: "🆕 מה חדש" },

  // My Log
  "mylog.level": { en: "Level {n}", he: "רמה {n}" },
  "mylog.winStreak": { en: "🔥 {n} win streak", he: "🔥 רצף {n} נצחונות" },
  "mylog.xp": { en: "XP", he: "נק' ניסיון" },
  "mylog.xpToNext": { en: "{n}/100 XP to next level", he: "{n}/100 נק' לרמה הבאה" },
  "mylog.wins": { en: "Wins", he: "נצחונות" },
  "mylog.losses": { en: "Losses", he: "הפסדים" },
  "mylog.winRate": { en: "Win rate", he: "אחוז ניצחון" },
  "mylog.netCoins": { en: "Net coins", he: "מאזן מטבעות" },
  "mylog.badges": { en: "🏅 Badges & rewards", he: "🏅 הישגים ופרסים" },
  "mylog.history": { en: "History", he: "היסטוריה" },
  "mylog.pendingEmpty": {
    en: "Your bets are still pending — results show here once matches finish.",
    he: "ההימורים שלכם עדיין ממתינים — התוצאות יופיעו כאן כשהמשחקים יסתיימו.",
  },
  "mylog.noFinished": {
    en: "No finished bets yet. Place some predictions!",
    he: "אין עדיין הימורים שהסתיימו. בצעו כמה תחזיות!",
  },
  "mylog.staked": { en: "staked {n}", he: "הימור {n}" },

  // Tiers (from levelInfo)
  "tier.legend": { en: "Legend", he: "אגדה" },
  "tier.expert": { en: "Expert", he: "מומחה" },
  "tier.scout": { en: "Scout", he: "סייר" },
  "tier.analyst": { en: "Analyst", he: "אנליסט" },
  "tier.rookie": { en: "Rookie", he: "מתחיל" },

  // Daily challenges (keyed by server challenge key)
  "challenge.bet_1": { en: "Place a bet", he: "בצעו הימור" },
  "challenge.spin_1": { en: "Spin the wheel", he: "סובבו את הגלגל" },
  "challenge.penalty_1": { en: "Play the Penalty Shootout", he: "שחקו דו-קרב פנדלים" },
  "challenge.done": { en: "🎯 Challenge done: +🪙{r}!", he: "🎯 אתגר הושלם: +🪙{r}!" },
  "challenge.claimed": { en: "✓ Claimed", he: "✓ נאסף" },
  "challenge.claim": { en: "Claim reward", he: "אספו פרס" },
  "challenge.inProgress": { en: "In progress", he: "בתהליך" },

  // Spin wheel
  "spin.title": { en: "🎡 Spin the Wheel", he: "🎡 סובבו את הגלגל" },
  "spin.desc": {
    en: "First spin free daily, then 🪙{cost} each (up to {max}/day). Win coins, a jackpot, or power-ups!",
    he: "סיבוב ראשון חינם כל יום, אחר כך 🪙{cost} לסיבוב (עד {max} ביום). זכו במטבעות, ג'קפוט או כוחות-על!",
  },
  "spin.spinning": { en: "Spinning…", he: "מסתובב…" },
  "spin.noSpins": { en: "No spins left today", he: "אין עוד סיבובים היום" },
  "spin.free": { en: "Spin now 🎡 (free)", he: "סובבו עכשיו 🎡 (חינם)" },
  "spin.again": { en: "Spin again 🎡 (🪙{cost})", he: "סובבו שוב 🎡 (🪙{cost})" },
  "spin.need": { en: "Need 🪙{cost} to spin", he: "צריך 🪙{cost} כדי לסובב" },
  "spin.leftOne": { en: "{n} spin left today", he: "נשאר {n} סיבוב היום" },
  "spin.leftMany": { en: "{n} spins left today", he: "נשארו {n} סיבובים היום" },
  "spin.comeback": { en: "Come back tomorrow", he: "חזרו מחר" },
  "spin.comebackTitle": { en: "🌱 Comeback Wheel", he: "🌱 גלגל הקאמבאק" },
  "spin.comebackDesc": {
    en: "You're near the bottom — here are 5 FREE daily catch-up spins with bigger prizes and no 'no win'. Climb back in!",
    he: "אתם קרובים לתחתית — הנה 5 סיבובי קאמבאק יומיים חינם עם פרסים גדולים יותר ובלי 'אין זכייה'. טפסו בחזרה!",
  },
  "spin.comebackPreviewDesc": {
    en: "👀 Admin preview — these spins are a demo and WON'T change your coins or use a spin. Tick 'Comeback Wheel live' in ⚙️ to launch it for players.",
    he: "👀 תצוגה מקדימה למנהל — הסיבובים האלה הם הדגמה ולא ישנו את המטבעות שלכם ולא ינצלו סיבוב. סמנו 'גלגל הקאמבאק פעיל' ב-⚙️ כדי להפעיל לשחקנים.",
  },
  "comebackAlert.title": { en: "🌱 You've got a Comeback Wheel!", he: "🌱 יש לכם גלגל קאמבאק!" },
  "comebackAlert.body": {
    en: "You've slipped near the bottom of the table — but here's your way back: 5 FREE daily spins that pay DOUBLE, just for you. Catch up fast!",
    he: "צנחתם לתחתית הטבלה — אבל הנה הדרך שלכם בחזרה: 5 סיבובים יומיים חינם שמשלמים פי שניים, רק בשבילכם. טפסו מהר!",
  },
  "comebackAlert.cta": { en: "Spin now →", he: "סובבו עכשיו ←" },
  "comebackAlert.preview": { en: "admin preview", he: "תצוגה מקדימה" },
  "comebackAlert.pill": { en: "🌱 Comeback Wheel", he: "🌱 גלגל הקאמבאק" },
  "comebackAlert.close": { en: "Hide", he: "הסתר" },
  "spin.boosts": { en: "⚡ 2× boosts:", he: "⚡ הכפלות 2×:" },
  "spin.shields": { en: "🛡️ shields:", he: "🛡️ מגנים:" },
  "spin.freeBets": { en: "🎟️ free bets:", he: "🎟️ הימורי חינם:" },

  // Wheel slice labels
  "wheel.noWin": { en: "No win", he: "אין זכייה" },
  "wheel.boost": { en: "2× Boost", he: "בוסט 2×" },
  "wheel.shield": { en: "Shield", he: "מגן" },
  "wheel.jackpot": { en: "up to 2K", he: "עד 2K" },
  "wheel.freebet": { en: "Free bet", he: "הימור חינם" },
  "wheel.gain": { en: "Gain {pct}%", he: "רווח {pct}%" },
  "wheel.lose": { en: "Lose {pct}%", he: "הפסד {pct}%" },

  // Prize toasts
  "prize.boost": { en: "⚡ {n} × 2× payout power-up!", he: "⚡ {n} × כוח הכפלת זכייה 2×!" },
  "prize.shield": { en: "🛡️ {n} × streak shield!", he: "🛡️ {n} × מגן רצף!" },
  "prize.jackpot": { en: "💰 JACKPOT! +🪙{n}", he: "💰 ג'קפוט! +🪙{n}" },
  "prize.freebet": { en: "🎟️ {n} × free bet token!", he: "🎟️ {n} × אסימון הימור חינם!" },
  "prize.noWin": {
    en: "😬 No win this time — try another spin!",
    he: "😬 אין זכייה הפעם — נסו סיבוב נוסף!",
  },
  "prize.coins": { en: "🪙 +{n} coins", he: "🪙 +{n} מטבעות" },
  "prize.gain": { en: "📈 +{pct}% — +🪙{n} coins!", he: "📈 +{pct}% — +🪙{n} מטבעות!" },
  "prize.lose": { en: "📉 −{pct}% — −🪙{n} coins", he: "📉 −{pct}% — −🪙{n} מטבעות" },

  // "Spin before you bet" gate (regular wheel only)
  "gate.title": { en: "Use all your spins to unlock betting", he: "נצלו את כל הסיבובים כדי לפתוח הימורים" },
  "gate.desc": {
    en: "Use up all of today's spins first — then you can place bets today.",
    he: "נצלו קודם את כל הסיבובים של היום — ואז תוכלו להמר היום.",
  },
  "gate.cta": { en: "Spin now", he: "לסובב עכשיו" },
  "gate.card": { en: "Use all today's spins first to bet", he: "נצלו קודם את כל הסיבובים של היום כדי להמר" },

  // Penalty shootout
  "penalty.title": { en: "⚽ Penalty Shootout", he: "⚽ דו-קרב פנדלים" },
  "penalty.desc": {
    en: "Tap Shoot when the ball lines up with the goal. 5 shots, 🪙100 each.",
    he: "לחצו «בעיטה» כשהכדור מיושר עם השער. 5 בעיטות, 🪙100 כל אחת.",
  },
  "penalty.comeback": { en: "Come back tomorrow ⚽", he: "חזרו מחר ⚽" },
  "penalty.play": { en: "Play", he: "שחקו" },
  "penalty.goal": { en: "⚽ GOAL!", he: "⚽ גול!" },
  "penalty.saved": { en: "🧤 Saved!", he: "🧤 הודף!" },
  "penalty.shotLine": { en: "Shot {n}/5 · Goals {g}", he: "בעיטה {n}/5 · גולים {g}" },
  "penalty.shoot": { en: "Shoot ⚽", he: "בעיטה ⚽" },
  "penalty.result": { en: "{g}/5 goals · +🪙{r}", he: "{g}/5 גולים · +🪙{r}" },
  "penalty.celebrate": { en: "⚽ {g}/5 — +🪙{r}!", he: "⚽ {g}/5 — +🪙{r}!" },

  // Achievements (keyed by server achievement key)
  "ach.first_win": { en: "First Win", he: "ניצחון ראשון" },
  "ach.wins_10": { en: "10 Wins", he: "10 ניצחונות" },
  "ach.wins_50": { en: "50 Wins", he: "50 ניצחונות" },
  "ach.exact_master": { en: "Exact Master", he: "מלך התוצאה המדויקת" },
  "ach.streak_5": { en: "5 Win Streak", he: "רצף 5 ניצחונות" },
  "ach.coins_5k": { en: "5,000 Coins", he: "5,000 מטבעות" },
  "ach.coins_25k": { en: "25,000 Coins", he: "25,000 מטבעות" },
  "ach.level_10": { en: "Reach Level 10", he: "הגיעו לרמה 10" },
  "ach.reward": { en: "🏅 Badge reward: +🪙{r}!", he: "🏅 פרס הישג: +🪙{r}!" },
  "ach.claim": { en: "Claim", he: "אספו" },
  "ach.claimed": { en: "✓ Claimed", he: "✓ נאסף" },
  "ach.locked": { en: "Locked", he: "נעול" },

  // describeCall (bet summaries)
  "call.winner": { en: "Winner: {side}", he: "מנצח: {side}" },
  "call.halftime": { en: "Half-time leader: {side}", he: "מוביל במחצית: {side}" },
  "call.goals3": { en: "3+ goals: {yn}", he: "3+ גולים: {yn}" },
  "call.btts": { en: "Both teams score: {yn}", he: "שתי הקבוצות כובשות: {yn}" },
  "call.totals": { en: "Total goals: {pick}", he: "סך הגולים: {pick}" },
  "call.exact": { en: "Exact score: {h}–{a}", he: "תוצאה מדויקת: {h}–{a}" },

  // Bet markets
  "bet.WINNER": { en: "Winner / Draw", he: "מנצח / תיקו" },
  "bet.EXACT": { en: "Exact score", he: "תוצאה מדויקת" },
  "bet.HALFTIME": { en: "Half-time leader", he: "מוביל במחצית" },
  "bet.GOALS3": { en: "3+ goals", he: "3+ גולים" },
  "bet.BTTS": { en: "Both teams score", he: "שתי הקבוצות כובשות" },
  "bet.TOTALS": { en: "Total goals", he: "סך הגולים" },
  "prompt.WINNER": { en: "Who wins the match?", he: "מי ינצח במשחק?" },
  "prompt.EXACT": { en: "Guess the exact final score", he: "נחשו את התוצאה הסופית המדויקת" },
  "prompt.HALFTIME": { en: "Who's leading at half-time?", he: "מי מוביל במחצית?" },
  "prompt.GOALS3": { en: "Will there be 3 or more goals?", he: "האם יהיו 3 גולים או יותר?" },
  "prompt.BTTS": { en: "Will both teams score?", he: "האם שתי הקבוצות יכבשו?" },
  "prompt.TOTALS": {
    en: "How many goals in total (both teams)?",
    he: "כמה גולים בסך הכול (שתי הקבוצות)?",
  },

  // Bet form
  "form.yes3": { en: "Yes, 3+", he: "כן, 3+" },
  "form.under3": { en: "Under 3", he: "פחות מ-3" },
  "form.bet": { en: "Bet", he: "הימור" },
  "form.coins": { en: "coins", he: "מטבעות" },
  "form.useBoost": { en: "⚡ Use a 2× payout power-up", he: "⚡ השתמשו בכוח הכפלת זכייה 2×" },
  "form.boostLeft": { en: "({n} left)", he: "(נשארו {n})" },
  "form.useFreeBet": {
    en: "🎟️ Use a free bet token (🪙{stake} on the house)",
    he: "🎟️ השתמשו באסימון הימור חינם (🪙{stake} על חשבון הבית)",
  },
  "form.freeBetLeft": { en: "({n} left)", he: "(נשארו {n})" },
  "form.ifCorrect": { en: "→ If correct, you win 🪙{n}", he: "→ אם צדקתם, תזכו ב-🪙{n}" },
  "form.unpopular": {
    en: "(unpopular picks win even more)",
    he: "(ניחושים לא פופולריים מזכים בעוד יותר)",
  },
  "form.predict": { en: "Predict", he: "נחשו" },
  "form.save": { en: "Save", he: "שמירה" },
  "form.knockout": {
    en: "⚔️ Knockout — no draw. A tie is decided in extra time & penalties.",
    he: "⚔️ נוקאאוט — אין תיקו. שוויון מוכרע בהארכה ובפנדלים.",
  },

  // Bet editor
  "editor.confirm": {
    en: "Cancel this bet and get your coins back?",
    he: "לבטל את ההימור ולקבל את המטבעות בחזרה?",
  },
  "editor.edit": { en: "✏️ Edit", he: "✏️ עריכה" },
  "editor.cancel": { en: "🗑 Cancel / Undo", he: "🗑 ביטול" },
  "editor.errUpdate": { en: "Could not update bet.", he: "לא הצלחנו לעדכן את ההימור." },

  // Match card
  "card.motd": {
    en: "⭐ Game of the Day — winning bets get a bonus!",
    he: "⭐ משחק היום — הימורים מנצחים מקבלים בונוס!",
  },
  "card.featured": {
    en: "⭐ Game of the Day — pays {mult}×!",
    he: "⭐ משחק היום — משלם {mult}×!",
  },
  "card.tip": {
    en: "💡 Place a bet on each option — backing the unpopular pick pays an underdog bonus.",
    he: "💡 הימרו על כל אפשרות — תמיכה בניחוש הפחות פופולרי מזכה בבונוס מאנדרדוג.",
  },
  "card.yourBet": { en: "✅ Your bet:", he: "✅ ההימור שלכם:" },
  "card.couldWin": { en: "Could win 🪙{n} ({mult})", he: "אפשר לזכות ב-🪙{n} ({mult})" },
  "card.placed": { en: "Bet placed ✅", he: "ההימור בוצע ✅" },
  "card.errPlace": { en: "Could not place prediction.", he: "לא הצלחנו לבצע את התחזית." },
  "card.open": { en: "Open", he: "פתוח" },
  "card.started": { en: "Started", he: "התחיל" },
  "card.closesAt": { en: "🔒 Betting closes at {time}", he: "🔒 ההימורים נסגרים ב-{time}" },
  "card.lastCall": {
    en: "🔒 Last call — closes in {n} min (at {time})",
    he: "🔒 הזדמנות אחרונה — נסגר בעוד {n} דק׳ (ב-{time})",
  },
  "card.closedAt": {
    en: "🔒 Betting closed — kicked off at {time}",
    he: "🔒 ההימורים נסגרו — המשחק התחיל ב-{time}",
  },
  "card.closedNotice": {
    en: "This match has kicked off — betting is closed.",
    he: "המשחק התחיל — ההימורים סגורים.",
  },
  "card.betLine": {
    en: "Stake {s} · could win 🪙{w} ({mult})",
    he: "הימור {s} · אפשר לזכות ב-🪙{w} ({mult})",
  },

  // Who-wins split
  "who.titleOne": { en: "Who wins? ({n} bet)", he: "מי ינצח? (הימור {n})" },
  "who.titleMany": { en: "Who wins? ({n} bets)", he: "מי ינצח? ({n} הימורים)" },

  // Smart banner (scrolling marquee). Playful tone; EN→EN players, HE→HE players.
  "banner.dHM": { en: "{h}h {m}m", he: "{h} שע׳ {m} דק׳" },
  "banner.dM": { en: "{m}m", he: "{m} דק׳" },
  "banner.dDH": { en: "{d}d {h}h", he: "{d} ימים {h} שע׳" },
  "banner.kickoffIn": {
    en: "⏰ {home} vs {away} — kicks off in {time}",
    he: "⏰ {home} נגד {away} — בעוד {time}",
  },
  "banner.locksIn": {
    en: "🔒 Last call! {home} vs {away} locks in {n} min",
    he: "🔒 הזדמנות אחרונה! {home} נגד {away} ננעל בעוד {n} דק׳",
  },
  "banner.live": { en: "🔴 LIVE: {home} {hs}–{as} {away}", he: "🔴 חי: {home} {hs}–{as} {away}" },
  "banner.fullTime": { en: "✅ Full time: {home} {hs}–{as} {away}", he: "✅ סיום: {home} {hs}–{as} {away}" },
  "banner.motdIn": {
    en: "⭐ Game of the Day: {home} vs {away} — kicks off in {time}",
    he: "⭐ משחק היום: {home} נגד {away} — בעוד {time}",
  },
  "banner.motdLive": {
    en: "⭐ Game of the Day LIVE: {home} {hs}–{as} {away}",
    he: "⭐ משחק היום חי: {home} {hs}–{as} {away}",
  },
  "banner.motdFt": {
    en: "⭐ Game of the Day: {home} {hs}–{as} {away} (full time)",
    he: "⭐ משחק היום: {home} {hs}–{as} {away} (סיום)",
  },
  "banner.motd": { en: "⭐ Game of the Day: {home} vs {away}", he: "⭐ משחק היום: {home} נגד {away}" },
  "banner.eventOn": {
    en: "🔥 {name} is ON — Game of the Day pays {mult}×!",
    he: "🔥 {name} פעיל — משחק היום משלם {mult}×!",
  },
  "banner.featured": {
    en: "⭐ Game of the Day: {home} vs {away} — pays {mult}×",
    he: "⭐ משחק היום: {home} נגד {away} — משלם {mult}×",
  },
  "banner.jackpot": {
    en: "💰 Spin the Wheel and hit the 🪙{amount} jackpot!",
    he: "💰 סובבו את הגלגל ותפסו את הג׳קפוט של 🪙{amount}!",
  },
  "banner.biggestBet": {
    en: "💸 Highest bet: {name} staked 🪙{amount} on {team}!",
    he: "💸 ההימור הגדול: {name} הימר 🪙{amount} על {team}!",
  },
  "banner.top3": {
    en: "🏆 Top 3: 1) {a} · 2) {b} · 3) {c}",
    he: "🏆 שלושת המובילים: 1) {a} · 2) {b} · 3) {c}",
  },
  "banner.climber": {
    en: "🚀 Biggest climber: {name} jumped from #{from} to #{to}!",
    he: "🚀 הזינוק הגדול: {name} עלה ממקום #{from} למקום #{to}!",
  },
  "banner.pays": { en: "Winner pays {mult}×!", he: "מנצח משלם {mult}×!" },
  "banner.biggestWin": {
    en: "🏆 Biggest win: {name} turned 🪙{stake} into 🪙{payout}!",
    he: "🏆 הזכייה הגדולה: {name} הפך 🪙{stake} ל-🪙{payout}!",
  },
  "banner.biggestLoss": {
    en: "💥 Ouch of the day: {name} dropped 🪙{amount} on {team}! 😅",
    he: "💥 האאוץ׳ של היום: {name} הפסיד 🪙{amount} על {team}! 😅",
  },
  "banner.top": { en: "👑 Top of the table: {name} — 🪙{networth}", he: "👑 בראש הטבלה: {name} — 🪙{networth}" },
  "banner.tight": {
    en: "🔥 Just 🪙{gap} between #1 and #2 — neck and neck!",
    he: "🔥 רק 🪙{gap} בין הראשון לשני — צמוד!",
  },
  "banner.winRate": {
    en: "🎯 {name} is on fire — {pct}% win rate ({won}/{total})!",
    he: "🎯 {name} בכושר מעולה — {pct}% הצלחה ({won}/{total})!",
  },
  "banner.mover": {
    en: "📈 {name} is surging — up 🪙{amount} in 2 days!",
    he: "📈 {name} בזינוק — עלייה של 🪙{amount} ביומיים!",
  },
  "banner.faller": {
    en: "📉 Rough patch for {name} — down 🪙{amount} in 2 days",
    he: "📉 תקופה קשה ל-{name} — ירידה של 🪙{amount} ביומיים",
  },
  "banner.bigWin": {
    en: "💰 Cha-ching! {name} won 🪙{payout} on {team}!",
    he: "💰 קצ'ינג! {name} זכה ב-🪙{payout} על {team}!",
  },
  "banner.gainer": {
    en: "📈 {name} is on a heater — up 🪙{amount} today!",
    he: "📈 {name} לוהט — עלייה של 🪙{amount} היום!",
  },
  "banner.rankDrop": {
    en: "📉 {name} is in free-fall — crashed from #{from} to #{to}!",
    he: "📉 {name} בנפילה חופשית — צנח מ-#{from} ל-#{to}!",
  },
  "banner.onRopes": {
    en: "😱 {name} is on the ropes — down to just 🪙{coins} after dropping 🪙{lost}!",
    he: "😱 {name} על הקרשים — נשארו רק 🪙{coins} אחרי הפסד של 🪙{lost}!",
  },
  "banner.bigLoss": {
    en: "💸 Ouch! {name} blew 🪙{amount} on {team}!",
    he: "💸 אאוץ'! {name} שרף 🪙{amount} על {team}!",
  },
  "banner.hotStreak": {
    en: "🔥 {name} is on fire — {n} wins in a row!",
    he: "🔥 {name} בוער — {n} ניצחונות ברצף!",
  },
  "banner.coldStreak": {
    en: "❄️ {name} is ice cold — {n} losses straight!",
    he: "❄️ {name} קפוא — {n} הפסדים ברצף!",
  },
  "banner.mostActive": {
    en: "🎯 {name} can't stop betting — {count} bets in 24h!",
    he: "🎯 {name} לא מפסיק להמר — {count} הימורים ב-24 שעות!",
  },
  "banner.rivalry": {
    en: "⚔️ {chaser} is just 🪙{gap} behind {leader} for #{rank}!",
    he: "⚔️ {chaser} במרחק 🪙{gap} בלבד מ-{leader} על מקום #{rank}!",
  },
  "banner.newPlayer": {
    en: "👋 Say hi to {name} — just joined the game!",
    he: "👋 קבלו את {name} — הצטרף/ה עכשיו למשחק!",
  },
  "banner.missedYou": {
    en: "💙 We missed you, {name}! Here's 🪙{gift} — welcome back!",
    he: "💙 התגעגענו, {name}! קבלו 🪙{gift} — ברוכים השובים!",
  },
  "banner.youWon": { en: "✅ You won 🪙{payout} on {team}!", he: "✅ זכית ב-🪙{payout} על {team}!" },
  "banner.yourRank": { en: "📊 You're #{rank} — keep climbing!", he: "📊 אתה במקום #{rank} — תמשיך לטפס!" },
  "banner.freeBet": {
    en: "🎟️ Your free bet is ready — don't waste it!",
    he: "🎟️ הימור החינם שלך מוכן — אל תפספס!",
  },
  "banner.streak": { en: "🔥 {n}-win streak — keep it rolling!", he: "🔥 רצף {n} נצחונות — תמשיך ככה!" },
  "banner.speed": { en: "Scroll speed: {s} (tap to change)", he: "מהירות גלילה: {s} (לחצו לשינוי)" },
  "banner.spd.slow": { en: "Slow", he: "איטי" },
  "banner.spd.normal": { en: "Normal", he: "רגיל" },
  "banner.spd.fast": { en: "Fast", he: "מהיר" },

  // Event admin panel (admins only)
  "admin.title": { en: "⚙️ Event admin", he: "⚙️ ניהול אירוע" },
  "admin.bannerPublic": { en: "Banner visible to everyone", he: "באנר גלוי לכולם" },
  "admin.previewNote": {
    en: "Off = only you (admin) see the banner — preview mode.",
    he: "כבוי = רק אתם (מנהל) רואים את הבאנר — מצב תצוגה.",
  },
  "admin.comebackLive": { en: "🌱 Comeback Wheel live for everyone", he: "🌱 גלגל החזרה פעיל לכולם" },
  "admin.comebackNote": {
    en: "Off = only you (admin) can preview the Comeback Wheel; bottom-30% players still use the regular wheel.",
    he: "כבוי = רק אתם (מנהל) רואים תצוגה מקדימה של גלגל החזרה; שחקני 30% התחתונים עדיין משתמשים בגלגל הרגיל.",
  },
  "admin.eventOn": { en: "Road to the Final event ON", he: "אירוע הדרך לגמר פעיל" },
  "admin.mult": { en: "Default Winner multiplier (×)", he: "מכפיל ברירת מחדל למנצח (×)" },
  "admin.jackpot": { en: "Jackpot amount (🪙)", he: "סכום הג׳קפוט (🪙)" },
  "admin.override": { en: "Game of the Day — set each game's own ×", he: "משחק היום — קבעו מכפיל לכל משחק" },
  "admin.autoPick": { en: "Auto — biggest upcoming game", he: "אוטומטי — המשחק הגדול הקרוב" },
  "admin.eventName": { en: "Event name", he: "שם האירוע" },
  "admin.saved": { en: "Saved ✓", he: "נשמר ✓" },
  "admin.save": { en: "Save", he: "שמירה" },
};

// Look up a key and fill in {token} placeholders.
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>
): string {
  const entry = DICT[key];
  let s = entry ? entry[lang] : key;
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.split(`{${k}}`).join(String(params[k]));
    }
  }
  return s;
}

type LangContextValue = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  // Start "en" on both server and first client render to avoid hydration
  // mismatch; the effect below switches to the saved/auto-detected language.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    const auto: Lang =
      typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("he")
        ? "he"
        : "en";
    setLangState(saved === "en" || saved === "he" ? saved : auto);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  }, [lang]);

  function setLang(l: Lang) {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  const lang = ctx.lang;
  // Stable per-language identity so it's safe in effect/callback deps.
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang]
  );
  return { lang, setLang: ctx.setLang, t };
}
