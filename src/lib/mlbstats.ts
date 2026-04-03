/**
 * MLB Stats API — free, no key required.
 * https://statsapi.mlb.com
 *
 * Provides: player search, season stats, game logs, pitcher/batter splits,
 * team standings, recent scores.
 */

const BASE = "https://statsapi.mlb.com/api/v1";

// ── Types ──────────────────────────────────────────────────────────

export interface MLBPlayer {
  id: number;
  fullName: string;
  primaryPosition: { abbreviation: string; name: string };
  currentTeam?: { id: number; name: string };
  batSide?: { code: string };
  pitchHand?: { code: string };
}

export interface MLBPlayerStats {
  gamesPlayed: number;
  // Hitting
  avg?: string;
  obp?: string;
  slg?: string;
  ops?: string;
  homeRuns?: number;
  rbi?: number;
  hits?: number;
  runs?: number;
  stolenBases?: number;
  strikeOuts?: number;
  baseOnBalls?: number;
  atBats?: number;
  // Pitching
  era?: string;
  whip?: string;
  wins?: number;
  losses?: number;
  strikeoutsPitching?: number;
  inningsPitched?: string;
  hitsAllowed?: number;
  earnedRuns?: number;
  walksAllowed?: number;
  strikeoutToWalkRatio?: string;
}

export interface MLBGameLog {
  date: string;
  opponent: string;
  stat: Record<string, unknown>;
}

// ── API calls ──────────────────────────────────────────────────────

export async function searchPlayer(
  playerName: string
): Promise<MLBPlayer | null> {
  try {
    const res = await fetch(
      `${BASE}/people/search?names=${encodeURIComponent(playerName)}&hydrate=currentTeam`
    );
    if (!res.ok) {
      // Fallback: search via sports endpoint
      const res2 = await fetch(
        `${BASE}/sports/1/players?search=${encodeURIComponent(playerName)}&hydrate=currentTeam`
      );
      if (!res2.ok) return null;
      const data2 = await res2.json();
      return data2.people?.[0] || null;
    }
    const data = await res.json();
    return data.people?.[0] || null;
  } catch {
    return null;
  }
}

