import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "swish — know before you bet",
  description:
    "Screenshot any bet. Get the stats that actually matter — in seconds.",
  openGraph: {
    title: "swish — know before you bet",
    description:
      "Screenshot any bet. Get the stats that actually matter — in seconds.",
    siteName: "swish",
  },
  twitter: {
    card: "summary",
    title: "swish — know before you bet",
    description:
      "Screenshot any bet. Get the stats that actually matter — in seconds.",
  },
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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border/50 px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="swish" className="w-9 h-9 rounded-lg" />
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                swish
              </h1>
            </div>
            <span className="text-muted text-xs sm:text-sm">
              know before you bet
            </span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border/50 px-4 py-4 text-center text-xs text-muted">
          For entertainment only. Not financial advice. Please gamble responsibly.
        </footer>
      </body>
    </html>
  );
}
