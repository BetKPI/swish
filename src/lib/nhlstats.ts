/**
 * NHL Stats API — free, no key required.
 * https://api-web.nhle.com
 *
 * Provides: player search, season stats, game logs, team standings, schedules.
 */

import { cachedFetch, TTL } from "./fetch";

const BASE = "https://api-web.nhle.com/v1";
const STATS_BASE = "https://api.nhle.com/stats/rest/en";

// ── Types ──────────────────────────────────────────────────────────

export interface NHLPlayer {
  playerId: number;
  fullName: string;
  firstName: { default: string };
  lastName: { default: string };
  position: string;
  teamAbbrev?: { default: string };
  teamName?: { default: string };
  sweaterNumber?: number;
}

export interface NHLGameLog {
  gameId: number;
  gameDate: string;
  opponentAbbrev: string | { default: string };
  opponentCommonName?: { default: string };
  homeRoadFlag: "H" | "R";
  // Skater stats
  goals?: number;
  assists?: number;
  points?: number;
  shots?: number;
  plusMinus?: number;
  pim?: number;
  toi?: string; // "20:15"
  powerPlayGoals?: number;
  // Goalie stats
  gamesStarted?: number;
  savePctg?: number;
  shotsAgainst?: number;
  saves?: number;
  goalsAgainst?: number;
}

export interface NHLPropAnalysis {
  stat: string;
  line: number;
  hitCount: number;
  totalGames: number;
  hitRate: number;
  average: number;
  last5Avg: number;
  trend: "rising" | "falling" | "stable";
  gameValues: { date: string; value: number; hit: boolean; opponent: string }[];
}

// ── Player search ──────────────────────────────────────────────────

