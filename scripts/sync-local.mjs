// Trigger the sync endpoint locally for testing.
// Usage: npm run sync:local   (reads SYNC_SECRET and a base URL from env)
const base = process.env.SITE_URL || "http://localhost:3000";
const secret = process.env.SYNC_SECRET;

if (!secret) {
  console.error("Set SYNC_SECRET in your environment first.");
  process.exit(1);
}

const res = await fetch(`${base}/api/sync`, {
  headers: { "x-sync-secret": secret },
});
console.log("HTTP", res.status);
console.log(await res.text());
