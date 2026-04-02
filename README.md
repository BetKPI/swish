# Swish — Smart Bet Analysis

Upload a screenshot of your sports bet and get instant charts, stats, and analytics — like doing stock research before placing a bet.

## Features

- **Screenshot upload** — Drag-and-drop or click to upload from any sportsbook
- **AI bet extraction** — Claude Vision reads your bet and extracts sport, type, teams, odds, and line
- **Bet-type-specific analysis** — Different stats for spreads vs. over/unders vs. player props vs. moneyline
- **Interactive charts** — Line, bar, distribution, and table visualizations powered by Recharts
- **Mobile-first** — Designed for phone users who screenshot bets on the go

## Setup

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Create `.env.local` with your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

3. Run the dev server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS** (dark theme)
- **Recharts** (data visualization)
- **Anthropic Claude** (vision extraction + analysis)
- **ESPN API** (public sports data, no key required)

## Deploy to Vercel

Set `ANTHROPIC_API_KEY` in your Vercel environment variables, then deploy.
