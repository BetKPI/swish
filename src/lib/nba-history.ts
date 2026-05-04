/**
 * NBA History - two-season data primitives for deterministic history charts.
 * Pulls team schedules, player game logs, standings, and quarter scores from
 * ESPN's free web APIs (no auth required).
 */

import { cachedFetch, TTL } from "./fetch";
import { searchTeam, searchPlayer } from "./espn";

const SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const WEB_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const V2_BASE = "https://site.api.espn.com/apis/v2/sports/basketball/nba";

// ── Types ──────────────────────────────────────────────────────────

export interface NBATeamGame {
  eventId: string;
  date: string;
  season: number;
  seasonType: "regular" | "playoffs";
  opponent: string;
  opponentId?: string;
  home: boolean;
  teamScore: number;
  opponentScore: number;
  won: boolean;
  margin: number; // teamScore - opponentScore
  total: number; // teamScore + opponentScore
  // Quarter scores (filled in when tryFetchQuarterScores is used)
  q1?: number;
  q2?: number;
  q3?: number;
  q4?: number;
  oppQ1?: number;
  oppQ2?: number;
  oppQ3?: number;
  oppQ4?: number;
}

export interface NBATeamTwoSeason {
  teamId: number;
  teamName: string;
  abbreviation: string;
  lastSeason: number;
  currentSeason: number;
  games: NBATeamGame[]; // all games, both seasons, sorted ascending
}

export interface NBAPlayerGame {
  eventId: string;
  date: string;
  season: number;
  seasonType: "regular" | "playoffs";
  opponent: string;
  home: boolean;
  stats: Record<string, number>;
}

export interface NBAPlayerTwoSeason {
  playerId: string;
  playerName: string;
  position?: string;
  games: NBAPlayerGame[];
  lastSeason: number;
  currentSeason: number;
}

export interface NBAStandingsRow {
  team: string;
  teamId?: number;
  conference: string;
  division?: string;
  wins: number;
  losses: number;
  winPct: number;
  seed?: number;
}

export interface NBAStandingsSnapshot {
  season: number;
  rows: NBAStandingsRow[];
}

// ── Season helpers ─────────────────────────────────────────────────

export function getCurrentAndLastNBASeasons(): { current: number; last: number } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // NBA season year in ESPN = ending year. Oct–June.
  // After July, next season has started.
  const current = m >= 7 ? y + 1 : y;
  return { current, last: current - 1 };
}

// ── Team schedule / games ──────────────────────────────────────────

interface ScheduleCompetitor {
  id?: string;
  homeAway?: "home" | "away";
  score?: unknown;
  winner?: boolean;
  team?: { id?: string; displayName?: string; abbreviation?: string };
}

interface ScheduleEvent {
  id?: string;
  date?: string;
  _seasonType?: "regular" | "playoffs";
  competitions?: Array<{
    status?: { type?: { completed?: boolean } };
    competitors?: ScheduleCompetitor[];
  }>;
  season?: { year?: number; type?: number };
}

function toNum(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object") {
    const v = (val as { value?: number; displayValue?: string });
    if (typeof v.value === "number") return v.value;
    if (v.displayValue != null) return Number(v.displayValue) || 0;
  }
  return Number(val) || 0;
}

async function fetchSeasonSchedule(teamId: number, season: number): Promise<ScheduleEvent[]> {
  const urls = [
    `${SITE_BASE}/teams/${teamId}/schedule?seasontype=2&season=${season}`,
    `${SITE_BASE}/teams/${teamId}/schedule?seasontype=3&season=${season}`,
  ];
  const out: ScheduleEvent[] = [];
  await Promise.all(
    urls.map(async (url, idx) => {
      const data = await cachedFetch<Record<string, unknown>>(url, TTL.LONG);
      if (!data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = ((data as any)?.events || (data as any)?.team?.events || []) as ScheduleEvent[];
      for (const e of events) {
        e._seasonType = idx === 0 ? "regular" : "playoffs";
        out.push(e);
      }
    }),
  );
  return out;
}

function parseTeamGames(
  events: ScheduleEvent[],
  teamId: number,
  season: number,
): NBATeamGame[] {
  const games: NBATeamGame[] = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    if (!comp.status?.type?.completed) continue;
    const comps = comp.competitors || [];
    if (comps.length < 2) continue;
    const me = comps.find((c) => String(c.team?.id || c.id) === String(teamId));
    const them = comps.find((c) => String(c.team?.id || c.id) !== String(teamId));
    if (!me || !them) continue;
    const teamScore = toNum(me.score);
    const opponentScore = toNum(them.score);
    if (teamScore === 0 && opponentScore === 0) continue;
    games.push({
      eventId: String(ev.id || ""),
      date: String(ev.date || ""),
      season,
      seasonType: ev._seasonType || "regular",
      opponent: them.team?.displayName || them.team?.abbreviation || "?",
      opponentId: them.team?.id,
      home: me.homeAway === "home",
      teamScore,
      opponentScore,
      won: teamScore > opponentScore,
      margin: teamScore - opponentScore,
      total: teamScore + opponentScore,
    });
  }
  return games;
}

