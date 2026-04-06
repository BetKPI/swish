"""
Collect NBA first basket data from play-by-play.
Run locally daily — NBA.com blocks Vercel's IPs.

Usage:
    python research/collect-firstbasket.py
    python research/collect-firstbasket.py --games 50

Output: models/first-basket-data.json (deployed with the app)
"""

import json
import re
import argparse
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen, Request

MODELS_DIR = Path(__file__).parent.parent / "models"
HEADERS = {"Referer": "https://www.nba.com/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def fetch(url):
    req = Request(url, headers=HEADERS)
    return json.loads(urlopen(req, timeout=15).read())


def get_recent_game_ids(n=40):
    data = fetch("https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json")
    games = [g for g in data["scoreboard"]["games"] if g.get("gameStatus") == 3]
    if not games:
        # No finished games today — use yesterday's last ID
        # Try fetching a known recent range
        return [f"00{22501130 - i}" for i in range(n)]
    last_id = int(games[-1]["gameId"])
    return [str(last_id - i).zfill(10) for i in range(n)]


def parse_game(game_id):
    try:
        pbp = fetch(f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{game_id}.json")
    except Exception:
        return None

    actions = pbp.get("game", {}).get("actions", [])
    home = pbp["game"].get("homeTeam", {}).get("teamTricode", "")
    away = pbp["game"].get("awayTeam", {}).get("teamTricode", "")

    tip_off = None
    first_basket = None
    first_shots = {"home": None, "away": None}

    for a in actions:
        if a.get("period") != 1:
            continue
        if not tip_off and a.get("actionType") == "jumpball" and a.get("description"):
            m = re.match(r"Jump Ball (.+?) vs\. (.+?): Tip to (.+)", a["description"])
            if m:
                tip_off = {"winner": m.group(1), "loser": m.group(2), "tippedTo": m.group(3)}
        is_shot = a.get("actionType") in ("2pt", "3pt")
        if is_shot and a.get("teamTricode"):
            tc = a["teamTricode"]
            if tc == home and not first_shots["home"]:
                first_shots["home"] = a.get("playerNameI", "")
            if tc == away and not first_shots["away"]:
                first_shots["away"] = a.get("playerNameI", "")
        if not first_basket and is_shot and a.get("shotResult") == "Made":
            first_basket = {
                "player": a.get("playerNameI", ""),
                "team": a.get("teamTricode", ""),
                "type": a.get("actionType", ""),
                "clock": a.get("clock", ""),
            }
        if tip_off and first_basket and first_shots["home"] and first_shots["away"]:
            break

    return {"home": home, "away": away, "tipOff": tip_off, "firstBasket": first_basket, "firstShots": first_shots}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games", type=int, default=40)
    args = parser.parse_args()

    print(f"Fetching {args.games} recent NBA games...")
    game_ids = get_recent_game_ids(args.games)

    results = {}
    for i, gid in enumerate(game_ids):
        r = parse_game(gid)
        if r:
            results[gid] = r
        if (i + 1) % 10 == 0:
            print(f"  Parsed {i + 1}/{len(game_ids)} ({len(results)} successful)")

    print(f"Parsed {len(results)} games total")

    # Build profiles
    player_stats = {}
    tip_stats = {}

    for gid, game in results.items():
        if game.get("firstBasket"):
            p = game["firstBasket"]["player"]
            if p not in player_stats:
                player_stats[p] = {"firstBaskets": 0, "firstShots": 0, "games": []}
            player_stats[p]["firstBaskets"] += 1
            opp = game["away"] if game["firstBasket"]["team"] == game["home"] else game["home"]
            player_stats[p]["games"].append({"vs": opp, "scoredFirst": True, "shotFirst": False, "shotType": game["firstBasket"]["type"]})

        for venue in ("home", "away"):
            p = game.get("firstShots", {}).get(venue)
            if p:
                if p not in player_stats:
                    player_stats[p] = {"firstBaskets": 0, "firstShots": 0, "games": []}
                player_stats[p]["firstShots"] += 1
                existing = [g for g in player_stats[p]["games"] if g.get("vs") == (game["away"] if venue == "home" else game["home"])]
                if existing:
                    existing[0]["shotFirst"] = True
                else:
                    opp = game["away"] if venue == "home" else game["home"]
                    player_stats[p]["games"].append({"vs": opp, "scoredFirst": False, "shotFirst": True})

        if game.get("tipOff"):
            w, l = game["tipOff"]["winner"], game["tipOff"]["loser"]
            for p in (w, l):
                if p not in tip_stats:
                    tip_stats[p] = {"wins": 0, "losses": 0}
            tip_stats[w]["wins"] += 1
            tip_stats[l]["losses"] += 1

    output = {
        "_meta": {"gamesProcessed": len(results), "lastUpdated": datetime.now().strftime("%Y-%m-%d")},
        "players": {name: {"name": name, "firstBaskets": s["firstBaskets"], "firstShots": s["firstShots"], "games": s["games"][:15]}
                    for name, s in sorted(player_stats.items(), key=lambda x: x[1]["firstBaskets"], reverse=True)},
        "tipOff": {name: {"name": name, "wins": s["wins"], "losses": s["losses"], "total": s["wins"] + s["losses"],
                   "winRate": round(s["wins"] / (s["wins"] + s["losses"]) * 100) if (s["wins"] + s["losses"]) > 0 else 0}
                   for name, s in sorted(tip_stats.items(), key=lambda x: x[1]["wins"], reverse=True)},
        "topFirstScorers": sorted([{"name": n, "count": s["firstBaskets"], "shotCount": s["firstShots"]}
                                    for n, s in player_stats.items() if s["firstBaskets"] >= 1],
                                   key=lambda x: x["count"], reverse=True)[:25],
    }

    out_path = MODELS_DIR / "first-basket-data.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to {out_path}")
    print(f"Players: {len(player_stats)}, Tip-off: {len(tip_stats)}")
    print(f"Top first scorers: {', '.join(p['name'] + f' ({p[\"count\"]})' for p in output['topFirstScorers'][:5])}")
    print(f"Top tip-off: {', '.join(f'{t[\"name\"]} {t[\"winRate\"]}%' for t in list(output['tipOff'].values())[:5])}")
    print("\nCommit models/first-basket-data.json and deploy.")


if __name__ == "__main__":
    main()
