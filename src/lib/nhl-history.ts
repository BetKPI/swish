/**
 * NHL History - two-season data primitives for deterministic history charts.
 * Uses the free api-web.nhle.com endpoints.
 */

import { cachedFetch, TTL } from "./fetch";
import { searchPlayer, findTeamAbbrev, getPlayerGameLog, type NHLGameLog } from "./nhlstats";

const BASE = "https://api-web.nhle.com/v1";

// ── Types ──────────────────────────────────────────────────────────

export interface NHLTeamGame {
  gameId: number;
  date: string;
  season: string; // "20252026"
  seasonLabel: string; // "24-25"
  opponent: string;
  opponentAbbrev: string;
  home: boolean;
  teamScore: number;
  opponentScore: number;
  won: boolean;
  total: number;
  margin: number;
  // Period scoring (filled when enriched)
  p1Team?: number;
  p2Team?: number;
  p3Team?: number;
  p1Opp?: number;
  p2Opp?: number;
  p3Opp?: number;
}

export interface NHLTeamTwoSeason {
  teamAbbrev: string;
  teamName: string;
  lastSeason: string;
  currentSeason: string;
  games: NHLTeamGame[];
}

export interface NHLPlayerGame {
  gameId: number;
  date: string;
  season: string;
  seasonType: "regular" | "playoffs";
  opponent: string;
  home: boolean;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  pim: number;
}

export interface NHLPlayerTwoSeason {
  playerId: number;
  playerName: string;
  position: string;
  lastSeason: string;
  currentSeason: string;
  games: NHLPlayerGame[];
}

export interface NHLStandingsRow {
  team: string;
  abbrev: string;
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  gp: number;
  conference: string;
  division: string;
}

export interface NHLStandingsSnapshot {
  seasonLabel: string;
  dateLabel: string;
  rows: NHLStandingsRow[];
}

// ── Season helpers ────────────────────────────────────────────────