export async function getPlayerSeasonStats(
  playerId: number,
  season?: number
): Promise<MLBPlayerStats | null> {
  const yr = season || new Date().getFullYear();
  try {
    const res = await fetch(
      `${BASE}/people/${playerId}/stats?stats=season&season=${yr}&group=hitting,pitching`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Merge hitting and pitching stats
    const allSplits = data.stats || [];
    let merged: Record<string, unknown> = {};
    for (const group of allSplits) {
      const splits = group.splits || [];
      if (splits.length > 0) {
        merged = { ...merged, ...splits[0].stat };
      }
    }
    if (Object.keys(merged).length === 0) return null;
    return merged as unknown as MLBPlayerStats;
  } catch {
    return null;
  }
}

export async function getPlayerGameLog(
  playerId: number,
  season?: number
): Promise<MLBGameLog[]> {
  const yr = season || new Date().getFullYear();
  try {
    const res = await fetch(
      `${BASE}/people/${playerId}/stats?stats=gameLog&season=${yr}&group=hitting,pitching`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const allStats = data.stats || [];
    const games: MLBGameLog[] = [];

    for (const group of allStats) {
      const splits = group.splits || [];
      for (const split of splits.slice(-15)) {
        games.push({
          date: split.date,
          opponent: split.opponent?.name || split.team?.name || "Unknown",
          stat: split.stat || {},
        });
      }
    }

    // Deduplicate by date and return last 15
    const seen = new Set<string>();
    const unique = games.filter((g) => {
      const key = g.date;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.slice(-15);
  } catch {
    return [];
  }
}

export async function getPlayerSplits(
  playerId: number,
  season?: number
): Promise<Record<string, unknown> | null> {
  const yr = season || new Date().getFullYear();
  try {
    const res = await fetch(
      `${BASE}/people/${playerId}/stats?stats=vsTeamTotal,homeAndAway&season=${yr}&group=hitting,pitching`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function searchTeam(
  teamName: string
): Promise<{ id: number; name: string; abbreviation: string } | null> {
  try {
    const res = await fetch(`${BASE}/teams?sportId=1&season=${new Date().getFullYear()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const teams = data.teams || [];
    const nameLower = teamName.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = teams.find((t: any) => {
      return (
        t.name?.toLowerCase().includes(nameLower) ||
        t.teamName?.toLowerCase().includes(nameLower) ||
        t.shortName?.toLowerCase().includes(nameLower) ||
        t.abbreviation?.toLowerCase() === nameLower ||
        nameLower.includes(t.teamName?.toLowerCase()) ||
        nameLower.includes(t.name?.toLowerCase())
      );
    });
    return match || null;
  } catch {
    return null;
  }
}

export async function getTeamStats(
  teamId: number,
  season?: number
): Promise<Record<string, unknown> | null> {
  const yr = season || new Date().getFullYear();
  try {
    const res = await fetch(
      `${BASE}/teams/${teamId}/stats?stats=season&group=hitting,pitching,fielding&season=${yr}`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getTeamSchedule(
  teamId: number,
  last: number = 15
): Promise<Record<string, unknown>[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const res = await fetch(
      `${BASE}/schedule?teamId=${teamId}&startDate=${startDate}&endDate=${today}&sportId=1&hydrate=team,linescore`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const games: Record<string, unknown>[] = [];
    for (const date of data.dates || []) {
      for (const game of date.games || []) {
        if (game.status?.detailedState === "Final") {
          games.push({
            date: game.gameDate,
            homeTeam: game.teams?.home?.team?.name,
            homeScore: game.teams?.home?.score,
            awayTeam: game.teams?.away?.team?.name,
            awayScore: game.teams?.away?.score,
            homeWin: game.teams?.home?.isWinner,
          });
        }
      }
    }
    return games.slice(-last);
  } catch {
    return [];
  }
}

// ── Orchestrator ───────────────────────────────────────────────────

export interface MLBPropAnalysis {
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

export async function fetchMLBData(
  teamNames: string[],
  playerNames: string[],
  market?: string,
  line?: number
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  let anyFound = false;

  // Fetch team data
  for (const name of teamNames) {
    const team = await searchTeam(name);
    if (!team) {
      console.log(`[MLB] Team not found: "${name}"`);
      results[name] = null;
      continue;
    }
    anyFound = true;
    console.log(`[MLB] Found team: "${name}" → id=${team.id}`);

    const [teamStats, schedule] = await Promise.all([
      getTeamStats(team.id),
      getTeamSchedule(team.id),
    ]);

    results[name] = {
      team,
      stats: teamStats,
      recentGames: schedule,
    };
  }

  // Fetch player data
  if (playerNames.length > 0) {
    const playerData: Record<string, unknown> = {};
    for (const name of playerNames) {
      const player = await searchPlayer(name);
      if (!player) {
        console.log(`[MLB] Player not found: "${name}"`);
        playerData[name] = null;
        continue;
      }
      anyFound = true;
      console.log(`[MLB] Found player: "${name}" → id=${player.id}`);

      const [seasonStats, gameLog, splits] = await Promise.all([
        getPlayerSeasonStats(player.id),
        getPlayerGameLog(player.id),
        getPlayerSplits(player.id),
      ]);

      const entry: Record<string, unknown> = {
        player,
        seasonStats,
        gameLog,
        splits,
      };

      // Compute prop analysis
      if (market && line != null && gameLog.length > 0) {
        entry.propAnalysis = analyzeMLBProp(gameLog, player, market, line);
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

function analyzeMLBProp(
  gameLog: MLBGameLog[],
  player: MLBPlayer,
  market: string,
  line: number
): MLBPropAnalysis {
  const stat = mapMLBMarketToStat(market, player);
  const values = gameLog.map((g) => ({
    date: g.date,
    value: getMLBStatValue(g.stat, stat),
    hit: getMLBStatValue(g.stat, stat) > line,
    opponent: g.opponent,
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
      ? Math.round(
          (last5.reduce((s, v) => s + v.value, 0) / last5.length) * 10
        ) / 10
      : 0;

  const mid = Math.floor(total / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const firstAvg =
    firstHalf.length > 0
      ? firstHalf.reduce((s, v) => s + v.value, 0) / firstHalf.length
      : 0;
  const secondAvg =
    secondHalf.length > 0
      ? secondHalf.reduce((s, v) => s + v.value, 0) / secondHalf.length
      : 0;
  const diff = secondAvg - firstAvg;
  const trend: "rising" | "falling" | "stable" =
    diff > average * 0.1 ? "rising" : diff < -average * 0.1 ? "falling" : "stable";

  return { stat, line, hitCount, totalGames: total, hitRate: total > 0 ? hitCount / total : 0, average, last5Avg, trend, gameValues: values };
}

function mapMLBMarketToStat(market: string, player: MLBPlayer): string {
  const m = market.toLowerCase();
  const isPitcher =
    player.primaryPosition?.abbreviation === "P" ||
    m.includes("strikeout") ||
    m.includes("k's") ||
    m.includes("earned run") ||
    m.includes("era") ||
    m.includes("pitch");

  if (isPitcher) {
    if (m.includes("strikeout") || m.includes("k")) return "strikeOuts_pitching";
    if (m.includes("earned run")) return "earnedRuns";
    if (m.includes("hit") && m.includes("allowed")) return "hits_pitching";
    if (m.includes("walk")) return "baseOnBalls_pitching";
    if (m.includes("inning")) return "inningsPitched";
    return "strikeOuts_pitching"; // most common pitcher prop
  }

  // Hitter props
  if (m.includes("hit") || m.includes("h+")) return "hits";
  if (m.includes("home run") || m.includes("hr")) return "homeRuns";
  if (m.includes("rbi") || m.includes("runs batted")) return "rbi";
  if (m.includes("run scored") || m.includes("runs scored")) return "runs";
  if (m.includes("stolen base") || m.includes("sb")) return "stolenBases";
  if (m.includes("total bases") || m.includes("tb")) return "totalBases";
  if (m.includes("strikeout") || m.includes("k")) return "strikeOuts";
  if (m.includes("walk") || m.includes("bb")) return "baseOnBalls";
  return "hits"; // default hitter prop
}

function getMLBStatValue(stat: Record<string, unknown>, key: string): number {
  // Handle combined keys
  if (key === "hits") return (stat.hits as number) || 0;
  if (key === "homeRuns") return (stat.homeRuns as number) || 0;
  if (key === "rbi") return (stat.rbi as number) || 0;
  if (key === "runs") return (stat.runs as number) || 0;
  if (key === "stolenBases") return (stat.stolenBases as number) || 0;
  if (key === "strikeOuts") return (stat.strikeOuts as number) || 0;
  if (key === "baseOnBalls") return (stat.baseOnBalls as number) || 0;
  if (key === "totalBases") return (stat.totalBases as number) || 0;
  if (key === "strikeOuts_pitching") return (stat.strikeOuts as number) || 0;
  if (key === "earnedRuns") return (stat.earnedRuns as number) || 0;
  if (key === "hits_pitching") return (stat.hits as number) || 0;
  if (key === "baseOnBalls_pitching") return (stat.baseOnBalls as number) || 0;
  if (key === "inningsPitched") return parseFloat(String(stat.inningsPitched || "0"));
  return (stat[key] as number) || 0;
}
