import type { OddsAnalysis } from "./odds";
import { analyzeOdds } from "./odds";

// ── Types ──────────────────────────────────────────────────────────

export interface TeamMetrics {
  name: string;
  record: { wins: number; losses: number; pct: number };
  homeRecord?: { wins: number; losses: number; pct: number };
  awayRecord?: { wins: number; losses: number; pct: number };
  recentForm: { wins: number; losses: number; last5: string[] }; // ["W","L","W","W","L"]
  scoring: {
    avgPointsFor: number;
    avgPointsAgainst: number;
    avgTotalPoints: number;
    last5AvgFor: number;
    last5AvgAgainst: number;
    last5AvgTotal: number;
  };
  ats?: {
    covers: number;
    pushes: number;
    fails: number;
    coverRate: number;
  };
  overUnder?: {
    overs: number;
    unders: number;
    pushes: number;
    overRate: number;
    avgTotal: number;
  };
  restDays?: number; // days since last game
  streak: { type: "W" | "L"; count: number };
  recentGames: GameResult[];
}

export interface GameResult {
  date: string;
  opponent: string;
  teamScore: number;
  opponentScore: number;
  won: boolean;
  home: boolean;
  margin: number;
  totalPoints: number;
}

export interface HeadToHeadRecord {
  games: GameResult[];
  team1Wins: number;
  team2Wins: number;
  avgMargin: number;
  avgTotal: number;
}

export interface ComputedAnalysis {
  teamMetrics: Record<string, TeamMetrics>;
  headToHead?: HeadToHeadRecord;
  oddsAnalysis?: OddsAnalysis | null;
  betTypeInsights: Record<string, unknown>;
}

// ── Main entry point ───────────────────────────────────────────────

export function computeAnalysis(
  teamData: Record<string, unknown>,
  extraction: {
    betType: string;
    odds: string;
    line?: number;
    teams: string[];
    sport: string;
  }
): ComputedAnalysis {
  const teamMetrics: Record<string, TeamMetrics> = {};

  for (const teamName of extraction.teams) {
    const raw = teamData[teamName] as Record<string, unknown> | null;
    if (!raw) continue;
    teamMetrics[teamName] = computeTeamMetrics(teamName, raw, extraction.line, extraction.betType);
  }

  // Head-to-head
  let headToHead: HeadToHeadRecord | undefined;
  if (extraction.teams.length === 2) {
    const [t1, t2] = extraction.teams;
    if (teamMetrics[t1] && teamMetrics[t2]) {
      headToHead = computeHeadToHead(teamMetrics[t1], teamMetrics[t2]);
    }
  }

  // Odds — just convert to implied probability, no edge calculation
  const oddsAnalysis = analyzeOdds(extraction.odds);

  // Bet-type-specific insights
  const betTypeInsights = computeBetTypeInsights(
    extraction.betType,
    teamMetrics,
    extraction
  );

  return { teamMetrics, headToHead, oddsAnalysis, betTypeInsights };
}

// ── Team metrics computation ───────────────────────────────────────

function computeTeamMetrics(
  teamName: string,
  raw: Record<string, unknown>,
  line?: number,
  betType?: string
): TeamMetrics {
  const recentGames = parseRecentGames(raw, teamName);
  const record = extractRecord(raw);
  const homeAway = extractHomeAwayRecord(raw);

  const scoring = computeScoring(recentGames);
  const recentForm = computeRecentForm(recentGames);
  const streak = computeStreak(recentGames);
  const restDays = computeRestDays(recentGames);

  const ats = betType === "spread" && line != null
    ? computeATS(recentGames, line)
    : computeATS(recentGames, 0); // general ATS at 0 for other bet types

  const overUnder = computeOverUnder(recentGames, line);

  return {
    name: teamName,
    record,
    homeRecord: homeAway?.home,
    awayRecord: homeAway?.away,
    recentForm,
    scoring,
    ats,
    overUnder,
    restDays,
    streak,
    recentGames,
  };
}

