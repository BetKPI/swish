/**
 * MLB Stats API — free, no key required.
 * https://statsapi.mlb.com
 *
 * Provides: player search, season stats, game logs, pitcher/batter splits,
 * team standings, recent scores.
 */

import { cachedFetch, TTL } from "./fetch";

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
  isHome?: boolean;
}

// ── API calls ──────────────────────────────────────────────────────

export async function searchPlayer(
  playerName: string
): Promise<MLBPlayer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/people/search?names=${encodeURIComponent(playerName)}&hydrate=currentTeam`,
      TTL.MEDIUM
    );
    if (data) {
      const people = (data.people as MLBPlayer[] | undefined);
      if (people?.[0]) return people[0];
    }
    // Fallback: search via sports endpoint
    const data2 = await cachedFetch<Record<string, unknown>>(
      `${BASE}/sports/1/players?search=${encodeURIComponent(playerName)}&hydrate=currentTeam`,
      TTL.MEDIUM
    );
    return (data2?.people as MLBPlayer[] | undefined)?.[0] || null;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/people/${playerId}/stats?stats=season&season=${yr}&group=hitting,pitching`,
      TTL.MEDIUM
    );
    if (!data) return null;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/people/${playerId}/stats?stats=gameLog&season=${yr}&group=hitting,pitching`,
      TTL.MEDIUM
    );
    if (!data) return [];
    const allStats = data.stats || [];
    const games: MLBGameLog[] = [];

    for (const group of allStats) {
      const splits = group.splits || [];
      for (const split of splits.slice(-15)) {
        games.push({
          date: split.date,
          opponent: split.opponent?.name || split.team?.name || "Unknown",
          stat: split.stat || {},
          isHome: split.isHome,
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
  return cachedFetch(`${BASE}/people/${playerId}/stats?stats=vsTeamTotal,homeAndAway&season=${yr}&group=hitting,pitching`, TTL.MEDIUM);
}

export async function searchTeam(
  teamName: string
): Promise<{ id: number; name: string; abbreviation: string } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/teams?sportId=1&season=${new Date().getFullYear()}`,
      TTL.LONG
    );
    if (!data) return null;
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
  return cachedFetch(`${BASE}/teams/${teamId}/stats?stats=season&group=hitting,pitching,fielding&season=${yr}`, TTL.LONG);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/schedule?teamId=${teamId}&startDate=${startDate}&endDate=${today}&sportId=1&hydrate=team,linescore`,
      TTL.SHORT
    );
    if (!data) return [];
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

// ── Pitcher head-to-head ───────────────────────────────────────────

/**
 * Get a pitcher's career game log to find starts against a specific team.
 */
export async function getPitcherVsTeam(
  pitcherId: number,
  opponentTeamId: number
): Promise<Record<string, unknown>[]> {
  try {
    // Get career game log (recent seasons) — filter by opponent
    const currentYear = new Date().getFullYear();
    const seasons = Array.from({ length: 6 }, (_, i) => currentYear - i).join(",");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${seasons}`,
      TTL.MEDIUM
    );
    if (!data) return [];
    const games: Record<string, unknown>[] = [];
    for (const statGroup of data.stats || []) {
      for (const split of statGroup.splits || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oppId = (split as any).opponent?.id;
        if (oppId === opponentTeamId) {
          games.push({
            date: split.date,
            season: split.season,
            opponent: (split as Record<string, unknown>).opponent,
            stat: split.stat,
          });
        }
      }
    }
    return games;
  } catch {
    return [];
  }
}

/**
 * Cross-reference two pitchers' game logs to find games where they started against each other.
 */
