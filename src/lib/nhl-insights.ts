/**
 * NHL Player deterministic insights.
 *
 * Mirrors the NBA/MLB shape - hit-rate verdict, bullets, probability.
 * Stats supported: goals, assists, points, shots, pim, anytime goal scorer.
 */

import type { NHLPlayerTwoSeason, NHLPlayerGame } from "./nhl-history";
import type { InsightBullet, Tone, MLBInsights as InsightsShape } from "./mlb-insights";

export type NHLStat = "goals" | "assists" | "points" | "shots" | "pim";

const STAT_LABELS: Record<NHLStat, string> = {
  goals: "goals",
  assists: "assists",
  points: "points",
  shots: "SOG",
  pim: "PIM",
};

function pickStat(g: NHLPlayerGame, stat: NHLStat): number {
  switch (stat) {
    case "goals": return g.goals;
    case "assists": return g.assists;
    case "points": return g.points;
    case "shots": return g.shots;
    case "pim": return g.pim;
  }
}

export function detectNHLPlayerStat(market?: string, description?: string): NHLStat | null {
  const m = `${market || ""} ${description || ""}`.toLowerCase();
  if (m.includes("anytime goal") || m.includes("to score") || (m.includes("goal") && !m.includes("first goal") && !m.includes("save"))) {
    if (m.includes("assist")) return "points"; // "goals + assists" -> points
    return "goals";
  }
  if (m.includes("assist")) return "assists";
  if (m.includes("shots on goal") || m.includes("sog") || (m.includes("shot") && !m.includes("save"))) return "shots";
  if (m.includes("pim") || m.includes("penalty min")) return "pim";
  if (m.includes("point") || m.includes("g+a")) return "points";
  return null;
}

