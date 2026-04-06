"""
Collect MLB NRFI (No Run First Inning) data from statsapi.mlb.com.

Fetches starting pitchers from recent games, then checks play-by-play
for first inning runs. Outputs models/nrfi-data.json.

Free API, no key required.
"""

import json
import os
import time
import urllib.request
from datetime import datetime, timedelta

BASE = "https://statsapi.mlb.com/api/v1"
OUT = os.path.join(os.path.dirname(__file__), "..", "models", "nrfi-data.json")


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


def get_recent_game_ids(days_back: int = 14) -> list:
    """Get completed game IDs from recent schedule."""
    games = []
    today = datetime.now()
    for offset in range(days_back):
        date = today - timedelta(days=offset)
        date_str = date.strftime("%Y-%m-%d")
        data = fetch_json(f"{BASE}/schedule?sportId=1&date={date_str}&hydrate=linescore")
        if not data or "dates" not in data:
            continue
        for d in data["dates"]:
            for g in d.get("games", []):
                status = g.get("status", {}).get("abstractGameState", "")
                if status == "Final":
                    games.append({
                        "gamePk": g["gamePk"],
                        "date": g.get("officialDate", date_str),
                        "home": g.get("teams", {}).get("home", {}).get("team", {}).get("name", ""),
                        "away": g.get("teams", {}).get("away", {}).get("team", {}).get("name", ""),
                    })
    return games


def get_starting_pitchers(gamePk: int) -> list:
    """Get starting pitchers for a game from boxscore."""
    data = fetch_json(f"{BASE}/game/{gamePk}/boxscore")
    if not data:
        return []
    starters = []
    for side in ["home", "away"]:
        team_data = data.get("teams", {}).get(side, {})
        team_name = team_data.get("team", {}).get("name", "Unknown")
        # Find the starting pitcher from the pitchers list
        pitcher_ids = team_data.get("pitchers", [])
        if pitcher_ids:
            sp_id = pitcher_ids[0]  # First pitcher listed is the starter
            players = team_data.get("players", {})
            player_key = f"ID{sp_id}"
            player_info = players.get(player_key, {})
            name = player_info.get("person", {}).get("fullName", f"Unknown-{sp_id}")
            starters.append({
                "id": sp_id,
                "name": name,
                "team": team_name,
                "side": side,
            })
    return starters


def get_first_inning_runs(gamePk: int, pitcher_id: int) -> int | None:
    """Check play-by-play for runs in the 1st inning while pitcher was on mound."""
    data = fetch_json(f"https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live")
    if not data or "liveData" not in data:
        return None
    all_plays = data.get("liveData", {}).get("plays", {}).get("allPlays", [])
    runs = 0
    for play in all_plays:
        inning = play.get("about", {}).get("inning")
        if inning is None:
            continue
        if inning > 1:
            break
        if inning < 1:
            continue
        # Only count runs while our pitcher was pitching
        matchup_pitcher_id = play.get("matchup", {}).get("pitcher", {}).get("id")
        if matchup_pitcher_id != pitcher_id:
            continue
        for runner in play.get("runners", []):
            if runner.get("movement", {}).get("end") == "score":
                runs += 1
    return runs


def main():
    print("=== NRFI Data Collector ===")
    print("Fetching recent MLB games...")
    games = get_recent_game_ids(days_back=21)
    print(f"Found {len(games)} completed games")

    if not games:
        print("No games found. MLB season may not be active yet.")
        # Write empty but valid JSON
        result = {
            "_meta": {
                "gamesProcessed": 0,
                "lastUpdated": datetime.now().isoformat(),
                "season": str(datetime.now().year),
                "note": "No games found - season may not be active",
            },
            "pitchers": {},
        }
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w") as f:
            json.dump(result, f, indent=2)
        print(f"Wrote empty data to {OUT}")
        return

    # Collect per-pitcher data
    pitcher_data: dict[str, dict] = {}
    games_processed = 0

    for i, game in enumerate(games):
        print(f"\n[{i+1}/{len(games)}] Game {game['gamePk']}: {game['away']} @ {game['home']} ({game['date']})")

        starters = get_starting_pitchers(game["gamePk"])
        if not starters:
            print("  No starting pitchers found, skipping")
            continue

        for sp in starters:
            runs = get_first_inning_runs(game["gamePk"], sp["id"])
            if runs is None:
                print(f"  {sp['name']}: couldn't parse play-by-play")
                continue

            result_str = "NRFI" if runs == 0 else "YRFI"
            opponent = game["away"] if sp["side"] == "home" else game["home"]
            print(f"  {sp['name']} ({sp['team']}): {runs} runs in 1st → {result_str}")

            key = sp["name"]
            if key not in pitcher_data:
                pitcher_data[key] = {
                    "name": sp["name"],
                    "team": sp["team"],
                    "playerId": sp["id"],
                    "gamesStarted": 0,
                    "cleanFirstInnings": 0,
                    "recentGames": [],
                }

            pitcher_data[key]["gamesStarted"] += 1
            if runs == 0:
                pitcher_data[key]["cleanFirstInnings"] += 1
            pitcher_data[key]["recentGames"].append({
                "date": game["date"],
                "opponent": opponent,
                "firstInningRuns": runs,
                "result": result_str,
            })

        games_processed += 1
        # Small delay to be polite to the API
        if i % 5 == 4:
            time.sleep(0.5)

    # Calculate rates
    for key in pitcher_data:
        p = pitcher_data[key]
        if p["gamesStarted"] > 0:
            p["nrfiRate"] = round(p["cleanFirstInnings"] / p["gamesStarted"] * 100, 1)
        else:
            p["nrfiRate"] = 0.0
        # Sort recent games by date descending
        p["recentGames"].sort(key=lambda x: x["date"], reverse=True)

    result = {
        "_meta": {
            "gamesProcessed": games_processed,
            "lastUpdated": datetime.now().isoformat(),
            "season": str(datetime.now().year),
        },
        "pitchers": pitcher_data,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n=== Done ===")
    print(f"Processed {games_processed} games")
    print(f"Found data for {len(pitcher_data)} pitchers")
    print(f"Saved to {OUT}")


if __name__ == "__main__":
    main()
