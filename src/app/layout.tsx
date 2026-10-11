import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SessionProvider } from "@/components/progress/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Dashboard · LinguaTrack Academy", template: "%s · LinguaTrack Academy" },
  description:
    "A little English, every day. Learn with Burmese explanations, practical lessons, and thoughtful practice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
