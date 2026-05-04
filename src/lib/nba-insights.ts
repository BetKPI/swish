/**
 * NBA player-prop insights -deterministic structured analysis.
 * Mirror of mlb-insights for NBA props.
 *
 * Inputs: a player's two-season game log (regular + playoffs), a market line,
 * the bet stat, optional opposing team. Output: verdict, L10 projection vs
 * line, ranked bullets, risk flags. Playoff context is surfaced explicitly
 * since the user is targeting playoff bets right now.
 */

import type { NBAPlayerTwoSeason, NBAPlayerGame } from "./nba-history";

export type Tone = "pos" | "neg" | "neutral";

export interface InsightBullet {
  label: string;
  value: string;
  tone: Tone;
}

export interface NBAInsights {
  verdict: string;
  projection?: {
    proj: number;
    diff: number;
    edge: number;
    lean: "strong over" | "lean over" | "pass" | "lean under" | "strong under";
  };
  bullets: InsightBullet[];
  flags: string[];
}

export type NBAStat =
  | "pts" | "reb" | "ast" | "stl" | "blk" | "fg3m" | "tov"
  | "pra" | "pr" | "pa" | "ra";

const STAT_LABELS: Record<NBAStat, string> = {
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  stl: "STL",
  blk: "BLK",
  fg3m: "3PM",
  tov: "TOV",
  pra: "PRA",
  pr: "PTS+REB",
  pa: "PTS+AST",
  ra: "REB+AST",
};

// ESPN's NBA gamelog stat keys are uppercase abbreviations: PTS, REB, AST,
// STL, BLK, TO, MIN, "3PM"/"3PT" (made; sometimes formatted as "3-7"), FGM, FGA.
function num(s: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = s[k];
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string") {
      // For "3PT" formatted like "3-7", grab the leading number (made shots)
      const dash = v.indexOf("-");
      if (dash > 0) {
        const n = Number(v.slice(0, dash));
        if (!isNaN(n)) return n;
      }
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

function pickStat(g: NBAPlayerGame, stat: NBAStat): number {
  const s = (g.stats || {}) as Record<string, unknown>;
  const pts = num(s, "PTS", "pts", "points");
  const reb = num(s, "REB", "reb", "rebounds");
  const ast = num(s, "AST", "ast", "assists");
  switch (stat) {
    case "pts": return pts;
    case "reb": return reb;
    case "ast": return ast;
    case "stl": return num(s, "STL", "stl", "steals");
    case "blk": return num(s, "BLK", "blk", "blocks");
    case "fg3m": return num(s, "3PM", "3PT", "fg3m", "threesMade");
    case "tov": return num(s, "TO", "TOV", "tov", "turnovers");
    case "pra": return pts + reb + ast;
    case "pr": return pts + reb;
    case "pa": return pts + ast;
    case "ra": return reb + ast;
  }
}

function pickMinutes(g: NBAPlayerGame): number {
  const s = (g.stats || {}) as Record<string, unknown>;
  return num(s, "MIN", "min", "minutes", "mins");
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 100);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function streakFromEnd(values: number[], line: number, kind: "over" | "under"): number {
  let s = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    const cleared = kind === "over" ? values[i] > line : values[i] < line;
    if (cleared) s++;
    else break;
  }
  return s;
}

function leanFromEdge(edge: number): NBAInsights["projection"] extends infer T
  ? T extends { lean: infer L } ? L : never : never {
  if (edge >= 0.20) return "strong over";
  if (edge >= 0.08) return "lean over";
  if (edge <= -0.20) return "strong under";
  if (edge <= -0.08) return "lean under";
  return "pass";
}

/** Detect which NBA stat the bet is for, based on market + description. */
export function detectNBAStat(market?: string, description?: string): NBAStat | null {
  const m = `${market || ""} ${description || ""}`.toLowerCase();
  if (m.includes("pra") || (m.includes("points") && m.includes("rebound") && m.includes("assist"))) return "pra";
  if (m.includes("points") && m.includes("rebound")) return "pr";
  if (m.includes("points") && m.includes("assist")) return "pa";
  if (m.includes("rebound") && m.includes("assist")) return "ra";
  if (m.includes("three") || /\b3pt\b|\b3s\b|\b3pm\b/.test(m)) return "fg3m";
  if (m.includes("rebound")) return "reb";
  if (m.includes("assist")) return "ast";
  if (m.includes("steal")) return "stl";
  if (m.includes("block")) return "blk";
  if (m.includes("turnover")) return "tov";
  if (m.includes("point") || m.includes("score")) return "pts";
  return null;
}

