import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://swish-jet.vercel.app"),
  title: "swish - run the bet through the numbers",
  description:
    "Drop a bet screenshot. Real probability, every game log, every matchup angle.",
  applicationName: "swish",
  appleWebApp: {
    capable: true,
    title: "swish",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "swish - run the bet through the numbers",
    description:
      "Drop a bet screenshot. Real probability, every game log, every matchup angle.",
    siteName: "swish",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "swish - run the bet through the numbers",
    description:
      "Drop a bet screenshot. Real probability, every game log, every matchup angle.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
  viewportFit: "cover", // safe-area inset support for iPhone notch / home indicator
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
        <header className="border-b border-border/50 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="swish" className="w-9 h-9 rounded-lg" />
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                swish
              </h1>
            </div>
            <a href="/tonight" className="text-muted text-xs sm:text-sm hover:text-accent transition-colors">
              today's top picks →
            </a>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <SpeedInsights />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
            `,
          }}
        />
        <footer className="border-t border-border/50 px-4 py-4 text-center text-xs text-muted whitespace-nowrap">
          For entertainment only. Not financial advice. Gamble responsibly.
        </footer>
      </body>
    </html>
  );
}
