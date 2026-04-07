"""
Collect historical PGA major tournament results from ESPN.

Fetches leaderboard data for US Open, PGA Championship, and The Open
Championship (2019-2025). Saves JSON files to models/pga-history/.

The Masters is skipped — we already have detailed hole-by-hole data.

Free API, no key required.
"""

import json
import os
import time
import urllib.request
from datetime import datetime

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "pga-history")
LEADERBOARD = "https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard"

# ESPN event IDs for each major by year
# The Open was cancelled in 2020 due to COVID
TOURNAMENTS = {
    "us-open": {
        "name": "U.S. Open",
        "events": {
            2019: "401056556",
            2020: "401219333",   # Held in September 2020
            2021: "401243414",
            2022: "401353222",
            2023: "401465533",
            2024: "401580355",
            2025: "401703515",
        },
    },
    "pga-championship": {
        "name": "PGA Championship",
        "events": {
            2019: "401056552",
            2020: "401219481",   # Held in August 2020
            2021: "401243418",
            2022: "401353226",
            2023: "401465523",
            2024: "401580351",
            2025: "401703511",
        },
    },
    "the-open": {
        "name": "The Open Championship",
        "events": {
            2019: "401056547",
            # 2020: cancelled due to COVID
            2021: "401243410",
            2022: "401353217",
            2023: "401465539",
            2024: "401580360",
            2025: "401703521",
        },
    },
}


def fetch_json(url: str):
    """Fetch JSON from URL with retries."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SwishApp/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt < 2:
                time.sleep(2)
            else:
                print(f"  FAIL {url[:80]}: {e}")
                return None


def fetch_event_leaderboard(event_id: str) -> list:
    """Fetch full leaderboard for a specific event via the web leaderboard API."""
    url = f"{LEADERBOARD}?event={event_id}"
    data = fetch_json(url)
    if not data:
        return []

    events = data.get("events", [])
    if not events:
        return []

    event = events[0]
    competitions = event.get("competitions", [])
    if not competitions:
        return []

    competitors = competitions[0].get("competitors", [])
    results = []

    for comp in competitors:
        athlete = comp.get("athlete", {})
        player_name = athlete.get("displayName", "Unknown")

        # Position from status.position.displayName (e.g. "1", "T3", "CUT")
        status = comp.get("status", {})
        pos_info = status.get("position", {})
        pos_display = pos_info.get("displayName", "")
        # Parse numeric position; for "T3" -> 3, for "CUT" -> 999
        pos_num = 999
        if pos_display:
            digits = "".join(c for c in pos_display if c.isdigit())
            if digits:
                pos_num = int(digits)

        # Score to par from statistics
        score_to_par = ""
        for stat in comp.get("statistics", []):
            if stat.get("name") == "scoreToPar":
                score_to_par = stat.get("displayValue", "")
                break

        # Total strokes from score.value
        score_obj = comp.get("score", {})
        total_strokes = None
        if score_obj and score_obj.get("value") is not None:
            total_strokes = int(score_obj["value"])

        # Round-by-round scores from linescores
        rounds = []
        for i, ls in enumerate(comp.get("linescores", []), 1):
            value = ls.get("value")
            if value is not None:
                rounds.append({
                    "round": i,
                    "strokes": int(value),
                    "toPar": ls.get("displayValue", ""),
                })

        results.append({
            "playerName": player_name,
            "playerId": athlete.get("id", comp.get("id", "")),
            "position": pos_num,
            "positionDisplay": pos_display,
            "scoreToPar": score_to_par,
            "totalStrokes": total_strokes,
            "rounds": rounds,
        })

    # Sort by position
    results.sort(key=lambda x: x["position"])
    return results


def collect_tournament(slug: str, info: dict) -> dict:
    """Collect all years of data for a tournament."""
    tournament_name = info["name"]
    events = info["events"]
    all_years = {}

    for year in sorted(events.keys()):
        event_id = events[year]
        print(f"  {year} (event {event_id})...", end=" ", flush=True)

        results = fetch_event_leaderboard(event_id)
        if results:
            all_years[str(year)] = {
                "year": year,
                "eventId": event_id,
                "players": results,
            }
            print(f"{len(results)} players")
        else:
            print("no data")

        # Be polite to the API
        time.sleep(1)

    return {
        "_meta": {
            "tournament": tournament_name,
            "slug": slug,
            "yearsCollected": sorted(all_years.keys()),
            "lastUpdated": datetime.now().isoformat(),
            "source": "ESPN API (free, no auth)",
        },
        "years": all_years,
    }


def main():
    print("=== PGA Major Tournament History Collector ===\n")
    os.makedirs(OUT_DIR, exist_ok=True)

    for slug, info in TOURNAMENTS.items():
        print(f"\n--- {info['name']} ---")
        data = collect_tournament(slug, info)

        out_path = os.path.join(OUT_DIR, f"{slug}.json")
        with open(out_path, "w") as f:
            json.dump(data, f, indent=2)

        total_players = sum(
            len(y["players"]) for y in data["years"].values()
        )
        print(f"  Saved {len(data['years'])} years, {total_players} total player entries -> {out_path}")

    print("\n=== Done ===")
    print(f"Output directory: {OUT_DIR}")


if __name__ == "__main__":
    main()
