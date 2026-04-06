"""
Optimize Swish Score weights via backtesting against historical outcomes.

Loads bet data from research/data/, simulates Swish Scores with different
weight combinations, and finds weights that best predict hit/miss outcomes.

The idea: a good Swish Score should give high scores to bets that hit
and low scores to bets that miss. We optimize for this correlation.

Usage:
    python research/optimize_weights.py
    python research/optimize_weights.py --sport NBA
    python research/optimize_weights.py --iterations 5000

Output: models/swish-weights.json (updated)
"""

import json
import random
import sys
from pathlib import Path
from datetime import datetime

DATA_DIR = Path(__file__).parent / "data"
MODELS_DIR = Path(__file__).parent.parent / "models"
WEIGHTS_PATH = MODELS_DIR / "swish-weights.json"


def load_bets(sport: str | None = None) -> list[dict]:
    """Load bet data from JSON files."""
    bets = []
    pattern = f"{sport.lower()}_bets.json" if sport else "*_bets.json"
    for f in DATA_DIR.glob(pattern):
        with open(f) as fp:
            bets.extend(json.load(fp))
    return bets


def load_current_weights() -> dict:
    """Load current model weights."""
    with open(WEIGHTS_PATH) as f:
        return json.load(f)


def simulate_score(bet: dict, weights: dict) -> float:
    """
    Simulate a simplified Swish Score for a bet using given weights.

    This is a simplified version of the TypeScript scoring — we compute
    sub-scores from the game data and combine with weights.

    Returns 0-100 raw score.
    """
    bet_type = bet.get("betType", "")

    if bet_type == "spread":
        w = weights.get("spread", {})
        margin = bet.get("margin", 0)
        line = bet.get("line", 0)

        # ATS: did this team historically cover?
        cover_pct = 0.5 + (margin + line) / 40  # rough proxy
        ats_score = max(0, min(100, cover_pct * 100))

        # Close games: margin within line+3
        close = 1 if abs(margin) <= abs(line) + 3 else 0
        close_score = 60 if close else 40

        # Margin trend: proxy from margin itself
        margin_score = max(0, min(100, 50 + margin * 2))

        # Home/away: home teams win ~55%
        home_score = 55 if bet.get("team") == bet.get("homeTeam") else 45

        # Rest: neutral
        rest_score = 50

        return (
            ats_score * w.get("atsCoverRate", 0.35) +
            close_score * w.get("closeGames", 0.2) +
            margin_score * w.get("marginTrend", 0.2) +
            home_score * w.get("homeAwayRecord", 0.15) +
            rest_score * w.get("restAdvantage", 0.1)
        )

    elif bet_type == "over_under":
        w = weights.get("over_under", {})
        total = bet.get("total", 0)
        line = bet.get("line", 0)

        # Over rate proxy
        over_rate = 0.5 + (total - line) / 40
        over_score = max(0, min(100, over_rate * 100))

        # Pace projection
        diff = total - line
        pace_score = max(0, min(100, 50 + (diff / max(line, 1)) * 200))

        # Trend: neutral proxy
        trend_score = 50

        # Avg vs line
        avg_score = max(0, min(100, 50 + (diff / max(line, 1)) * 200))

        return (
            over_score * w.get("overRate", 0.35) +
            pace_score * w.get("paceProjection", 0.25) +
            trend_score * w.get("scoringTrend", 0.2) +
            avg_score * w.get("avgVsLine", 0.2)
        )

    elif bet_type == "moneyline":
        w = weights.get("moneyline", {})
        home_win = bet.get("homeWin", False)
        is_home = bet.get("team") == bet.get("homeTeam")
        won = (is_home and home_win) or (not is_home and not home_win)

        win_score = 65 if won else 35
        form_score = 55 if won else 45
        diff = bet.get("margin", 0) * (1 if is_home else -1)
        diff_score = max(0, min(100, 50 + diff * 2))
        home_score = 55 if is_home else 45
        streak_score = 55 if won else 45

        return (
            win_score * w.get("winPct", 0.3) +
            form_score * w.get("recentForm", 0.25) +
            diff_score * w.get("pointDiff", 0.2) +
            home_score * w.get("homeAwayPct", 0.15) +
            streak_score * w.get("streak", 0.1)
        )

    return 50  # fallback