export async function getPitcherMatchupHistory(
  pitcher1Id: number,
  pitcher1Name: string,
  pitcher1TeamId: number,
  pitcher2Id: number,
  pitcher2Name: string,
  pitcher2TeamId: number
): Promise<Record<string, unknown>> {
  // Get each pitcher's starts against the other's team
  const [p1VsTeam2, p2VsTeam1] = await Promise.all([
    getPitcherVsTeam(pitcher1Id, pitcher2TeamId),
    getPitcherVsTeam(pitcher2Id, pitcher1TeamId),
  ]);

  // Find matching dates (both pitched on the same day = they faced each other)
  const p1Dates = new Set(p1VsTeam2.map((g) => g.date as string));
  const p2Dates = new Set(p2VsTeam1.map((g) => g.date as string));
  const commonDates = [...p1Dates].filter((d) => p2Dates.has(d));

  const matchups = commonDates.map((date) => {
    const p1Game = p1VsTeam2.find((g) => g.date === date);
    const p2Game = p2VsTeam1.find((g) => g.date === date);
    return {
      date,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pitcher1: { name: pitcher1Name, ...(p1Game?.stat as any || {}) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pitcher2: { name: pitcher2Name, ...(p2Game?.stat as any || {}) },
    };
  });

  // Also include each pitcher's overall stats vs the opposing team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summarize = (games: Record<string, unknown>[]) => {
    if (games.length === 0) return null;
    let totalIP = 0, totalER = 0, totalK = 0, totalBB = 0, totalH = 0, wins = 0, losses = 0;
    for (const g of games) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = g.stat as any;
      if (!s) continue;
      totalIP += parseFloat(s.inningsPitched || "0");
      totalER += s.earnedRuns || 0;
      totalK += s.strikeOuts || 0;
      totalBB += s.baseOnBalls || 0;
      totalH += s.hits || 0;
      if (s.wins) wins += s.wins;
      if (s.losses) losses += s.losses;
    }
    const era = totalIP > 0 ? ((totalER / totalIP) * 9).toFixed(2) : "0.00";
    return {
      games: games.length,
      wins,
      losses,
      era,
      inningsPitched: totalIP.toFixed(1),
      strikeOuts: totalK,
      walks: totalBB,
      hits: totalH,
      earnedRuns: totalER,
    };
  };

  return {
    pitcher1: {
      name: pitcher1Name,
      id: pitcher1Id,
      vsOpponent: summarize(p1VsTeam2),
      gamesVsOpponent: p1VsTeam2.length,
    },
    pitcher2: {
      name: pitcher2Name,
      id: pitcher2Id,
      vsOpponent: summarize(p2VsTeam1),
      gamesVsOpponent: p2VsTeam1.length,
    },
    headToHeadGames: matchups,
    totalMatchups: commonDates.length,
  };
}

// ── Probable pitchers ──────────────────────────────────────────────

export async function getProbablePitchers(
  teamId: number
): Promise<Record<string, unknown> | null> {
  try {
    // Get today's and tomorrow's games with probable pitchers
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/schedule?teamId=${teamId}&startDate=${today}&endDate=${tomorrow}&sportId=1&hydrate=probablePitcher(note),team`,
      TTL.SHORT
    );
    if (!data) return null;
    const dates = data.dates || [];
    for (const d of dates) {
      for (const game of d.games || []) {
        const home = game.teams?.home;
        const away = game.teams?.away;
        const homePitcher = home?.probablePitcher;
        const awayPitcher = away?.probablePitcher;
        if (homePitcher || awayPitcher) {
          return {
            gameDate: d.date,
            homeTeam: home?.team?.name,
            awayTeam: away?.team?.name,
            homePitcher: homePitcher ? {
              id: homePitcher.id,
              fullName: homePitcher.fullName,
              era: homePitcher.era,
              wins: homePitcher.wins,
              losses: homePitcher.losses,
              note: homePitcher.note,
            } : null,
            awayPitcher: awayPitcher ? {
              id: awayPitcher.id,
              fullName: awayPitcher.fullName,
              era: awayPitcher.era,
              wins: awayPitcher.wins,
              losses: awayPitcher.losses,
              note: awayPitcher.note,
            } : null,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch full pitcher data (season stats + game log) for a given pitcher ID.
 */
export async function fetchPitcherData(
  pitcherId: number
): Promise<Record<string, unknown> | null> {
  try {
    const [seasonStats, gameLog] = await Promise.all([
      getPlayerSeasonStats(pitcherId),
      getPlayerGameLog(pitcherId),
    ]);
    return { seasonStats, gameLog };
  } catch {
    return null;
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

    // Fetch probable pitchers for this team
    const probablePitchers = await getProbablePitchers(team.id);

    results[name] = {
      team,
      stats: teamStats,
      recentGames: schedule,
      probablePitchers,
    };

    // If we got pitcher IDs, fetch their full stats
    if (probablePitchers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pp = probablePitchers as any;
      const pitcherFetches: Promise<void>[] = [];

      for (const key of ["homePitcher", "awayPitcher"] as const) {
        const pitcher = pp[key];
        if (pitcher?.id) {
          pitcherFetches.push(
            fetchPitcherData(pitcher.id).then((data) => {
              if (data) {
                pp[key] = { ...pitcher, ...data };
              }
            })
          );
        }
      }
      await Promise.all(pitcherFetches);
    }
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
      if (market && typeof line === "number" && gameLog.length > 0) {
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
    home: g.isHome ?? false,
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
  const olderHalf = values.slice(0, mid);
  const recentHalf = values.slice(mid);
  const olderAvg =
    olderHalf.length > 0
      ? olderHalf.reduce((s, v) => s + v.value, 0) / olderHalf.length
      : 0;
  const recentAvg =
    recentHalf.length > 0
      ? recentHalf.reduce((s, v) => s + v.value, 0) / recentHalf.length
      : 0;
  const diff = recentAvg - olderAvg;
  const threshold = average > 0 ? average * 0.1 : 0.5;
  const trend: "rising" | "falling" | "stable" =
    diff > threshold ? "rising" : diff < -threshold ? "falling" : "stable";

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
