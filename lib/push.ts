// Server-side Web Push: sends notifications to players' phones/browsers even when
// the game is closed. Subscriptions live in `push_subscriptions`; we push to every
// endpoint a player registered and prune the ones the push service reports dead.
//
// Configured entirely from env vars, so if the VAPID keys aren't set (e.g. a local
// dev or preview deploy) every send simply no-ops instead of throwing.
import webpush from "web-push";
import { supabase } from "@/lib/supabase";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:moscoron@gmail.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function pushConfigured(): boolean {
  return !!PUBLIC_KEY && !!PRIVATE_KEY;
}

export function vapidPublicKey(): string {
  return PUBLIC_KEY;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string; // where to go when tapped (defaults to the site root)
  tag?: string; // collapses repeat alerts of the same kind
};

// Fire a push to all of a player's devices. Best-effort and non-throwing: callers
// (gift/reply/chat) must never fail their main action because a push failed.
export async function sendPushToPlayer(playerId: string, payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return;

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("player_id", playerId);
    if (!subs || subs.length === 0) return;

    const body = JSON.stringify(payload);
    const dead: string[] = [];

    await Promise.all(
      subs.map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body
          );
        } catch (err: any) {
          // 404/410 mean the subscription is gone for good — drop it.
          const code = err?.statusCode;
          if (code === 404 || code === 410) dead.push(s.id);
        }
      })
    );

    if (dead.length) {
      await supabase.from("push_subscriptions").delete().in("id", dead);
    }
  } catch {
    // Swallow everything — a broken push must not break the caller.
  }
}