function streakFromEnd(values: number[], threshold: number, dir: "over" | "under"): number {
  let s = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    const cond = dir === "over" ? v >= threshold : v < threshold;
    if (cond) s++;
    else break;
  }
  return s;
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 100);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function buildNHLPlayerInsights(args: {
  player: NHLPlayerTwoSeason;
  stat: NHLStat;
  line: number;
  oppTeam?: string;
  isPlayoffs?: boolean;
}): InsightsShape {
  const { player, stat, line, oppTeam, isPlayoffs } = args;
  const allGames = player.games || [];
  const playoffGames = allGames.filter((g) => g.seasonType === "playoffs");
  const regSeason = allGames.filter((g) => g.seasonType !== "playoffs");
  const primary = isPlayoffs && playoffGames.length >= 3 ? playoffGames : regSeason;

  const values = primary.map((g) => pickStat(g, stat));
  const last10 = values.slice(-10);
  const last5 = values.slice(-5);

  const overs = (arr: number[]) => arr.filter((v) => v >= line).length;
  const proj = Math.round(mean(last10.length ? last10 : values) * 10) / 10;

  const isAnytime = line === 0.5;
  const statLabel = STAT_LABELS[stat];

  const overStreak = streakFromEnd(values, line, "over");
  const underStreak = streakFromEnd(values, line, "under");
  const totalOvers = overs(values);

  const actionPhrase =
    isAnytime && stat === "goals" ? "Scored a goal" :
    isAnytime && stat === "assists" ? "Got an assist" :
    isAnytime && stat === "points" ? "Got on the scoresheet" :
    isAnytime ? `Got a ${statLabel}` :
    `Cleared ${line} ${statLabel}`;
  const underActionPhrase =
    isAnytime && stat === "goals" ? "No goal" :
    isAnytime && stat === "assists" ? "No assist" :
    isAnytime && stat === "points" ? "Held off the scoresheet" :
    isAnytime ? `No ${statLabel}` :
    `Under ${line} ${statLabel}`;

  let verdict: string;
  if (overStreak >= 3) {
    verdict = `${actionPhrase} in ${overs(last10)} of last ${last10.length} - ${overStreak} straight.`;
  } else if (underStreak >= 3) {
    verdict = `${underActionPhrase} in ${underStreak} straight.`;
  } else if (isAnytime && values.length > 0) {
    verdict = `${actionPhrase} in ${pct(totalOvers, values.length)}% of games this season (${totalOvers}/${values.length}).`;
  } else if (last10.length > 0) {
    verdict = `Cleared ${line} ${statLabel} in ${overs(last10)} of last ${last10.length}.`;
  } else {
    verdict = `Avg ${proj} ${statLabel} per game.`;
  }

  const bullets: InsightBullet[] = [];

  if (last10.length >= 3) {
    const l10o = overs(last10);
    const l10pct = pct(l10o, last10.length);
    bullets.push({
      label: `Last ${last10.length}`,
      value: `${l10o}/${last10.length} over (${l10pct}%)`,
      tone: l10pct >= 60 ? "pos" : l10pct <= 40 ? "neg" : "neutral",
    });
  }
  if (last5.length >= 3) {
    const l5o = overs(last5);
    const l5pct = pct(l5o, last5.length);
    bullets.push({
      label: "Last 5",
      value: `${l5o}/${last5.length} over (${l5pct}%)`,
      tone: l5pct >= 60 ? "pos" : l5pct <= 40 ? "neg" : "neutral",
    });
  }

  if (last10.length > 0 && !isAnytime) {
    bullets.push({
      label: `Avg ${statLabel} (L10)`,
      value: `${proj}`,
      tone: "neutral",
    });
  }

  // vs opponent rate
  if (oppTeam) {
    const oppLower = oppTeam.toLowerCase();
    const vsOpp = allGames.filter((g) => {
      const o = g.opponent.toLowerCase();
      return o.includes(oppLower) || oppLower.includes(o.split(/\s+/).pop() || "");
    });
    if (vsOpp.length >= 2) {
      const vsVals = vsOpp.map((g) => pickStat(g, stat));
      const vsOvers = vsVals.filter((v) => v >= line).length;
      const vsAvg = Math.round(mean(vsVals) * 10) / 10;
      const vsPct = pct(vsOvers, vsOpp.length);
      bullets.push({
        label: `vs ${oppTeam}`,
        value: isAnytime
          ? `${vsOvers}/${vsOpp.length} (${vsPct}%)`
          : `${vsAvg} avg / ${vsOvers}/${vsOpp.length} over`,
        tone: vsPct >= 60 ? "pos" : vsPct <= 40 ? "neg" : "neutral",
      });
    }
  }

  // Home / road split
  const homeGames = primary.filter((g) => g.home);
  const roadGames = primary.filter((g) => !g.home);
  if (homeGames.length >= 5 && roadGames.length >= 5) {
    const hMean = mean(homeGames.map((g) => pickStat(g, stat)));
    const rMean = mean(roadGames.map((g) => pickStat(g, stat)));
    const delta = hMean - rMean;
    if (Math.abs(delta) >= 0.2) {
      bullets.push({
        label: "Home / road",
        value: `${hMean.toFixed(1)} home vs ${rMean.toFixed(1)} road`,
        tone: "neutral",
      });
    }
  }

  // Probability blend
  const seasonN = values.length;
  const seasonRate = seasonN > 0 ? totalOvers / seasonN : 0;
  const l10Rate = last10.length > 0 ? overs(last10) / last10.length : 0;
  const l5Rate = last5.length > 0 ? overs(last5) / last5.length : 0;
  let weighted = 0;
  let totalW = 0;
  if (last10.length >= 3) { weighted += l10Rate * 0.5; totalW += 0.5; }
  if (last5.length >= 3) { weighted += l5Rate * 0.2; totalW += 0.2; }
  if (seasonN >= 5) { weighted += seasonRate * 0.3; totalW += 0.3; }
  let probability = totalW > 0 ? weighted / totalW : 0.5;
  if (overStreak >= 3) probability += 0.05;
  if (underStreak >= 3) probability -= 0.05;
  probability = clamp(probability, 0.05, 0.95);

  const flags: string[] = [];
  if (seasonN < 10) flags.push(`Only ${seasonN} games of data`);
  if (isPlayoffs && playoffGames.length < 3) flags.push("Limited playoff sample - using regular-season data");

  let lean: "strong over" | "lean over" | "pass" | "lean under" | "strong under";
  const projEdge = line > 0 ? (proj - line) / line : 0;
  if (projEdge >= 0.20) lean = "strong over";
  else if (projEdge >= 0.08) lean = "lean over";
  else if (projEdge <= -0.20) lean = "strong under";
  else if (projEdge <= -0.08) lean = "lean under";
  else lean = "pass";

  const tone: Tone = projEdge >= 0.08 ? "pos" : projEdge <= -0.08 ? "neg" : "neutral";
  void tone; // Tone unused at top level - bullets carry the tone

  return {
    verdict,
    projection: { proj, diff: Math.round((proj - line) * 10) / 10, edge: projEdge, lean },
    probability,
    bullets,
    flags,
  };
}
