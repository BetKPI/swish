"""
Collect historical bet outcome data from ESPN for model training.

Scrapes recent completed games and generates synthetic bet scenarios
with known outcomes (hit/miss) for backtesting Swish Score weights.

Usage:
    python research/collect_data.py --sport NBA --days 30
    python research/collect_data.py --sport MLB --days 14
    python research/collect_data.py --all

Output: research/data/{sport}_bets.json
"""

import json
import sys
import os
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"
SPORT_MAP = {
    "NBA": ("basketball", "nba"),
    "NFL": ("football", "nfl"),
    "MLB": ("baseball", "mlb"),
    "NHL": ("hockey", "nhl"),
}


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "Swish-Research/1.0"})
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        print(f"  HTTP {e.code} for {url}")
        return {}


def get_completed_games(sport: str, days: int) -> list[dict]:
    """Fetch completed games from ESPN scoreboard for the past N days."""
    cat, league = SPORT_MAP.get(sport.upper(), (None, None))
    if not cat:
        print(f"Unknown sport: {sport}")
        return []

    games = []
    for d in range(days):
        date = datetime.now() - timedelta(days=d)
        date_str = date.strftime("%Y%m%d")
        url = f"{ESPN_BASE}/{cat}/{league}/scoreboard?dates={date_str}"
        data = fetch_json(url)

        for event in data.get("events", []):
            comp = event.get("competitions", [{}])[0]
            status = comp.get("status", {}).get("type", {}).get("name", "")
            if status != "STATUS_FINAL":
                continue

            competitors = comp.get("competitors", [])
            if len(competitors) < 2:
                continue

            home = next((c for c in competitors if c.get("homeAway") == "home"), competitors[0])
            away = next((c for c in competitors if c.get("homeAway") == "away"), competitors[1])

            home_score = int(home.get("score", 0))
            away_score = int(away.get("score", 0))
            total = home_score + away_score
            margin = home_score - away_score  # positive = home win

            game = {
                "date": date_str,
                "sport": sport.upper(),
                "homeTeam": home.get("team", {}).get("displayName", ""),
                "awayTeam": away.get("team", {}).get("displayName", ""),
                "homeScore": home_score,
                "awayScore": away_score,
                "total": total,
                "margin": margin,
                "homeWin": home_score > away_score,
            }

            # Generate synthetic bet scenarios from this game
            bets = generate_bets(game, sport)
            games.extend(bets)

    return games


def generate_bets(game: dict, sport: str) -> list[dict]:
    """Generate synthetic bet scenarios with known outcomes from a completed game."""
    bets = []
    margin = game["margin"]
    total = game["total"]

    # Spread bets: test various spread lines
    for spread in [-10, -7, -5, -3, -1.5, 1.5, 3, 5, 7, 10]:
        # Home team getting spread points
        covered = (margin + spread) > 0
        bets.append({
            **game,
            "betType": "spread",
            "team": game["homeTeam"],
            "line": spread,
            "outcome": "hit" if covered else "miss",
        })

    # Over/under bets: test various totals
    avg_total = {"NBA": 220, "NFL": 44, "MLB": 8.5, "NHL": 5.5}.get(sport, 200)
    for ou_line in [avg_total - 10, avg_total - 5, avg_total - 2, avg_total, avg_total + 2, avg_total + 5, avg_total + 10]:
        bets.append({
            **game,
            "betType": "over_under",
            "line": ou_line,
            "outcome": "hit" if total > ou_line else "miss",
        })

    # Moneyline
    bets.append({
        **game,
        "betType": "moneyline",
        "team": game["homeTeam"],
        "outcome": "hit" if game["homeWin"] else "miss",
    })
    bets.append({
        **game,
        "betType": "moneyline",
        "team": game["awayTeam"],
        "outcome": "miss" if game["homeWin"] else "hit",
    })

    return bets


def main():
    parser = argparse.ArgumentParser(description="Collect historical bet data")
    parser.add_argument("--sport", type=str, help="Sport to collect (NBA, NFL, MLB, NHL)")
    parser.add_argument("--days", type=int, default=30, help="Days of history to collect")
    parser.add_argument("--all", action="store_true", help="Collect all sports")
    args = parser.parse_args()

    sports = list(SPORT_MAP.keys()) if args.all else [args.sport.upper()] if args.sport else ["NBA"]

    for sport in sports:
        print(f"Collecting {sport} data for last {args.days} days...")
        bets = get_completed_games(sport, args.days)
        print(f"  Generated {len(bets)} synthetic bet scenarios")

        out_path = DATA_DIR / f"{sport.lower()}_bets.json"
        with open(out_path, "w") as f:
            json.dump(bets, f, indent=2)
        print(f"  Saved to {out_path}")

    print("\nDone. Run research/optimize_weights.py next to find better weights.")


if __name__ == "__main__":
    main()
