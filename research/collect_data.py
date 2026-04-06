"""
Collect historical bet data with PRE-GAME features for predictive training.

For each completed game, we reconstruct what a bettor would have known
BEFORE the game started (team records, recent form, scoring trends, ATS
history, etc.) and then label with the actual outcome.

This mirrors what swishScore.ts computes in production — the same features,
just reconstructed from historical data.

Usage:
    python research/collect_data.py --sport NBA --days 30
    python research/collect_data.py --all --days 30

Output: research/data/{sport}_bets.json
"""

import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from collections import defaultdict

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"
SPORT_MAP = {
    "NBA": ("basketball", "nba"),
    "NFL": ("football", "nfl"),
    "MLB": ("baseball", "mlb"),
    "NHL": ("hockey", "nhl"),
}

# Typical spread/total lines by sport for generating bet scenarios
SPORT_LINES = {
    "NBA": {"spreads": [-8, -5, -3, -1.5, 1.5, 3, 5, 8], "totals": [210, 215, 220, 225, 230]},
    "NFL": {"spreads": [-7, -3.5, -3, -1.5, 1.5, 3, 3.5, 7], "totals": [38, 41, 44, 47, 50]},
    "MLB": {"spreads": [-1.5, 1.5], "totals": [7, 7.5, 8, 8.5, 9, 9.5]},
    "NHL": {"spreads": [-1.5, 1.5], "totals": [5, 5.5, 6, 6.5]},
}


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "Swish-Research/1.0"})
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except (HTTPError, Exception) as e:
        print(f"  Error fetching {url}: {e}")
        return {}


def fetch_all_games(sport: str, days: int) -> list[dict]:
    """Fetch all completed games, sorted oldest-first for chronological processing."""
    cat, league = SPORT_MAP.get(sport.upper(), (None, None))
    if not cat:
        print(f"Unknown sport: {sport}")
        return []

    raw_games = []
    for d in range(days, -1, -1):  # oldest first
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

            raw_games.append({
                "date": date_str,
                "homeTeam": home.get("team", {}).get("displayName", ""),
                "awayTeam": away.get("team", {}).get("displayName", ""),
                "homeScore": home_score,
                "awayScore": away_score,
                "total": home_score + away_score,
                "margin": home_score - away_score,
                "homeWin": home_score > away_score,
            })

    return raw_games


