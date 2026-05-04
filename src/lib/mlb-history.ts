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

// ── Team pitching + hitting season stats ───────────────────────────

export interface TeamPitchingStats {
  era: number;          // team ERA
  whip: number;
  kPer9: number;
  bbPer9: number;
  hrPer9: number;
}

export interface TeamHittingStats {
  ba: number;
  obp: number;
  slg: number;
  kPct: number;         // strikeouts / plate appearances
  bbPct: number;
  runsPerGame: number;
}

/**
 * Pull a team's season pitching stats from MLB Stats API. Used to add
 * "opposing staff quality" context to total bets and K props.
 */
export async function getTeamPitchingStats(teamId: number): Promise<TeamPitchingStats | null> {
  if (!teamId) return null;
  const year = new Date().getFullYear();
  try {
    const r = await fetch(
      `${BASE}/teams/${teamId}/stats?stats=season&group=pitching&season=${year}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const j = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (j?.stats?.[0]?.splits?.[0]?.stat || {}) as Record<string, any>;
    const era = Number(s.era);
    const whip = Number(s.whip);
    const kPer9 = Number(s.strikeoutsPer9Inn);
    const bbPer9 = Number(s.walksPer9Inn);
    const hrPer9 = Number(s.homeRunsPer9);
    if (!Number.isFinite(era)) return null;
    return {
      era,
      whip: Number.isFinite(whip) ? whip : 0,
      kPer9: Number.isFinite(kPer9) ? kPer9 : 0,
      bbPer9: Number.isFinite(bbPer9) ? bbPer9 : 0,
      hrPer9: Number.isFinite(hrPer9) ? hrPer9 : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Team season hitting stats — used for "opposing lineup K rate" on
 * pitcher K props and "opponent's offensive output" on totals.
 */
export async function getTeamHittingStats(teamId: number): Promise<TeamHittingStats | null> {
  if (!teamId) return null;
  const year = new Date().getFullYear();
  try {
    const r = await fetch(
      `${BASE}/teams/${teamId}/stats?stats=season&group=hitting&season=${year}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const j = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (j?.stats?.[0]?.splits?.[0]?.stat || {}) as Record<string, any>;
    const pa = Number(s.plateAppearances);
    const k = Number(s.strikeOuts);
    const bb = Number(s.baseOnBalls);
    const games = Number(s.gamesPlayed);
    const runs = Number(s.runs);
    return {
      ba: Number(s.avg) || 0,
      obp: Number(s.obp) || 0,
      slg: Number(s.slg) || 0,
      kPct: pa > 0 ? Math.round((k / pa) * 1000) / 1000 : 0,
      bbPct: pa > 0 ? Math.round((bb / pa) * 1000) / 1000 : 0,
      runsPerGame: games > 0 ? Math.round((runs / games) * 10) / 10 : 0,
    };
  } catch {
    return null;
  }
}

// ── Statcast / xStats — actual + expected hitting stats ────────────

export interface BatterStatcast {
  available: boolean;
  // Actual season stats
  ba?: number;
  slg?: number;
  woba?: number;
  // Expected stats (from Statcast)
  xba?: number;
  xslg?: number;
  xwoba?: number;
  // Derived deltas — actual minus expected. Positive = over-performing
  // (running hot, due to regress down). Negative = under-performing
  // (running cold, due to regress up).
  baDelta?: number;
  slgDelta?: number;
  wobaDelta?: number;
}

/**
 * Pull both actual and expected hitting stats for a batter from MLB Stats
 * API. The expected stats (xBA / xSLG / xwOBA) are Statcast-derived and
 * give a sharp bettor a regression read: actual minus expected tells you
 * whether the player is running hot or due to bounce back.
 *
 * Used for total bases / hits / HR / RBI props, not just HR.
 */
export async function tryFetchBatterExitVelocity(batterId: number): Promise<BatterStatcast> {
  if (!batterId) return { available: false };
  const year = new Date().getFullYear();

  const parseAvg = (s: unknown): number | undefined => {
    if (typeof s !== "string") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  try {
    const [actualR, expectedR] = await Promise.all([
      fetch(
        `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=season&group=hitting&season=${year}`,
        { signal: AbortSignal.timeout(8000) },
      ),
      fetch(
        `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=expectedStatistics&group=hitting&season=${year}`,
        { signal: AbortSignal.timeout(8000) },
      ),
    ]);
    if (!actualR.ok && !expectedR.ok) return { available: false };
    const actualJ = actualR.ok ? await actualR.json() : null;
    const expectedJ = expectedR.ok ? await expectedR.json() : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actualSplit = (actualJ?.stats?.[0]?.splits || [])[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expectedSplit = (expectedJ?.stats?.[0]?.splits || [])[0];

    const ba = parseAvg(actualSplit?.stat?.avg);
    const slg = parseAvg(actualSplit?.stat?.slg);
    const wobaActual = parseAvg(actualSplit?.stat?.obp); // OBP not wOBA, but useful

    const xba = parseAvg(expectedSplit?.stat?.avg);
    const xslg = parseAvg(expectedSplit?.stat?.slg);
    const xwoba = parseAvg(expectedSplit?.stat?.woba);

    if (ba == null && xba == null) {
      // Try last year fallback if current season has nothing
      const lastYear = year - 1;
      const fallback = await fetch(
        `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=season,expectedStatistics&group=hitting&season=${lastYear}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!fallback.ok) return { available: false };
      const j = await fallback.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seasonSplit = j.stats?.find((s: any) => s.type?.displayName === "season")?.splits?.[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expSplit = j.stats?.find((s: any) => s.type?.displayName === "expectedStatistics")?.splits?.[0];
      const fb_ba = parseAvg(seasonSplit?.stat?.avg);
      const fb_slg = parseAvg(seasonSplit?.stat?.slg);
      const fb_xba = parseAvg(expSplit?.stat?.avg);
      const fb_xslg = parseAvg(expSplit?.stat?.slg);
      if (fb_ba == null && fb_xba == null) return { available: false };
      return {
        available: true,
        ba: fb_ba, slg: fb_slg,
        xba: fb_xba, xslg: fb_xslg,
        baDelta: fb_ba != null && fb_xba != null ? Math.round((fb_ba - fb_xba) * 1000) / 1000 : undefined,
        slgDelta: fb_slg != null && fb_xslg != null ? Math.round((fb_slg - fb_xslg) * 1000) / 1000 : undefined,
      };
    }

    return {
      available: true,
      ba, slg, woba: wobaActual,
      xba, xslg, xwoba,
      baDelta: ba != null && xba != null ? Math.round((ba - xba) * 1000) / 1000 : undefined,
      slgDelta: slg != null && xslg != null ? Math.round((slg - xslg) * 1000) / 1000 : undefined,
      wobaDelta: wobaActual != null && xwoba != null ? Math.round((wobaActual - xwoba) * 1000) / 1000 : undefined,
    };
  } catch (e) {
    console.error("[Statcast] fetch failed:", e);
    return { available: false };
  }
}