def evaluate_weights(bets: list[dict], weights: dict) -> dict:
    """
    Evaluate a weight config against historical bets.

    Good weights should:
    1. Give higher scores to hits than misses (separation)
    2. Have high accuracy at a threshold (e.g. score > 55 predicts hit)

    Returns metrics dict.
    """
    hit_scores = []
    miss_scores = []

    for bet in bets:
        score = simulate_score(bet, weights)
        if bet.get("outcome") == "hit":
            hit_scores.append(score)
        else:
            miss_scores.append(score)

    if not hit_scores or not miss_scores:
        return {"separation": 0, "accuracy": 0.5, "fitness": 0}

    avg_hit = sum(hit_scores) / len(hit_scores)
    avg_miss = sum(miss_scores) / len(miss_scores)
    separation = avg_hit - avg_miss  # higher = better

    # Accuracy at threshold 50
    correct = sum(1 for s in hit_scores if s >= 50) + sum(1 for s in miss_scores if s < 50)
    total = len(hit_scores) + len(miss_scores)
    accuracy = correct / total

    # Combined fitness
    fitness = separation * 0.6 + accuracy * 100 * 0.4

    return {
        "separation": round(separation, 2),
        "avgHit": round(avg_hit, 2),
        "avgMiss": round(avg_miss, 2),
        "accuracy": round(accuracy, 4),
        "fitness": round(fitness, 2),
        "n": total,
    }


def mutate_weights(weights: dict, bet_type: str) -> dict:
    """Randomly mutate weights for a bet type, keeping them summing to ~1."""
    new_weights = dict(weights)
    w = dict(weights.get(bet_type, {}))

    if not w:
        return new_weights

    keys = list(w.keys())
    # Pick 2 random keys and shift weight between them
    k1, k2 = random.sample(keys, 2)
    shift = random.uniform(-0.08, 0.08)
    w[k1] = max(0.05, min(0.6, w[k1] + shift))
    w[k2] = max(0.05, min(0.6, w[k2] - shift))

    # Normalize to sum to 1
    total = sum(w.values())
    w = {k: round(v / total, 4) for k, v in w.items()}

    new_weights[bet_type] = w
    return new_weights


def optimize(bets: list[dict], bet_type: str, iterations: int = 2000) -> dict:
    """Hill-climbing optimizer for one bet type."""
    current = load_current_weights()
    type_bets = [b for b in bets if b.get("betType") == bet_type]

    if not type_bets:
        print(f"  No {bet_type} bets to optimize against")
        return current

    best_metrics = evaluate_weights(type_bets, current)
    best_weights = current
    print(f"  {bet_type}: starting fitness={best_metrics['fitness']}, "
          f"accuracy={best_metrics['accuracy']}, separation={best_metrics['separation']}")

    for i in range(iterations):
        candidate = mutate_weights(best_weights, bet_type)
        metrics = evaluate_weights(type_bets, candidate)

        if metrics["fitness"] > best_metrics["fitness"]:
            best_weights = candidate
            best_metrics = metrics

    print(f"  {bet_type}: final fitness={best_metrics['fitness']}, "
          f"accuracy={best_metrics['accuracy']}, separation={best_metrics['separation']}")
    print(f"  {bet_type} weights: {best_weights[bet_type]}")

    return best_weights


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Optimize Swish Score weights")
    parser.add_argument("--sport", type=str, help="Filter bets by sport")
    parser.add_argument("--iterations", type=int, default=2000, help="Optimization iterations per bet type")
    args = parser.parse_args()

    bets = load_bets(args.sport)
    if not bets:
        print("No bet data found. Run collect_data.py first.")
        sys.exit(1)

    print(f"Loaded {len(bets)} bet scenarios")

    # Evaluate-only mode (iterations=0) — used by autoresearch agent
    if args.iterations == 0:
        current = load_current_weights()
        for bet_type in ["spread", "over_under", "moneyline"]:
            type_bets = [b for b in bets if b.get("betType") == bet_type]
            if type_bets:
                metrics = evaluate_weights(type_bets, current)
                print(f"  {bet_type}: fitness={metrics['fitness']}, "
                      f"accuracy={metrics['accuracy']}, separation={metrics['separation']}, n={metrics['n']}")
        # Overall fitness
        all_metrics = evaluate_weights(bets, current)
        print(f"  OVERALL: fitness={all_metrics['fitness']}, "
              f"accuracy={all_metrics['accuracy']}, separation={all_metrics['separation']}, n={all_metrics['n']}")
        return

    # Optimize each bet type
    final_weights = load_current_weights()
    for bet_type in ["spread", "over_under", "moneyline"]:
        result = optimize(bets, bet_type, args.iterations)
        final_weights[bet_type] = result[bet_type]

    # Update metadata
    final_weights["_meta"] = {
        "version": final_weights.get("_meta", {}).get("version", 1) + 1,
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "source": f"autoresearch — optimized over {len(bets)} scenarios, {args.iterations} iterations",
        "notes": "Weights optimized by research/optimize_weights.py hill-climbing against historical outcomes",
    }

    with open(WEIGHTS_PATH, "w") as f:
        json.dump(final_weights, f, indent=2)

    print(f"\nUpdated {WEIGHTS_PATH}")
    print("Commit and deploy to use new weights in production.")


if __name__ == "__main__":
    main()
