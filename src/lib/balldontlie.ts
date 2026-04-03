/**
 * Ball Don't Lie API — free NBA data (no key required).
 * https://www.balldontlie.io/
 *
 * Provides: player search, season averages, game logs, team stats.
 */

const BASE = "https://api.balldontlie.io/v1";

// BDL requires an API key (free tier at balldontlie.io).
function headers(): Record<string, string> {
  const key = process.env.BDL_API_KEY;
  if (key) return { Authorization: key };
  return {};
}

// Track if we've gotten a 401 so we stop wasting requests
let authFailed = false;

function isAvailable(): boolean {
  if (authFailed) return false;
  return !!process.env.BDL_API_KEY;
}

function markAuthFailed() {
  authFailed = true;
  console.log("[BDL] API key missing or invalid — all BDL calls will be skipped this invocation");
}

// ── Types ──────────────────────────────────────────────────────────

export interface BDLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  team: { id: number; full_name: string; abbreviation: string };
}

export interface BDLGameStats {
  id: number;
  date: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  min: string;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  game: { id: number; date: string; home_team_score: number; visitor_team_score: number };
}

export interface BDLSeasonAverages {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  min: string;
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
  games_played: number;
}

// ── API calls ──────────────────────────────────────────────────────

export async function searchPlayer(
  playerName: string
): Promise<BDLPlayer | null> {
  if (!isAvailable()) return null;
  try {
    // Try last name search first (most reliable on BDL)
    const parts = playerName.trim().split(/\s+/);
    const lastName = parts.length > 1 ? parts.slice(-1)[0] : parts[0];
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";

    const res = await fetch(
      `${BASE}/players?search=${encodeURIComponent(lastName)}&per_page=15`,
      { headers: headers() }
    );
    if (res.status === 401 || res.status === 403) {
      markAuthFailed();
      return null;
    }
    if (!res.ok) {
      console.log(`[BDL] Player search failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    let players: BDLPlayer[] = Array.isArray(data?.data) ? data.data : [];

    // If no results with last name, try first_name + last_name params
    if (players.length === 0 && firstName) {
      const res2 = await fetch(
        `${BASE}/players?first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&per_page=5`,
        { headers: headers() }
      );
      if (res2.ok) {
        const data2 = await res2.json();
        players = Array.isArray(data2?.data) ? data2.data : [];
      }
    }

    if (players.length === 0) return null;

    // Try exact match first, then partial
    const nameLower = playerName.toLowerCase();
    const exact = players.find(
      (p) => `${p.first_name} ${p.last_name}`.toLowerCase() === nameLower
    );
    if (exact) return exact;

    // Partial match on first name if we have it
    if (firstName) {
      const partial = players.find(
        (p) => p.first_name.toLowerCase().startsWith(firstName.toLowerCase())
      );
      if (partial) return partial;
    }

    return players[0];
  } catch {
    return null;
  }
}

export async function getSeasonAverages(
  playerId: number,
  season?: number
): Promise<BDLSeasonAverages | null> {
  const yr = season || getCurrentSeason();
  try {
    const res = await fetch(
      `${BASE}/season_averages?season=${yr}&player_ids[]=${playerId}`,
      { headers: headers() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0] || null;
  } catch {
    return null;
  }
}

export async function getPlayerGameLog(
  playerId: number,
  last: number = 10
): Promise<BDLGameStats[]> {
  const season = getCurrentSeason();
  try {
    const res = await fetch(
      `${BASE}/stats?player_ids[]=${playerId}&seasons[]=${season}&per_page=${last}&sort=-game.date`,
      { headers: headers() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []) as BDLGameStats[];
  } catch {
    return [];
  }
}

export async function getTeamStats(
  teamId: number,
  season?: number
): Promise<Record<string, unknown> | null> {
  const yr = season || getCurrentSeason();
  try {
    const res = await fetch(
      `${BASE}/teams/${teamId}`,
      { headers: headers() }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function searchTeam(
  teamName: string
): Promise<{ id: number; full_name: string; abbreviation: string } | null> {
  if (!isAvailable()) return null;
  try {
    const res = await fetch(`${BASE}/teams?per_page=30`, { headers: headers() });
    if (res.status === 401 || res.status === 403) {
      markAuthFailed();
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    const teams = data.data || [];
    const nameLower = teamName.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = teams.find((t: any) => {
      return (
        t.full_name?.toLowerCase().includes(nameLower) ||
        t.name?.toLowerCase().includes(nameLower) ||
        t.abbreviation?.toLowerCase() === nameLower ||
        nameLower.includes(t.name?.toLowerCase()) ||
        nameLower.includes(t.full_name?.toLowerCase())
      );
    });
    return match || null;
  } catch {
    return null;
  }
}

// ── Orchestrator ───────────────────────────────────────────────────

export interface BDLPlayerData {
  player: BDLPlayer;
  seasonAverages: BDLSeasonAverages | null;
  gameLog: BDLGameStats[];
  propAnalysis?: PropAnalysis;
}

export interface PropAnalysis {
  stat: string;
  line: number;
  hitCount: number;
  totalGames: number;
  hitRate: number;
  average: number;
  last5Avg: number;
  trend: "rising" | "falling" | "stable";
  gameValues: { date: string; value: number; hit: boolean }[];
}

/**
 * Fetch all NBA data for a bet — players and teams.
 */
export async function fetchNBAData(
  teamNames: string[],
  playerNames: string[],
  market?: string,
  line?: number
): Promise<Record<string, unknown>> {
  // If no API key, skip BDL entirely
  if (!isAvailable()) {
    console.log("[BDL] No API key — skipping Ball Don't Lie, falling through to ESPN");
    return { _unsupported: true, _reason: "no_api_key" };
  }

  const results: Record<string, unknown> = {};
  let anyFound = false;

  // Fetch team data
  for (const name of teamNames) {
    const team = await searchTeam(name);
    if (!team) {
      console.log(`[BDL] Team not found: "${name}"`);
      results[name] = null;
      continue;
    }
    anyFound = true;
    results[name] = { team };
    console.log(`[BDL] Found team: "${name}" → id=${team.id}`);
  }

  // Fetch player data
  if (playerNames.length > 0) {
    const playerData: Record<string, BDLPlayerData | null> = {};
    for (const name of playerNames) {
      const player = await searchPlayer(name);
      if (!player) {
        console.log(`[BDL] Player not found: "${name}"`);
        playerData[name] = null;
        continue;
      }
      anyFound = true;
      console.log(`[BDL] Found player: "${name}" → id=${player.id}`);

      const [seasonAverages, gameLog] = await Promise.all([
        getSeasonAverages(player.id),
        getPlayerGameLog(player.id, 15),
      ]);

      const entry: BDLPlayerData = { player, seasonAverages, gameLog };

      // Compute prop analysis if we have a market and line
      if (market && typeof line === "number" && gameLog.length > 0) {
        entry.propAnalysis = analyzeProp(gameLog, market, line);
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

function analyzeProp(
  gameLog: BDLGameStats[],
  market: string,
  line: number
): PropAnalysis {
  const stat = mapMarketToStat(market);
  const values = gameLog.map((g) => ({
    date: g.game?.date || g.date,
    value: getStatValue(g, stat),
    hit: getStatValue(g, stat) > line,
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

  // Trend: compare older half vs recent half
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

  return {
    stat,
    line,
    hitCount,
    totalGames: total,
    hitRate: total > 0 ? hitCount / total : 0,
    average,
    last5Avg,
    trend,
    gameValues: values,
  };
}

function mapMarketToStat(market: string): string {
  const m = market.toLowerCase();
  if (m.includes("point") || m.includes("pts")) return "pts";
  if (m.includes("rebound") || m.includes("reb")) return "reb";
  if (m.includes("assist") || m.includes("ast")) return "ast";
  if (m.includes("steal")) return "stl";
  if (m.includes("block") || m.includes("blk")) return "blk";
  if (m.includes("three") || m.includes("3p") || m.includes("3-point"))
    return "fg3m";
  if (m.includes("turnover")) return "turnover";
  if (m.includes("pts+reb+ast") || m.includes("pra")) return "pra";
  if (m.includes("pts+reb") || m.includes("pr")) return "pts+reb";
  if (m.includes("pts+ast") || m.includes("pa")) return "pts+ast";
  if (m.includes("reb+ast") || m.includes("ra")) return "reb+ast";
  // Default to points
  return "pts";
}

function getStatValue(game: BDLGameStats, stat: string): number {
  switch (stat) {
    case "pts": return game.pts || 0;
    case "reb": return game.reb || 0;
    case "ast": return game.ast || 0;
    case "stl": return game.stl || 0;
    case "blk": return game.blk || 0;
    case "fg3m": return game.fg3m || 0;
    case "turnover": return game.turnover || 0;
    case "pra": return (game.pts || 0) + (game.reb || 0) + (game.ast || 0);
    case "pts+reb": return (game.pts || 0) + (game.reb || 0);
    case "pts+ast": return (game.pts || 0) + (game.ast || 0);
    case "reb+ast": return (game.reb || 0) + (game.ast || 0);
    default: return game.pts || 0;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function getCurrentSeason(): number {
  const now = new Date();
  // NBA season spans two calendar years — if before July, use previous year
  return now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
}
