/**
 * Swish Score - a 0-10 data-strength rating for any bet type.
 * Computed internally on 0-100, displayed as X.X/10.
 *
 * Scale: 5 = neutral, 7+ = data looks strong, 8.5+ = very strong, below 4 = data looks weak.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { ComputedAnalysis } from "./analytics";
import type { BetExtraction } from "@/types";

// Load model weights from JSON - updated by autoresearch loop
interface ModelWeights {
  player_prop: { hitRate: number; trend: number; consistency: number; sampleSize: number; homeAway: number };
  spread: { atsCoverRate: number; closeGames: number; marginTrend: number; homeAwayRecord: number; restAdvantage: number };
  over_under: { overRate: number; paceProjection: number; scoringTrend: number; avgVsLine: number };
  moneyline: { winPct: number; recentForm: number; pointDiff: number; homeAwayPct: number; streak: number };
}

let _weights: ModelWeights | null = null;
function getWeights(): ModelWeights {
  if (!_weights) {
    try {
      const raw = readFileSync(join(process.cwd(), "models", "swish-weights.json"), "utf-8");
      _weights = JSON.parse(raw) as ModelWeights;
    } catch {
      // Fallback to defaults if file missing
      _weights = {
        player_prop: { hitRate: 0.4, trend: 0.2, consistency: 0.15, sampleSize: 0.1, homeAway: 0.15 },
        spread: { atsCoverRate: 0.35, closeGames: 0.2, marginTrend: 0.2, homeAwayRecord: 0.15, restAdvantage: 0.1 },
        over_under: { overRate: 0.35, paceProjection: 0.25, scoringTrend: 0.2, avgVsLine: 0.2 },
        moneyline: { winPct: 0.3, recentForm: 0.25, pointDiff: 0.2, homeAwayPct: 0.15, streak: 0.1 },
      };
    }
  }
  return _weights;
}

export interface SwishScoreResult {
  /** Display score: 0-10 scale (one decimal) */
  score: number;
  label: string;
  detail: string;
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

/** Takes raw 0-100 score, returns label */
function getLabel(raw: number): string {
  if (raw <= 30) return "Weak";
  if (raw <= 45) return "Shaky";
  if (raw <= 55) return "Toss-Up";
  if (raw <= 70) return "Solid";
  if (raw <= 85) return "Strong";
  return "Lock";
}

/** Convert internal 0-100 to display 0-10 (one decimal) */
function toDisplay(raw: number): number {
  return Math.round(raw) / 10;
}

// ── Player Prop scoring ───────────────────────────────────────────

function scorePlayerProp(
  computed: ComputedAnalysis,
  extraction: BetExtraction,
  rawData: Record<string, unknown>
): SwishScoreResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerData = (rawData as any)?._players;
  const playerName = extraction.players[0] || "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pData = playerData?.[playerName] as any;
  const pa = pData?.propAnalysis;

  if (!pa) {
    return { score: toDisplay(45), label: getLabel(45), detail: "Limited player data available for this prop" };
  }

  const hitRate = pa.hitRate ?? 0; // 0-1
  const hitCount = pa.hitCount ?? 0;
  const totalGames = pa.totalGames ?? 0;
  const average = pa.average ?? 0;
  const last5Avg = pa.last5Avg ?? average;
  const line = pa.line ?? extraction.line ?? 0;
  const trend = pa.trend ?? "stable";

  // Hit rate: 40% weight - map 0-100% to 0-100 score
  const hitRateScore = clamp(hitRate * 100);

  // Trend direction: 20% weight - last5 vs season avg
  let trendScore = 50;
  if (line > 0 && average > 0) {
    const diff = last5Avg - average;
    // If trend is in the direction of the hit (last5 > avg means rising for over bets)
    trendScore = clamp(50 + (diff / average) * 200);
  }
  if (trend === "rising") trendScore = Math.max(trendScore, 60);
  if (trend === "falling") trendScore = Math.min(trendScore, 40);

  // Consistency / std dev: 15% weight - lower std dev = higher score
  const seasonStats = pData?.seasonAverages || pData?.seasonStats;
  let consistencyScore = 50;
  if (seasonStats) {
    // If we have game logs, compute std dev
    const gameValues = pData?.gameLogs?.map((g: Record<string, number>) => g[pa.stat]) || [];
    if (gameValues.length > 2) {
      const mean = gameValues.reduce((s: number, v: number) => s + v, 0) / gameValues.length;
      const variance = gameValues.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / gameValues.length;
      const stdDev = Math.sqrt(variance);
      // Lower std dev relative to mean = more consistent = higher score
      const cv = mean > 0 ? stdDev / mean : 1;
      consistencyScore = clamp(80 - cv * 100);
    }
  }

  // Sample size: 10% weight
  const sampleScore = clamp(totalGames * 8); // 12+ games = 96+

  // Home/away relevance: 15% weight
  let homeAwayScore = 50;
  if (pData?.homeAvg != null && pData?.awayAvg != null && line > 0) {
    // Check if they perform better in the expected venue
    const venueAvg = pData.homeAvg; // We don't always know venue, default to neutral
    homeAwayScore = clamp(50 + ((venueAvg - line) / line) * 100);
  }

  const w = getWeights().player_prop;
  const raw = hitRateScore * w.hitRate + trendScore * w.trend + consistencyScore * w.consistency + sampleScore * w.sampleSize + homeAwayScore * w.homeAway;
  const score = Math.round(clamp(raw));

  const trendWord = trend === "rising" ? "rising trend" : trend === "falling" ? "falling trend" : "steady trend";
  const displayScore = toDisplay(score);
  const detail = `${hitCount}/${totalGames} over the line, avg ${average} vs ${line} line, ${trendWord}`;

  return { score: displayScore, label: getLabel(score), detail };
}

