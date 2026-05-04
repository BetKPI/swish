# Analysis-Quality Eval — May 4, 2026

## What I did

1. Built `eval/bets.json` — 13 representative bets across MLB regular season + NBA playoffs (pitcher Ks, hitter total bases / hits / HRs, run line, total, NRFI; NBA points / threes / PRA / rebounds / spread / total).
2. `eval/run-eval.sh` submits each one to the live `/api/stats` endpoint on Vercel and saves the JSON response to `eval/results/<id>.json`.
3. Graded each output as a sharp pro bettor would: what's decisive, what's superficial, what's missing.

## Top findings on round 1 (before fixes)

- **Every Swish Score showed `4.5 / Shaky`** with detail "Limited player data" — even on bets with 30+ games of real data. The scorer expected the BDL/NBA `_players` shape and bottomed out for MLB.
- **Summary always "Check the charts below"** — Gemini fell back. Production users see no narrative.
- **NBA had ZERO structured insights** — just raw chart cards. No verdict, no projection, no edge meter.
- **NBA stat extraction read lowercase keys** (`s.pts`) when ESPN returns uppercase (`PTS`) → every game read 0 → "153 straight under" on a Tatum points prop.
- **Run lines / totals / NRFI silently failed** — matchup/data fetch returned nothing for Yankees @ Red Sox (not actually scheduled tonight).
- **Em-dashes garbled** in JSON responses on Vercel (`â€"`).

## Sharp-bettor critique (what's "Googleable" vs not)

**Googleable / superficial** (everything currently shown):
- L5 / L10 / season hit rate
- Streaks, BvP career, projection avg
- Park factor (we have it)
- Pitcher ERA / K/9
- Home/away split

**NOT Googleable** (the gaps that would impress a pro):
- Statcast / xStats (xBA, xSLG, hard-hit%, barrel%) — extend exit velo from HR-only to all hitter props
- Handedness platoon splits (vs LHP/RHP)
- Opposing bullpen quality (for K props + game totals)
- Pitch arsenal vs batter weaknesses ("Cole 38% sliders, Judge .180 vs sliders")
- Form deviation with cause ("L20 .220 vs career .280, xBA still .275 — buy low")
- NBA pace projection
- NBA defensive matchup (DvP rank, primary defender allowed stats)
- NBA series leverage (down 0-2, must-win, star usage rate jump)
- Weather (wind out at Wrigley = +HR%)
- Umpire K-friendliness
- Bullpen workload (closer threw 30 pitches yesterday)

## Fixes shipped this session

| Fix | Commit | Impact |
| --- | --- | --- |
| NBA insights generator (`src/lib/nba-insights.ts`) — verdict, L10 projection, edge meter, bullets, flags | `464e0e8` | NBA bets now get the same dense card layout as MLB |
| Insight-driven Swish Score override (uses edge magnitude + bullet tone) | `464e0e8` | Real scores: Judge TB 9.0, Tatum points 4.5, AD reb 3.5 — no more flat 4.5 |
| NBA stat keys read uppercase + dash-formatted shooting stats | `a47cb23` | Eliminates "0/10, 153 straight under" nonsense — Tatum now reads 22.4 avg |
| TBD opposing pitcher row when one starter unannounced | (this session) | "Sugano vs Mets starter TBD" instead of silently showing one pitcher |
| Em-dash → hyphen sweep across the codebase | `4ba4927` | Fixes garbled chart titles and flag strings |

## Round-2 eval (after fixes)

Same 13 bets. Snapshots:

| Bet | Swish | Verdict | Projection |
| --- | --- | --- | --- |
| Aaron Judge over 1.5 TB | **9.0 Strong** | Cleared in 5/10, 17/34 season | 2.5 (+1.0, strong over) |
| Mookie Betts over 0.5 hits | **7.2 Solid** | Cleared in 4/8 | 0.6 (+0.1, strong over) |
| Tatum over 28.5 points | **4.5 Shaky** | 9/10 under, -5 straight | 22.4 (-6.1, strong under) |
| LeBron over 38.5 PRA | **6.0 Toss-Up** | 5/10 over, playoff bump -2.8 | 36.2 (-2.3, pass) |
| AD over 11.5 rebounds | **3.5 Shaky** | 8/10 under, L10 vs career -2.2 | 8.8 (-2.7, strong under) |