export async function getTeamTwoSeason(
  teamId: number,
  teamName: string,
  abbreviation: string = "",
): Promise<NBATeamTwoSeason> {
  const { current, last } = getCurrentAndLastNBASeasons();
  const [lastEvents, currEvents] = await Promise.all([
    fetchSeasonSchedule(teamId, last),
    fetchSeasonSchedule(teamId, current),
  ]);
  const lastGames = parseTeamGames(lastEvents, teamId, last);
  const currGames = parseTeamGames(currEvents, teamId, current);
  const all = [...lastGames, ...currGames].sort((a, b) => a.date.localeCompare(b.date));
  return {
    teamId,
    teamName,
    abbreviation,
    lastSeason: last,
    currentSeason: current,
    games: all,
  };
}

export async function resolveNBATeam(name: string): Promise<{ id: number; name: string; abbreviation: string } | null> {
  const t = await searchTeam("NBA", name);
  if (!t) return null;
  const id = Number((t as { id?: string | number }).id);
  if (!id) return null;
  return {
    id,
    name: (t as { displayName?: string }).displayName || name,
    abbreviation: (t as { abbreviation?: string }).abbreviation || "",
  };
}

// ── Player game log ────────────────────────────────────────────────

interface GameLogResponse {
  labels?: string[];
  events?: Record<string, { gameDate?: string; opponent?: { displayName?: string; abbreviation?: string }; homeAway?: string }>;
  seasonTypes?: Array<{
    categories?: Array<{
      events?: Array<{ eventId?: string; stats?: Array<string | number> }>;
    }>;
  }>;
}

async function fetchPlayerSeasonLog(playerId: string, season: number): Promise<NBAPlayerGame[]> {
  const data = await cachedFetch<GameLogResponse>(
    `${WEB_BASE}/athletes/${playerId}/gamelog?season=${season}`,
    TTL.MEDIUM,
  );
  if (!data) return [];
  const labels = data.labels || [];
  const events = data.events || {};
  const games: NBAPlayerGame[] = [];
  const seasonTypes = data.seasonTypes || [];
  for (let stIdx = 0; stIdx < seasonTypes.length; stIdx++) {
    const seasonType = seasonTypes[stIdx];
    const typeName: "regular" | "playoffs" = stIdx === 0 ? "regular" : "playoffs";
    for (const cat of seasonType.categories || []) {
      for (const ev of cat.events || []) {
        const info = events[ev.eventId || ""] || {};
        const values = ev.stats || [];
        const stats: Record<string, number> = {};
        labels.forEach((label, i) => {
          const v = values[i];
          const num = Number(v);
          if (!isNaN(num) && !String(v).includes("-")) stats[label] = num;
        });
        games.push({
          eventId: String(ev.eventId || ""),
          date: info.gameDate || "",
          season,
          seasonType: typeName,
          opponent: info.opponent?.displayName || info.opponent?.abbreviation || "?",
          home: info.homeAway === "home",
          stats,
        });
      }
    }
  }
  return games;
}

export async function getPlayerTwoSeason(
  playerId: string,
  playerName: string,
): Promise<NBAPlayerTwoSeason> {
  const { current, last } = getCurrentAndLastNBASeasons();
  const [lastGames, currGames] = await Promise.all([
    fetchPlayerSeasonLog(playerId, last),
    fetchPlayerSeasonLog(playerId, current),
  ]);
  const all = [...lastGames, ...currGames].sort((a, b) => a.date.localeCompare(b.date));
  return {
    playerId,
    playerName,
    games: all,
    lastSeason: last,
    currentSeason: current,
  };
}

