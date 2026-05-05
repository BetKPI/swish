# swish — launch playbook

Last updated 2026-05-05. Live URL: https://swish-jet.vercel.app

## What we're testing

**Hypothesis**: there's demand for a free, fast, sharp-tier bet-research tool with probability-based scoring. The waitlist email is the conversion signal — if people leave email for "tomorrow's sharpest plays," PMF is real.

**Success bar (week 1)**:
- 1,000+ unique landing-page visits
- 80+ waitlist signups (8% conversion is healthy for a cold landing)
- 25+ actual bet analyses run (engaged users)
- 3+ unprompted shares / mentions in r/sportsbook or sports Twitter

If we hit those, double down with paid. If not, iterate the value prop before spending.

---

## Day-by-day plan

### Day 1 (Tuesday) — soft launch, organic only

- [ ] Post Show HN (see content below). Best timing: 8-9am ET on a Tuesday or Wednesday.
- [ ] Post on personal Twitter / X with screenshot of an actual analysis (Aaron Judge prop with stacked signals).
- [ ] DM 5-10 sports-betting Twitter accounts you follow with the link, ask for honest feedback (not retweets).
- [ ] Watch Discord webhook for signups. Track conversion rate.

**Goal**: see if anyone organically cares before you spend money.

### Day 2-3 — niche communities

- [ ] Post on r/sportsbook (read their rules first — self-promo is dicey). Frame it as "I built this because I was tired of paying $20/mo for props.cash."
- [ ] Post on r/dfsports if MLB / NBA player props relevant.
- [ ] Post on r/baseball or r/nba — sport-specific, talk about the data not the tool.
- [ ] Comment helpfully on existing prop-research threads with link in profile bio.

**Goal**: 200+ extra visits, 15+ signups.

### Day 4 — paid pilot ($50-100 budget)

- [ ] Twitter ad: $30/day x 2 days, sports-betting interest targeting. See ad copy below.
- [ ] Reddit ad: $20/day x 2 days, target r/sportsbook + r/dfsports.
- [ ] Track which channel converts best.

**Goal**: $50 spent, 500+ visits, 30+ signups. CAC under $2 is your bar to keep going.

### Day 5-6 — iterate based on data

- [ ] If signup rate < 5%, **the value prop is wrong**, not the traffic. Rewrite landing.
- [ ] If signup rate > 10%, **scale ads**.
- [ ] If users sign up but don't run a bet analysis, **upload friction is too high** — fix that.

### Day 7 — Product Hunt launch

- [ ] PH launches go live midnight PT on the day. Pick a Tuesday or Wednesday.
- [ ] Have 5-10 friends ready to upvote in first hour (matters for ranking).
- [ ] Use the PH copy below.

**Goal**: top 5 on PH for the day. ~500-2k visits.

---

## Reddit posts

### r/sportsbook (high-friction, self-promo unwelcome — frame as tool you built)

**Title**: I built a free probability tool because I couldn't justify props.cash anymore

**Body**:
> Spent the last few weeks scratching my own itch. Wanted a tool that:
>
> - Takes a screenshot of a slip and tells me the actual % chance of hitting
> - Pulls Statcast xStats, ballpark factors, weather, vs LHP/RHP splits, opposing staff ERA, pitch arsenal — all the angles I'd manually cross-reference on baseball-reference + savant + fangraphs
> - Doesn't cost $20/mo
>
> Built it on free APIs (MLB Stats, Open-Meteo for weather, Baseball Savant CSV for pitch arsenal). It's at https://swish-jet.vercel.app — drop a screenshot of your slip and you'll get a probability score + ~10 stacked signals per leg.
>
> Sample (Aaron Judge over 1.5 TB):
> ```
> Swish: 8.1/10 — ~81% chance to hit
> vs RHP: .983 OPS in 87 AB
> xSLG vs SLG: .677 vs .645 (cold, regress up)
> xwOBA: .450 (elite)
> Facing Brayan Bello: 9.1 ERA, 4.7 H/9
> Wind 12 mph out to CF, 78°F
> ```
>
> Free, no signup required to use. There's an email signup if you want a daily digest of the sharpest plays but it's optional.
>
> **Honestly looking for feedback** — what's missing? What would make you actually use this over props.cash?