export async function searchPlayer(
  playerName: string
): Promise<NHLPlayer | null> {
  try {
    // Primary: search.d3.nhle.com (the current working search endpoint)
    const data = await cachedFetch<Record<string, unknown>[]>(
      `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=5&q=${encodeURIComponent(playerName)}`,
      TTL.MEDIUM
    );
    if (data && Array.isArray(data) && data.length > 0) {
      const nameLower = playerName.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exact = data.find((p: any) => (p.name || "").toLowerCase() === nameLower);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = exact || data[0] as any;
      if (match?.playerId) {
        return {
          playerId: match.playerId,
          fullName: match.name || playerName,
          firstName: { default: match.name?.split(" ")[0] || "" },
          lastName: { default: match.name?.split(" ").slice(1).join(" ") || "" },
          position: match.positionCode || "?",
          teamAbbrev: { default: match.teamAbbrev || match.lastTeamAbbrev || "" },
        };
      }
    }

    // Fallback: old endpoint (may still work in some regions)
    const fallback = await cachedFetch<NHLPlayer[] | Record<string, unknown>>(
      `${BASE}/player/search?q=${encodeURIComponent(playerName)}&limit=5`,
      TTL.MEDIUM
    );
    if (fallback && Array.isArray(fallback) && fallback.length > 0) {
      const nameLower = playerName.toLowerCase();
      const exactMatch = fallback.find(
        (p: NHLPlayer) => {
          const full = `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.toLowerCase();
          return full === nameLower;
        }
      );
      return exactMatch || fallback[0];
    }

    console.log(`[NHL] Player search failed for: "${playerName}"`);
    return null;
  } catch {
    return null;
  }
}

// ── Player game log ────────────────────────────────────────────────

export async function getPlayerGameLog(
  playerId: number,
  season?: string
): Promise<NHLGameLog[]> {
  const yr = season || getCurrentNHLSeason();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/player/${playerId}/game-log/${yr}/2`, // 2 = regular season
      TTL.MEDIUM
    );
    if (!data) return [];
    const games: NHLGameLog[] = data.gameLog || [];
    return games.slice(0, 15); // Most recent 15
  } catch {
    return [];
  }
}

// ── Player season stats (landing page) ─────────────────────────────

export async function getPlayerStats(
  playerId: number
): Promise<Record<string, unknown> | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/player/${playerId}/landing`,
      TTL.MEDIUM
    );
    if (!data) return null;
    return {
      featuredStats: data.featuredStats,
      careerTotals: data.careerTotals,
      position: data.position,
      firstName: data.firstName?.default,
      lastName: data.lastName?.default,
      teamName: data.currentTeamAbbrev,
      seasonTotals: data.seasonTotals,
    };
  } catch {
    return null;
  }
}

// ── Team search ────────────────────────────────────────────────────

const NHL_TEAMS: Record<string, string> = {
  "anaheim ducks": "ANA", "ducks": "ANA",
  "arizona coyotes": "ARI", "coyotes": "ARI",
  "boston bruins": "BOS", "bruins": "BOS",
  "buffalo sabres": "BUF", "sabres": "BUF",
  "calgary flames": "CGY", "flames": "CGY",
  "carolina hurricanes": "CAR", "hurricanes": "CAR",
  "chicago blackhawks": "CHI", "blackhawks": "CHI",
  "colorado avalanche": "COL", "avalanche": "COL",
  "columbus blue jackets": "CBJ", "blue jackets": "CBJ",
  "dallas stars": "DAL", "stars": "DAL",
  "detroit red wings": "DET", "red wings": "DET",
  "edmonton oilers": "EDM", "oilers": "EDM",
  "florida panthers": "FLA", "panthers": "FLA",
  "los angeles kings": "LAK", "kings": "LAK",
  "minnesota wild": "MIN", "wild": "MIN",
  "montreal canadiens": "MTL", "canadiens": "MTL",
  "nashville predators": "NSH", "predators": "NSH",
  "new jersey devils": "NJD", "devils": "NJD",
  "new york islanders": "NYI", "islanders": "NYI",
  "new york rangers": "NYR", "rangers": "NYR",
  "ottawa senators": "OTT", "senators": "OTT",
  "philadelphia flyers": "PHI", "flyers": "PHI",
  "pittsburgh penguins": "PIT", "penguins": "PIT",
  "san jose sharks": "SJS", "sharks": "SJS",
  "seattle kraken": "SEA", "kraken": "SEA",
  "st. louis blues": "STL", "blues": "STL", "st louis blues": "STL",
  "tampa bay lightning": "TBL", "lightning": "TBL",
  "toronto maple leafs": "TOR", "maple leafs": "TOR", "leafs": "TOR",
  "utah hockey club": "UTA", "utah": "UTA",
  "vancouver canucks": "VAN", "canucks": "VAN",
  "vegas golden knights": "VGK", "golden knights": "VGK",
  "washington capitals": "WSH", "capitals": "WSH", "caps": "WSH",
  "winnipeg jets": "WPG", "jets": "WPG",
};

export function findTeamAbbrev(teamName: string): string | null {
  const lower = teamName.toLowerCase().trim();
  if (NHL_TEAMS[lower]) return NHL_TEAMS[lower];
  // Partial match
  for (const [key, abbrev] of Object.entries(NHL_TEAMS)) {
    if (lower.includes(key) || key.includes(lower)) return abbrev;
  }
  return null;
}

// ── Team stats ─────────────────────────────────────────────────────

export async function getTeamStats(
  teamAbbrev: string
): Promise<Record<string, unknown> | null> {
  return cachedFetch(`${BASE}/club-stats/${teamAbbrev}/now`, TTL.LONG);
}

export async function getTeamSchedule(
  teamAbbrev: string
): Promise<Record<string, unknown>[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/club-schedule-season/${teamAbbrev}/now`,
      TTL.SHORT
    );
    if (!data) return [];
    const games = data.games || [];
    // Get completed games, last 15
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completed = games.filter((g: any) => g.gameState === "OFF" || g.gameState === "FINAL");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return completed.slice(-15).map((g: any) => ({
      date: g.gameDate,
      homeTeam: g.homeTeam?.abbrev,
      homeScore: g.homeTeam?.score,
      awayTeam: g.awayTeam?.abbrev,
      awayScore: g.awayTeam?.score,
      homeTeamName: g.homeTeam?.placeName?.default,
      awayTeamName: g.awayTeam?.placeName?.default,
    }));
  } catch {
    return [];
  }
}

export async function getTeamStandings(): Promise<Record<string, unknown>[]> {
  const data = await cachedFetch<Record<string, unknown>>(`${BASE}/standings/now`, TTL.SHORT);
  return (data?.standings as Record<string, unknown>[]) || [];
}

// ── Team goalie lookup ────────────────────────────────────────────

export async function getTeamStartingGoalie(
  teamAbbrev: string
): Promise<{ player: NHLPlayer; stats: Record<string, unknown> | null; gameLog: NHLGameLog[] } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roster: any = await cachedFetch(
      `${BASE}/roster/${teamAbbrev}/current`,
      TTL.MEDIUM
    );
    if (!roster) return null;

    // Goalies are in the "goalies" array
    const goalies: NHLPlayer[] = roster.goalies || [];
    if (goalies.length === 0) return null;

    // Pick the first goalie (typically the starter)
    const goalie = goalies[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerId = goalie.playerId || (goalie as any).id;
    if (!playerId) return null;

    const [stats, gameLog] = await Promise.all([
      getPlayerStats(playerId as number),
      getPlayerGameLog(playerId as number),
    ]);

    return {
      player: goalie,
      stats,
      gameLog,
    };
  } catch {
    return null;
  }
}

// ── Orchestrator ───────────────────────────────────────────────────

