import type { Metadata } from "next";
// JetBrains Mono, bundled with the app (no requests to font CDNs).
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import Motion from "./components/Motion";

export const metadata: Metadata = {
  title: { default: "Shielded Quest — puzzle-gated prizes, private by design", template: "%s · Shielded Quest" },
  description:
    "Hide shielded Zcash behind a riddle. Guesses never leave the solver's browser, anyone can verify the prize, and nobody can see who won. Privacy first: solve puzzles without being known.",
  referrer: "no-referrer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Lets the CSS hide not-yet-revealed elements only when scripts run. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        {children}
        <Motion />
      </body>
    </html>
  );
}
