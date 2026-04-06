# Swish Autoresearch

Automated model optimization for Swish Score weights.

## How it works

1. **collect_data.py** — Scrapes ESPN for completed games, generates synthetic bet scenarios with known outcomes (hit/miss)
2. **optimize_weights.py** — Hill-climbing optimizer that tests weight combinations against historical outcomes, finds weights where high Swish Scores correlate with hits
3. **run_loop.sh** — Ties it together in a loop. Optionally uses Claude Code for deeper analysis of results

## Quick start

```bash
# One pass: collect + optimize
python research/collect_data.py --all --days 30
python research/optimize_weights.py

# Full loop with Claude analysis
bash research/run_loop.sh --loop 3 --claude
```

## What gets updated

- `models/swish-weights.json` — The weight file loaded by `src/lib/swishScore.ts` at runtime
- `research/data/` — Historical bet data (gitignored, regenerated each run)
- `research/notes/` — Analysis notes from Claude (if --claude flag used)

## Architecture

```
ESPN historical games
        ↓
  collect_data.py
  (generate synthetic bets with known outcomes)
        ↓
  research/data/*.json
        ↓
  optimize_weights.py
  (hill-climbing: which weights predict hit/miss best?)
        ↓
  models/swish-weights.json
        ↓
  swishScore.ts loads weights at runtime
        ↓
  Better Swish Scores in production
```