export async function fetchNHLData(
  teamNames: string[],
  playerNames: string[],
  market?: string,
  line?: number
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  let anyFound = false;

  // Fetch team data
  for (const name of teamNames) {
    const abbrev = findTeamAbbrev(name);
    if (!abbrev) {
      console.log(`[NHL] Team not found: "${name}"`);
      results[name] = null;
      continue;
    }
    anyFound = true;
    console.log(`[NHL] Found team: "${name}" → ${abbrev}`);

    const [teamStats, schedule] = await Promise.all([
      getTeamStats(abbrev),
      getTeamSchedule(abbrev),
    ]);

    results[name] = {
      team: { abbreviation: abbrev, name },
      stats: teamStats,
      recentGames: schedule.map((g) => ({
        date: g.date,
        homeTeam: g.homeTeamName || g.homeTeam,
        homeScore: g.homeScore,
        awayTeam: g.awayTeamName || g.awayTeam,
        awayScore: g.awayScore,
      })),
    };
  }

  // Fetch player data
  if (playerNames.length > 0) {
    const playerData: Record<string, unknown> = {};
    for (const name of playerNames) {
      const player = await searchPlayer(name);
      if (!player) {
        console.log(`[NHL] Player not found: "${name}"`);
        playerData[name] = null;
        continue;
      }
      anyFound = true;
      const playerId = player.playerId;
      console.log(`[NHL] Found player: "${name}" → id=${playerId}`);

      const [stats, gameLog] = await Promise.all([
        getPlayerStats(playerId),
        getPlayerGameLog(playerId),
      ]);

      const entry: Record<string, unknown> = {
        player: {
          id: playerId,
          fullName: `${player.firstName?.default || ""} ${player.lastName?.default || ""}`.trim(),
          position: player.position,
          team: player.teamAbbrev?.default || player.teamName?.default,
        },
        stats,
        gameLog,
      };

      // Compute prop analysis
      if (market && typeof line === "number" && gameLog.length > 0) {
        entry.propAnalysis = analyzeNHLProp(gameLog, market, line);
      }

      playerData[name] = entry;
    }
    results._players = playerData;
  }

  if (!anyFound) {
    return { _unsupported: true };
  }

  return results;
}

// ── Prop analysis ──────────────────────────────────────────────────

function analyzeNHLProp(
  gameLog: NHLGameLog[],
  market: string,
  line: number
): NHLPropAnalysis {
  const stat = mapNHLMarketToStat(market);
  const values = gameLog.map((g) => ({
    date: g.gameDate,
    value: getNHLStatValue(g, stat),
    hit: getNHLStatValue(g, stat) > line,
    opponent: typeof g.opponentAbbrev === "string" ? g.opponentAbbrev : g.opponentAbbrev?.default || "?",
    home: g.homeRoadFlag === "H",
  }));

  const hitCount = values.filter((v) => v.hit).length;
  const total = values.length;
  const average =
    total > 0
      ? Math.round((values.reduce((s, v) => s + v.value, 0) / total) * 10) / 10
      : 0;
  const last5 = values.slice(-5);
  const last5Avg =
    last5.length > 0
      ? Math.round((last5.reduce((s, v) => s + v.value, 0) / last5.length) * 10) / 10
      : 0;

  const mid = Math.floor(total / 2);
  const olderHalf = values.slice(0, mid);
  const recentHalf = values.slice(mid);
  const olderAvg =
    olderHalf.length > 0 ? olderHalf.reduce((s, v) => s + v.value, 0) / olderHalf.length : 0;
  const recentAvg =
    recentHalf.length > 0 ? recentHalf.reduce((s, v) => s + v.value, 0) / recentHalf.length : 0;
  const diff = recentAvg - olderAvg;
  const threshold = average > 0 ? average * 0.1 : 0.5;
  const trend: "rising" | "falling" | "stable" =
    diff > threshold ? "rising" : diff < -threshold ? "falling" : "stable";

  return { stat, line, hitCount, totalGames: total, hitRate: total > 0 ? hitCount / total : 0, average, last5Avg, trend, gameValues: values };
}

function mapNHLMarketToStat(market: string): string {
  const m = market.toLowerCase();
  if (m.includes("goal")) return "goals";
  if (m.includes("assist")) return "assists";
  if (m.includes("point")) return "points";
  if (m.includes("shot")) return "shots";
  if (m.includes("save")) return "saves";
  if (m.includes("block")) return "blockedShots";
  if (m.includes("power play") || m.includes("pp")) return "powerPlayGoals";
  if (m.includes("goals against") || m.includes("ga")) return "goalsAgainst";
  // Default
  return "points";
}

function getNHLStatValue(game: NHLGameLog, stat: string): number {
  switch (stat) {
    case "goals": return game.goals || 0;
    case "assists": return game.assists || 0;
    case "points": return (game.goals || 0) + (game.assists || 0);
    case "shots": return game.shots || 0;
    case "saves": return game.saves || 0;
    case "goalsAgainst": return game.goalsAgainst || 0;
    case "powerPlayGoals": return game.powerPlayGoals || 0;
    case "plusMinus": return game.plusMinus || 0;
    default: return 0;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function getCurrentNHLSeason(): string {
  const now = new Date();
  const year = now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
  return `${year}${year + 1}`;
}
