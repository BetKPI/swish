# Swish — Product Requirements Document

## Overview

Swish is a web app that lets sports bettors upload a screenshot of a bet they're considering, and instantly get relevant charts, stats, and analytics to help them make an informed decision — similar to how a stock trader researches before buying.

The key differentiator is **bet-type-specific analysis**. The app doesn't just show generic team stats. It figures out what data actually matters for the specific bet. For example:
- **First basket prop (Joel Embiid)** → tip-off win %, first shot %, team first basket %, Embiid's scoring in first 2 minutes
- **Point spread (Lakers -3.5 vs Celtics)** → H2H record, ATS record, home/away splits, recent form
- **Over/under (Total 224.5)** → pace stats, points per game trends, over/under historical hit rates
- **Moneyline** → win %, strength of schedule, clutch stats, recent form

## Goals

- Let any bettor go from "should I take this bet?" to "here's the data" in under 30 seconds
- Provide genuinely useful, bet-type-specific analysis — not just generic stats
- Clean, modern UI that makes complex data easy to digest
- MVP ships fast — no auth, no persistence, just upload and analyze

## Target Users

- Casual to semi-serious sports bettors who want to do quick research before placing a bet
- People who currently just "go with their gut" but would look at data if it were easy

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **Charts**: Recharts (or Chart.js via react-chartjs-2)
- **Image Parsing**: Anthropic Claude Vision API (claude-sonnet-4-6 for speed/cost)
- **Sports Data**: ESPN public API endpoints (no key required), free web data
- **Deployment**: Vercel
- **Language**: TypeScript

## Architecture

Single Next.js app with:
- **Frontend**: Single-page app with upload area, loading state, results view
- **API Routes**:
  - `POST /api/analyze` — accepts image, calls Claude Vision to extract bet details
  - `POST /api/stats` — takes structured bet data, fetches relevant stats
- **Data Flow**:
  1. User uploads screenshot
  2. `/api/analyze` sends image to Claude Vision → returns structured bet info (sport, teams, players, bet type, line, odds)
  3. Frontend calls `/api/stats` with structured bet info
  4. `/api/stats` fetches relevant public data based on bet type and sport
  5. Frontend renders charts and analysis

## Feature Requirements

### F1: Screenshot Upload
- Drag-and-drop zone + click-to-upload on the main page
- Accepts PNG, JPG, WEBP
- Shows image preview after upload
- Max file size: 10MB
- Mobile-friendly (users will screenshot on phone and visit on phone)

### F2: Bet Extraction (Claude Vision)
- Send the uploaded image to Claude Vision API
- Extract structured data:
  - `sport` (NBA, NFL, MLB, NHL, Soccer, etc.)
  - `betType` (moneyline, spread, over_under, player_prop, game_prop, parlay)
  - `teams` (array of team names)
  - `players` (array of player names, if relevant)
  - `line` (the number — spread value, total, prop line)
  - `odds` (the odds for the bet)
  - `market` (specific market name, e.g., "First Basket Scorer", "Anytime TD")
  - `description` (human-readable summary of the bet)
- Handle parlays by extracting each leg separately
- Return confidence score — if low confidence, show warning to user

### F3: Bet-Type-Specific Data Fetching
- Based on the extracted bet type and sport, fetch the RELEVANT stats
- Use ESPN public endpoints and other free sources
- **For player props**: player game logs, relevant per-game stats, matchup data
- **For spreads**: team records, ATS history, H2H, home/away splits
- **For over/under**: pace stats, scoring averages, recent totals
- **For moneyline**: win %, recent form, strength of opponent
- The system should be smart about WHAT to fetch — this is the core value prop
- Include a Claude call to determine what stats are most relevant for the specific bet, then fetch those

### F4: Charts & Visualizations
- Render 3-6 charts based on the fetched data
- Chart types to support:
  - **Line chart**: trends over time (e.g., points per game last 10 games)
  - **Bar chart**: comparisons (e.g., team A vs team B stats)
  - **Distribution/histogram**: stat distributions (e.g., how often a team goes over X points)
  - **Table**: key stats in a clean tabular format
- Each chart should have a clear title explaining what it shows and WHY it's relevant to the bet
- Charts should be responsive and look good on mobile

### F5: Analysis Summary
- Below or above the charts, show a brief AI-generated summary
- "Here's what the data suggests about this bet" — not a recommendation, but context
- Highlight the 2-3 most important data points
- Include disclaimers (not financial advice, gamble responsibly, etc.)

### F6: UI/UX
- Clean, dark theme (sports/betting aesthetic)
- Single page — no navigation needed for MVP
- States: empty (upload prompt) → loading (analyzing...) → results (charts + summary)
- "Analyze Another Bet" button to reset
- Swish logo/branding at the top
- Mobile-first responsive design

## Data Model (In-Memory Only for MVP)

No database. All data is ephemeral per request.

```typescript
interface BetAnalysis {
  id: string;
  image: string; // base64
  extraction: {
    sport: string;
    betType: 'moneyline' | 'spread' | 'over_under' | 'player_prop' | 'game_prop' | 'parlay';
    teams: string[];
    players: string[];
    line?: number;
    odds: string;
    market?: string;
    description: string;
    confidence: number;
  };
  stats: StatDataPoint[];
  charts: ChartConfig[];
  summary: string;
}

interface StatDataPoint {
  label: string;
  value: number | string;
  context: string; // why this matters for the bet
}

interface ChartConfig {
  type: 'line' | 'bar' | 'distribution' | 'table';
  title: string;
  relevance: string; // why this chart matters for the bet
  data: any;
}
```

## Non-Functional Requirements

- **Performance**: Results should appear within 10-15 seconds of upload (Claude API + data fetching)
- **Mobile**: Must work well on mobile — this is a phone-first use case
- **Error handling**: Graceful failures — if data fetch fails, show what we have, not an error page
- **Cost**: Use claude-sonnet-4-6 for vision (fast/cheap), minimize API calls

## Out of Scope (NOT in MVP)

- User accounts / authentication
- Saving bet history
- Social features (sharing analysis)
- Real-time odds tracking
- Bet tracking / bankroll management
- Parlay correlation analysis
- Payment / premium features

## Environment Variables Required

```
ANTHROPIC_API_KEY=sk-ant-...
```

ESPN endpoints are public and require no key.

## Open Questions

None — MVP scope is clear. Ship it, learn from usage, iterate.