function parseRecentGames(
  raw: Record<string, unknown>,
  teamName: string
): GameResult[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentGamesRaw = (raw as any)?.recentGames || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamInfo = (raw as any)?.team;
  const teamDisplayName = teamInfo?.displayName?.toLowerCase() || teamName.toLowerCase();
  const teamShortName = teamInfo?.shortDisplayName?.toLowerCase() || "";
  const teamAbbr = teamInfo?.abbreviation?.toLowerCase() || "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return recentGamesRaw.map((g: any) => {
    const homeTeam = (g.homeTeam || "").toLowerCase();
    const awayTeam = (g.awayTeam || "").toLowerCase();
    const homeScore = parseInt(g.homeScore, 10) || 0;
    const awayScore = parseInt(g.awayScore, 10) || 0;

    const isHome =
      homeTeam.includes(teamDisplayName) ||
      homeTeam.includes(teamShortName) ||
      homeTeam.includes(teamAbbr) ||
      teamDisplayName.includes(homeTeam) ||
      teamShortName.includes(homeTeam);

    const teamScore = isHome ? homeScore : awayScore;
    const opponentScore = isHome ? awayScore : homeScore;
    const opponent = isHome ? g.awayTeam : g.homeTeam;

    return {
      date: g.date,
      opponent: opponent || "Unknown",
      teamScore,
      opponentScore,
      won: teamScore > opponentScore,
      home: isHome,
      margin: teamScore - opponentScore,
      totalPoints: homeScore + awayScore,
    };
  });
}

function extractRecord(raw: Record<string, unknown>): {
  wins: number;
  losses: number;
  pct: number;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  const recordItems =
    r?.record?.team?.record?.items ||
    r?.record?.team?.recordItems ||
    r?.record?.items ||
    [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overall = recordItems.find((item: any) => item.type === "total" || item.description === "Overall") || recordItems[0];
  if (overall) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = overall.stats || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wins = stats.find((s: any) => s.name === "wins")?.value || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const losses = stats.find((s: any) => s.name === "losses")?.value || 0;
    const total = wins + losses;
    return { wins, losses, pct: total > 0 ? wins / total : 0 };
  }
  return { wins: 0, losses: 0, pct: 0 };
}

function extractHomeAwayRecord(
  raw: Record<string, unknown>
): { home: { wins: number; losses: number; pct: number }; away: { wins: number; losses: number; pct: number } } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  const recordItems =
    r?.record?.team?.record?.items ||
    r?.record?.team?.recordItems ||
    r?.record?.items ||
    [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeRec = recordItems.find((item: any) => item.type === "home" || item.description === "Home");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awayRec = recordItems.find((item: any) => item.type === "road" || item.type === "away" || item.description === "Road" || item.description === "Away");

  if (!homeRec && !awayRec) return null;

  const parse = (rec: { stats?: { name: string; value: number }[] } | undefined) => {
    if (!rec) return { wins: 0, losses: 0, pct: 0 };
    const stats = rec.stats || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = stats.find((s: any) => s.name === "wins")?.value || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const l = stats.find((s: any) => s.name === "losses")?.value || 0;
    const t = w + l;
    return { wins: w, losses: l, pct: t > 0 ? w / t : 0 };
  };

  return { home: parse(homeRec), away: parse(awayRec) };
}

function computeScoring(games: GameResult[]) {
  const all = games.length;
  const last5 = games.slice(-5);

  const avg = (arr: GameResult[], fn: (g: GameResult) => number) =>
    arr.length > 0 ? arr.reduce((sum, g) => sum + fn(g), 0) / arr.length : 0;

  return {
    avgPointsFor: Math.round(avg(games, (g) => g.teamScore) * 10) / 10,
    avgPointsAgainst: Math.round(avg(games, (g) => g.opponentScore) * 10) / 10,
    avgTotalPoints: Math.round(avg(games, (g) => g.totalPoints) * 10) / 10,
    last5AvgFor: Math.round(avg(last5, (g) => g.teamScore) * 10) / 10,
    last5AvgAgainst: Math.round(avg(last5, (g) => g.opponentScore) * 10) / 10,
    last5AvgTotal: Math.round(avg(last5, (g) => g.totalPoints) * 10) / 10,
  };
}

function computeRecentForm(games: GameResult[]): {
  wins: number;
  losses: number;
  last5: string[];
} {
  const last5 = games.slice(-5);
  return {
    wins: last5.filter((g) => g.won).length,
    losses: last5.filter((g) => !g.won).length,
    last5: last5.map((g) => (g.won ? "W" : "L")),
  };
}

function computeStreak(games: GameResult[]): { type: "W" | "L"; count: number } {
  if (games.length === 0) return { type: "W", count: 0 };
  const last = games[games.length - 1];
  const type = last.won ? "W" : "L";
  let count = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i].won === last.won) count++;
    else break;
  }
  return { type, count };
}