// ── Spread scoring ────────────────────────────────────────────────

function scoreSpread(
  computed: ComputedAnalysis,
  extraction: BetExtraction
): SwishScoreResult {
  const teams = Object.values(computed.teamMetrics);
  const team = teams[0];
  if (!team) {
    return { score: toDisplay(45), label: getLabel(45), detail: "Not enough team data for spread analysis" };
  }

  const ats = team.ats;
  const line = extraction.line ?? 0;

  // ATS cover rate: 35% weight
  const coverRate = ats?.coverRate ?? 0.5;
  const atsScore = clamp(coverRate * 100);

  // Close games record: 20% weight - games decided within line + 3
  const closeGames = team.recentGames.filter(g => Math.abs(g.margin) <= Math.abs(line) + 3);
  const closeWins = closeGames.filter(g => g.won).length;
  const closeScore = closeGames.length > 0
    ? clamp((closeWins / closeGames.length) * 100)
    : 50;

  // Margin trend: 20% weight - are margins growing or shrinking?
  const games = team.recentGames;
  let marginTrendScore = 50;
  if (games.length >= 4) {
    const mid = Math.floor(games.length / 2);
    const firstHalf = games.slice(0, mid);
    const secondHalf = games.slice(mid);
    const firstAvg = firstHalf.reduce((s, g) => s + g.margin, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, g) => s + g.margin, 0) / secondHalf.length;
    marginTrendScore = clamp(50 + (secondAvg - firstAvg) * 3);
  }

  // Home/away record: 15% weight
  let homeAwayScore = 50;
  if (team.homeRecord && team.awayRecord) {
    const relevantPct = team.homeRecord.pct; // Default to home perspective
    homeAwayScore = clamp(relevantPct * 100);
  }

  // Rest advantage: 10% weight
  let restScore = 50;
  if (team.restDays != null) {
    if (team.restDays >= 2 && team.restDays <= 4) restScore = 65;
    else if (team.restDays === 1) restScore = 45;
    else if (team.restDays === 0) restScore = 35;
    else restScore = 55; // too much rest can be bad
  }

  const w = getWeights().spread;
  const raw = atsScore * w.atsCoverRate + closeScore * w.closeGames + marginTrendScore * w.marginTrend + homeAwayScore * w.homeAwayRecord + restScore * w.restAdvantage;
  const score = Math.round(clamp(raw));

  const covers = ats?.covers ?? 0;
  const total = (ats?.covers ?? 0) + (ats?.fails ?? 0);
  const avgMargin = games.length > 0
    ? Math.round((games.reduce((s, g) => s + g.margin, 0) / games.length) * 10) / 10
    : 0;
  const displayScore = toDisplay(score);
  const detail = `Covered ${line} in ${covers}/${total}, avg margin ${avgMargin > 0 ? "+" : ""}${avgMargin}`;

  return { score: displayScore, label: getLabel(score), detail };
}

// ── Over/Under scoring ────────────────────────────────────────────

