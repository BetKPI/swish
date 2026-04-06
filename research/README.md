# Swish Autoresearch

Automated model optimization for Swish Score weights.

## How it works

1. **collect_data.py** — Scrapes ESPN for completed games, generates synthetic bet scenarios with known outcomes (hit/miss)
2. **optimize_weights.py** — Hill-climbing optimizer that tests weight combinations against historical outcomes, finds weights where high Swish Scores correlate with hits
3. **run_loop.sh** — Ties it together in a loop. Optionally uses Claude Code for deeper analysis of results

## Quick start

```bash
# Collect 30 days of data with pre-game features
python research/collect_data.py --all --days 30

# Rank which metrics actually predict outcomes
python research/rank_metrics.py

# Optimize Swish Score weights
python research/optimize_weights.py --iterations 5000

# Or run the full loop with Claude Code as researcher
bash research/run_loop.sh --agent
```

## What gets updated

- `models/swish-weights.json` — The weight file loaded by `src/lib/swishScore.ts` at runtime
- `research/data/` — Historical bet data with pre-game features (gitignored, regenerated each run)
- `research/data/metric_rankings.json` — Which metrics predict outcomes (ranked by effect size)
- `research/notes/` — Analysis notes from Claude (if --agent mode used)

## Architecture

```
ESPN historical games (30+ days)
        ↓
  collect_data.py
  (build rolling team profiles, generate bets with PRE-GAME features)
        ↓
  research/data/*.json (features + outcomes)
        ↓
  rank_metrics.py                optimize_weights.py
  (which features predict?)      (which weights predict?)
        ↓                              ↓
  Reorder/drop charts           models/swish-weights.json
  in charts.ts                         ↓
                                swishScore.ts loads at runtime
                                       ↓
                                Better predictions in production
```