function computeRestDays(games: GameResult[]): number | undefined {
  if (games.length === 0) return undefined;
  const lastGame = games[games.length - 1];
  if (!lastGame.date) return undefined;
  const lastDate = new Date(lastGame.date);
  const now = new Date();
  const diff = Math.floor(
    (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diff;
}

function computeATS(
  games: GameResult[],
  spread: number
): { covers: number; pushes: number; fails: number; coverRate: number } {
  let covers = 0;
  let pushes = 0;
  let fails = 0;
  for (const g of games) {
    const adjustedMargin = g.margin + spread; // spread is from the team's perspective
    if (adjustedMargin > 0) covers++;
    else if (adjustedMargin === 0) pushes++;
    else fails++;
  }
  const decided = covers + fails;
  return {
    covers,
    pushes,
    fails,
    coverRate: decided > 0 ? covers / decided : 0,
  };
}

function computeOverUnder(
  games: GameResult[],
  line?: number
): { overs: number; unders: number; pushes: number; overRate: number; avgTotal: number } {
  const total = line ?? 0;
  let overs = 0;
  let unders = 0;
  let pushes = 0;
  let totalPoints = 0;

  for (const g of games) {
    totalPoints += g.totalPoints;
    if (total > 0) {
      if (g.totalPoints > total) overs++;
      else if (g.totalPoints < total) unders++;
      else pushes++;
    }
  }

  const decided = overs + unders;
  return {
    overs,
    unders,
    pushes,
    overRate: decided > 0 ? overs / decided : 0,
    avgTotal: games.length > 0 ? Math.round((totalPoints / games.length) * 10) / 10 : 0,
  };
}

// ── Head-to-head ───────────────────────────────────────────────────

function computeHeadToHead(
  team1: TeamMetrics,
  team2: TeamMetrics
): HeadToHeadRecord | undefined {
  // Find common opponents by matching opponent names in recent games
  const t2Name = team2.name.toLowerCase();
  const t1Name = team1.name.toLowerCase();

  const t1vsT2 = team1.recentGames.filter(
    (g) =>
      g.opponent.toLowerCase().includes(t2Name) ||
      t2Name.includes(g.opponent.toLowerCase())
  );
  const t2vsT1 = team2.recentGames.filter(
    (g) =>
      g.opponent.toLowerCase().includes(t1Name) ||
      t1Name.includes(g.opponent.toLowerCase())
  );

  // Use whichever set has more matches (both should be similar)
  const games = t1vsT2.length >= t2vsT1.length ? t1vsT2 : t2vsT1;
  if (games.length === 0) return undefined;

  const isFromT1Perspective = t1vsT2.length >= t2vsT1.length;

  return {
    games,
    team1Wins: games.filter((g) => (isFromT1Perspective ? g.won : !g.won)).length,
    team2Wins: games.filter((g) => (isFromT1Perspective ? !g.won : g.won)).length,
    avgMargin:
      Math.round(
        (games.reduce((s, g) => s + (isFromT1Perspective ? g.margin : -g.margin), 0) /
          games.length) *
          10
      ) / 10,
    avgTotal:
      Math.round(
        (games.reduce((s, g) => s + g.totalPoints, 0) / games.length) * 10
      ) / 10,
  };
}

// ── Bet-type-specific insights ─────────────────────────────────────

function computeBetTypeInsights(
  betType: string,
  teamMetrics: Record<string, TeamMetrics>,
  extraction: { teams: string[]; line?: number; odds: string }
): Record<string, unknown> {
  const teams = Object.values(teamMetrics);

  switch (betType) {
    case "spread":
      return computeSpreadInsights(teams, extraction.line);
    case "over_under":
      return computeOverUnderInsights(teams, extraction.line);
    case "moneyline":
      return computeMoneylineInsights(teams);
    default:
      return {};
  }
}

function computeSpreadInsights(teams: TeamMetrics[], line?: number) {
  const insights: Record<string, unknown> = {};

  for (const team of teams) {
    const key = team.name;
    const margins = team.recentGames.map((g) => g.margin);
    const avgMargin =
      margins.length > 0
        ? Math.round((margins.reduce((s, m) => s + m, 0) / margins.length) * 10) / 10
        : 0;

    const homeMargins = team.recentGames
      .filter((g) => g.home)
      .map((g) => g.margin);
    const awayMargins = team.recentGames
      .filter((g) => !g.home)
      .map((g) => g.margin);

    insights[key] = {
      avgMarginOfVictory: avgMargin,
      homeAvgMargin:
        homeMargins.length > 0
          ? Math.round(
              (homeMargins.reduce((s, m) => s + m, 0) / homeMargins.length) * 10
            ) / 10
          : null,
      awayAvgMargin:
        awayMargins.length > 0
          ? Math.round(
              (awayMargins.reduce((s, m) => s + m, 0) / awayMargins.length) * 10
            ) / 10
          : null,
      atsRecord: team.ats
        ? `${team.ats.covers}-${team.ats.fails}${team.ats.pushes > 0 ? `-${team.ats.pushes}` : ""}`
        : null,
      coverRate: team.ats ? `${(team.ats.coverRate * 100).toFixed(0)}%` : null,
      gamesDecidedByLine:
        line != null
          ? team.recentGames.filter(
              (g) => Math.abs(g.margin) <= Math.abs(line) + 3
            ).length
          : null,
    };
  }
  return { type: "spread", ...insights };
}

function computeOverUnderInsights(teams: TeamMetrics[], line?: number) {
  const insights: Record<string, unknown> = {};

  for (const team of teams) {
    insights[team.name] = {
      avgTotalPoints: team.scoring.avgTotalPoints,
      last5AvgTotal: team.scoring.last5AvgTotal,
      overRate: team.overUnder
        ? `${(team.overUnder.overRate * 100).toFixed(0)}%`
        : null,
      overRecord: team.overUnder
        ? `${team.overUnder.overs}-${team.overUnder.unders}${team.overUnder.pushes > 0 ? `-${team.overUnder.pushes}` : ""}`
        : null,
      scoringTrend: computeScoringTrend(team.recentGames),
    };
  }

  // Combined analysis if we have two teams
  if (teams.length === 2) {
    const combinedAvg =
      teams[0].scoring.avgPointsFor + teams[1].scoring.avgPointsFor;
    const combinedLast5 =
      teams[0].scoring.last5AvgFor + teams[1].scoring.last5AvgFor;
    insights._combined = {
      avgCombinedScore: Math.round(combinedAvg * 10) / 10,
      last5CombinedScore: Math.round(combinedLast5 * 10) / 10,
      projectedTotal: Math.round(((combinedAvg + combinedLast5) / 2) * 10) / 10,
      lineComparison:
        line != null
          ? {
              line,
              projection: Math.round(((combinedAvg + combinedLast5) / 2) * 10) / 10,
              leaningOver:
                (combinedAvg + combinedLast5) / 2 > line,
            }
          : null,
    };
  }

  return { type: "over_under", ...insights };
}

function computeMoneylineInsights(teams: TeamMetrics[]) {
  const insights: Record<string, unknown> = {};

  for (const team of teams) {
    insights[team.name] = {
      winPct: `${(team.record.pct * 100).toFixed(0)}%`,
      homeWinPct: team.homeRecord
        ? `${(team.homeRecord.pct * 100).toFixed(0)}%`
        : null,
      awayWinPct: team.awayRecord
        ? `${(team.awayRecord.pct * 100).toFixed(0)}%`
        : null,
      currentStreak: `${team.streak.type}${team.streak.count}`,
      last5: team.recentForm.last5.join(""),
      avgPointsFor: team.scoring.avgPointsFor,
      avgPointsAgainst: team.scoring.avgPointsAgainst,
      pointDifferential:
        Math.round(
          (team.scoring.avgPointsFor - team.scoring.avgPointsAgainst) * 10
        ) / 10,
    };
  }
  return { type: "moneyline", ...insights };
}

function computeScoringTrend(
  games: GameResult[]
): "rising" | "falling" | "stable" {
  if (games.length < 4) return "stable";
  const mid = Math.floor(games.length / 2);
  const first = games.slice(0, mid);
  const second = games.slice(mid);
  if (first.length === 0 || second.length === 0) return "stable";
  const firstAvg =
    first.reduce((s, g) => s + g.totalPoints, 0) / first.length;
  const secondAvg =
    second.reduce((s, g) => s + g.totalPoints, 0) / second.length;
  const diff = secondAvg - firstAvg;
  if (diff > 5) return "rising";
  if (diff < -5) return "falling";
  return "stable";
}
