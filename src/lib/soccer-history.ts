/**
 * Soccer team data from ESPN's site v2 endpoints. Pulls recent matches
 * with W/D/L results, goal scores, home/away flag. Used to compute
 * soccer-specific signals (form, goal differential, BTTS rate, clean
 * sheets) that the generic team-bet path doesn't surface.
 *
 * Soccer leagues ESPN supports: eng.1 (EPL), esp.1 (La Liga),
 * ger.1 (Bundesliga), ita.1 (Serie A), fra.1 (Ligue 1),
 * uefa.champions, usa.1 (MLS), mex.1 (Liga MX).
 */

import { cachedFetch, TTL } from "./fetch";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

export interface SoccerMatch {
  date: string;
  home: boolean;
  opponent: string;
  teamGoals: number;
  oppGoals: number;
  result: "W" | "D" | "L";
}

export interface SoccerTeamForm {
  teamId: number;
  teamName: string;
  league: string;
  matches: SoccerMatch[];
  recordOverall: { w: number; d: number; l: number };
  recentForm: ("W" | "D" | "L")[]; // last 5
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  cleanSheetRate: number;        // % of matches without conceding
  failedToScoreRate: number;     // % of matches with 0 scored
  bttsRate: number;              // % of matches with both teams scoring
  homeRecord: { w: number; d: number; l: number };
  awayRecord: { w: number; d: number; l: number };
}

interface ScheduleResp {
  events?: Array<{
    date?: string;
    competitions?: Array<{
      competitors?: Array<{
        team?: { id?: string; displayName?: string };
        homeAway?: string;
        score?: { value?: number; winner?: boolean } | string | number;
        winner?: boolean;
      }>;
      status?: { type?: { completed?: boolean } };
    }>;
  }>;
}

function parseScore(s: unknown): number | null {
  if (typeof s === "number") return s;
  if (typeof s === "string") { const n = Number(s); return Number.isFinite(n) ? n : null; }
  if (s && typeof s === "object" && "value" in s) {
    const v = (s as { value: unknown }).value;
    if (typeof v === "number") return v;
    if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : null; }
  }
  return null;
}

export async function getSoccerTeamForm(
  league: string,
  teamId: number,
  teamName: string,
  limit: number = 15,
): Promise<SoccerTeamForm | null> {
  if (!league || !teamId) return null;
  try {
    const url = `${BASE}/soccer/${league}/teams/${teamId}/schedule`;
    const data = await cachedFetch<ScheduleResp>(url, TTL.SHORT);
    if (!data) return null;
    const events = data.events || [];
    const matches: SoccerMatch[] = [];
    for (const e of events) {
      const comp = e.competitions?.[0];
      if (!comp) continue;
      if (!comp.status?.type?.completed) continue;
      const competitors = comp.competitors || [];
      const me = competitors.find((c) => String(c.team?.id) === String(teamId));
      const them = competitors.find((c) => String(c.team?.id) !== String(teamId));
      if (!me || !them) continue;
      const teamGoals = parseScore(me.score);
      const oppGoals = parseScore(them.score);
      if (teamGoals == null || oppGoals == null) continue;
      const home = me.homeAway === "home";
      const result: "W" | "D" | "L" =
        teamGoals > oppGoals ? "W" :
        teamGoals < oppGoals ? "L" :
        "D";
      matches.push({
        date: e.date || "",
        home,
        opponent: them.team?.displayName || "",
        teamGoals,
        oppGoals,
        result,
      });
    }
    // Sort ascending by date so .slice(-5) gets the latest
    matches.sort((a, b) => a.date.localeCompare(b.date));

    const recordOverall = { w: 0, d: 0, l: 0 };
    const homeRecord = { w: 0, d: 0, l: 0 };
    const awayRecord = { w: 0, d: 0, l: 0 };
    let totalFor = 0, totalAgainst = 0;
    let cleanSheets = 0, failedToScore = 0, btts = 0;
    for (const m of matches) {
      const k = m.result === "W" ? "w" : m.result === "D" ? "d" : "l";
      recordOverall[k]++;
      if (m.home) homeRecord[k]++; else awayRecord[k]++;
      totalFor += m.teamGoals;
      totalAgainst += m.oppGoals;
      if (m.oppGoals === 0) cleanSheets++;
      if (m.teamGoals === 0) failedToScore++;
      if (m.teamGoals > 0 && m.oppGoals > 0) btts++;
    }
    const n = matches.length;
    return {
      teamId,
      teamName,
      league,
      matches,
      recordOverall,
      recentForm: matches.slice(-5).map((m) => m.result),
      avgGoalsFor: n > 0 ? Math.round((totalFor / n) * 10) / 10 : 0,
      avgGoalsAgainst: n > 0 ? Math.round((totalAgainst / n) * 10) / 10 : 0,
      cleanSheetRate: n > 0 ? Math.round((cleanSheets / n) * 100) / 100 : 0,
      failedToScoreRate: n > 0 ? Math.round((failedToScore / n) * 100) / 100 : 0,
      bttsRate: n > 0 ? Math.round((btts / n) * 100) / 100 : 0,
      homeRecord,
      awayRecord,
    };
  } catch {
    return null;
  }
}

/**
 * Head-to-head between two teams from the schedule data we already have.
 * Returns the most recent N matches between them.
 */
export function getH2H(teamA: SoccerTeamForm, teamBName: string, n: number = 5): SoccerMatch[] {
  const lower = teamBName.toLowerCase();
  return teamA.matches
    .filter((m) => m.opponent.toLowerCase() === lower || m.opponent.toLowerCase().includes(lower) || lower.includes(m.opponent.toLowerCase()))
    .slice(-n);
}
