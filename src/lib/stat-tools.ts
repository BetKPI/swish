/**
 * Deterministic stat model tools.
 * These are pure-computation functions that the chat endpoint can invoke
 * instead of relying on the LLM to do math. Each returns a structured
 * result the AI interprets for the user.
 */

export interface StatToolResult {
  tool: string;
  result: Record<string, unknown>;
}

/**
 * Compute hit rate for a player prop given game log values and a line.
 */
export function computeHitRate(values: number[], line: number): StatToolResult {
  const total = values.length;
  if (total === 0) return { tool: "hit_rate", result: { error: "no data" } };

  const hits = values.filter((v) => v > line).length;
  const hitRate = hits / total;
  const avg = values.reduce((s, v) => s + v, 0) / total;
  const last5 = values.slice(-5);
  const last5Avg = last5.length > 0 ? last5.reduce((s, v) => s + v, 0) / last5.length : avg;
  const last5Hits = last5.filter((v) => v > line).length;

  return {
    tool: "hit_rate",
    result: {
      hitRate: Math.round(hitRate * 1000) / 10,
      hits,
      total,
      average: Math.round(avg * 100) / 100,
      line,
      last5Avg: Math.round(last5Avg * 100) / 100,
      last5HitRate: last5.length > 0 ? Math.round((last5Hits / last5.length) * 1000) / 10 : null,
      verdict: hitRate >= 0.65 ? "strong" : hitRate >= 0.5 ? "moderate" : "weak",
    },
  };
}

/**
 * Compute trend direction from a series of values.
 * Uses simple linear regression slope.
 */
export function computeTrend(values: number[]): StatToolResult {
  const n = values.length;
  if (n < 3) return { tool: "trend", result: { error: "need at least 3 data points" } };

  // Simple linear regression
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;

  // Percentage change per game
  const pctPerGame = yMean !== 0 ? (slope / yMean) * 100 : 0;

  // First half vs second half comparison
  const mid = Math.floor(n / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

  let direction: "rising" | "falling" | "stable";
  if (pctPerGame > 1.5) direction = "rising";
  else if (pctPerGame < -1.5) direction = "falling";
  else direction = "stable";

  return {
    tool: "trend",
    result: {
      direction,
      slope: Math.round(slope * 1000) / 1000,
      pctChangePerGame: Math.round(pctPerGame * 100) / 100,
      firstHalfAvg: Math.round(firstAvg * 100) / 100,
      secondHalfAvg: Math.round(secondAvg * 100) / 100,
      totalGames: n,
    },
  };
}

/**
 * Compute consistency (coefficient of variation) from values.
 * Lower CV = more consistent = more predictable for betting.
 */
export function computeConsistency(values: number[]): StatToolResult {
  const n = values.length;
  if (n < 3) return { tool: "consistency", result: { error: "need at least 3 data points" } };

  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 999;

  // Find longest streak above/below mean
  let currentStreak = 0;
  let maxStreakAbove = 0;
  let maxStreakBelow = 0;
  for (const v of values) {
    if (v >= mean) {
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      maxStreakAbove = Math.max(maxStreakAbove, currentStreak);
    } else {
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      maxStreakBelow = Math.max(maxStreakBelow, Math.abs(currentStreak));
    }
  }

  let rating: "very_consistent" | "consistent" | "volatile" | "very_volatile";
  if (cv < 0.15) rating = "very_consistent";
  else if (cv < 0.3) rating = "consistent";
  else if (cv < 0.5) rating = "volatile";
  else rating = "very_volatile";

  return {
    tool: "consistency",
    result: {
      rating,
      coefficientOfVariation: Math.round(cv * 1000) / 1000,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      min: Math.min(...values),
      max: Math.max(...values),
      range: Math.max(...values) - Math.min(...values),
      longestStreakAboveMean: maxStreakAbove,
      longestStreakBelowMean: maxStreakBelow,
    },
  };
}

/**
 * Compute home/away splits from game results.
 */
export function computeSplits(
  games: Array<{ home: boolean; value: number; won?: boolean }>
): StatToolResult {
  const home = games.filter((g) => g.home);
  const away = games.filter((g) => !g.home);

  if (home.length === 0 || away.length === 0) {
    return { tool: "splits", result: { error: "need both home and away games" } };
  }

  const homeAvg = home.reduce((s, g) => s + g.value, 0) / home.length;
  const awayAvg = away.reduce((s, g) => s + g.value, 0) / away.length;
  const homeWinPct = home.filter((g) => g.won).length / home.length;
  const awayWinPct = away.filter((g) => g.won).length / away.length;

  return {
    tool: "splits",
    result: {
      homeAvg: Math.round(homeAvg * 100) / 100,
      awayAvg: Math.round(awayAvg * 100) / 100,
      difference: Math.round((homeAvg - awayAvg) * 100) / 100,
      homeGames: home.length,
      awayGames: away.length,
      homeWinPct: Math.round(homeWinPct * 1000) / 10,
      awayWinPct: Math.round(awayWinPct * 1000) / 10,
      betterAt: homeAvg > awayAvg ? "home" : "away",
    },
  };
}

/**
 * Run all applicable stat tools for a given dataset.
 * Used by the chat endpoint to precompute everything the AI needs.
 */
export function runAllTools(
  values: number[],
  line?: number,
  games?: Array<{ home: boolean; value: number; won?: boolean }>
): StatToolResult[] {
  const results: StatToolResult[] = [];

  if (values.length > 0) {
    if (line != null) results.push(computeHitRate(values, line));
    results.push(computeTrend(values));
    results.push(computeConsistency(values));
  }

  if (games && games.length > 0) {
    results.push(computeSplits(games));
  }

  return results;
}
