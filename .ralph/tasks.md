# Tasks

- [x] 1. Initialize Next.js 14+ project with TypeScript, Tailwind CSS, and App Router
  - Run `npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"` (accept defaults)
  - Install dependencies: `recharts`, `@anthropic-ai/sdk`
  - Verify `npm run dev` starts without errors
  - Acceptance: Project runs on localhost, has TypeScript + Tailwind configured

- [x] 2. Set up project structure and shared types
  - Create `src/types/index.ts` with BetAnalysis, StatDataPoint, ChartConfig interfaces from PRD
  - Create `src/lib/` directory for utility modules
  - Acceptance: Types compile without errors, folder structure is clean

- [ ] 3. Build the main page UI — upload state
  - Create dark-themed layout in `src/app/layout.tsx` with Swish branding
  - Build `src/app/page.tsx` with drag-and-drop + click-to-upload zone
  - Handle file selection, preview, and validation (PNG/JPG/WEBP, max 10MB)
  - Style with Tailwind — dark theme, modern sports aesthetic
  - Mobile-responsive
  - Acceptance: Can drag or click to upload an image, see preview, looks great on mobile

- [ ] 4. Build the loading/analyzing state UI
  - Show loading state after user uploads: animated spinner/skeleton with status messages
  - Status messages cycle through: "Reading your bet...", "Fetching stats...", "Building charts..."
  - Keep the uploaded image visible during loading
  - Acceptance: Smooth transition from upload to loading state, looks polished

- [ ] 5. Build the `/api/analyze` endpoint — Claude Vision bet extraction
  - Create `src/app/api/analyze/route.ts`
  - Accept POST with base64 image
  - Call Claude Vision (claude-sonnet-4-6) with a detailed prompt to extract bet details
  - Prompt should instruct Claude to return structured JSON: sport, betType, teams, players, line, odds, market, description, confidence
  - Return the structured extraction
  - Acceptance: Sending a bet screenshot returns accurate structured bet data

- [ ] 6. Build the `/api/stats` endpoint — bet-type-specific data fetching
  - Create `src/app/api/stats/route.ts`
  - Accept POST with the structured bet extraction
  - Step 1: Call Claude to determine what stats are most relevant for this specific bet type (e.g., for "first basket" → tip-off win %, first shot stats, etc.)
  - Step 2: Fetch data from ESPN public API endpoints based on the sport and teams/players
  - Create `src/lib/espn.ts` with helper functions to fetch team stats, player game logs, team records, H2H data from ESPN's public API
  - Step 3: Call Claude again to organize the fetched data into chart configs and a summary, explaining WHY each stat matters for this specific bet
  - Return: array of ChartConfig objects + summary text + key stat data points
  - Acceptance: Given a structured bet, returns relevant stats, chart configs, and summary

- [ ] 7. Build the results UI — charts and analysis display
  - Create `src/components/ChartDisplay.tsx` — renders a single chart based on ChartConfig
  - Support chart types: line (Recharts LineChart), bar (BarChart), distribution (BarChart styled as histogram), table (HTML table)
  - Create `src/components/AnalysisResults.tsx` — renders the full analysis: summary, key stats, all charts
  - Each chart has a title and a "why this matters" subtitle
  - "Analyze Another Bet" button to reset
  - Dark-themed, responsive
  - Acceptance: Charts render correctly for all types, look good on mobile, summary is readable

- [ ] 8. Wire up the full flow end-to-end
  - Connect frontend upload → `/api/analyze` → `/api/stats` → results display
  - Handle errors gracefully (show error message, allow retry)
  - Handle edge cases: low confidence extraction (show warning), partial data (show what we have)
  - Test with real bet screenshots from various sportsbooks
  - Acceptance: Full flow works — upload screenshot, see charts and analysis within 15 seconds

- [ ] 9. Polish and mobile optimization
  - Fine-tune responsive layouts for mobile
  - Add Swish logo/header with subtle goat emoji or icon
  - Add footer with disclaimer ("For entertainment only. Not financial advice. Gamble responsibly.")
  - Optimize loading states and transitions
  - Ensure charts are touch-friendly and readable on small screens
  - Acceptance: Looks great and works smoothly on both desktop and mobile

- [ ] 10. Prepare for Vercel deployment
  - Create `.env.example` with required environment variables
  - Add `ANTHROPIC_API_KEY` to `.env.local` (gitignored)
  - Verify `npm run build` succeeds with no errors
  - Test production build locally with `npm run start`
  - Create a clean README.md with setup instructions
  - Acceptance: `npm run build` passes, app works in production mode
