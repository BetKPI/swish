/**
 * MLB History - two-season data primitives for deterministic history charts.
 * Pulls last season + current YTD from the public MLB Stats API.
 */

import { cachedFetch, TTL } from "./fetch";

const BASE = "https://statsapi.mlb.com/api/v1";

// ── Types ──────────────────────────────────────────────────────────

export interface MLBTeamGame {
  date: string;
  opponent: string;
  opponentId: number;
  isHome: boolean;
  teamScore: number;
  oppScore: number;
  won: boolean;
  totalRuns: number;
  margin: number;
  f5Runs?: number;
  f3Runs?: number;
  firstInningRuns?: number;
  season: number;
}

export interface MLBTeamTwoSeason {
  teamId: number;
  teamName: string;
  lastSeason: MLBTeamGame[];
  currentSeason: MLBTeamGame[];
  lastSeasonYear: number;
  currentSeasonYear: number;
}

export interface MLBPitcherGame {
  date: string;
  opponent: string;
  opponentId: number;
  season: number;
  ip: number;
  er: number;
  k: number;
  bb: number;
  h: number;
  hr: number;
  win: boolean;
  loss: boolean;
  era: number;
}

export interface MLBPitcherTwoSeason {
  pitcherId: number;
  pitcherName: string;
  lastSeason: MLBPitcherGame[];
  currentSeason: MLBPitcherGame[];
  lastSeasonYear: number;
  currentSeasonYear: number;
}

export interface MLBBatterGame {
  date: string;
  opponent: string;
  opponentId: number;
  season: number;
  ab: number;
  hits: number;
  hr: number;
  rbi: number;
  runs: number;
  bb: number;
  so: number;
  totalBases: number;
  stolenBases: number;
}

export interface MLBBatterTwoSeason {
  batterId: number;
  batterName: string;
  lastSeason: MLBBatterGame[];
  currentSeason: MLBBatterGame[];
  lastSeasonYear: number;
  currentSeasonYear: number;
}

export interface MLBBatterVsPitcher {
  batterName: string;
  pitcherName: string;
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  avg: string;
}

export interface MLBStandingsRow {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  divisionRank: number;
  leagueRank: number;
  divisionName?: string;
  leagueName?: string;
}

export interface MLBStandingsSnapshot {
  season: number;
  rows: MLBStandingsRow[];
}

// ── Helpers ────────────────────────────────────────────────────────

export function getLastAndCurrentSeasons(): { last: number; current: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0 = Jan
  if (m < 3) {
    return { last: y - 2, current: y - 1 };
  }
  return { last: y - 1, current: y };
}

export function parseIP(s: unknown): number {
  if (s === null || s === undefined) return 0;
  const str = String(s);
  if (!str) return 0;
  const n = Number(str);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 10);
  if (frac === 1) return whole + 1 / 3;
  if (frac === 2) return whole + 2 / 3;
  return whole;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

// ── Team schedule / results ────────────────────────────────────────

interface ScheduleResponse {
  dates?: Array<{
    games?: Array<{
      gameDate?: string;
      status?: { detailedState?: string };
      teams?: {
        home?: {
          score?: number;
          isWinner?: boolean;
          team?: { id?: number; name?: string };
        };
        away?: {
          score?: number;
          isWinner?: boolean;
          team?: { id?: number; name?: string };
        };
      };
      linescore?: {
        innings?: Array<{
          home?: { runs?: number };
          away?: { runs?: number };
        }>;
      };
    }>;
  }>;
}

