/**
 * Convert American odds to implied probability.
 * e.g. -110 → 52.4%, +150 → 40.0%
 */
export function americanToImpliedProbability(odds: number): number {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
  return 100 / (odds + 100);
}

/**
 * Convert decimal odds to implied probability.
 * e.g. 1.91 → 52.4%, 2.50 → 40.0%
 */
export function decimalToImpliedProbability(odds: number): number {
  return 1 / odds;
}

/**
 * Parse an odds string (American, decimal, or fractional) and return implied probability.
 */
export function parseOddsToImpliedProbability(oddsStr: string): number | null {
  const cleaned = oddsStr.replace(/\s/g, "");

  // American odds: -110, +150, etc.
  if (/^[+-]\d+$/.test(cleaned)) {
    return americanToImpliedProbability(parseInt(cleaned, 10));
  }

  // Decimal odds: 1.91, 2.50, etc.
  if (/^\d+\.\d+$/.test(cleaned)) {
    const dec = parseFloat(cleaned);
    if (dec > 1) return decimalToImpliedProbability(dec);
  }

  // Fractional odds: 5/2, 10/11, etc.
  const fracMatch = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den > 0) return den / (num + den);
  }

  return null;
}

/**
 * Calculate the edge: difference between implied probability from odds
 * and the actual historical win rate.
 * Positive = value bet (historical rate > implied), Negative = overpriced.
 */
export function calculateEdge(impliedProb: number, actualRate: number): number {
  return actualRate - impliedProb;
}

/**
 * Format probability as a percentage string.
 */
export function formatProbability(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

/**
 * Build a complete odds analysis object for display.
 */
export function analyzeOdds(
  oddsStr: string,
  actualWinRate?: number
): OddsAnalysis | null {
  const impliedProb = parseOddsToImpliedProbability(oddsStr);
  if (impliedProb === null) return null;

  const result: OddsAnalysis = {
    odds: oddsStr,
    impliedProbability: impliedProb,
    impliedProbabilityFormatted: formatProbability(impliedProb),
  };

  if (actualWinRate !== undefined) {
    result.actualWinRate = actualWinRate;
    result.actualWinRateFormatted = formatProbability(actualWinRate);
    result.edge = calculateEdge(impliedProb, actualWinRate);
    result.edgeFormatted = `${result.edge > 0 ? "+" : ""}${(result.edge * 100).toFixed(1)}%`;
    result.hasValue = result.edge > 0;
  }

  return result;
}

export interface OddsAnalysis {
  odds: string;
  impliedProbability: number;
  impliedProbabilityFormatted: string;
  actualWinRate?: number;
  actualWinRateFormatted?: string;
  edge?: number;
  edgeFormatted?: string;
  hasValue?: boolean;
}