class TeamTracker:
    """Tracks rolling team stats as we process games chronologically."""

    def __init__(self):
        self.teams: dict[str, dict] = defaultdict(lambda: {
            "wins": 0, "losses": 0,
            "homeWins": 0, "homeLosses": 0,
            "awayWins": 0, "awayLosses": 0,
            "recentMargins": [],     # last 10 margins (from team's perspective)
            "recentScoresFor": [],   # last 10 points scored
            "recentScoresAgainst": [],  # last 10 points allowed
            "recentTotals": [],      # last 10 game totals
            "atsCoverCount": {},     # line -> cover count
            "atsFailCount": {},      # line -> fail count
            "overCount": {},         # line -> over count
            "underCount": {},        # line -> under count
            "streak": 0,             # positive = win streak, negative = loss streak
            "lastGameDate": None,
        })

    def get_pregame_features(self, team: str, is_home: bool) -> dict:
        """Get features that would have been known BEFORE a game."""
        t = self.teams[team]
        total_games = t["wins"] + t["losses"]

        if total_games < 3:
            return {}  # not enough history

        win_pct = t["wins"] / total_games if total_games > 0 else 0.5
        home_games = t["homeWins"] + t["homeLosses"]
        away_games = t["awayWins"] + t["awayLosses"]
        home_pct = t["homeWins"] / home_games if home_games > 0 else 0.5
        away_pct = t["awayWins"] / away_games if away_games > 0 else 0.5

        recent_margins = t["recentMargins"][-10:]
        recent_for = t["recentScoresFor"][-10:]
        recent_against = t["recentScoresAgainst"][-10:]
        recent_totals = t["recentTotals"][-10:]
        last5_margins = t["recentMargins"][-5:]
        last5_for = t["recentScoresFor"][-5:]

        avg_margin = sum(recent_margins) / len(recent_margins) if recent_margins else 0
        avg_for = sum(recent_for) / len(recent_for) if recent_for else 0
        avg_against = sum(recent_against) / len(recent_against) if recent_against else 0
        avg_total = sum(recent_totals) / len(recent_totals) if recent_totals else 0
        last5_avg_margin = sum(last5_margins) / len(last5_margins) if last5_margins else 0
        last5_avg_for = sum(last5_for) / len(last5_for) if last5_for else 0

        # Recent form: wins in last 5
        last5_wins = sum(1 for m in last5_margins if m > 0)

        # Close games: decided by 5 or fewer
        close_games = [m for m in recent_margins if abs(m) <= 5]
        close_wins = sum(1 for m in close_games if m > 0)
        close_rate = close_wins / len(close_games) if close_games else 0.5

        # Scoring trend: last 5 avg vs last 10 avg
        scoring_trend = last5_avg_for - avg_for if avg_for > 0 else 0

        # Rest days
        rest_days = None
        if t["lastGameDate"]:
            try:
                last = datetime.strptime(t["lastGameDate"], "%Y%m%d")
                rest_days = (datetime.now() - last).days
            except ValueError:
                pass

        return {
            "totalGames": total_games,
            "winPct": round(win_pct, 4),
            "homePct": round(home_pct, 4),
            "awayPct": round(away_pct, 4),
            "avgMargin": round(avg_margin, 2),
            "avgFor": round(avg_for, 2),
            "avgAgainst": round(avg_against, 2),
            "avgTotal": round(avg_total, 2),
            "last5Wins": last5_wins,
            "last5AvgMargin": round(last5_avg_margin, 2),
            "last5AvgFor": round(last5_avg_for, 2),
            "scoringTrend": round(scoring_trend, 2),
            "closeWinRate": round(close_rate, 4),
            "streak": t["streak"],
            "restDays": rest_days,
            "isHome": is_home,
        }

    def get_ats_rate(self, team: str, line: float) -> float:
        """Get ATS cover rate for a specific line."""
        t = self.teams[team]
        covers = t["atsCoverCount"].get(str(line), 0)
        fails = t["atsFailCount"].get(str(line), 0)
        total = covers + fails
        return covers / total if total > 0 else 0.5

    def get_over_rate(self, team: str, line: float) -> float:
        """Get over rate for a specific total line."""
        t = self.teams[team]
        overs = t["overCount"].get(str(line), 0)
        unders = t["underCount"].get(str(line), 0)
        total = overs + unders
        return overs / total if total > 0 else 0.5

    def record_game(self, team: str, pts_for: int, pts_against: int,
                    is_home: bool, date: str, game_total: int):
        """Update team's rolling stats after a game."""
        t = self.teams[team]
        margin = pts_for - pts_against
        won = margin > 0

        t["wins" if won else "losses"] += 1
        if is_home:
            t["homeWins" if won else "homeLosses"] += 1
        else:
            t["awayWins" if won else "awayLosses"] += 1

        t["recentMargins"].append(margin)
        t["recentScoresFor"].append(pts_for)
        t["recentScoresAgainst"].append(pts_against)
        t["recentTotals"].append(game_total)

        # Keep only last 20 for memory
        for key in ["recentMargins", "recentScoresFor", "recentScoresAgainst", "recentTotals"]:
            if len(t[key]) > 20:
                t[key] = t[key][-20:]

        # Streak
        if won:
            t["streak"] = t["streak"] + 1 if t["streak"] > 0 else 1
        else:
            t["streak"] = t["streak"] - 1 if t["streak"] < 0 else -1

        t["lastGameDate"] = date

        # Update ATS and O/U counters for common lines
        sport_lines = None
        for sport, lines in SPORT_LINES.items():
            # We don't know the sport here, update all common lines
            for spread in lines["spreads"]:
                key = str(spread)
                if (margin + spread) > 0:
                    t["atsCoverCount"][key] = t["atsCoverCount"].get(key, 0) + 1
                else:
                    t["atsFailCount"][key] = t["atsFailCount"].get(key, 0) + 1

            for ou_line in lines["totals"]:
                key = str(ou_line)
                if game_total > ou_line:
                    t["overCount"][key] = t["overCount"].get(key, 0) + 1
                else:
                    t["underCount"][key] = t["underCount"].get(key, 0) + 1