### r/dfsports

**Title**: Free tool: probability + xStats on any prop in 20 seconds (screenshot it)

**Body**:
> Built [swish](https://swish-jet.vercel.app) over the last few weeks — drop a screenshot of any prop and it pulls:
>
> - L5/L10/season hit rates with green/red bar chart
> - Statcast xBA / xSLG / xwOBA (regression read)
> - vs LHP / vs RHP platoon splits
> - Opposing pitcher's pitch arsenal + best K-pitch
> - Ballpark factor + game-time weather (wind direction relative to CF)
> - L10 projection vs line
> - Probability score (0-10 = % chance to hit)
>
> Free. No signup to use. Built on free APIs (MLB Stats, Open-Meteo, Baseball Savant).
>
> Looking for honest feedback on what data signals you'd want next.

### r/baseball or r/nba (sport-specific, lead with data not product)

**Title for r/baseball**: How would you size up Aaron Judge over 1.5 TB tonight at Fenway?

**Body**:
> Pulled together: vs RHP .983 OPS in 87 AB, xSLG .677 vs actual .645 (regression-up signal), facing Brayan Bello (9.1 ERA, .310 BA allowed vs righties), wind 12mph out to CF, 78°F. Park factor at Fenway is +6% on hits.
>
> All these point to over but the BvP career is 2-21 with 8 K (small sample).
>
> Built a free tool that stacks these signals if anyone wants it: https://swish-jet.vercel.app — curious what you'd lean.

---

## Twitter / X

### Launch tweet (with screenshot)

> Built this in a few weeks because I was tired of cross-referencing baseball-reference + savant + fangraphs for every prop.
>
> Drop a slip screenshot → 10 stacked signals + a probability score.
>
> Free. https://swish-jet.vercel.app
>
> [attach screenshot of Aaron Judge bet card with all the signals]

### Reply thread for engagement

1. The headline number is "% chance to hit" — not arbitrary 1-10. Score = model probability.
2. xBA vs BA delta tells you regression direction (hot/sell-high or cold/buy-low).
3. Pitch arsenal pulls from Baseball Savant — every pitcher's pitch mix + whiff% per pitch type.
4. Wind direction is converted to fielding-relative ("out to CF" / "in from CF") using each park's compass bearing.
5. All free APIs. No paid tier yet.

### Daily content (run for a week)

> Today's nastiest matchup angle (per swish):
> [Player] over [line] [stat] — [signal that pops]
>
> [link]

(Run this once a day with a real bet that scored 8+ on swish. Establishes authority.)

---

## Show HN

**Title**: Show HN: Swish – screenshot a sports bet, get the real probability it hits

**Body**:
> swish takes a screenshot of any bet slip and pulls every angle a sharp bettor would manually cross-reference: L5/L10/season hit rates, Statcast xBA/xSLG/xwOBA, vs-LHP/RHP platoon splits, opposing pitcher's pitch arsenal (best K-pitch), ballpark factor, game-time weather (wind direction relative to CF using park compass bearing), L10 projection vs line, and a probability score that's actually a probability — score 7.5 = ~75% chance to hit.
>
> Built on free APIs:
> - MLB Stats API for game logs, splits, expected stats, lineups
> - Baseball Savant CSV for pitch arsenal (whiff%, wOBA per pitch)
> - Open-Meteo for weather (no auth, no rate limit)
> - ESPN for NBA / NHL game logs and series leverage
>
> Live at https://swish-jet.vercel.app. No signup. Source: https://github.com/BetKPI/swish
>
> Built to be PWA-installable on iPhone (Add to Home Screen).
>
> Architecture: Next.js 16 + React 19 on Vercel. Deterministic pre-computation in TypeScript on the API layer; Gemini handles the natural-language drill-down chat. Charts are recharts.
>
> Honest gaps: NBA primary-defender DvP is hard to get without paid NBA Stats API access. Umpire K-zone tendencies aren't integrated yet. Calibration of the probability score against historical outcomes hasn't been backtested — that's next.

---

## Product Hunt

**Tagline**: The take, before you take the bet.

**Description**:
> Drop a screenshot of any bet slip. We do the cross-referencing — game logs, Statcast xStats, ballpark factors, weather, vs LHP/RHP splits, pitch arsenal, opposing matchup — and give you the actual % chance it hits.
>
> Free. No signup. No picks for sale.
>
> What sets it apart from props.cash and OddsJam: the probability score is a real probability (model estimate), not arbitrary 1-10. xBA vs BA flag tells you regression direction. Pitch arsenal pulls from Baseball Savant per pitcher, including best K-pitch by whiff%. Weather translates raw wind into fielding-relative direction ("out to CF" / "in from CF").

**First comment (yours)**:
> Built this because I was tired of paying $20/month for props.cash and still cross-referencing 4 other tabs. swish stacks every signal a sharp bettor would manually pull, in 20 seconds, free.
>
> Honest feedback most welcome. NBA primary-defender DvP is the biggest gap I haven't closed — open to ideas.

---

## Ad copy variants (paste into Twitter / Reddit / Google)

### Twitter / X ads — interest targeting "sports betting" + "DraftKings" + "FanDuel"

**A. Decisive** (test first):
> Stop guessing on props. Drop your slip — get a real % chance it hits, free. https://swish-jet.vercel.app

**B. Sharp-bettor lingo**:
> Every prop has 10 angles you should check. swish does them all in 20s. xBA, platoon splits, pitch arsenal, weather. Free.

**C. Comparison**:
> Like props.cash but free. Probability score + Statcast + weather + pitch arsenal — all on one screen.

**D. FOMO**:
> Tonight's slip checked through 11 sharp signals before you tap submit. Free.

### Reddit ads — target r/sportsbook, r/dfsports, r/sportsbetting

**A. Solving the same pain**:
> Built this because I was tired of paying $20/mo for props.cash. swish pulls every angle (xStats, splits, arsenal, weather) in 20s. Free.

**B. Tool focus**:
> Free probability tool for any prop. Screenshot → 10 stacked signals + % chance to hit. https://swish-jet.vercel.app

### Google search ads — keywords: "props cash alternative", "free hit rate tool", "MLB prop research", "sports bet probability"

**Headline 1**: Free Sports Bet Probability Tool
**Headline 2**: Real % Chance, Not Arbitrary Score
**Headline 3**: xStats + Pitch Arsenal + Weather

**Description**: Drop a bet screenshot. Get the actual probability it hits, free. Statcast, ballpark factors, weather, vs-LHP/RHP splits, pitch arsenal — every angle a sharp bettor would manually cross-reference, in 20 seconds.

### Meta / Instagram — visual-first

Use a screenshot of the Judge bet card with the probability score circled. Caption: *"Drop a screenshot. Get the real number. Free."*

---

## Metrics dashboard (what to watch)

| Metric | Source | Daily target (week 1) |
|---|---|---|
| Unique landing visits | Vercel Speed Insights | 100+ |
| Bet analyses run | Discord webhook bet log | 5+ |
| Waitlist signups | Discord webhook waitlist | 8+ |
| Conversion (visits → signups) | (signups / visits) | 5%+ |
| Conversion (visits → analyses) | (analyses / visits) | 5%+ |

If signup conversion stays under 3% after 500 visits, **rewrite the landing pitch** before spending more on ads.

If analysis conversion is high (>10%) but signup is low, **the tool is good but the daily-digest pitch isn't compelling** — try a different signup hook.

---

## Risk / things that could blow up

- **Sportsbook ToS** — nothing in our flow violates DK / FD / PrizePicks ToS, but be careful never to claim affiliation. The "screenshot" framing is a feature, not a partnership.
- **Gambling content rules** — Reddit and Twitter both have policies. Our tool is research, not picks-for-sale. Frame accordingly.
- **Data source drift** — MLB Stats API and Baseball Savant are free public endpoints; if either breaks, weather + ESPN keep most of the analysis alive but need a quick fix.