async function fetchTeamSeason(
  teamId: number,
  season: number,
  ttl: number,
): Promise<MLBTeamGame[]> {
  try {
    const url = `${BASE}/schedule?teamId=${teamId}&season=${season}&sportId=1&gameType=R&hydrate=team,linescore`;
    const data = await cachedFetch<ScheduleResponse>(url, ttl);
    if (!data || !data.dates) return [];
    const out: MLBTeamGame[] = [];
    for (const d of data.dates) {
      if (!d.games) continue;
      for (const g of d.games) {
        if (g.status?.detailedState !== "Final") continue;
        const home = g.teams?.home;
        const away = g.teams?.away;
        if (!home || !away) continue;
        const isHome = home.team?.id === teamId;
        const me = isHome ? home : away;
        const opp = isHome ? away : home;
        const teamScore = num(me.score);
        const oppScore = num(opp.score);
        const innings = g.linescore?.innings ?? [];
        let f1: number | undefined;
        let f3: number | undefined;
        let f5: number | undefined;
        if (innings.length >= 1) {
          f1 = num(innings[0]?.home?.runs) + num(innings[0]?.away?.runs);
        }
        if (innings.length >= 3) {
          let s = 0;
          for (let i = 0; i < 3; i++) {
            s += num(innings[i]?.home?.runs) + num(innings[i]?.away?.runs);
          }
          f3 = s;
        }
        if (innings.length >= 5) {
          let s = 0;
          for (let i = 0; i < 5; i++) {
            s += num(innings[i]?.home?.runs) + num(innings[i]?.away?.runs);
          }
          f5 = s;
        }
        out.push({
          date: (g.gameDate ?? "").slice(0, 10),
          opponent: opp.team?.name ?? "",
          opponentId: num(opp.team?.id),
          isHome,
          teamScore,
          oppScore,
          won: bool(me.isWinner),
          totalRuns: teamScore + oppScore,
          margin: teamScore - oppScore,
          f5Runs: f5,
          f3Runs: f3,
          firstInningRuns: f1,
          season,
        });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  } catch (e) {
    console.error("[MLB History] fetchTeamSeason", e);
    return [];
  }
}

export async function getTeamTwoSeasonResults(
  teamId: number,
  teamName: string,
): Promise<MLBTeamTwoSeason> {
  const { last, current } = getLastAndCurrentSeasons();
  const [lastSeason, currentSeason] = await Promise.all([
    fetchTeamSeason(teamId, last, TTL.LONG),
    fetchTeamSeason(teamId, current, TTL.MEDIUM),
  ]);
  return {
    teamId,
    teamName,
    lastSeason,
    currentSeason,
    lastSeasonYear: last,
    currentSeasonYear: current,
  };
}

// ── Pitcher / batter game logs ─────────────────────────────────────

interface GameLogResponse {
  stats?: Array<{
    splits?: Array<{
      date?: string;
      opponent?: { id?: number; name?: string };
      stat?: Record<string, unknown>;
    }>;
  }>;
}

async function fetchPitcherSeason(
  pitcherId: number,
  season: number,
  ttl: number,
): Promise<MLBPitcherGame[]> {
  try {
    const url = `${BASE}/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`;
    const data = await cachedFetch<GameLogResponse>(url, ttl);
    const splits = data?.stats?.[0]?.splits ?? [];
    const out: MLBPitcherGame[] = [];
    for (const sp of splits) {
      const st = sp.stat ?? {};
      const ip = parseIP(st.inningsPitched);
      const er = num(st.earnedRuns);
      out.push({
        date: (sp.date ?? "").slice(0, 10),
        opponent: sp.opponent?.name ?? "",
        opponentId: num(sp.opponent?.id),
        season,
        ip,
        er,
        k: num(st.strikeOuts),
        bb: num(st.baseOnBalls),
        h: num(st.hits),
        hr: num(st.homeRuns),
        win: bool(st.wins) || num(st.wins) > 0,
        loss: bool(st.losses) || num(st.losses) > 0,
        era: ip > 0 ? (er / ip) * 9 : 0,
      });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  } catch (e) {
    console.error("[MLB History] fetchPitcherSeason", e);
    return [];
  }
}

export async function getPitcherTwoSeasonLog(
  pitcherId: number,
  pitcherName: string,
): Promise<MLBPitcherTwoSeason> {
  const { last, current } = getLastAndCurrentSeasons();
  const [lastSeason, currentSeason] = await Promise.all([
    fetchPitcherSeason(pitcherId, last, TTL.LONG),
    fetchPitcherSeason(pitcherId, current, TTL.MEDIUM),
  ]);
  return {
    pitcherId,
    pitcherName,
    lastSeason,
    currentSeason,
    lastSeasonYear: last,
    currentSeasonYear: current,
  };
}

/**
 * Pull 6 seasons of the pitcher's game log and return only starts against `opponentTeamId`.
 * Goes much deeper than the 2-season main chart for a more useful career track record.
 */
export async function getPitcherCareerVsOpponent(
  pitcherId: number,
  opponentTeamId: number,
  seasonsBack: number = 6,
): Promise<MLBPitcherGame[]> {
  const { current } = getLastAndCurrentSeasons();
  const seasons: number[] = [];
  for (let i = 0; i < seasonsBack; i++) seasons.push(current - i);
  const results = await Promise.all(
    seasons.map((yr) => fetchPitcherSeason(pitcherId, yr, TTL.LONG)),
  );
  const all = results.flat().filter((g) => g.opponentId === opponentTeamId);
  all.sort((a, b) => a.date.localeCompare(b.date));
  return all;
}

async function fetchBatterSeason(
  batterId: number,
  season: number,
  ttl: number,
): Promise<MLBBatterGame[]> {
  try {
    const url = `${BASE}/people/${batterId}/stats?stats=gameLog&season=${season}&group=hitting`;
    const data = await cachedFetch<GameLogResponse>(url, ttl);
    const splits = data?.stats?.[0]?.splits ?? [];
    const out: MLBBatterGame[] = [];
    for (const sp of splits) {
      const st = sp.stat ?? {};
      out.push({
        date: (sp.date ?? "").slice(0, 10),
        opponent: sp.opponent?.name ?? "",
        opponentId: num(sp.opponent?.id),
        season,
        ab: num(st.atBats),
        hits: num(st.hits),
        hr: num(st.homeRuns),
        rbi: num(st.rbi),
        runs: num(st.runs),
        bb: num(st.baseOnBalls),
        so: num(st.strikeOuts),
        totalBases: num(st.totalBases),
        stolenBases: num(st.stolenBases),
      });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  } catch (e) {
    console.error("[MLB History] fetchBatterSeason", e);
    return [];
  }
}

export async function getBatterTwoSeasonLog(
  batterId: number,
  batterName: string,
): Promise<MLBBatterTwoSeason> {
  const { last, current } = getLastAndCurrentSeasons();
  const [lastSeason, currentSeason] = await Promise.all([
    fetchBatterSeason(batterId, last, TTL.LONG),
    fetchBatterSeason(batterId, current, TTL.MEDIUM),
  ]);
  return {
    batterId,
    batterName,
    lastSeason,
    currentSeason,
    lastSeasonYear: last,
    currentSeasonYear: current,
  };
}

// ── Batter vs pitcher ──────────────────────────────────────────────

interface VsPlayerResponse {
  stats?: Array<{
    splits?: Array<{
      stat?: Record<string, unknown>;
    }>;
  }>;
}

export async function getBatterVsPitcher(
  batterId: number,
  batterName: string,
  pitcherId: number,
  pitcherName: string,
): Promise<MLBBatterVsPitcher | null> {
  try {
    const url = `${BASE}/people/${batterId}/stats?stats=vsPlayer&opposingPlayerId=${pitcherId}&group=hitting&sportId=1`;
    const data = await cachedFetch<VsPlayerResponse>(url, TTL.LONG);
    const splits = data?.stats?.[0]?.splits ?? [];
    if (splits.length === 0) return null;
    const st = splits[0].stat ?? {};
    const pa = num(st.plateAppearances);
    if (pa === 0) return null;
    return {
      batterName,
      pitcherName,
      pa,
      ab: num(st.atBats),
      hits: num(st.hits),
      hr: num(st.homeRuns),
      rbi: num(st.rbi),
      bb: num(st.baseOnBalls),
      so: num(st.strikeOuts),
      avg: String(st.avg ?? ".000"),
    };
  } catch (e) {
    console.error("[MLB History] getBatterVsPitcher", e);
    return null;
  }
}

// ── Standings ──────────────────────────────────────────────────────

interface StandingsResponse {
  records?: Array<{
    league?: { id?: number; name?: string };
    division?: { id?: number; name?: string };
    teamRecords?: Array<{
      team?: { id?: number; name?: string };
      wins?: number;
      losses?: number;
      divisionRank?: string | number;
      leagueRank?: string | number;
    }>;
  }>;
}

async function fetchStandingsSeason(
  season: number,
): Promise<MLBStandingsSnapshot> {
  try {
    const url = `${BASE}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`;
    const data = await cachedFetch<StandingsResponse>(url, TTL.LONG);
    const rows: MLBStandingsRow[] = [];
    const records = data?.records ?? [];
    for (const rec of records) {
      const leagueId = rec.league?.id;
      const leagueName = leagueId === 103 ? "AL" : leagueId === 104 ? "NL" : undefined;
      const divisionName = rec.division?.name;
      for (const tr of rec.teamRecords ?? []) {
        rows.push({
          teamId: num(tr.team?.id),
          teamName: tr.team?.name ?? "",
          wins: num(tr.wins),
          losses: num(tr.losses),
          divisionRank: num(tr.divisionRank),
          leagueRank: num(tr.leagueRank),
          divisionName,
          leagueName,
        });
      }
    }
    return { season, rows };
  } catch (e) {
    console.error("[MLB History] fetchStandingsSeason", e);
    return { season, rows: [] };
  }
}

export async function getMLBStandingsForSeasons(
  seasons: number[],
): Promise<MLBStandingsSnapshot[]> {
  try {
    return await Promise.all(seasons.map((s) => fetchStandingsSeason(s)));
  } catch (e) {
    console.error("[MLB History] getMLBStandingsForSeasons", e);
    return [];
  }
}

// ── Statcast exit velocity (stub) ──────────────────────────────────

export async function tryFetchBatterExitVelocity(
  _batterId: number,
):
  Promise<
    | { available: false }
    | {
        available: true;
        avgExitVelo: number;
        maxExitVelo: number;
        hardHitPct: number;
        barrelPct: number;
      }
  > {
  return { available: false };
}
