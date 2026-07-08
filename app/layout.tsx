import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
};

export const metadata: Metadata = {
  title: "Soccer Prediction Game",
  description:
    "Predict real soccer matches, win virtual coins, and climb the leaderboard. Free to play, no real money.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-180.png", // iOS home-screen icon (required for installable PWA)
  },
  appleWebApp: {
    capable: true,
    title: "Soccer",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
