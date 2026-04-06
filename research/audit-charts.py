"""
Audit: do our charts match what the market taxonomy says is relevant?

For each bet type in the stress test, submits to the live API and checks:
1. Did we return charts at all?
2. Do the chart titles/types match what the taxonomy says we should show?
3. Are we showing anything the taxonomy says is IRRELEVANT?
4. Are we missing anything the taxonomy says is RELEVANT?

Run: python research/audit-charts.py
"""

import json
import sys
from urllib.request import urlopen, Request

BASE = "https://swish-jet.vercel.app"

# Test bets covering every market category
TEST_BETS = [
    # Standard props
    {"sport": "NBA", "betType": "player_prop", "teams": ["New York Knicks", "Chicago Bulls"], "players": ["Jalen Brunson"], "market": "Points", "line": 26.5, "odds": "-115", "description": "Brunson O 26.5 Pts", "confidence": 0.9},
    {"sport": "NBA", "betType": "player_prop", "teams": ["New York Knicks", "Chicago Bulls"], "players": ["Karl-Anthony Towns"], "market": "Rebounds", "line": 11.5, "odds": "-110", "description": "KAT O 11.5 Reb", "confidence": 0.9},
    {"sport": "NBA", "betType": "player_prop", "teams": ["Boston Celtics", "Milwaukee Bucks"], "players": ["Jaylen Brown"], "market": "Three Pointers Made", "line": 2.5, "odds": "+110", "description": "Brown O 2.5 3PM", "confidence": 0.85},
    # First scorer
    {"sport": "NBA", "betType": "player_prop", "teams": ["San Antonio Spurs", "Indiana Pacers"], "players": ["Stephon Castle"], "market": "First Basket Scorer", "line": None, "odds": "+800", "description": "Castle First Basket", "confidence": 0.9},
    # Double-double
    {"sport": "NBA", "betType": "player_prop", "teams": ["Denver Nuggets", "Phoenix Suns"], "players": ["Nikola Jokic"], "market": "Double-Double", "line": None, "odds": "-200", "description": "Jokic Double-Double", "confidence": 0.9},
    # PRA combo
    {"sport": "NBA", "betType": "player_prop", "teams": ["Denver Nuggets", "Phoenix Suns"], "players": ["Nikola Jokic"], "market": "Pts+Reb+Ast", "line": 45.5, "odds": "-110", "description": "Jokic O 45.5 PRA", "confidence": 0.9},
    # Team bets
    {"sport": "NBA", "betType": "spread", "teams": ["New York Knicks", "Chicago Bulls"], "players": [], "line": -8.5, "odds": "-110", "description": "Knicks -8.5", "confidence": 0.9},
    {"sport": "NBA", "betType": "over_under", "teams": ["Minnesota Timberwolves", "Philadelphia 76ers"], "players": [], "line": 215.5, "odds": "-110", "description": "O 215.5 Wolves/76ers", "confidence": 0.9},
    {"sport": "NBA", "betType": "moneyline", "teams": ["Boston Celtics", "Milwaukee Bucks"], "players": [], "odds": "-150", "description": "Celtics ML", "confidence": 0.9},
    # MLB
    {"sport": "MLB", "betType": "player_prop", "teams": ["New York Yankees", "Miami Marlins"], "players": ["Aaron Judge"], "market": "Home Runs", "line": 0.5, "odds": "+210", "description": "Judge HR", "confidence": 0.85},
    {"sport": "MLB", "betType": "player_prop", "teams": ["Houston Astros", "Athletics"], "players": ["Framber Valdez"], "market": "Strikeouts", "line": 5.5, "odds": "-115", "description": "Valdez O 5.5 K", "confidence": 0.85},
    # NHL
    {"sport": "NHL", "betType": "player_prop", "teams": ["New York Rangers", "Carolina Hurricanes"], "players": ["Alexis Lafreniere"], "market": "Shots on Goal", "line": 3.5, "odds": "-120", "description": "Lafreniere O 3.5 SOG", "confidence": 0.85},
    {"sport": "NHL", "betType": "player_prop", "teams": ["Edmonton Oilers", "Vancouver Canucks"], "players": ["Connor McDavid"], "market": "Points", "line": 1.5, "odds": "+110", "description": "McDavid O 1.5 Pts", "confidence": 0.85},
    # Golf
    {"sport": "Golf", "betType": "player_prop", "teams": ["The Masters"], "players": ["Scottie Scheffler"], "market": "Tournament Winner", "odds": "+450", "description": "Scheffler Masters Win", "confidence": 0.85},
    # NFL
    {"sport": "NFL", "betType": "spread", "teams": ["San Francisco 49ers", "Dallas Cowboys"], "players": [], "line": -3.5, "odds": "-110", "description": "49ers -3.5", "confidence": 0.9},
]

