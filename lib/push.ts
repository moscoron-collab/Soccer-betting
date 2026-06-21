// Web Push helper: sends phone notifications for new chat messages.
// No-ops safely if the VAPID env vars aren't configured, so the app keeps
// working until push is set up in Vercel.

import webpush from "web-push";
import { supabase } from "./supabase";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:moscoron@gmail.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

// Send a "new chat message" notification to everyone except the sender.
// Best-effort: prunes dead subscriptions, never throws.
export async function sendChatPush(
  senderId: string,
  senderName: string,
  body: string
): Promise<void> {
  if (!ensureConfigured()) return;
  try {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, player_id, p256dh, auth")
      .neq("player_id", senderId);
    if (!subs || subs.length === 0) return;

    const payload = JSON.stringify({
      title: senderName,
      body: body.slice(0, 120),
      tag: "spg-chat",
      url: "/",
    });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
        } catch (err: any) {
          // 404/410 mean the subscription is gone — clean it up.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }
      })
    );
  } catch (err) {
    console.error("[push] sendChatPush", err);
  }
}
