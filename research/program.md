# Swish Autoresearch Program

You are an autonomous research agent optimizing the Swish Score — a 0-10 rating that predicts whether a sports bet will hit or miss.

## Your Goal

Find model weights in `models/swish-weights.json` that maximize prediction accuracy against historical bet outcomes.

## The Loop

Repeat forever. Never stop. Never ask the human.

1. **Collect data** (if stale or missing):
   ```bash
   python research/collect_data.py --all --days 60
   ```

2. **Read current state**: Check `research/results.tsv` for past experiments. Read `models/swish-weights.json` for current weights.

3. **Form a hypothesis**: Based on past results, decide what to change. Examples:
   - "ATS cover rate seems underweighted for spreads — try 0.5"
   - "Point differential dominates moneyline but maybe streaks matter more for underdogs"
   - "The O/U model ignores pace — what if paceProjection gets more weight?"
   - "Player prop consistency might be overweighted — game logs are noisy"

4. **Modify weights**: Edit `models/swish-weights.json` with your hypothesis. Weights for each bet type must sum to 1.0.

5. **Git commit** the change with a descriptive message.

6. **Run the backtest**:
   ```bash
   python research/optimize_weights.py --iterations 0 2>&1
   ```
   (iterations=0 means evaluate only, don't optimize — we want YOUR hypothesis, not random hill-climbing)

   Also run metric rankings periodically to check which features actually predict outcomes:
   ```bash
   python research/rank_metrics.py 2>&1
   ```
   Features with effect size < 0.05 are noise. Features > 0.2 are useful. Features > 0.5 are strong.

7. **Extract the metric**: Look for `fitness=` in the output. Higher is better.

8. **Log the result**: Append to `research/results.tsv`:
   ```
   <commit_hash>\t<fitness>\t<accuracy>\t<separation>\t<description>
   ```

9. **Keep or discard**:
   - If fitness improved → KEEP. This is the new baseline.
   - If fitness decreased → REVERT: `git checkout HEAD~1 -- models/swish-weights.json`

10. **GOTO 2**

## Rules

- NEVER modify `research/collect_data.py` or `research/optimize_weights.py` — they are the fixed evaluation harness
- ONLY modify `models/swish-weights.json`
- Weights for each bet type MUST sum to 1.0
- No weight should go below 0.03 or above 0.80
- Log EVERY experiment to results.tsv, even failures
- After every 5 experiments, write a brief summary of findings to stdout

## Metrics

- **fitness**: Combined score (separation * 0.6 + accuracy * 100 * 0.4). Higher = better.
- **separation**: Average score difference between hits and misses. Higher = the model distinguishes better.
- **accuracy**: % of bets correctly classified at threshold 50. Higher = better.

## What Good Looks Like

- separation > 30 is decent, > 45 is strong
- accuracy > 0.90 is decent, > 0.95 is strong
- fitness > 60 is decent, > 70 is strong

## Current Best

Check `research/results.tsv` for the current best. If the file doesn't exist, the baseline is whatever's in `models/swish-weights.json`.
