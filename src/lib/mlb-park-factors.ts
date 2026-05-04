/**
 * MLB ballpark factors — multi-year averages, normalized to 100 = league avg.
 * Higher = more hitter-friendly for that stat. Used to add park context to
 * player-prop insights ("Coors Field, +15% HR").
 *
 * Sources blended from FanGraphs / Baseball Savant / Statcast 2022-2024.
 * These move slowly; a refresh once a year is enough.
 */

export interface ParkFactors {
  team: string;
  parkName: string;
  runs: number; // 100 = neutral
  hr: number;
  hits: number;
  k: number; // pitcher K factor — >100 = pitcher-friendly for K's
}

const PARK_FACTORS: Record<string, ParkFactors> = {
  COL: { team: "COL", parkName: "Coors Field", runs: 120, hr: 115, hits: 112, k: 92 },
  CIN: { team: "CIN", parkName: "Great American Ball Park", runs: 106, hr: 112, hits: 102, k: 98 },
  PHI: { team: "PHI", parkName: "Citizens Bank Park", runs: 105, hr: 113, hits: 101, k: 100 },
  NYY: { team: "NYY", parkName: "Yankee Stadium", runs: 104, hr: 113, hits: 100, k: 100 },
  TEX: { team: "TEX", parkName: "Globe Life Field", runs: 107, hr: 109, hits: 103, k: 98 },
  BAL: { team: "BAL", parkName: "Camden Yards", runs: 102, hr: 110, hits: 100, k: 100 },
  TOR: { team: "TOR", parkName: "Rogers Centre", runs: 103, hr: 109, hits: 101, k: 99 },
  MIL: { team: "MIL", parkName: "American Family Field", runs: 102, hr: 110, hits: 100, k: 100 },
  CHC: { team: "CHC", parkName: "Wrigley Field", runs: 102, hr: 105, hits: 101, k: 100 },
  CWS: { team: "CWS", parkName: "Rate Field", runs: 102, hr: 113, hits: 100, k: 99 },
  HOU: { team: "HOU", parkName: "Daikin Park", runs: 102, hr: 102, hits: 100, k: 100 },
  ARI: { team: "ARI", parkName: "Chase Field", runs: 102, hr: 104, hits: 100, k: 99 },
  ATL: { team: "ATL", parkName: "Truist Park", runs: 103, hr: 105, hits: 101, k: 100 },
  BOS: { team: "BOS", parkName: "Fenway Park", runs: 108, hr: 96, hits: 106, k: 99 },
  WSH: { team: "WSH", parkName: "Nationals Park", runs: 100, hr: 100, hits: 100, k: 100 },
  STL: { team: "STL", parkName: "Busch Stadium", runs: 98, hr: 94, hits: 98, k: 101 },
  CLE: { team: "CLE", parkName: "Progressive Field", runs: 98, hr: 98, hits: 98, k: 102 },
  MIN: { team: "MIN", parkName: "Target Field", runs: 99, hr: 98, hits: 99, k: 100 },
  LAA: { team: "LAA", parkName: "Angel Stadium", runs: 99, hr: 100, hits: 99, k: 100 },
  KC: { team: "KC", parkName: "Kauffman Stadium", runs: 98, hr: 90, hits: 100, k: 100 },
  NYM: { team: "NYM", parkName: "Citi Field", runs: 96, hr: 95, hits: 97, k: 102 },
  TB: { team: "TB", parkName: "Steinbrenner Field", runs: 97, hr: 95, hits: 97, k: 102 },
  PIT: { team: "PIT", parkName: "PNC Park", runs: 96, hr: 90, hits: 99, k: 102 },
  DET: { team: "DET", parkName: "Comerica Park", runs: 96, hr: 90, hits: 100, k: 101 },
  MIA: { team: "MIA", parkName: "loanDepot park", runs: 95, hr: 90, hits: 98, k: 103 },
  LAD: { team: "LAD", parkName: "Dodger Stadium", runs: 95, hr: 100, hits: 96, k: 102 },
  OAK: { team: "OAK", parkName: "Sutter Health Park", runs: 95, hr: 92, hits: 97, k: 102 },
  SEA: { team: "SEA", parkName: "T-Mobile Park", runs: 92, hr: 95, hits: 95, k: 104 },
  SF: { team: "SF", parkName: "Oracle Park", runs: 91, hr: 86, hits: 95, k: 105 },
  SD: { team: "SD", parkName: "Petco Park", runs: 92, hr: 90, hits: 95, k: 104 },
};

const TEAM_NAME_TO_ABBR: Record<string, string> = {
  "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
  "New York Yankees": "NYY", "Athletics": "OAK", "Oakland Athletics": "OAK",
  "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD",
  "San Francisco Giants": "SF", "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB", "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

/** Resolve "New York Yankees" or "Yankees" to a park-factors entry, or null. */
export function getParkFactors(teamName: string): ParkFactors | null {
  if (!teamName) return null;
  const exact = TEAM_NAME_TO_ABBR[teamName];
  if (exact && PARK_FACTORS[exact]) return PARK_FACTORS[exact];
  // Try suffix match: "Yankees" → "New York Yankees" → "NYY"
  const lower = teamName.toLowerCase();
  for (const [full, abbr] of Object.entries(TEAM_NAME_TO_ABBR)) {
    if (full.toLowerCase().endsWith(lower) || lower.endsWith(full.toLowerCase().split(/\s+/).pop() || "")) {
      if (PARK_FACTORS[abbr]) return PARK_FACTORS[abbr];
    }
  }
  // Direct abbr lookup
  const upper = teamName.toUpperCase();
  if (PARK_FACTORS[upper]) return PARK_FACTORS[upper];
  return null;
}