export function buildNBAPlayerInsights(args: {
  player: NBAPlayerTwoSeason;
  stat: NBAStat;
  line: number;
  oppTeam?: string;
  isPlayoffs?: boolean;
}): NBAInsights {
  const { player, stat, line, oppTeam, isPlayoffs } = args;
  const allGames = player.games || [];

  // Split by season type -playoff games carry different signal than regular
  const playoffGames = allGames.filter((g) => g.seasonType === "playoffs");
  const regSeasonGames = allGames.filter((g) => g.seasonType !== "playoffs");

  // Default to regular season for most context, but if we're in playoffs and
  // there's enough playoff sample, that becomes primary.
  const primary = isPlayoffs && playoffGames.length >= 3 ? playoffGames : regSeasonGames;
  const values = primary.map((g) => pickStat(g, stat));
  const last10 = values.slice(-10);
  const last5 = values.slice(-5);
  const last3 = values.slice(-3);

  const statLabel = STAT_LABELS[stat];
  const overs = (vs: number[]) => vs.filter((v) => v > line).length;

  // Projection: weighted toward L10 (recent form), fall back to season
  const proj = round1(mean(last10.length ? last10 : values));
  const diff = round1(proj - line);
  const edge = line === 0 ? 0 : diff / line;
  const lean = leanFromEdge(edge);

  const overStreak = streakFromEnd(values, line, "over");
  const underStreak = streakFromEnd(values, line, "under");

  // Verdict
  let verdict: string;
  if (overStreak >= 3) {
    verdict = `${overs(last10)} of last ${last10.length} over ${line} ${statLabel} -${overStreak} straight.`;
  } else if (underStreak >= 3) {
    verdict = `${last10.length - overs(last10)} of last ${last10.length} under ${line} -${underStreak} straight under.`;
  } else if (last10.length > 0) {
    verdict = `Cleared ${line} ${statLabel} in ${overs(last10)} of last ${last10.length}.`;
  } else if (playoffGames.length === 0 && isPlayoffs) {
    verdict = `No playoff games yet -using regular-season form (${proj} avg).`;
  } else {
    verdict = `Limited data -only ${primary.length} ${isPlayoffs ? "playoff" : "regular-season"} games to lean on.`;
  }

  const bullets: InsightBullet[] = [];

  // Last N hit rates
  if (last10.length >= 5) {
    bullets.push({
      label: `Last ${last10.length}`,
      value: `${overs(last10)}/${last10.length} over (${pct(overs(last10), last10.length)}%)`,
      tone: pct(overs(last10), last10.length) >= 60 ? "pos" : pct(overs(last10), last10.length) <= 40 ? "neg" : "neutral",
    });
  }
  if (last5.length >= 3) {
    bullets.push({
      label: "Last 5",
      value: `${overs(last5)}/${last5.length} over (${pct(overs(last5), last5.length)}%)`,
      tone: pct(overs(last5), last5.length) >= 60 ? "pos" : pct(overs(last5), last5.length) <= 40 ? "neg" : "neutral",
    });
  }
  if (last3.length === 3) {
    const l3Avg = round1(mean(last3));
    bullets.push({
      label: "L3 avg",
      value: `${l3Avg}`,
      tone: l3Avg > line * 1.15 ? "pos" : l3Avg < line * 0.85 ? "neg" : "neutral",
    });
  }

  // Streak callout
  if (overStreak >= 5) bullets.push({ label: "Streak", value: `${overStreak} straight over`, tone: "pos" });
  else if (underStreak >= 5) bullets.push({ label: "Cold streak", value: `${underStreak} straight under`, tone: "neg" });

  // Minutes context -sharp bettors care about role
  const recentMinutes = primary.slice(-10).map(pickMinutes).filter((m) => m > 0);
  if (recentMinutes.length >= 3) {
    const avgMin = round1(mean(recentMinutes));
    if (avgMin > 0) {
      bullets.push({
        label: "L10 minutes",
        value: `${avgMin}`,
        tone: avgMin >= 35 ? "pos" : avgMin <= 28 ? "neg" : "neutral",
      });
    }
  }

  // Playoff vs regular split (when both samples exist)
  if (playoffGames.length >= 3 && regSeasonGames.length >= 10) {
    const playoffAvg = round1(mean(playoffGames.map((g) => pickStat(g, stat))));
    const regAvg = round1(mean(regSeasonGames.map((g) => pickStat(g, stat))));
    const bump = round1(playoffAvg - regAvg);
    if (Math.abs(bump) >= line * 0.05) {
      bullets.push({
        label: "Playoffs vs reg",
        value: `${playoffAvg} vs ${regAvg} (${bump > 0 ? "+" : ""}${bump})`,
        tone: bump > 0 ? "pos" : "neg",
      });
    }
  }

  // vs Opponent recent (regular season + playoffs combined)
  if (oppTeam) {
    const vsOpp = allGames.filter((g) =>
      g.opponent.toLowerCase().includes(oppTeam.toLowerCase()) ||
      oppTeam.toLowerCase().includes(g.opponent.toLowerCase().split(/\s+/).pop() || "")
    );
    if (vsOpp.length >= 2) {
      const vsOppOvers = vsOpp.filter((g) => pickStat(g, stat) > line).length;
      const vsOppAvg = round1(mean(vsOpp.map((g) => pickStat(g, stat))));
      bullets.push({
        label: `vs ${oppTeam}`,
        value: `${vsOppOvers}/${vsOpp.length} (avg ${vsOppAvg})`,
        tone: pct(vsOppOvers, vsOpp.length) >= 60 ? "pos" : pct(vsOppOvers, vsOpp.length) <= 40 ? "neg" : "neutral",
      });
    }
  }

  // Home / away split
  const venueGames = primary.slice(-20);
  if (venueGames.length >= 8) {
    const homeGames = venueGames.filter((g) => g.home);
    const awayGames = venueGames.filter((g) => !g.home);
    if (homeGames.length >= 3 && awayGames.length >= 3) {
      const homeAvg = round1(mean(homeGames.map((g) => pickStat(g, stat))));
      const awayAvg = round1(mean(awayGames.map((g) => pickStat(g, stat))));
      const bigGap = Math.abs(homeAvg - awayAvg) >= line * 0.1;
      if (bigGap) {
        bullets.push({
          label: "Home vs away",
          value: `${homeAvg} home, ${awayAvg} away`,
          tone: "neutral",
        });
      }
    }
  }

  // Career-vs-recent regression flag -sharp bettors always look for buy/sell
  const allValues = allGames.map((g) => pickStat(g, stat));
  if (allValues.length >= 30 && last10.length >= 5) {
    const careerAvg = round1(mean(allValues));
    const last10Avg = round1(mean(last10));
    const dev = round1(last10Avg - careerAvg);
    if (Math.abs(dev) >= line * 0.12) {
      bullets.push({
        label: "L10 vs career",
        value: `${last10Avg} vs ${careerAvg} (${dev > 0 ? "+" : ""}${dev})`,
        tone: dev > 0 ? "pos" : "neg",
      });
    }
  }

  // Projection bullet (always include if we have signal)
  if (last10.length >= 3) {
    const sign = diff > 0 ? "+" : "";
    const tone: Tone =
      lean === "strong over" || lean === "lean over"
        ? "pos"
        : lean === "strong under" || lean === "lean under"
          ? "neg"
          : "neutral";
    bullets.push({
      label: "L10 projection",
      value: `${proj} (${sign}${diff} vs line)`,
      tone,
    });
  }

  const flags: string[] = [];
  if (primary.length < 10) flags.push(`Only ${primary.length} games -small sample.`);
  if (recentMinutes.length >= 3 && mean(recentMinutes) <= 25) {
    flags.push("Reduced role -averaging under 25 minutes recently.");
  }
  if (isPlayoffs && playoffGames.length === 0) {
    flags.push("Series just started -no playoff data yet, regular-season only.");
  }

  return {
    verdict,
    projection:
      last10.length >= 3
        ? { proj, diff, edge: round1(edge), lean }
        : undefined,
    bullets,
    flags,
  };
}