function scoreOverUnder(
  computed: ComputedAnalysis,
  extraction: BetExtraction
): SwishScoreResult {
  const teams = Object.values(computed.teamMetrics);
  const line = extraction.line ?? 0;

  // Over rate at line: 35% weight
  let overRateScore = 50;
  let overCount = 0;
  let totalGamesOU = 0;
  for (const team of teams) {
    if (team.overUnder) {
      overCount += team.overUnder.overs;
      totalGamesOU += team.overUnder.overs + team.overUnder.unders;
      overRateScore = clamp(team.overUnder.overRate * 100);
    }
  }

  // Pace projection vs line: 25% weight
  let paceScore = 50;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const combined = computed.betTypeInsights._combined as any;
  let projection = 0;
  if (combined?.projectedTotal && line > 0) {
    projection = combined.projectedTotal;
    const diff = projection - line;
    paceScore = clamp(50 + (diff / line) * 200);
  } else if (teams.length >= 2 && line > 0) {
    projection = teams[0].scoring.avgPointsFor + teams[1].scoring.avgPointsFor;
    const diff = projection - line;
    paceScore = clamp(50 + (diff / line) * 200);
  }

  // Scoring trend: 20% weight
  let trendScore = 50;
  if (teams.length >= 2) {
    const t1Trend = teams[0].scoring.last5AvgTotal - teams[0].scoring.avgTotalPoints;
    const t2Trend = teams[1].scoring.last5AvgTotal - teams[1].scoring.avgTotalPoints;
    const avgTrend = (t1Trend + t2Trend) / 2;
    trendScore = clamp(50 + avgTrend * 3);
  }

  // Combined avg vs line: 20% weight
  let avgVsLineScore = 50;
  if (teams.length >= 2 && line > 0) {
    const combinedAvg = teams[0].scoring.avgPointsFor + teams[1].scoring.avgPointsFor;
    const diff = combinedAvg - line;
    avgVsLineScore = clamp(50 + (diff / line) * 200);
  }

  const w = getWeights().over_under;
  const raw = overRateScore * w.overRate + paceScore * w.paceProjection + trendScore * w.scoringTrend + avgVsLineScore * w.avgVsLine;
  const score = Math.round(clamp(raw));

  const projRounded = Math.round(projection * 10) / 10;
  const diff = Math.round((projection - line) * 10) / 10;
  const overUnder = diff >= 0 ? "over" : "under";
  const displayScore = toDisplay(score);
  const detail = `Projects ~${projRounded} total, ${Math.abs(diff)} ${overUnder} the ${line} line`;

  return { score: displayScore, label: getLabel(score), detail };
}

// ── Moneyline scoring ─────────────────────────────────────────────

function scoreMoneyline(
  computed: ComputedAnalysis,
  extraction: BetExtraction
): SwishScoreResult {
  const teams = Object.values(computed.teamMetrics);
  const team = teams[0];
  if (!team) {
    return { score: toDisplay(45), label: getLabel(45), detail: "Not enough data for moneyline analysis" };
  }

  // Win pct: 30% weight
  const winPctScore = clamp(team.record.pct * 100);

  // Recent form last 5: 25% weight
  const last5Wins = team.recentForm.wins;
  const formScore = clamp((last5Wins / 5) * 100);

  // Point differential: 20% weight
  const ptDiff = team.scoring.avgPointsFor - team.scoring.avgPointsAgainst;
  const diffScore = clamp(50 + ptDiff * 2);

  // Home/away pct: 15% weight
  let homeAwayScore = 50;
  if (team.homeRecord) homeAwayScore = clamp(team.homeRecord.pct * 100);

  // Streak: 10% weight
  let streakScore = 50;
  if (team.streak.type === "W") streakScore = clamp(50 + team.streak.count * 10);
  else streakScore = clamp(50 - team.streak.count * 10);

  const w = getWeights().moneyline;
  const raw = winPctScore * w.winPct + formScore * w.recentForm + diffScore * w.pointDiff + homeAwayScore * w.homeAwayPct + streakScore * w.streak;
  const score = Math.round(clamp(raw));

  const winPct = Math.round(team.record.pct * 100);
  const streakStr = `${team.streak.type}${team.streak.count}`;
  const displayScore = toDisplay(score);
  const detail = `${team.name} ${winPct}% win rate, on a ${streakStr} streak`;

  return { score: displayScore, label: getLabel(score), detail };
}

// ── Main entry point ──────────────────────────────────────────────

export function computeSwishScore(
  betType: string,
  computed: ComputedAnalysis,
  extraction: BetExtraction,
  rawData: Record<string, unknown>
): SwishScoreResult {
  switch (betType) {
    case "player_prop":
      return scorePlayerProp(computed, extraction, rawData);
    case "spread":
      return scoreSpread(computed, extraction);
    case "over_under":
      return scoreOverUnder(computed, extraction);
    case "moneyline":
      return scoreMoneyline(computed, extraction);
    default:
      // For exotic / unsupported bet types, return a neutral score
      return { score: toDisplay(50), label: getLabel(50), detail: "Standard bet type with mixed data signals" };
  }
}
