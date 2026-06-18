import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soccer Prediction Game",
  description:
    "Predict real soccer matches, win virtual coins, and climb the leaderboard. Free to play, no real money.",
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
