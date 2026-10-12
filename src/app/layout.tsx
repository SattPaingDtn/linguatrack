import type { Metadata } from "next";
import { ApplicationBoundary } from "@/components/layout/application-boundary";
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
        <ApplicationBoundary>{children}</ApplicationBoundary>
      </body>
    </html>
  );
}
