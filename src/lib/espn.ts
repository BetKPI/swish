const SPORT_MAP: Record<string, { sport: string; league: string }> = {
  NBA: { sport: "basketball", league: "nba" },
  NFL: { sport: "football", league: "nfl" },
  MLB: { sport: "baseball", league: "mlb" },
  NHL: { sport: "hockey", league: "nhl" },
  NCAAF: { sport: "football", league: "college-football" },
  NCAAB: { sport: "basketball", league: "mens-college-basketball" },
  MLS: { sport: "soccer", league: "usa.1" },
  EPL: { sport: "soccer", league: "eng.1" },
  Soccer: { sport: "soccer", league: "usa.1" },
};

function getLeagueInfo(sport: string) {
  const key = sport.toUpperCase();
  return SPORT_MAP[key] || SPORT_MAP["NBA"];
}

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

export async function searchTeam(
  sport: string,
  teamName: string
): Promise<Record<string, unknown> | null> {
  const { sport: s, league } = getLeagueInfo(sport);
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
  const { sport: s, league } = getLeagueInfo(sport);
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
  const { sport: s, league } = getLeagueInfo(sport);
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
  const { sport: s, league } = getLeagueInfo(sport);
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
  const { sport: s, league } = getLeagueInfo(sport);
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
  teamNames: string[]
): Promise<Record<string, unknown>> {
  const key = sport.toUpperCase();
  if (!SPORT_MAP[key]) {
    return { _unsupported: true, _sport: sport };
  }

  const results: Record<string, unknown> = {};
  let anyFound = false;

  for (const name of teamNames) {
    const team = await searchTeam(sport, name);
    if (!team) {
      results[name] = null;
      continue;
    }

    anyFound = true;
    const teamId = (team as { id: string }).id;
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

  if (!anyFound) {
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
