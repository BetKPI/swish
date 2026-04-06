"""
Rank which pre-game metrics actually predict bet outcomes.

For each feature in the training data, compute how well it separates
hits from misses. This tells us which charts/stats are worth showing
users and which are noise.

Usage:
    python research/rank_metrics.py
    python research/rank_metrics.py --sport NBA
    python research/rank_metrics.py --bet-type spread

Output: prints ranked feature importance + saves to research/data/metric_rankings.json
"""

import json
import argparse
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path(__file__).parent / "data"


def load_bets(sport: str | None = None) -> list[dict]:
    bets = []
    pattern = f"{sport.lower()}_bets.json" if sport else "*_bets.json"
    for f in DATA_DIR.glob(pattern):
        with open(f) as fp:
            bets.extend(json.load(fp))
    return bets


def analyze_feature(bets: list[dict], feature_key: str) -> dict | None:
    """
    For a single feature, compare its average value for hits vs misses.
    Returns separation stats, or None if not enough data.
    """
    hit_vals = []
    miss_vals = []

    for bet in bets:
        val = bet.get("features", {}).get(feature_key)
        if val is None:
            continue
        if not isinstance(val, (int, float)):
            continue
        if bet["outcome"] == "hit":
            hit_vals.append(val)
        else:
            miss_vals.append(val)

    if len(hit_vals) < 10 or len(miss_vals) < 10:
        return None

    avg_hit = sum(hit_vals) / len(hit_vals)
    avg_miss = sum(miss_vals) / len(miss_vals)
    separation = avg_hit - avg_miss

    # Predictive accuracy: if feature > midpoint predicts hit
    midpoint = (avg_hit + avg_miss) / 2
    correct = sum(1 for v in hit_vals if v >= midpoint) + sum(1 for v in miss_vals if v < midpoint)
    total = len(hit_vals) + len(miss_vals)
    accuracy = correct / total

    # Effect size (Cohen's d approximation)
    import math
    hit_var = sum((v - avg_hit) ** 2 for v in hit_vals) / len(hit_vals)
    miss_var = sum((v - avg_miss) ** 2 for v in miss_vals) / len(miss_vals)
    pooled_std = math.sqrt((hit_var + miss_var) / 2) or 1
    effect_size = abs(separation) / pooled_std

    return {
        "feature": feature_key,
        "avgHit": round(avg_hit, 4),
        "avgMiss": round(avg_miss, 4),
        "separation": round(separation, 4),
        "accuracy": round(accuracy, 4),
        "effectSize": round(effect_size, 4),
        "nHit": len(hit_vals),
        "nMiss": len(miss_vals),
    }


def rank_features(bets: list[dict], bet_type: str) -> list[dict]:
    """Rank all features by predictive power for a bet type."""
    type_bets = [b for b in bets if b.get("betType") == bet_type]
    if not type_bets:
        return []

    # Collect all feature keys
    all_keys: set[str] = set()
    for bet in type_bets:
        all_keys.update(bet.get("features", {}).keys())

    # Analyze each
    results = []
    for key in sorted(all_keys):
        r = analyze_feature(type_bets, key)
        if r:
            results.append(r)

    # Sort by effect size (strongest signal first)
    results.sort(key=lambda x: x["effectSize"], reverse=True)
    return results


def main():
    parser = argparse.ArgumentParser(description="Rank metrics by predictive power")
    parser.add_argument("--sport", type=str, help="Filter by sport")
    parser.add_argument("--bet-type", type=str, help="Filter by bet type")
    args = parser.parse_args()

    bets = load_bets(args.sport)
    if not bets:
        print("No data. Run collect_data.py first.")
        return

    print(f"Loaded {len(bets)} bet scenarios\n")

    bet_types = [args.bet_type] if args.bet_type else ["spread", "over_under", "moneyline"]
    all_rankings = {}

    for bt in bet_types:
        rankings = rank_features(bets, bt)
        if not rankings:
            print(f"  {bt}: no data")
            continue

        all_rankings[bt] = rankings
        n = rankings[0]["nHit"] + rankings[0]["nMiss"]
        print(f"{'=' * 60}")
        print(f"  {bt.upper()} — {n} bets")
        print(f"{'=' * 60}")
        print(f"  {'Rank':<5} {'Feature':<25} {'Effect':>7} {'Acc':>7} {'AvgHit':>8} {'AvgMiss':>8} {'Sep':>8}")
        print(f"  {'-'*5} {'-'*25} {'-'*7} {'-'*7} {'-'*8} {'-'*8} {'-'*8}")

        for i, r in enumerate(rankings, 1):
            signal = ""
            if r["effectSize"] >= 0.5:
                signal = " << STRONG"
            elif r["effectSize"] >= 0.2:
                signal = " < useful"
            elif r["effectSize"] < 0.05:
                signal = "   noise"

            print(f"  {i:<5} {r['feature']:<25} {r['effectSize']:>7.3f} {r['accuracy']:>6.1%} "
                  f"{r['avgHit']:>8.3f} {r['avgMiss']:>8.3f} {r['separation']:>+8.3f}{signal}")

        # Summary
        strong = [r for r in rankings if r["effectSize"] >= 0.2]
        noise = [r for r in rankings if r["effectSize"] < 0.05]
        print(f"\n  STRONG signals ({len(strong)}): {', '.join(r['feature'] for r in strong)}")
        print(f"  NOISE ({len(noise)}): {', '.join(r['feature'] for r in noise)}")
        print()

    # Save rankings
    out_path = DATA_DIR / "metric_rankings.json"
    with open(out_path, "w") as f:
        json.dump(all_rankings, f, indent=2)
    print(f"Full rankings saved to {out_path}")


if __name__ == "__main__":
    main()
