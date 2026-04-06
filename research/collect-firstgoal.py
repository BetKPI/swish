"""
Collect NHL First Goal Scorer data from api-web.nhle.com.

Fetches recent completed games, then checks play-by-play for the
first goal scorer. Outputs models/first-goal-data.json.

Free API, no key required.
"""

import json
import os
import time
import urllib.request
from datetime import datetime, timedelta

BASE = "https://api-web.nhle.com/v1"
OUT = os.path.join(os.path.dirname(__file__), "..", "models", "first-goal-data.json")


def fetch_json(url: str):
    """Fetch JSON from URL with retries."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SwishApp/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
            else:
                print(f"  FAIL {url[:80]}: {e}")
                return None


def get_current_season() -> str:
    """Get current NHL season string like '20252026'."""
    now = datetime.now()
    year = now.year - 1 if now.month < 7 else now.year
    return f"{year}{year + 1}"


def get_recent_games(weeks_back: int = 4) -> list:
    """Get completed games from recent schedule weeks."""
    games = []
    seen_ids = set()

    for week_offset in range(weeks_back):
        date = datetime.now() - timedelta(weeks=week_offset)
        date_str = date.strftime("%Y-%m-%d")
        print(f"  Fetching schedule for week of {date_str}...")
        data = fetch_json(f"{BASE}/schedule/{date_str}")
        if not data or "gameWeek" not in data:
            continue

        for day in data["gameWeek"]:
            for game in day.get("games", []):
                state = game.get("gameState", "")
                if state not in ("OFF", "FINAL"):
                    continue
                gid = game.get("id")
                if gid in seen_ids:
                    continue
                seen_ids.add(gid)

                home_abbrev = game.get("homeTeam", {}).get("abbrev", "")
                away_abbrev = game.get("awayTeam", {}).get("abbrev", "")
                games.append({
                    "gameId": gid,
                    "date": day.get("date", ""),
                    "homeTeam": home_abbrev,
                    "awayTeam": away_abbrev,
                })

    # Sort by date descending
    games.sort(key=lambda x: x["date"], reverse=True)
    return games


def build_roster_map(data: dict) -> dict:
    """Build a player ID -> name map from the play-by-play roster data."""
    roster = {}
    # rosterSpots is the usual location in NHL play-by-play
    for spot in data.get("rosterSpots", []):
        pid = spot.get("playerId")
        if not pid:
            continue
        first = spot.get("firstName", {})
        last = spot.get("lastName", {})
        if isinstance(first, dict):
            first = first.get("default", "")
        if isinstance(last, dict):
            last = last.get("default", "")
        name = f"{first} {last}".strip()
        if name:
            roster[pid] = name
    return roster


def get_first_goal(gameId: int) -> dict | None:
    """Fetch play-by-play and find the first goal scorer."""
    data = fetch_json(f"{BASE}/gamecenter/{gameId}/play-by-play")
    if not data or "plays" not in data:
        return None

    # Build roster lookup for player names
    roster = build_roster_map(data)

    for play in data["plays"]:
        if play.get("typeDescKey") == "goal":
            details = play.get("details", {})

            # Try multiple field patterns the NHL API uses for scorer name
            scorer_name = ""
            scorer_id = 0

            # Pattern 1: scoringPlayerId + roster lookup
            scoring_pid = details.get("scoringPlayerId", 0)
            if scoring_pid and scoring_pid in roster:
                scorer_name = roster[scoring_pid]
                scorer_id = scoring_pid

            # Pattern 2: direct name fields
            if not scorer_name:
                scorer_name = details.get("scoringPlayerName", "")

            # Pattern 3: firstName/lastName (may be dicts with "default")
            if not scorer_name:
                first = details.get("firstName", {})
                last = details.get("lastName", {})
                if isinstance(first, dict):
                    first = first.get("default", "")
                if isinstance(last, dict):
                    last = last.get("default", "")
                scorer_name = f"{first} {last}".strip()

            # Pattern 4: check play-level fields
            if not scorer_name:
                # Some versions put it under play.details with playerId
                pid = details.get("playerId", 0)
                if pid and pid in roster:
                    scorer_name = roster[pid]
                    scorer_id = pid

            if not scorer_id:
                scorer_id = scoring_pid or details.get("playerId", 0)

            period = play.get("periodDescriptor", {}).get("number", 1)
            time_in = play.get("timeInPeriod", "")
            event_team = details.get("eventOwnerTeamId")

            # Figure out which team scored
            scoring_team = ""
            if event_team:
                home_id = data.get("homeTeam", {}).get("id")
                away_id = data.get("awayTeam", {}).get("id")
                if event_team == home_id:
                    scoring_team = data.get("homeTeam", {}).get("abbrev", "")
                elif event_team == away_id:
                    scoring_team = data.get("awayTeam", {}).get("abbrev", "")

            return {
                "scorerName": scorer_name or "Unknown",
                "scorerPlayerId": scorer_id,
                "scoringTeam": scoring_team,
                "period": period,
                "timeInPeriod": time_in,
            }

    return None


def main():
    print("=== NHL First Goal Data Collector ===")
    print("Fetching recent NHL games...")
    games = get_recent_games(weeks_back=5)
    print(f"Found {len(games)} completed games")

    if not games:
        print("No games found. NHL season may not be active.")
        result = {
            "_meta": {
                "gamesProcessed": 0,
                "lastUpdated": datetime.now().isoformat(),
                "season": get_current_season(),
                "note": "No games found - season may not be active",
            },
            "teams": {},
            "players": {},
            "topFirstScorers": [],
        }
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w") as f:
            json.dump(result, f, indent=2)
        print(f"Wrote empty data to {OUT}")
        return

    # Collect first goal data per game
    records = []
    for i, game in enumerate(games):
        print(f"[{i+1}/{len(games)}] Game {game['gameId']}: {game['awayTeam']} @ {game['homeTeam']} ({game['date']})")
        fg = get_first_goal(game["gameId"])
        if fg:
            print(f"  First goal: {fg['scorerName']} ({fg['scoringTeam']}) at {fg['timeInPeriod']} P{fg['period']}")
            records.append({
                **game,
                **fg,
            })
        else:
            print("  No goal data found")

        if i % 5 == 4:
            time.sleep(0.5)

    # Build per-team data
    team_data: dict[str, dict] = {}
    for rec in records:
        for team_abbrev in [rec["homeTeam"], rec["awayTeam"]]:
            if not team_abbrev:
                continue
            if team_abbrev not in team_data:
                team_data[team_abbrev] = {
                    "abbrev": team_abbrev,
                    "gamesPlayed": 0,
                    "firstGoalFor": 0,
                    "firstGoalAgainst": 0,
                    "firstGoalScorers": {},
                }
            team_data[team_abbrev]["gamesPlayed"] += 1

            if rec["scoringTeam"] == team_abbrev:
                team_data[team_abbrev]["firstGoalFor"] += 1
                scorer = rec["scorerName"]
                scorers = team_data[team_abbrev]["firstGoalScorers"]
                if scorer not in scorers:
                    scorers[scorer] = {"name": scorer, "count": 0, "games": []}
                scorers[scorer]["count"] += 1
                opponent = rec["awayTeam"] if team_abbrev == rec["homeTeam"] else rec["homeTeam"]
                scorers[scorer]["games"].append({
                    "date": rec["date"],
                    "vs": opponent,
                    "time": rec["timeInPeriod"],
                    "period": rec["period"],
                })
            else:
                team_data[team_abbrev]["firstGoalAgainst"] += 1

    # Calculate rates for team scorers
    for team in team_data.values():
        gp = team["gamesPlayed"]
        team["firstGoalForRate"] = round(team["firstGoalFor"] / gp * 100, 1) if gp else 0
        scorers_list = []
        for s in team["firstGoalScorers"].values():
            s["rate"] = round(s["count"] / gp * 100, 1) if gp else 0
            scorers_list.append(s)
        scorers_list.sort(key=lambda x: x["count"], reverse=True)
        team["firstGoalScorers"] = scorers_list

    # Build per-player data
    player_data: dict[str, dict] = {}
    for rec in records:
        name = rec["scorerName"]
        if name == "Unknown":
            continue
        if name not in player_data:
            player_data[name] = {
                "name": name,
                "playerId": rec["scorerPlayerId"],
                "team": rec["scoringTeam"],
                "firstGoalCount": 0,
                "recentGames": [],
            }
        player_data[name]["firstGoalCount"] += 1
        opponent = rec["awayTeam"] if rec["scoringTeam"] == rec["homeTeam"] else rec["homeTeam"]
        player_data[name]["recentGames"].append({
            "date": rec["date"],
            "vs": opponent,
            "time": rec["timeInPeriod"],
            "period": rec["period"],
        })

    # Top first goal scorers
    total_games = len(records)
    top_scorers = sorted(player_data.values(), key=lambda x: x["firstGoalCount"], reverse=True)[:20]
    top_list = []
    for p in top_scorers:
        top_list.append({
            "name": p["name"],
            "team": p["team"],
            "count": p["firstGoalCount"],
            "rate": round(p["firstGoalCount"] / total_games * 100, 1) if total_games else 0,
        })

    result = {
        "_meta": {
            "gamesProcessed": len(records),
            "totalGames": len(games),
            "lastUpdated": datetime.now().isoformat(),
            "season": get_current_season(),
        },
        "teams": team_data,
        "players": player_data,
        "topFirstScorers": top_list,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n=== Done ===")
    print(f"Processed {len(records)} games with first goal data")
    print(f"Found data for {len(team_data)} teams, {len(player_data)} players")
    print(f"Saved to {OUT}")


if __name__ == "__main__":
    main()
