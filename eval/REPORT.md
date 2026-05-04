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

## What I didn't ship (next session)

These are the highest-value remaining items based on the Googleable/non-Googleable lens:

1. **Statcast for all hitters** — extend `tryFetchBatterExitVelocity` to feed exit velo, hard-hit%, and barrel rate into hitter insights for every prop, not just HR. Sharps live for "hitter L20 has .280 BA but .310 xBA — under-performing, due to regress up."
2. **Opposing bullpen quality** — for K and total props, surface "starter goes ~5.5 IP, bullpen 4.5 ERA L20". Already have team game logs; need to compute relief ERA.
3. **NBA defensive matchup** — DvP rank vs the position, plus likely primary defender. ESPN exposes opponent allowed stats by position.
4. **Series leverage for playoffs** — pull current series score and tag elimination/pivotal games. Star usage rate typically jumps 2-3% in elimination scenarios.
5. **NBA spread/total 500 fix** — debug the team-bet path so the eval is complete.

## Reproduce

```bash
bash /c/Users/scott/Desktop/swish/eval/run-eval.sh
# results land in eval/results/<id>.json
```

`EVAL_BASE_URL` env var overrides the target (defaults to `https://swish-jet.vercel.app`).
