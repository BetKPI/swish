import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Swish — Smart Bet Analysis",
  description:
    "Upload a screenshot of your sports bet and get instant charts, stats, and analytics.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <span className="text-2xl">🏀</span>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-accent">Swish</span>
            </h1>
            <span className="text-muted text-sm hidden sm:inline">
              — smart bet analysis
            </span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
          For entertainment only. Not financial advice. Gamble responsibly.
        </footer>
      </body>
    </html>
  );
}
