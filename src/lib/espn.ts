import { cachedFetch, TTL } from "./fetch";

const SPORT_MAP: Record<string, { sport: string; league: string }> = {
  NBA: { sport: "basketball", league: "nba" },
  NFL: { sport: "football", league: "nfl" },
  MLB: { sport: "baseball", league: "mlb" },
  NHL: { sport: "hockey", league: "nhl" },
  NCAAF: { sport: "football", league: "college-football" },
  NCAAB: { sport: "basketball", league: "mens-college-basketball" },
  MLS: { sport: "soccer", league: "usa.1" },
  EPL: { sport: "soccer", league: "eng.1" },
  SOCCER: { sport: "soccer", league: "usa.1" },
  // Common aliases from Gemini extraction
  BASKETBALL: { sport: "basketball", league: "nba" },
  FOOTBALL: { sport: "football", league: "nfl" },
  BASEBALL: { sport: "baseball", league: "mlb" },
  HOCKEY: { sport: "hockey", league: "nhl" },
  "COLLEGE FOOTBALL": { sport: "football", league: "college-football" },
  "COLLEGE BASKETBALL": { sport: "basketball", league: "mens-college-basketball" },
  CFB: { sport: "football", league: "college-football" },
  CBB: { sport: "basketball", league: "mens-college-basketball" },
  "PREMIER LEAGUE": { sport: "soccer", league: "eng.1" },
  "LA LIGA": { sport: "soccer", league: "esp.1" },
  "SERIE A": { sport: "soccer", league: "ita.1" },
  BUNDESLIGA: { sport: "soccer", league: "ger.1" },
  "LIGUE 1": { sport: "soccer", league: "fra.1" },
  // Golf
  GOLF: { sport: "golf", league: "pga" },
  PGA: { sport: "golf", league: "pga" },
  "PGA TOUR": { sport: "golf", league: "pga" },
  "THE MASTERS": { sport: "golf", league: "pga" },
  MASTERS: { sport: "golf", league: "pga" },
  LIV: { sport: "golf", league: "liv" },
  LPGA: { sport: "golf", league: "lpga" },
};

function getLeagueInfo(sport: string): { sport: string; league: string } | null {
  const key = sport.toUpperCase();
  return SPORT_MAP[key] || null;
}

function getLeagueInfoOrThrow(sport: string): { sport: string; league: string } {
  const info = getLeagueInfo(sport);
  if (!info) throw new Error(`Unsupported sport: ${sport}`);
  return info;
}

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const WEB_BASE = "https://site.web.api.espn.com/apis/common/v3/sports";
const CORE_BASE = "https://sports.core.api.espn.com/v2/sports";

// ── Player search & game log ───────────────────────────────────────

export interface ESPNPlayerGameLog {
  date: string;
  opponent: string;
  home: boolean;
  stats: Record<string, string | number>;
}

/**
 * Search for a player using ESPN's site API, then try roster fallback.
 */
export async function searchPlayer(
  sport: string,
  playerName: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    // Fast: ESPN site search API
    const searchData = await cachedFetch<Record<string, unknown>>(
      `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(playerName)}&limit=5&type=player&sport=${s}&league=${league}`,
      TTL.MEDIUM
    );
    if (searchData) {
      const results = (searchData.items || searchData.results || []) as Record<string, unknown>[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = results.find((r: any) => r.type === "player");
      if (match) {
        return { id: match.id, displayName: match.displayName || match.name, ...match };
      }
    }

    // Fallback: athletes endpoint
    const data = await cachedFetch<Record<string, unknown>>(
      `${BASE}/${s}/${league}/athletes?limit=100&search=${encodeURIComponent(playerName)}`,
      TTL.MEDIUM
    );
    if (data) {
      const athletes = (data.athletes || data.items || []) as Record<string, unknown>[];
      if (athletes.length > 0) return athletes[0];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch player's full season game log from ESPN web API.
 * Returns per-game stats with opponent, date, home/away.
 */
export async function getPlayerGameLog(
  sport: string,
  playerId: string
): Promise<ESPNPlayerGameLog[]> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${WEB_BASE}/${s}/${league}/athletes/${playerId}/gamelog`,
      TTL.MEDIUM
    );
    if (!data) return [];

    const labels: string[] = data.labels || [];
    const eventDetails = data.events || {};
    const seasonType = data.seasonTypes?.[0]; // Regular season
    if (!seasonType) return [];

    const games: ESPNPlayerGameLog[] = [];
    for (const cat of seasonType.categories || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ev of (cat.events || []) as any[]) {
        const info = eventDetails[ev.eventId] || {};
        const statValues = ev.stats || [];
        const stats: Record<string, string | number> = {};
        labels.forEach((label, i) => {
          const val = statValues[i];
          // Try to parse as number, keep as string if it contains non-numeric chars (like "12-25")
          const num = Number(val);
          stats[label] = !isNaN(num) && !String(val).includes("-") ? num : val;
        });
        games.push({
          date: info.gameDate || "",
          opponent: info.opponent?.displayName || info.opponent?.abbreviation || "Unknown",
          home: info.homeAway === "home",
          stats,
        });
      }
    }

    return games;
  } catch {
    return [];
  }
}

export async function getPlayerStats(
  sport: string,
  playerId: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  return cachedFetch(`${BASE}/${s}/${league}/athletes/${playerId}/statistics`, TTL.MEDIUM);
}

export async function fetchPlayerData(
  sport: string,
  playerNames: string[]
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  for (const name of playerNames) {
    const player = await searchPlayer(sport, name);
    if (!player) {
      results[name] = null;
      continue;
    }

    const playerId = (player as { id?: string }).id;
    if (!playerId) {
      results[name] = { player };
      continue;
    }

    const [stats, gameLog] = await Promise.all([
      getPlayerStats(sport, playerId),
      getPlayerGameLog(sport, String(playerId)),
    ]);

    results[name] = { player, stats, gameLog };
  }

  return results;
}

// ── Team search & stats ────────────────────────────────────────────

export async function searchTeam(
  sport: string,
  teamName: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/${s}/${league}/teams?limit=100`,
      TTL.LONG
    );
    if (!data) return null;
    const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
    const match = teams.find(
      (t: { team: { displayName: string; shortDisplayName: string; abbreviation: string; name: string } }) => {
        const team = t.team;
        const name = teamName.toLowerCase();
        return (
          team.displayName?.toLowerCase().includes(name) ||
          team.shortDisplayName?.toLowerCase().includes(name) ||
          team.abbreviation?.toLowerCase() === name ||
          team.name?.toLowerCase().includes(name) ||
          name.includes(team.name?.toLowerCase()) ||
          name.includes(team.displayName?.toLowerCase())
        );
      }
    );
    return match?.team || null;
  } catch {
    return null;
  }
}