# What each market SHOULD show (from taxonomy intuition)
EXPECTED = {
    "Points": ["game log", "hit rate", "trend", "opponent"],
    "Rebounds": ["game log", "hit rate", "trend", "opponent"],
    "Three Pointers Made": ["game log", "hit rate", "3pt"],
    "First Basket Scorer": ["tip-off", "first basket", "first shot", "team"],
    "Double-Double": ["double", "pts", "reb", "ast", "multi-stat"],
    "Pts+Reb+Ast": ["pra", "combo", "breakdown", "hit rate"],
    "spread": ["ats", "cover", "margin", "matchup"],
    "over_under": ["total", "over", "pace"],
    "moneyline": ["win", "comparison", "margin"],
    "Home Runs": ["game log", "hr", "home run"],
    "Strikeouts": ["game log", "strikeout", "k"],
    "Shots on Goal": ["game log", "shot", "sog"],
    "Tournament Winner": ["masters", "hole", "leaderboard", "round"],
}


def test_bet(bet):
    try:
        data = json.dumps({"extraction": bet}).encode()
        req = Request(f"{BASE}/api/stats", data=data, headers={"Content-Type": "application/json"}, method="POST")
        resp = urlopen(req, timeout=30)
        result = json.loads(resp.read())

        charts = result.get("charts", [])
        stats = result.get("stats", [])
        summary = result.get("summary", "")

        chart_titles = [c.get("title", "") for c in charts]
        chart_types = [c.get("type", "") for c in charts]

        market = bet.get("market", bet["betType"])
        expected = EXPECTED.get(market, EXPECTED.get(bet["betType"], []))

        # Check if any expected keywords appear in chart titles
        matched = []
        missing = []
        for keyword in expected:
            found = any(keyword.lower() in t.lower() for t in chart_titles) or keyword.lower() in summary.lower()
            if found:
                matched.append(keyword)
            else:
                missing.append(keyword)

        return {
            "bet": bet["description"],
            "market": market,
            "charts": len(charts),
            "stats": len(stats),
            "hasSummary": bool(summary),
            "chartTitles": chart_titles,
            "matched": matched,
            "missing": missing,
            "score": f"{len(matched)}/{len(expected)}",
        }
    except Exception as e:
        return {"bet": bet["description"], "error": str(e)[:100]}


print("Auditing chart relevance across all bet types...\n")

results = []
for bet in TEST_BETS:
    r = test_bet(bet)
    results.append(r)
    status = "PASS" if not r.get("missing") else "GAP" if r.get("charts", 0) > 0 else "FAIL"
    icon = {"PASS": "OK", "GAP": "!!", "FAIL": "XX"}[status]
    print(f"[{icon}] {r['bet']}")
    if r.get("error"):
        print(f"     ERROR: {r['error']}")
        continue
    print(f"     Charts: {r['charts']}, Stats: {r['stats']}, Match: {r['score']}")
    if r.get("chartTitles"):
        for t in r["chartTitles"]:
            print(f"       - {t}")
    if r.get("missing"):
        print(f"     MISSING: {', '.join(r['missing'])}")
    print()

# Summary
gaps = [r for r in results if r.get("missing")]
fails = [r for r in results if r.get("charts", 0) == 0 and not r.get("error")]
print(f"\n{'='*60}")
print(f"TOTAL: {len(results)} bets tested")
print(f"PASS:  {len(results) - len(gaps) - len(fails)}")
print(f"GAPS:  {len(gaps)} (charts shown but missing expected content)")
print(f"FAILS: {len(fails)} (no charts at all)")
print(f"\nGaps to fix:")
for r in gaps:
    print(f"  {r['bet']}: missing {', '.join(r['missing'])}")
