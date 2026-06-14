/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  src/app/layout.js  — ROOT LAYOUT (Server Component)
 *
 *  Stays a server component so `metadata` keeps working. All interactivity
 *  (sidebar collapse, mobile drawer, theme) lives in <AppShell>, a client
 *  component that wraps every route's page.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "SkipCommand · Ops Console",
  description: "Skip waste rental operations — dispatch, fleet, revenue intelligence",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}