export async function getTeamStats(
  sport: string,
  teamId: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  return cachedFetch(`${BASE}/${s}/${league}/teams/${teamId}/statistics`, TTL.LONG);
}

export async function getTeamRecord(
  sport: string,
  teamId: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  return cachedFetch(`${BASE}/${s}/${league}/teams/${teamId}`, TTL.LONG);
}

export async function getScoreboard(
  sport: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  return cachedFetch(`${BASE}/${s}/${league}/scoreboard`, TTL.SHORT);
}

export async function getTeamSchedule(
  sport: string,
  teamId: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  return cachedFetch(`${BASE}/${s}/${league}/teams/${teamId}/schedule`, TTL.SHORT);
}

export async function fetchAllTeamData(
  sport: string,
  teamNames: string[],
  playerNames?: string[]
): Promise<Record<string, unknown>> {
  const key = sport.toUpperCase();
  if (!SPORT_MAP[key]) {
    console.log(`[ESPN] Sport not supported: "${sport}" (key: "${key}")`);
    return { _unsupported: true, _sport: sport };
  }

  console.log(`[ESPN] Fetching data for sport="${sport}", teams=${JSON.stringify(teamNames)}, players=${JSON.stringify(playerNames)}`);

  const results: Record<string, unknown> = {};
  let anyFound = false;

  for (const name of teamNames) {
    const team = await searchTeam(sport, name);
    if (!team) {
      console.log(`[ESPN] Team not found: "${name}" in sport "${sport}"`);
      results[name] = null;
      continue;
    }

    anyFound = true;
    const teamId = (team as { id: string }).id;
    console.log(`[ESPN] Found team: "${name}" → id=${teamId}`);
    const [stats, record, schedule] = await Promise.all([
      getTeamStats(sport, teamId),
      getTeamRecord(sport, teamId),
      getTeamSchedule(sport, teamId),
    ]);

    results[name] = {
      team,
      stats,
      record,
      recentGames: extractRecentGames(schedule),
    };
  }

  // Fetch player data if player names provided
  if (playerNames && playerNames.length > 0) {
    const playerData = await fetchPlayerData(sport, playerNames);
    results._players = playerData;
  }

  // For golf and player-focused sports, players alone count as "found"
  const isGolf = sport.toUpperCase() === "GOLF" || sport.toUpperCase() === "PGA";
  if (!anyFound && !isGolf) {
    console.log(`[ESPN] No teams found for any of: ${JSON.stringify(teamNames)}`);
    return { _unsupported: true, _sport: sport };
  }

  return results;
}

function extractRecentGames(
  schedule: Record<string, unknown> | null
): Record<string, unknown>[] {
  if (!schedule) return [];
  try {
    const events =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (schedule as any)?.events ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (schedule as any)?.team?.events ||
      [];
    return events
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((e: any) => {
        const status = e.competitions?.[0]?.status?.type?.completed;
        return status === true;
      })
      .slice(-10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => {
        const comp = e.competitions?.[0];
        // Score can be a number, string, or object { value, displayValue }
        const parseScore = (s: unknown): string => {
          if (s == null) return "0";
          if (typeof s === "object" && s !== null) {
            return String((s as { displayValue?: string; value?: number }).displayValue ?? (s as { value?: number }).value ?? 0);
          }
          return String(s);
        };
        return {
          date: e.date,
          name: e.name,
          homeTeam: comp?.competitors?.[0]?.team?.displayName,
          homeScore: parseScore(comp?.competitors?.[0]?.score),
          awayTeam: comp?.competitors?.[1]?.team?.displayName,
          awayScore: parseScore(comp?.competitors?.[1]?.score),
        };
      });
  } catch {
    return [];
  }
}
