// Shared chat helpers: message validation + a basic kid-safe content filter.
// The audience is children, so the rules lean strict: short messages only, no
// links or phone numbers, and a profanity mask. This is a baseline, not a
// guarantee — moderators can still delete anything.

export const MAX_MESSAGE_LEN = 200;

// How many messages one player may send in a sliding window (anti-spam).
export const RATE_MAX = 6;
export const RATE_WINDOW_MS = 20_000;

// Links and "contact me" patterns we don't want kids sharing.
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|me|co|co\.il|ru|info|xyz)\b)/i;
// 7+ digits (allowing spaces / dashes / +) — catches phone numbers.
const PHONE_RE = /(?:\+?\d[\s-]?){7,}/;

// A small, deliberately conservative profanity list (English + Hebrew). Matched
// case-insensitively as substrings and masked with asterisks. Extend as needed.
const BANNED_WORDS = [
  // English
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy", "cunt",
  "slut", "whore", "fag", "nigger", "retard", "porn", "sex",
  // Hebrew (common slurs / curses)
  "זין", "כוס", "זונה", "מניאק", "בן זונה", "שרמוטה", "תזדיין", "חרא", "מטומטם",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replace banned words with asterisks of the same length.
function maskProfanity(text: string): string {
  let out = text;
  for (const w of BANNED_WORDS) {
    const re = new RegExp(escapeRegExp(w), "gi");
    out = out.replace(re, (m) => "*".repeat(m.length));
  }
  return out;
}

// Pull @mentions out of a message: an "@" followed by 2–20 letters/digits/
// underscores. Returns lowercased, de-duplicated tokens (without the "@"). Note
// this only catches single-token usernames — names with spaces aren't mentionable
// this way. Used to notify/ping mentioned players.
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  const re = /@([\p{L}\p{N}_]{2,20})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1].toLowerCase());
  return [...out];
}

export type CleanResult =
  | { ok: true; text: string }
  | { ok: false; code: "EMPTY" | "TOO_LONG" | "NO_LINKS" };

// Validate + sanitize a raw chat message. Returns a machine-readable code on
// rejection so the client can show a localized error.
export function cleanMessage(raw: unknown): CleanResult {
  if (typeof raw !== "string") return { ok: false, code: "EMPTY" };
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return { ok: false, code: "EMPTY" };
  if (collapsed.length > MAX_MESSAGE_LEN) return { ok: false, code: "TOO_LONG" };
  if (LINK_RE.test(collapsed) || PHONE_RE.test(collapsed)) return { ok: false, code: "NO_LINKS" };
  return { ok: true, text: maskProfanity(collapsed) };
}
