/**
 * MLB stadium coordinates + outfield orientation.
 *
 * `bearingCF` is the compass bearing (degrees) FROM home plate TO center
 * field — used to translate raw wind direction into "out to CF" / "in from
 * RF" / "L to R" relative to the field. So when wind is FROM 270° (W) and
 * the ballpark CF bearing is 90° (E), the wind is blowing OUT to CF.
 *
 * Bearings sourced from public stadium orientation tables; close enough
 * for HR-impact heuristics (the wind angle bands are coarse anyway).
 */

export interface ParkCoords {
  team: string;
  parkName: string;
  lat: number;
  lon: number;
  /** Compass bearing from home plate to center field (0=N, 90=E, 180=S, 270=W). */
  bearingCF: number;
  /** Roof: open (no roof), retractable (often open / close), closed (always indoors / dome). */
  roof: "open" | "retractable" | "closed";
}

const PARKS: Record<string, ParkCoords> = {
  ARI: { team: "ARI", parkName: "Chase Field", lat: 33.4453, lon: -112.0667, bearingCF: 23, roof: "retractable" },
  ATL: { team: "ATL", parkName: "Truist Park", lat: 33.8908, lon: -84.4678, bearingCF: 88, roof: "open" },
  BAL: { team: "BAL", parkName: "Camden Yards", lat: 39.2839, lon: -76.6217, bearingCF: 60, roof: "open" },
  BOS: { team: "BOS", parkName: "Fenway Park", lat: 42.3467, lon: -71.0972, bearingCF: 30, roof: "open" },
  CHC: { team: "CHC", parkName: "Wrigley Field", lat: 41.9484, lon: -87.6553, bearingCF: 30, roof: "open" },
  CWS: { team: "CWS", parkName: "Rate Field", lat: 41.83, lon: -87.6339, bearingCF: 35, roof: "open" },
  CIN: { team: "CIN", parkName: "Great American Ball Park", lat: 39.0975, lon: -84.5083, bearingCF: 130, roof: "open" },
  CLE: { team: "CLE", parkName: "Progressive Field", lat: 41.4962, lon: -81.6852, bearingCF: 0, roof: "open" },
  COL: { team: "COL", parkName: "Coors Field", lat: 39.7559, lon: -104.9942, bearingCF: 0, roof: "open" },
  DET: { team: "DET", parkName: "Comerica Park", lat: 42.339, lon: -83.0485, bearingCF: 30, roof: "open" },
  HOU: { team: "HOU", parkName: "Daikin Park", lat: 29.7572, lon: -95.3556, bearingCF: 60, roof: "retractable" },
  KC: { team: "KC", parkName: "Kauffman Stadium", lat: 39.0517, lon: -94.4803, bearingCF: 45, roof: "open" },
  LAA: { team: "LAA", parkName: "Angel Stadium", lat: 33.8003, lon: -117.8827, bearingCF: 60, roof: "open" },
  LAD: { team: "LAD", parkName: "Dodger Stadium", lat: 34.0739, lon: -118.24, bearingCF: 22, roof: "open" },
  MIA: { team: "MIA", parkName: "loanDepot park", lat: 25.7781, lon: -80.2197, bearingCF: 40, roof: "retractable" },
  MIL: { team: "MIL", parkName: "American Family Field", lat: 43.0282, lon: -87.9712, bearingCF: 65, roof: "retractable" },
  MIN: { team: "MIN", parkName: "Target Field", lat: 44.9817, lon: -93.2776, bearingCF: 90, roof: "open" },
  NYM: { team: "NYM", parkName: "Citi Field", lat: 40.7571, lon: -73.8458, bearingCF: 25, roof: "open" },
  NYY: { team: "NYY", parkName: "Yankee Stadium", lat: 40.8296, lon: -73.9262, bearingCF: 30, roof: "open" },
  OAK: { team: "OAK", parkName: "Sutter Health Park", lat: 38.5803, lon: -121.5133, bearingCF: 45, roof: "open" },
  PHI: { team: "PHI", parkName: "Citizens Bank Park", lat: 39.9061, lon: -75.1665, bearingCF: 35, roof: "open" },
  PIT: { team: "PIT", parkName: "PNC Park", lat: 40.4469, lon: -80.0057, bearingCF: 0, roof: "open" },
  SD: { team: "SD", parkName: "Petco Park", lat: 32.7073, lon: -117.157, bearingCF: 0, roof: "open" },
  SF: { team: "SF", parkName: "Oracle Park", lat: 37.7786, lon: -122.3893, bearingCF: 90, roof: "open" },
  SEA: { team: "SEA", parkName: "T-Mobile Park", lat: 47.5914, lon: -122.3325, bearingCF: 45, roof: "retractable" },
  STL: { team: "STL", parkName: "Busch Stadium", lat: 38.6226, lon: -90.1928, bearingCF: 60, roof: "open" },
  TB: { team: "TB", parkName: "Steinbrenner Field", lat: 27.9805, lon: -82.5072, bearingCF: 90, roof: "open" },
  TEX: { team: "TEX", parkName: "Globe Life Field", lat: 32.7474, lon: -97.0825, bearingCF: 0, roof: "retractable" },
  TOR: { team: "TOR", parkName: "Rogers Centre", lat: 43.6414, lon: -79.3894, bearingCF: 0, roof: "retractable" },
  WSH: { team: "WSH", parkName: "Nationals Park", lat: 38.873, lon: -77.0074, bearingCF: 30, roof: "open" },
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

/** Resolve "New York Yankees" or "Yankees" or "NYY" to a ParkCoords entry. */
export function getParkCoords(teamName: string): ParkCoords | null {
  if (!teamName) return null;
  const exact = TEAM_NAME_TO_ABBR[teamName];
  if (exact && PARKS[exact]) return PARKS[exact];
  const upper = teamName.toUpperCase();
  if (PARKS[upper]) return PARKS[upper];
  const lower = teamName.toLowerCase();
  for (const [full, abbr] of Object.entries(TEAM_NAME_TO_ABBR)) {
    const lastWord = full.toLowerCase().split(/\s+/).pop() || "";
    if (lastWord && lower === lastWord && PARKS[abbr]) return PARKS[abbr];
  }
  return null;
}

/**
 * Translate a raw wind direction (compass bearing the wind is BLOWING TO,
 * 0-359) and the park's CF bearing into a fielding-relative description:
 * "out to CF", "in from CF", "L to R", or "R to L".
 */
export function classifyWind(windToBearing: number, parkBearingCF: number): string {
  // Angle of wind relative to CF (0 = exactly out to CF, 180 = in from CF)
  let delta = ((windToBearing - parkBearingCF) + 360) % 360;
  if (delta > 180) delta -= 360; // -180..180
  const abs = Math.abs(delta);
  if (abs <= 30) return "out to CF";
  if (abs >= 150) return "in from CF";
  if (delta > 0) return "L to R"; // wind clockwise from CF (right field side)
  return "R to L";
}