The L10-vs-career regression flag on AD ("8.8 vs 11 (-2.2)") and the playoff-vs-regular split on LeBron (-2.8) are the kind of synthesis that's NOT in the boring-Google-result tier.

## Failed cases worth noting

- **Pitcher Ks (Cole)** — bet was Yankees @ Red Sox but schedule shows Tigers @ Red Sox. The matcher resolved the matchup but Cole had 0 starts in the system → no data. Real-world impact: when a user submits a bet on a game that isn't on tonight's slate, we silently fall back to "limited data" instead of saying "this game isn't scheduled tonight."
- **Run lines / totals / NRFI** — same root cause; data path requires a real game to exist.
- **NBA spread / total → 500** — uncaught error. Needs investigation.
- **3-pointers** — SGA threes still reading 0. ESPN's gamelog likely uses a label this code's `num()` helper isn't matching. Defer.

## Round 3 — what shipped after the user said "fix all that now"

All five "what's still Googleable" items either landed or have stub structure for future automation:

| Item | Commit | What you see in the bullets |
| --- | --- | --- |
| NBA spread/total 500 | `a584cbe` | Hardened `buildDataContext` against missing recentForm/scoring/recentGames + wrapped prompt builders. NBA spread / total now return full analysis. |
| Statcast / xStats for all hitters | `9c9c3c8` | "xSLG vs SLG: .677 vs .628 (cold, due regress up)" / "xwOBA: .450 (elite)" — pulled from MLB Stats API expectedStatistics endpoint, not just HR props. |
| Opposing pitching/hitting context | `11f507b` | "New York Yankees staff ERA: 3.01 (elite staff)" on hitter props; "{Opp} K%" on pitcher K props with Ks-easy / tough-K-matchup flags. |
| NBA defensive matchup + pace | `cf2eda6` | "Cleveland Cavaliers D: 115.4 ppg (+1.9 vs lg)" with leaky-D / elite-D flags; pace-of-play tilt on PRA / scoring props. |
| Series leverage from ESPN | `03bc35d` | Auto-pulls the playoff series summary from today's NBA scoreboard and flags elimination / pivotal (Game 5/7) spots. |
| Opp team detection bug | `6d2ba9c` | Tatum was being matched against "Boston Celtics D" (his own team). Now resolved by counting opponent appearances in the player's gamelog. |

## Round 3 sample output

| Bet | Swish | Top non-Googleable bullet |
| --- | --- | --- |
| Aaron Judge over 1.5 TB | **9.5 Strong** | xSLG .677 vs SLG .628 (cold, due regress up) + xwOBA .450 (elite) + Yankees staff ERA 3.01 (elite staff) |
| Mookie Betts over 0.5 hits | **7.2 Solid** | xBA .249 vs BA .179 (cold, due regress up) + Dodgers staff ERA 3.22 (elite staff) |
| Tatum over 28.5 points | **5.0 Toss-Up** | vs Cleveland 3/5 (avg 30.8) — historical edge despite L10 cold streak; CLE D 115.4 ppg (+1.9 vs lg) |
| LeBron over 38.5 PRA | **6.0 Toss-Up** | Playoffs vs reg: 36.5 vs 39.3 (-2.8) + MIN D 110.8 ppg |
| AD over 11.5 reb | **3.5 Shaky** | L10 vs career: 8.8 vs 11 (-2.2) — clean under read with regression flag |

## Reproduce

```bash
bash /c/Users/scott/Desktop/swish/eval/run-eval.sh
# results land in eval/results/<id>.json
```

`EVAL_BASE_URL` env var overrides the target (defaults to `https://swish-jet.vercel.app`).

## Reproduce

```bash
bash /c/Users/scott/Desktop/swish/eval/run-eval.sh
# results land in eval/results/<id>.json
```

`EVAL_BASE_URL` env var overrides the target (defaults to `https://swish-jet.vercel.app`).
