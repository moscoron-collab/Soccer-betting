"use client";

// Client-side Web Push helpers: register the service worker, ask permission,
// subscribe, and tell the server. iOS only supports this when the site has been
// added to the Home Screen (installed as a PWA).

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushConfigured(): boolean {
  return !!VAPID_PUBLIC;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

// Register the service worker (safe to call repeatedly).
export async function registerSW(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    /* ignore */
  }
}

type EnableResult = "enabled" | "denied" | "unsupported" | "unavailable" | "error";

export async function enablePush(token: string): Promise<EnableResult> {
  if (!pushSupported()) return "unsupported";
  if (!VAPID_PUBLIC) return "unavailable";
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-player-token": token },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok ? "enabled" : "error";
  } catch {
    return "error";
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