export async function resolveNBAPlayer(name: string): Promise<{ id: string; displayName: string } | null> {
  const p = await searchPlayer("NBA", name);
  if (!p) return null;
  const id = (p as { id?: string | number }).id;
  if (!id) return null;
  return {
    id: String(id),
    displayName: (p as { displayName?: string }).displayName || name,
  };
}

// ── Standings (current + prior seasons) ───────────────────────────

export async function getNBAStandingsForSeason(season: number): Promise<NBAStandingsSnapshot> {
  const data = await cachedFetch<Record<string, unknown>>(
    `${V2_BASE}/standings?season=${season}`,
    TTL.LONG,
  );
  const rows: NBAStandingsRow[] = [];
  if (!data) return { season, rows };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = ((data as any).children || []) as Array<any>;
  for (const group of groups) {
    const conference = group.name || group.abbreviation || "?";
    const entries = group.standings?.entries || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const entry of entries as any[]) {
      const stats: Record<string, number | string> = {};
      for (const s of entry.stats || []) {
        stats[s.name] = s.displayValue ?? s.value;
      }
      rows.push({
        team: entry.team?.displayName || "?",
        teamId: entry.team?.id ? Number(entry.team.id) : undefined,
        conference,
        wins: Number(stats.wins) || 0,
        losses: Number(stats.losses) || 0,
        winPct: Number(stats.winPercent) || 0,
        seed: Number(stats.playoffSeed) || undefined,
      });
    }
  }
  return { season, rows };
}

export async function getNBAStandingsForSeasons(seasons: number[]): Promise<NBAStandingsSnapshot[]> {
  return Promise.all(seasons.map((s) => getNBAStandingsForSeason(s)));
}

// ── Quarter scores (for 3Q / quarter exotics) ─────────────────────

interface SummaryResponse {
  boxscore?: {
    teams?: Array<{
      team?: { id?: string };
      linescores?: Array<{ value?: number; displayValue?: string }>;
    }>;
  };
  header?: {
    competitions?: Array<{
      competitors?: Array<{
        id?: string;
        team?: { id?: string };
        linescores?: Array<{ value?: number; displayValue?: string }>;
      }>;
    }>;
  };
}

async function fetchQuarterScores(
  eventId: string,
  teamId: number,
): Promise<{ q: number[]; oppQ: number[] } | null> {
  const data = await cachedFetch<SummaryResponse>(
    `${SITE_BASE}/summary?event=${eventId}`,
    TTL.LONG,
  );
  if (!data) return null;
  // Prefer header competitors with linescores
  const comps = data.header?.competitions?.[0]?.competitors || [];
  let me: { linescores?: Array<{ value?: number; displayValue?: string }> } | undefined;
  let them: { linescores?: Array<{ value?: number; displayValue?: string }> } | undefined;
  for (const c of comps) {
    const cid = c.id || c.team?.id;
    if (String(cid) === String(teamId)) me = c;
    else them = c;
  }
  if (!me?.linescores || !them?.linescores) return null;
  const mq = me.linescores.slice(0, 4).map((l) => Number(l.value ?? l.displayValue) || 0);
  const tq = them.linescores.slice(0, 4).map((l) => Number(l.value ?? l.displayValue) || 0);
  if (mq.length < 4 || tq.length < 4) return null;
  return { q: mq, oppQ: tq };
}

/**
 * Fill quarter scores on up to `limit` most-recent completed games.
 * Mutates the games array in place. Safe to call sparingly.
 */
export async function enrichRecentQuarterScores(
  team: NBATeamTwoSeason,
  limit: number = 40,
): Promise<void> {
  const targets = team.games.slice(-limit).filter((g) => g.eventId);
  const CHUNK = 6;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const slice = targets.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (g) => {
        const qs = await fetchQuarterScores(g.eventId, team.teamId);
        if (!qs) return;
        [g.q1, g.q2, g.q3, g.q4] = qs.q;
        [g.oppQ1, g.oppQ2, g.oppQ3, g.oppQ4] = qs.oppQ;
      }),
    );
  }
}