export function getCurrentAndLastNHLSeasons(): { current: string; last: string; currentLabel: string; lastLabel: string } {
  const now = new Date();
  const m = now.getUTCMonth();
  const y = now.getUTCFullYear();
  // NHL season runs Oct-June. After July, new season has started.
  const startYear = m >= 6 ? y : y - 1;
  const current = `${startYear}${startYear + 1}`;
  const last = `${startYear - 1}${startYear}`;
  const currentLabel = `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
  const lastLabel = `${String(startYear - 1).slice(2)}-${String(startYear).slice(2)}`;
  return { current, last, currentLabel, lastLabel };
}

// ── Team schedule ─────────────────────────────────────────────────

interface RawGame {
  id?: number;
  gameDate?: string;
  gameState?: string;
  homeTeam?: { abbrev?: string; score?: number; placeName?: { default?: string } };
  awayTeam?: { abbrev?: string; score?: number; placeName?: { default?: string } };
}

async function fetchTeamSeason(teamAbbrev: string, season: string): Promise<RawGame[]> {
  const data = await cachedFetch<Record<string, unknown>>(
    `${BASE}/club-schedule-season/${teamAbbrev}/${season}`,
    TTL.LONG,
  );
  if (!data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any).games || []) as RawGame[];
}

function parseTeamGames(
  rawGames: RawGame[],
  teamAbbrev: string,
  season: string,
  seasonLabel: string,
): NHLTeamGame[] {
  const out: NHLTeamGame[] = [];
  for (const g of rawGames) {
    if (g.gameState !== "OFF" && g.gameState !== "FINAL") continue;
    const isHome = g.homeTeam?.abbrev === teamAbbrev;
    const me = isHome ? g.homeTeam : g.awayTeam;
    const them = isHome ? g.awayTeam : g.homeTeam;
    if (!me || !them) continue;
    const teamScore = me.score ?? 0;
    const opponentScore = them.score ?? 0;
    if (teamScore === 0 && opponentScore === 0) continue;
    out.push({
      gameId: g.id || 0,
      date: g.gameDate || "",
      season,
      seasonLabel,
      opponent: them.placeName?.default || them.abbrev || "?",
      opponentAbbrev: them.abbrev || "",
      home: isHome,
      teamScore,
      opponentScore,
      won: teamScore > opponentScore,
      margin: teamScore - opponentScore,
      total: teamScore + opponentScore,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getNHLTeamTwoSeason(
  teamAbbrev: string,
  teamName: string,
): Promise<NHLTeamTwoSeason> {
  const { current, last, currentLabel, lastLabel } = getCurrentAndLastNHLSeasons();
  const [lastRaw, currRaw] = await Promise.all([
    fetchTeamSeason(teamAbbrev, last),
    fetchTeamSeason(teamAbbrev, current),
  ]);
  const lastGames = parseTeamGames(lastRaw, teamAbbrev, last, lastLabel);
  const currGames = parseTeamGames(currRaw, teamAbbrev, current, currentLabel);
  return {
    teamAbbrev,
    teamName,
    lastSeason: last,
    currentSeason: current,
    games: [...lastGames, ...currGames],
  };
}

export function resolveNHLTeam(name: string): { abbrev: string; name: string } | null {
  const abbrev = findTeamAbbrev(name);
  if (!abbrev) return null;
  return { abbrev, name };
}

// ── Player two-season game log ────────────────────────────────────

function normalizeOpponent(opp: string | { default?: string } | undefined): string {
  if (!opp) return "?";
  if (typeof opp === "string") return opp;
  return opp.default || "?";
}

export async function getNHLPlayerTwoSeason(
  playerId: number,
  playerName: string,
  position: string,
): Promise<NHLPlayerTwoSeason> {
  const { current, last, currentLabel, lastLabel } = getCurrentAndLastNHLSeasons();
  const [lastLog, currLog] = await Promise.all([
    getPlayerGameLog(playerId, last).catch(() => [] as NHLGameLog[]),
    getPlayerGameLog(playerId, current).catch(() => [] as NHLGameLog[]),
  ]);
  const mapGame = (g: NHLGameLog, season: string): NHLPlayerGame => ({
    gameId: g.gameId,
    date: g.gameDate,
    season,
    seasonType: g.seasonType === "playoffs" ? "playoffs" : "regular",
    opponent: normalizeOpponent(g.opponentCommonName) || normalizeOpponent(g.opponentAbbrev),
    home: g.homeRoadFlag === "H",
    goals: g.goals || 0,
    assists: g.assists || 0,
    points: g.points || 0,
    shots: g.shots || 0,
    pim: g.pim || 0,
  });
  const games = [
    ...lastLog.map((g) => mapGame(g, last)),
    ...currLog.map((g) => mapGame(g, current)),
  ].sort((a, b) => a.date.localeCompare(b.date));
  // currentLabel / lastLabel retained for any future per-season filtering callers.
  void currentLabel;
  void lastLabel;
  return {
    playerId,
    playerName,
    position,
    lastSeason: last,
    currentSeason: current,
    games,
  };
}

export async function resolveNHLPlayer(name: string): Promise<{ id: number; name: string; position: string } | null> {
  const p = await searchPlayer(name);
  if (!p) return null;
  return { id: p.playerId, name: p.fullName, position: p.position };
}

// ── Standings (current only - NHL API requires a date for historical) ─

export async function getNHLStandingsSnapshot(dateISO?: string): Promise<NHLStandingsSnapshot> {
  const url = dateISO ? `${BASE}/standings/${dateISO}` : `${BASE}/standings/now`;
  const data = await cachedFetch<Record<string, unknown>>(url, TTL.LONG);
  const rows: NHLStandingsRow[] = [];
  if (!data) return { seasonLabel: "?", dateLabel: dateISO || "now", rows };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = ((data as any).standings || []) as any[];
  for (const e of entries) {
    rows.push({
      team: e.teamName?.default || e.teamAbbrev?.default || "?",
      abbrev: e.teamAbbrev?.default || "",
      wins: Number(e.wins) || 0,
      losses: Number(e.losses) || 0,
      otLosses: Number(e.otLosses) || 0,
      points: Number(e.points) || 0,
      gp: Number(e.gamesPlayed) || 0,
      conference: e.conferenceName || "?",
      division: e.divisionName || "?",
    });
  }
  return { seasonLabel: String((data as { seasonId?: unknown }).seasonId || "?"), dateLabel: dateISO || "now", rows };
}

export async function getNHLStandingsForRecentYears(): Promise<NHLStandingsSnapshot[]> {
  // Grab current + end-of-last-two-seasons snapshots (approx end of regular season = early April)
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const currentSeasonEndYear = m >= 6 ? y + 1 : y; // season ends in spring of the "end year"
  const dates = [
    undefined, // current snapshot
    `${currentSeasonEndYear - 1}-04-10`,
    `${currentSeasonEndYear - 2}-04-10`,
    `${currentSeasonEndYear - 3}-04-10`,
  ];
  return Promise.all(dates.map((d) => getNHLStandingsSnapshot(d)));
}

// ── Period-scoring enrichment (for 1st period bets) ───────────────

interface GameLanding {
  summary?: {
    linescore?: {
      byPeriod?: Array<{ home?: number; away?: number }>;
    };
  };
  homeTeam?: { abbrev?: string };
  awayTeam?: { abbrev?: string };
}

async function fetchPeriodScores(
  gameId: number,
  teamAbbrev: string,
): Promise<{ team: number[]; opp: number[] } | null> {
  const data = await cachedFetch<GameLanding>(
    `${BASE}/gamecenter/${gameId}/landing`,
    TTL.LONG,
  );
  if (!data?.summary?.linescore?.byPeriod) return null;
  const byPeriod = data.summary.linescore.byPeriod.slice(0, 3);
  if (byPeriod.length < 3) return null;
  const isHome = data.homeTeam?.abbrev === teamAbbrev;
  const teamArr = byPeriod.map((p) => (isHome ? p.home : p.away) || 0);
  const oppArr = byPeriod.map((p) => (isHome ? p.away : p.home) || 0);
  return { team: teamArr, opp: oppArr };
}

/**
 * Fill period scores on up to `limit` most-recent completed games.
 */
export async function enrichNHLRecentPeriodScores(
  team: NHLTeamTwoSeason,
  limit: number = 30,
): Promise<void> {
  const targets = team.games.slice(-limit).filter((g) => g.gameId);
  const CHUNK = 6;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const slice = targets.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (g) => {
        const ps = await fetchPeriodScores(g.gameId, team.teamAbbrev);
        if (!ps) return;
        [g.p1Team, g.p2Team, g.p3Team] = ps.team;
        [g.p1Opp, g.p2Opp, g.p3Opp] = ps.opp;
      }),
    );
  }
}
