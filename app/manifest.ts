import type { MetadataRoute } from "next";

// Web app manifest. Needed so the game can be "installed" to a phone's home
// screen — which on iOS is a hard requirement for Web Push to work at all.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Soccer Prediction Game",
    short_name: "Soccer",
    description:
      "Predict real soccer matches, win virtual coins, and climb the leaderboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1f3a",
    theme_color: "#0b1f3a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
