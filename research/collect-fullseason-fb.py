"""Collect full-season first basket data from NBA.com play-by-play."""

import json, re, sys, time
from urllib.request import urlopen, Request
from collections import defaultdict
from pathlib import Path

MODELS = Path(__file__).parent.parent / "models"
HEADERS = {"Referer": "https://www.nba.com/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch(url):
    req = Request(url, headers=HEADERS)
    return json.loads(urlopen(req, timeout=10).read())

# Get latest game ID
sb = fetch("https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json")
all_games = sb["scoreboard"]["games"]
end_id = max(int(g["gameId"]) for g in all_games) if all_games else 22501147
start_id = 22500001
total = end_id - start_id + 1
print(f"Scraping {total} games ({start_id} to {end_id})...")

# Track data per team
team_first_baskets = defaultdict(lambda: defaultdict(lambda: {"count": 0, "games": []}))
team_first_shots = defaultdict(lambda: defaultdict(int))
center_tips = defaultdict(lambda: {"wins": 0, "losses": 0, "teams": set()})
# Track which center plays for which team
center_team_map = {}
game_count = 0
errors = 0

for i, gid_num in enumerate(range(start_id, end_id + 1)):
    gid = f"00{gid_num}"
    try:
        pbp = fetch(f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gid}.json")
        actions = pbp.get("game", {}).get("actions", [])
        # homeTeam/awayTeam are often empty — extract teams from actions
        teams_seen = set()
        for a in actions[:30]:
            tc = a.get("teamTricode")
            if tc:
                teams_seen.add(tc)
            if len(teams_seen) >= 2:
                break
        if len(teams_seen) < 2:
            continue
        teams_list = sorted(teams_seen)
        home = teams_list[0]  # alphabetical — not perfect but works for tracking
        away = teams_list[1]

        tip_off = None
        first_basket = None
        first_shots = {home: None, away: None}

        for a in actions:
            if a.get("period") != 1:
                continue
            # Tip-off
            if not tip_off and a.get("actionType") == "jumpball" and a.get("description"):
                m = re.match(r"Jump Ball (.+?) vs\. (.+?): Tip to (.+)", a["description"])
                if m:
                    tip_off = {"winner": m.group(1), "loser": m.group(2), "tippedTo": m.group(3)}
                    # Figure out which team each center is on by looking at the tippedTo player's team
                    tip_to_name = m.group(3)
                    # Find what team tippedTo is on from subsequent actions
                    for a2 in actions:
                        if a2.get("playerNameI") == tip_to_name and a2.get("teamTricode"):
                            tip_to_team = a2["teamTricode"]
                            opp_team = away if tip_to_team == home else home
                            center_tips[m.group(1)]["wins"] += 1
                            center_tips[m.group(2)]["losses"] += 1
                            center_team_map[m.group(1)] = tip_to_team
                            center_team_map[m.group(2)] = opp_team
                            break

            # First shots
            is_shot = a.get("actionType") in ("2pt", "3pt")
            if is_shot and a.get("teamTricode"):
                tc = a["teamTricode"]
                if tc in first_shots and first_shots[tc] is None:
                    first_shots[tc] = a.get("playerNameI", "")

            # First basket
            if not first_basket and is_shot and a.get("shotResult") == "Made":
                first_basket = {"player": a.get("playerNameI", ""), "team": a.get("teamTricode", ""), "type": a.get("actionType", "")}

            if tip_off and first_basket and all(first_shots.values()):
                break

        game_count += 1

        # Record first basket
        if first_basket:
            tc = first_basket["team"]
            player = first_basket["player"]
            opp = away if tc == home else home
            team_first_baskets[tc][player]["count"] += 1
            if len(team_first_baskets[tc][player]["games"]) < 15:
                team_first_baskets[tc][player]["games"].append({"vs": opp, "type": first_basket["type"]})

        # Record first shots
        for tc, player in first_shots.items():
            if player:
                team_first_shots[tc][player] += 1

    except Exception:
        errors += 1

    if (i + 1) % 100 == 0:
        sys.stdout.write(f"\r  {i+1}/{total} ({game_count} ok, {errors} err)")
        sys.stdout.flush()
        time.sleep(0.1)  # tiny pause every 100 to be nice

print(f"\nParsed {game_count} games, {errors} errors")

# Build output with per-team structure
output = {
    "_meta": {"gamesProcessed": game_count, "lastUpdated": "2026-04-06", "season": "2025-26"},
    "teams": {},
    "tipOff": {},
    "topFirstScorers": [],
}

# Per-team data
all_teams = sorted(set(list(team_first_baskets.keys()) + list(team_first_shots.keys())))
for tc in all_teams:
    fb = team_first_baskets.get(tc, {})
    fs = team_first_shots.get(tc, {})
    team_games = sum(v["count"] for v in fb.values()) if fb else 0

    top_fb = sorted(
        [{"name": p, "count": d["count"], "rate": round(d["count"] / max(team_games, 1) * 100, 1), "games": d["games"]}
         for p, d in fb.items()],
        key=lambda x: x["count"], reverse=True
    )[:10]

    top_fs = sorted(
        [{"name": p, "count": c, "rate": round(c / max(team_games, 1) * 100, 1)}
         for p, c in fs.items()],
        key=lambda x: x["count"], reverse=True
    )[:10]

    output["teams"][tc] = {
        "tricode": tc,
        "totalGames": team_games,
        "firstScorers": top_fb,
        "firstShots": top_fs,
    }

# Tip-off centers with team mapping
for name, stats in sorted(center_tips.items(), key=lambda x: x[1]["wins"] + x[1]["losses"], reverse=True):
    total = stats["wins"] + stats["losses"]
    if total >= 3:
        output["tipOff"][name] = {
            "name": name,
            "team": center_team_map.get(name, "?"),
            "wins": stats["wins"],
            "losses": stats["losses"],
            "total": total,
            "winRate": round(stats["wins"] / total * 100),
        }

# Global top
all_fb = defaultdict(int)
all_fb_team = {}
for tc, players in team_first_baskets.items():
    for player, data in players.items():
        all_fb[player] += data["count"]
        all_fb_team[player] = tc
output["topFirstScorers"] = sorted(
    [{"name": n, "count": c, "team": all_fb_team.get(n, "?")} for n, c in all_fb.items()],
    key=lambda x: x["count"], reverse=True
)[:30]

with open(MODELS / "first-basket-data.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"\nSaved to models/first-basket-data.json")
print(f"Teams: {len(output['teams'])}")
print(f"Centers: {len(output['tipOff'])}")
print(f"\nTop 5 first scorers:")
for p in output["topFirstScorers"][:5]:
    print(f"  {p['name']} ({p['team']}): {p['count']} first baskets")
print(f"\nTop 5 tip-off:")
for s in list(output["tipOff"].values())[:5]:
    print(f"  {s['name']} ({s['team']}): {s['wins']}/{s['total']} ({s['winRate']}%)")

# Show Spurs specifically
sas = output["teams"].get("SAS", {})
print(f"\nSpurs ({sas.get('totalGames', 0)} games):")
print("  First scorers:")
for p in sas.get("firstScorers", [])[:5]:
    print(f"    {p['name']}: {p['count']} ({p['rate']}%)")
print("  First shots:")
for p in sas.get("firstShots", [])[:5]:
    print(f"    {p['name']}: {p['count']} ({p['rate']}%)")
