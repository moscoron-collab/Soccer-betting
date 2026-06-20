// Per-player local-day helpers. Daily features (spin, penalty, top-up) reset at
// each player's local midnight. The client sends its IANA timezone (auto-detected
// from the browser) and the server computes "today" in that zone.

// Returns YYYY-MM-DD for the given date in the given timezone (falls back to UTC).
export function localDate(tz: string | null | undefined, d: Date = new Date()): string {
  if (tz) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
    } catch {
      /* invalid tz -> fall through to UTC */
    }
  }
  return d.toISOString().slice(0, 10);
}

// True if `last` happened on an earlier local day than now (i.e. it's a new day).
export function isNewLocalDay(last: string | null, tz: string | null | undefined): boolean {
  if (!last) return true;
  return localDate(tz, new Date(last)) !== localDate(tz);
}
