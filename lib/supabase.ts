import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client using the service-role key.
// NEVER import this into client components — it has full database access.
//
// The client is created lazily (on first use) rather than at import time, so the
// app can be built/imported without env vars present (e.g. during `next build`).

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY env vars."
    );
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false },
    // Force every query to bypass Next.js's fetch Data Cache, so reads (e.g. the
    // leaderboard) are always live and never served from a stale snapshot.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return client;
}

// A proxy so existing `supabase.from(...)` calls keep working, but the underlying
// client isn't constructed until the first property access at request time.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getClient() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