def generate_bets_with_features(game: dict, sport: str, tracker: TeamTracker) -> list[dict]:
    """Generate bet scenarios using PRE-GAME features (before recording this game)."""
    bets = []
    home = game["homeTeam"]
    away = game["awayTeam"]
    margin = game["margin"]
    total = game["total"]

    home_features = tracker.get_pregame_features(home, is_home=True)
    away_features = tracker.get_pregame_features(away, is_home=False)

    # Skip if either team has < 3 games of history
    if not home_features or not away_features:
        return []

    lines = SPORT_LINES.get(sport.upper(), SPORT_LINES["NBA"])

    # Spread bets
    for spread in lines["spreads"]:
        covered = (margin + spread) > 0
        home_ats = tracker.get_ats_rate(home, spread)
        bets.append({
            "date": game["date"],
            "sport": sport.upper(),
            "betType": "spread",
            "team": home,
            "opponent": away,
            "line": spread,
            "outcome": "hit" if covered else "miss",
            "features": {
                **home_features,
                "atsCoverRate": round(home_ats, 4),
                "oppWinPct": away_features["winPct"],
                "oppAvgFor": away_features["avgFor"],
                "oppAvgAgainst": away_features["avgAgainst"],
            },
        })

    # Over/under bets (over perspective)
    for ou_line in lines["totals"]:
        went_over = total > ou_line
        home_over_rate = tracker.get_over_rate(home, ou_line)
        away_over_rate = tracker.get_over_rate(away, ou_line)
        # Combined projection from pre-game averages
        projection = home_features["avgFor"] + away_features["avgFor"]
        bets.append({
            "date": game["date"],
            "sport": sport.upper(),
            "betType": "over_under",
            "team": home,
            "opponent": away,
            "line": ou_line,
            "outcome": "hit" if went_over else "miss",
            "features": {
                "overRate": round((home_over_rate + away_over_rate) / 2, 4),
                "projection": round(projection, 2),
                "projVsLine": round(projection - ou_line, 2),
                "homeAvgTotal": home_features["avgTotal"],
                "awayAvgTotal": away_features["avgTotal"],
                "homeScoringTrend": home_features["scoringTrend"],
                "awayScoringTrend": away_features["scoringTrend"],
                "homeLast5AvgFor": home_features["last5AvgFor"],
                "awayLast5AvgFor": away_features["last5AvgFor"],
            },
        })

    # Moneyline — home team
    bets.append({
        "date": game["date"],
        "sport": sport.upper(),
        "betType": "moneyline",
        "team": home,
        "opponent": away,
        "outcome": "hit" if game["homeWin"] else "miss",
        "features": {
            **home_features,
            "oppWinPct": away_features["winPct"],
            "oppAvgMargin": away_features["avgMargin"],
            "oppStreak": away_features["streak"],
        },
    })

    # Moneyline — away team
    bets.append({
        "date": game["date"],
        "sport": sport.upper(),
        "betType": "moneyline",
        "team": away,
        "opponent": home,
        "outcome": "miss" if game["homeWin"] else "hit",
        "features": {
            **away_features,
            "oppWinPct": home_features["winPct"],
            "oppAvgMargin": home_features["avgMargin"],
            "oppStreak": home_features["streak"],
        },
    })

    return bets


def collect_sport(sport: str, days: int) -> list[dict]:
    """Collect data for one sport with chronological feature building."""
    # Fetch extra history for building team profiles before the training window
    warmup_days = 15  # 15 days of warmup before the training window
    total_days = days + warmup_days

    print(f"  Fetching {total_days} days of games ({warmup_days}d warmup + {days}d training)...")
    all_games = fetch_all_games(sport, total_days)
    print(f"  Found {len(all_games)} completed games")

    tracker = TeamTracker()
    bets = []
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")

    for game in all_games:
        # Generate bets BEFORE recording the game (pre-game features)
        if game["date"] >= cutoff:
            game_bets = generate_bets_with_features(game, sport, tracker)
            bets.extend(game_bets)

        # NOW record the game to update team profiles for future games
        tracker.record_game(
            game["homeTeam"], game["homeScore"], game["awayScore"],
            is_home=True, date=game["date"], game_total=game["total"]
        )
        tracker.record_game(
            game["awayTeam"], game["awayScore"], game["homeScore"],
            is_home=False, date=game["date"], game_total=game["total"]
        )

    return bets


def main():
    parser = argparse.ArgumentParser(description="Collect historical bet data with pre-game features")
    parser.add_argument("--sport", type=str, help="Sport to collect (NBA, NFL, MLB, NHL)")
    parser.add_argument("--days", type=int, default=30, help="Days of training data")
    parser.add_argument("--all", action="store_true", help="Collect all sports")
    args = parser.parse_args()

    sports = list(SPORT_MAP.keys()) if args.all else [args.sport.upper()] if args.sport else ["NBA"]

    for sport in sports:
        print(f"Collecting {sport} — {args.days} days of predictive training data...")
        bets = collect_sport(sport, args.days)
        print(f"  Generated {len(bets)} bet scenarios with pre-game features")

        out_path = DATA_DIR / f"{sport.lower()}_bets.json"
        with open(out_path, "w") as f:
            json.dump(bets, f, indent=2)
        print(f"  Saved to {out_path}")

    print("\nDone. Run research/optimize_weights.py to find optimal weights.")


if __name__ == "__main__":
    main()
