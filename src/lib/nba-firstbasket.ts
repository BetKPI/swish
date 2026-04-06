/**
 * NBA First Basket data from models/first-basket-data.json.
 *
 * Pre-built from full season play-by-play (1100+ games).
 * Data is per-team: first basket scorers, first shot takers, tip-off centers.
 * Updated daily by research/collect-fullseason-fb.py.
 */

import { readFileSync } from "fs";
import { join } from "path";

interface TeamFirstBasketData {
  tricode: string;
  totalGames: number;
  firstScorers: { name: string; count: number; rate: number; games: { vs: string; type: string }[] }[];
  firstShots: { name: string; count: number; rate: number }[];
}

interface TipOffCenter {
  name: string;
  team: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

interface FirstBasketDB {
  _meta: { gamesProcessed: number; lastUpdated: string; season: string };
  teams: Record<string, TeamFirstBasketData>;
  tipOff: Record<string, TipOffCenter>;
  topFirstScorers: { name: string; count: number; team: string }[];
}

let _db: FirstBasketDB | null = null;

function loadDB(): FirstBasketDB | null {
  if (_db) return _db;
  try {
    const raw = readFileSync(join(process.cwd(), "models", "first-basket-data.json"), "utf-8");
    _db = JSON.parse(raw);
    return _db;
  } catch {
    return null;
  }
}

/**
 * Find team tricode from a team name (fuzzy match).
 */
function findTeamTricode(db: FirstBasketDB, teamName: string): string | null {
  const name = teamName.toLowerCase();
  // Direct tricode match
  if (db.teams[teamName.toUpperCase()]) return teamName.toUpperCase();
  // Common name mappings
  const aliases: Record<string, string> = {
    "spurs": "SAS", "san antonio": "SAS", "pacers": "IND", "indiana": "IND",
    "celtics": "BOS", "boston": "BOS", "lakers": "LAL", "los angeles lakers": "LAL",
    "clippers": "LAC", "warriors": "GSW", "golden state": "GSW", "nuggets": "DEN", "denver": "DEN",
    "heat": "MIA", "miami": "MIA", "bucks": "MIL", "milwaukee": "MIL",
    "76ers": "PHI", "sixers": "PHI", "philadelphia": "PHI", "knicks": "NYK", "new york knicks": "NYK",
    "nets": "BKN", "brooklyn": "BKN", "raptors": "TOR", "toronto": "TOR",
    "bulls": "CHI", "chicago": "CHI", "cavaliers": "CLE", "cleveland": "CLE", "cavs": "CLE",
    "pistons": "DET", "detroit": "DET", "hawks": "ATL", "atlanta": "ATL",
    "hornets": "CHA", "charlotte": "CHA", "magic": "ORL", "orlando": "ORL",
    "wizards": "WAS", "washington": "WAS", "timberwolves": "MIN", "minnesota": "MIN", "wolves": "MIN",
    "thunder": "OKC", "oklahoma": "OKC", "blazers": "POR", "portland": "POR", "trail blazers": "POR",
    "kings": "SAC", "sacramento": "SAC", "suns": "PHX", "phoenix": "PHX",
    "mavericks": "DAL", "dallas": "DAL", "mavs": "DAL", "rockets": "HOU", "houston": "HOU",
    "grizzlies": "MEM", "memphis": "MEM", "pelicans": "NOP", "new orleans": "NOP",
    "jazz": "UTA", "utah": "UTA",
  };
  for (const [alias, tc] of Object.entries(aliases)) {
    if (name.includes(alias)) return tc;
  }
  return null;
}

/**
 * Get first basket data filtered to the specific teams in the bet.
 */
export async function getFirstBasketData(
  playerName: string,
  teamNames: string[]
): Promise<{
  playerTeam: TeamFirstBasketData | null;
  opponentTeam: TeamFirstBasketData | null;
  playerTipCenter: TipOffCenter | null;
  opponentTipCenter: TipOffCenter | null;
  tipMatchup: { player: TipOffCenter; opponent: TipOffCenter; headToHead: string } | null;
  gamesProcessed: number;
  season: string;
} | null> {
  const db = loadDB();
  if (!db) return null;

  // Find team tricodes
  const tricodes = teamNames.map((t) => findTeamTricode(db, t)).filter(Boolean) as string[];
  if (tricodes.length < 2) {
    // Try to find player's team from the data
    for (const [tc, team] of Object.entries(db.teams)) {
      const hasPlayer = team.firstScorers.some((p) =>
        p.name.toLowerCase().includes(playerName.toLowerCase()) ||
        playerName.toLowerCase().includes(p.name.toLowerCase())
      );
      if (hasPlayer && !tricodes.includes(tc)) {
        tricodes.unshift(tc);
        break;
      }
    }
  }

  const playerTeamTC = tricodes[0] || null;
  const opponentTeamTC = tricodes[1] || null;

  const playerTeam = playerTeamTC ? db.teams[playerTeamTC] || null : null;
  const opponentTeam = opponentTeamTC ? db.teams[opponentTeamTC] || null : null;

  // Find tip-off centers for each team
  let playerTipCenter: TipOffCenter | null = null;
  let opponentTipCenter: TipOffCenter | null = null;

  for (const [, center] of Object.entries(db.tipOff)) {
    if (center.team === playerTeamTC && (!playerTipCenter || center.total > playerTipCenter.total)) {
      playerTipCenter = center;
    }
    if (center.team === opponentTeamTC && (!opponentTipCenter || center.total > opponentTipCenter.total)) {
      opponentTipCenter = center;
    }
  }

  // Head-to-head tip matchup
  let tipMatchup = null;
  if (playerTipCenter && opponentTipCenter) {
    const pRate = playerTipCenter.winRate;
    const oRate = opponentTipCenter.winRate;
    const edge = pRate > oRate ? playerTipCenter.name : opponentTipCenter.name;
    tipMatchup = {
      player: playerTipCenter,
      opponent: opponentTipCenter,
      headToHead: `${edge} has the edge (${pRate > oRate ? pRate : oRate}% vs ${pRate > oRate ? oRate : pRate}%)`,
    };
  }

  return {
    playerTeam,
    opponentTeam,
    playerTipCenter,
    opponentTipCenter,
    tipMatchup,
    gamesProcessed: db._meta.gamesProcessed,
    season: db._meta.season,
  };
}
