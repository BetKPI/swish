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
const CORE_BASE = "https://sports.core.api.espn.com/v2/sports";

// ── Player search & stats ──────────────────────────────────────────

export async function searchPlayer(
  sport: string,
  playerName: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    // ESPN roster search: find team first, then search roster
    // Alternatively, use the athletes endpoint
    const res = await fetch(
      `${BASE}/${s}/${league}/athletes?limit=100&search=${encodeURIComponent(playerName)}`
    );
    if (res.ok) {
      const data = await res.json();
      const athletes = data.athletes || data.items || [];
      if (athletes.length > 0) return athletes[0];
    }

    // Fallback: search across all teams
    const teamsRes = await fetch(`${BASE}/${s}/${league}/teams?limit=100`);
    if (!teamsRes.ok) return null;
    const teamsData = await teamsRes.json();
    const teams = teamsData.sports?.[0]?.leagues?.[0]?.teams || [];

    for (const t of teams) {
      const teamId = t.team?.id;
      if (!teamId) continue;
      const rosterRes = await fetch(
        `${BASE}/${s}/${league}/teams/${teamId}/roster`
      );
      if (!rosterRes.ok) continue;
      const rosterData = await rosterRes.json();
      const athletes2 = rosterData.athletes || [];
      for (const group of athletes2) {
        const items = group.items || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = items.find((a: any) => {
          const full = a.fullName?.toLowerCase() || a.displayName?.toLowerCase() || "";
          const search = playerName.toLowerCase();
          return full.includes(search) || search.includes(full);
        });
        if (match) return { ...match, teamId, teamName: t.team?.displayName };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getPlayerStats(
  sport: string,
  playerId: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    const res = await fetch(
      `${BASE}/${s}/${league}/athletes/${playerId}/statistics`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getPlayerGameLog(
  sport: string,
  playerId: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    const res = await fetch(
      `${BASE}/${s}/${league}/athletes/${playerId}/gamelog`
    );
    if (!res.ok) {
      // Try core API as fallback
      const coreRes = await fetch(
        `${CORE_BASE}/${s}/leagues/${league}/athletes/${playerId}/statisticslog`
      );
      if (!coreRes.ok) return null;
      return coreRes.json();
    }
    return res.json();
  } catch {
    return null;
  }
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
      getPlayerGameLog(sport, playerId),
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
    const res = await fetch(
      `${BASE}/${s}/${league}/teams?limit=100`
    );
    if (!res.ok) return null;
    const data = await res.json();
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
  try {
    const res = await fetch(
      `${BASE}/${s}/${league}/teams/${teamId}/statistics`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getTeamRecord(
  sport: string,
  teamId: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    const res = await fetch(`${BASE}/${s}/${league}/teams/${teamId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getScoreboard(
  sport: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    const res = await fetch(`${BASE}/${s}/${league}/scoreboard`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getTeamSchedule(
  sport: string,
  teamId: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfoOrThrow(sport);
  try {
    const res = await fetch(
      `${BASE}/${s}/${league}/teams/${teamId}/schedule`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
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

  if (!anyFound) {
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
        return {
          date: e.date,
          name: e.name,
          homeTeam: comp?.competitors?.[0]?.team?.displayName,
          homeScore: comp?.competitors?.[0]?.score,
          awayTeam: comp?.competitors?.[1]?.team?.displayName,
          awayScore: comp?.competitors?.[1]?.score,
        };
      });
  } catch {
    return [];
  }
}
