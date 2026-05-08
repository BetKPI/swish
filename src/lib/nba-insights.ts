/**
 * NBA player-prop insights -deterministic structured analysis.
 * Mirror of mlb-insights for NBA props.
 *
 * Inputs: a player's two-season game log (regular + playoffs), a market line,
 * the bet stat, optional opposing team. Output: verdict, L10 projection vs
 * line, ranked bullets, risk flags. Playoff context is surfaced explicitly
 * since the user is targeting playoff bets right now.
 */

import type { NBAPlayerTwoSeason, NBAPlayerGame, NBATeamTwoSeason } from "./nba-history";

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
  probability?: number;
  bullets: InsightBullet[];
  flags: string[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function estimateHitProbability(args: {
  l5Rate: number; l5N: number;
  l10Rate: number; l10N: number;
  seasonRate: number; seasonN: number;
  proj: number;
  line: number;
  posBullets: number;
  negBullets: number;
}): number {
  const { l5Rate, l5N, l10Rate, l10N, seasonRate, seasonN, proj, line, posBullets, negBullets } = args;
  let weighted = 0;
  let totalW = 0;
  if (l10N >= 3) { weighted += l10Rate * 0.5; totalW += 0.5; }
  if (l5N >= 3) { weighted += l5Rate * 0.2; totalW += 0.2; }
  if (seasonN >= 5) { weighted += seasonRate * 0.3; totalW += 0.3; }
  let p = totalW > 0 ? weighted / totalW : 0.5;
  if (line > 0) {
    const projEdge = (proj - line) / line;
    p += clamp(projEdge * 0.5, -0.15, 0.15);
  }
  p += (posBullets - negBullets) * 0.015;
  return clamp(p, 0.05, 0.95);
}

export type NBAStat =
  | "pts" | "reb" | "ast" | "stl" | "blk" | "fg3m" | "tov"
  | "pra" | "pr" | "pa" | "ra"
  | "ftm" | "fgm" | "stl_blk"
  | "min"; // FanDuel: Player Minutes O/U is a common prop

/** Period scope - "full" = whole game, "q1"-"q4" = single quarter,
 *  "h1"/"h2" = half. Quarter / half data is only populated for points
 *  (the most-bet quarter prop); other stats fall back to full-game.
 */
export type PeriodScope = "full" | "q1" | "q2" | "q3" | "q4" | "h1" | "h2";

/** Detect the period scope of an NBA player prop from the market and
 *  description text. Defaults to "full" when no period qualifier is found.
 */
export function detectNBAPeriodScope(market?: string, description?: string): PeriodScope {
  const m = `${market || ""} ${description || ""}`.toLowerCase();
  if (/\b(q1|1st quarter|first quarter)\b/.test(m)) return "q1";
  if (/\b(q2|2nd quarter|second quarter)\b/.test(m)) return "q2";
  if (/\b(q3|3rd quarter|third quarter)\b/.test(m)) return "q3";
  if (/\b(q4|4th quarter|fourth quarter)\b/.test(m)) return "q4";
  if (/\b(1h|h1|first half|1st half)\b/.test(m)) return "h1";
  if (/\b(2h|h2|second half|2nd half)\b/.test(m)) return "h2";
  return "full";
}

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
  ftm: "FTM",
  fgm: "FGM",
  stl_blk: "STL+BLK",
  min: "MIN",
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

function pickStat(g: NBAPlayerGame, stat: NBAStat, scope: PeriodScope = "full"): number {
  const s = (g.stats || {}) as Record<string, unknown>;
  const pts = num(s, "PTS", "pts", "points");
  const reb = num(s, "REB", "reb", "rebounds");
  const ast = num(s, "AST", "ast", "assists");

  // Period-scoped stats. We only have per-quarter POINTS (the most common
  // quarter / half prop). For non-points stats with a period scope, callers
  // should detect that case and surface a "data not available" flag.
  if (scope !== "full") {
    if (stat !== "pts") return 0; // signal: no data for this scope+stat combo
    const q1 = (g as { q1Pts?: number }).q1Pts ?? 0;
    const q2 = (g as { q2Pts?: number }).q2Pts ?? 0;
    const q3 = (g as { q3Pts?: number }).q3Pts ?? 0;
    const q4 = (g as { q4Pts?: number }).q4Pts ?? 0;
    switch (scope) {
      case "q1": return q1;
      case "q2": return q2;
      case "q3": return q3;
      case "q4": return q4;
      case "h1": return q1 + q2;
      case "h2": return q3 + q4;
    }
  }

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
    // ESPN gamelog stores FT and FG as "made-attempted" strings; num() picks
    // the leading made shots when ingestion stored them.
    case "ftm": return num(s, "FT", "FTM", "ftm");
    case "fgm": return num(s, "FG", "FGM", "fgm");
    case "stl_blk": return num(s, "STL", "stl", "steals") + num(s, "BLK", "blk", "blocks");
    case "min": return num(s, "MIN", "min", "minutes", "mins");
  }
}

/** Whether a game has the per-quarter data needed for a scoped pick. */
function hasScopedData(g: NBAPlayerGame, scope: PeriodScope): boolean {
  if (scope === "full") return true;
  const q1 = (g as { q1Pts?: number }).q1Pts;
  return q1 != null;
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
  // Steals + Blocks combo (FanDuel "Stocks") market
  if (m.includes("steal") && m.includes("block")) return "stl_blk";
  if (m.includes("three") || /\b3pt\b|\b3s\b|\b3pm\b/.test(m)) return "fg3m";
  if (m.includes("free throw") || /\bftm?\b/.test(m)) return "ftm";
  // Distinguish "field goal" from "first basket" - field goals made is a stat,
  // first basket is an exotic.
  if ((m.includes("field goal") || /\bfgm?\b/.test(m)) && !m.includes("first")) return "fgm";
  if (m.includes("rebound")) return "reb";
  if (m.includes("assist")) return "ast";
  if (m.includes("steal")) return "stl";
  if (m.includes("block")) return "blk";
  if (m.includes("turnover")) return "tov";
  // Player Minutes - watch for "minutes played" specifically; "first minute"
  // / "first quarter" should NOT match here.
  if ((m.includes("minutes") || /\bmin\b/.test(m)) && !m.includes("first") && !m.includes("quarter")) return "min";
  if (m.includes("point") || m.includes("score")) return "pts";
  return null;
}

/**
 * Detect double-double / triple-double yes/no markets. These don't fit the
 * over/under scoring shape - they're boolean outcomes per game. Returned
 * separately so the caller can route to a yes-rate handler.
 */
export function detectNBABooleanProp(market?: string, description?: string): "double_double" | "triple_double" | null {
  const m = `${market || ""} ${description || ""}`.toLowerCase();
  if (m.includes("triple double") || m.includes("triple-double")) return "triple_double";
  if (m.includes("double double") || m.includes("double-double")) return "double_double";
  return null;
}

/**
 * Build insights for a yes/no double-double or triple-double prop.
 *
 * DD = at least 2 of (PTS, REB, AST, STL, BLK) >= 10 in the same game
 * TD = at least 3 of those >= 10
 *
 * Returns an NBAInsights structure: hit-rate verdict, probability,
 * bullets that show season rate, L10 rate, recent streak.
 */
export function buildNBAPlayerBooleanInsights(args: {
  player: NBAPlayerTwoSeason;
  kind: "double_double" | "triple_double";
  oppTeam?: string;
  oppTeamData?: NBATeamTwoSeason;
  isPlayoffs?: boolean;
}): NBAInsights {
  const { player, kind, oppTeam, oppTeamData, isPlayoffs } = args;
  const allGames = player.games || [];
  const playoffGames = allGames.filter((g) => g.seasonType === "playoffs");
  const regSeasonGames = allGames.filter((g) => g.seasonType !== "playoffs");
  const primary = isPlayoffs && playoffGames.length >= 3 ? playoffGames : regSeasonGames;

  const meets = (g: NBAPlayerGame): boolean => {
    const s = (g.stats || {}) as Record<string, unknown>;
    const stats = [
      num(s, "PTS", "pts"),
      num(s, "REB", "reb"),
      num(s, "AST", "ast"),
      num(s, "STL", "stl"),
      num(s, "BLK", "blk"),
    ];
    const hits = stats.filter((v) => v >= 10).length;
    return kind === "triple_double" ? hits >= 3 : hits >= 2;
  };

  const hits = primary.filter(meets);
  const hitCount = hits.length;
  const total = primary.length;
  const last10 = primary.slice(-10);
  const last10Hits = last10.filter(meets).length;

  const seasonRate = total > 0 ? hitCount / total : 0;
  const last10Rate = last10.length > 0 ? last10Hits / last10.length : 0;

  // Streak from end
  let streak = 0;
  for (let i = primary.length - 1; i >= 0; i--) {
    if (meets(primary[i])) streak++;
    else break;
  }

  const label = kind === "triple_double" ? "triple-double" : "double-double";
  const bullets: InsightBullet[] = [
    {
      label: `${last10.length}-game rate`,
      value: `${last10Hits}/${last10.length} games (${Math.round(last10Rate * 100)}%)`,
      tone: last10Rate >= 0.40 ? "pos" : last10Rate <= 0.15 ? "neg" : "neutral",
    },
    {
      label: "Season rate",
      value: `${hitCount}/${total} games (${Math.round(seasonRate * 100)}%)`,
      tone: seasonRate >= 0.30 ? "pos" : seasonRate <= 0.10 ? "neg" : "neutral",
    },
  ];
  if (streak >= 2) {
    bullets.push({
      label: "Streak",
      value: `${streak} straight ${label}s`,
      tone: "pos",
    });
  }

  // vs opponent rate
  if (oppTeam) {
    const vsOpp = allGames.filter((g) =>
      g.opponent.toLowerCase().includes(oppTeam.toLowerCase()) ||
      oppTeam.toLowerCase().includes(g.opponent.toLowerCase().split(/\s+/).pop() || ""),
    );
    if (vsOpp.length >= 2) {
      const vsHits = vsOpp.filter(meets).length;
      bullets.push({
        label: `vs ${oppTeam}`,
        value: `${vsHits}/${vsOpp.length} (${Math.round((vsHits / vsOpp.length) * 100)}%)`,
        tone: vsHits / vsOpp.length >= 0.5 ? "pos" : vsHits / vsOpp.length <= 0.2 ? "neg" : "neutral",
      });
    }
  }

  // Opp defensive context — leaky D = more chances at high-stat games
  if (oppTeamData) {
    const recentDef = oppTeamData.games
      .filter((g) => g.season === oppTeamData.currentSeason)
      .slice(-20);
    if (recentDef.length >= 8) {
      const ppgAllowed = round1(mean(recentDef.map((g) => g.opponentScore)));
      bullets.push({
        label: `${oppTeam || "Opp"} D`,
        value: `${ppgAllowed} ppg (${ppgAllowed >= 117 ? "leaky" : ppgAllowed <= 110 ? "stingy" : "avg"})`,
        tone: ppgAllowed >= 117 ? "pos" : ppgAllowed <= 110 ? "neg" : "neutral",
      });
    }
  }

  // Probability: weighted L10 + season + streak bump
  const probability = clamp(
    last10Rate * 0.5 + seasonRate * 0.5 + (streak >= 3 ? 0.1 : 0),
    0.02, 0.95,
  );

  const verdict =
    streak >= 3
      ? `${streak} straight games with a ${label} - rolling.`
      : last10Rate >= 0.40
        ? `${last10Hits} ${label}s in last ${last10.length} games (${Math.round(last10Rate * 100)}%).`
        : seasonRate >= 0.20
          ? `${hitCount} ${label}s in ${total} games (${Math.round(seasonRate * 100)}% rate).`
          : `Rare event - ${hitCount} ${label}s in ${total} games (${Math.round(seasonRate * 100)}%).`;

  const flags: string[] = [];
  if (total < 10) flags.push(`Only ${total} games - small sample.`);

  return { verdict, probability, bullets, flags };
}

export function buildNBAPlayerInsights(args: {
  player: NBAPlayerTwoSeason;
  stat: NBAStat;
  line: number;
  oppTeam?: string;
  oppTeamData?: NBATeamTwoSeason;
  isPlayoffs?: boolean;
  /** Series record like "BOS leads 2-1" if known. */
  seriesContext?: string;
  /** Game number in series — 5/6/7 carry leverage. */
  gameInSeries?: number;
  /** Period scope - "full" by default; "q1"-"q4" / "h1"-"h2" for quarter / half props. */
  scope?: PeriodScope;
}): NBAInsights {
  const { player, stat, line, oppTeam, oppTeamData, isPlayoffs, seriesContext, gameInSeries } = args;
  const scope: PeriodScope = args.scope || "full";
  // For period-scoped props (quarter / half), only include games where the
  // play-by-play enrichment actually populated q1Pts-q4Pts. Mixing in
  // unenriched games would zero out averages and tank the projection.
  const allGamesAll = player.games || [];
  const allGames = scope === "full"
    ? allGamesAll
    : allGamesAll.filter((g) => hasScopedData(g, scope));

  // Split by season type -playoff games carry different signal than regular
  const playoffGames = allGames.filter((g) => g.seasonType === "playoffs");
  const regSeasonGames = allGames.filter((g) => g.seasonType !== "playoffs");

  // Default to regular season for most context, but if we're in playoffs and
  // there's enough playoff sample, that becomes primary.
  const primary = isPlayoffs && playoffGames.length >= 3 ? playoffGames : regSeasonGames;
  const values = primary.map((g) => pickStat(g, stat, scope));
  const last10 = values.slice(-10);
  const last5 = values.slice(-5);
  const last3 = values.slice(-3);

  // Stat label includes period scope when set ("Q3 PTS", "1H PTS", etc.)
  const scopeLabel =
    scope === "q1" ? "Q1 " : scope === "q2" ? "Q2 " :
    scope === "q3" ? "Q3 " : scope === "q4" ? "Q4 " :
    scope === "h1" ? "1H " : scope === "h2" ? "2H " : "";
  const statLabel = `${scopeLabel}${STAT_LABELS[stat]}`;
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
  if (scope !== "full" && primary.length === 0) {
    verdict = `No play-by-play data loaded for this period scope yet.`;
  } else if (overStreak >= 3) {
    verdict = `${overs(last10)} of last ${last10.length} over ${line} ${statLabel} -${overStreak} straight.`;
  } else if (underStreak >= 3) {
    verdict = `${last10.length - overs(last10)} of last ${last10.length} under ${line} ${statLabel} -${underStreak} straight under.`;
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
    const playoffAvg = round1(mean(playoffGames.map((g) => pickStat(g, stat, scope))));
    const regAvg = round1(mean(regSeasonGames.map((g) => pickStat(g, stat, scope))));
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
      const vsOppOvers = vsOpp.filter((g) => pickStat(g, stat, scope) > line).length;
      const vsOppAvg = round1(mean(vsOpp.map((g) => pickStat(g, stat, scope))));
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
      const homeAvg = round1(mean(homeGames.map((g) => pickStat(g, stat, scope))));
      const awayAvg = round1(mean(awayGames.map((g) => pickStat(g, stat, scope))));
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

  // Rest days - back-to-back hurts performance, full rest helps. Compute
  // from gap between most recent game and today.
  if (allGames.length >= 1) {
    const lastGameDate = allGames[allGames.length - 1]?.date;
    if (lastGameDate) {
      const lastTs = Date.parse(lastGameDate);
      if (Number.isFinite(lastTs)) {
        const days = Math.round((Date.now() - lastTs) / (24 * 60 * 60 * 1000));
        if (days <= 1) {
          bullets.push({
            label: "Rest",
            value: "B2B (no rest day)",
            tone: stat === "pts" || stat === "pra" || stat === "fg3m" ? "neg" : "neutral",
          });
        } else if (days >= 3 && days <= 7) {
          bullets.push({
            label: "Rest",
            value: `${days} days off (rested)`,
            tone: stat === "pts" || stat === "pra" ? "pos" : "neutral",
          });
        }
      }
    }
  }

  // Defensive matchup -opponent's recent points-allowed per game as a
  // defensive quality proxy. For a points / PRA / scoring prop, a stingy
  // defense suggests under, a leaky defense suggests over.
  if (oppTeamData && (stat === "pts" || stat === "pra" || stat === "pr" || stat === "pa" || stat === "fg3m")) {
    const recentDef = oppTeamData.games
      .filter((g) => g.season === oppTeamData.currentSeason)
      .slice(-20);
    if (recentDef.length >= 8) {
      const ppgAllowed = round1(mean(recentDef.map((g) => g.opponentScore)));
      const vsLeague = round1(ppgAllowed - 113.5);
      const tone: Tone =
        ppgAllowed >= 117 ? "pos" :
        ppgAllowed <= 110 ? "neg" :
        "neutral";
      const trail =
        ppgAllowed >= 118 ? " (leaky D, run-friendly)" :
        ppgAllowed <= 108 ? " (elite D, scoring suppressed)" :
        "";
      bullets.push({
        label: `${oppTeam || "Opp"} D`,
        value: `${ppgAllowed} ppg${trail} (${vsLeague > 0 ? "+" : ""}${vsLeague} vs lg)`,
        tone,
      });
    }
  }

  // Last game performance — recency bias is real, sharps look at the
  // most recent game line directly. If player just put up a monster
  // game the next-game regression is a sell signal; if they bombed,
  // bounce-back potential.
  if (primary.length >= 1) {
    const last = primary[primary.length - 1];
    const lastVal = pickStat(last, stat, scope);
    const lastDate = last.date?.slice(5) || ""; // mm-dd
    if (lastVal > 0 || stat === "pts" || stat === "pra") {
      const trail =
        line > 0 && lastVal >= line * 1.4 ? " (huge — sell-high candidate)" :
        line > 0 && lastVal <= line * 0.5 ? " (bombed — bounce-back?)" :
        "";
      bullets.push({
        label: `Last game ${lastDate}`,
        value: `${lastVal} ${STAT_LABELS[stat]}${trail}`,
        tone:
          line > 0 && lastVal >= line ? "pos" :
          line > 0 && lastVal < line ? "neg" : "neutral",
      });
    }
  }

  // Usage / role trend — minutes consistency is a big predictor of prop
  // outcomes, especially in playoffs (rotations tighten).
  if (recentMinutes.length >= 3) {
    const last3 = recentMinutes.slice(-3);
    const avg3 = last3.reduce((a, b) => a + b, 0) / last3.length;
    const earlier = recentMinutes.slice(0, -3);
    if (earlier.length >= 3) {
      const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
      const swing = round1(avg3 - earlierAvg);
      if (Math.abs(swing) >= 4) {
        bullets.push({
          label: "Minutes trend",
          value: `${round1(avg3)} L3 vs ${round1(earlierAvg)} earlier (${swing > 0 ? "+" : ""}${swing})`,
          tone: swing > 0 ? "pos" : "neg",
        });
      }
    }
  }

  // Pace projection -opp games avg total. Modern NBA avg is ~226; outliers
  // 10+ off are meaningful for points / PRA.
  if (oppTeamData && (stat === "pra" || stat === "pts")) {
    const recentPace = oppTeamData.games.filter((g) => g.season === oppTeamData.currentSeason).slice(-20);
    if (recentPace.length >= 8) {
      const oppAvgTotal = round1(mean(recentPace.map((g) => g.total)));
      if (oppAvgTotal >= 235) {
        bullets.push({ label: "Pace", value: `${oppTeam} games avg ${oppAvgTotal} (fast)`, tone: "pos" });
      } else if (oppAvgTotal <= 218) {
        bullets.push({ label: "Pace", value: `${oppTeam} games avg ${oppAvgTotal} (slow)`, tone: "neg" });
      }
    }
  }

  // Series leverage -elimination / pivotal game flags for playoff context.
  if (isPlayoffs && (seriesContext || gameInSeries != null)) {
    const isElim = !!seriesContext && /down\s*[02]-3|trails?\s*[02]-3|0-3|1-3/i.test(seriesContext);
    const isPivotal = gameInSeries != null && (gameInSeries === 5 || gameInSeries === 7);
    if (isElim) {
      bullets.push({ label: "Leverage", value: `${seriesContext} -elimination game`, tone: "pos" });
    } else if (isPivotal) {
      bullets.push({ label: "Leverage", value: `Game ${gameInSeries} (pivotal)`, tone: "pos" });
    } else if (seriesContext) {
      bullets.push({ label: "Series", value: seriesContext, tone: "neutral" });
    }
  }

  // Career-vs-recent regression flag -sharp bettors always look for buy/sell
  const allValues = allGames.map((g) => pickStat(g, stat, scope));
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

  // Probability the over hits — drives Swish Score
  const posBulletsCount = bullets.filter((b) => b.tone === "pos").length;
  const negBulletsCount = bullets.filter((b) => b.tone === "neg").length;
  const allValuesProb = allGames.map((g) => pickStat(g, stat, scope));
  const probability =
    line > 0 && last10.length >= 3
      ? estimateHitProbability({
          l5Rate: last5.length ? overs(last5) / last5.length : 0,
          l5N: last5.length,
          l10Rate: last10.length ? overs(last10) / last10.length : 0,
          l10N: last10.length,
          seasonRate: allValuesProb.length ? allValuesProb.filter((v) => v > line).length / allValuesProb.length : 0,
          seasonN: allValuesProb.length,
          proj,
          line,
          posBullets: posBulletsCount,
          negBullets: negBulletsCount,
        })
      : undefined;

  return {
    verdict,
    projection:
      last10.length >= 3
        ? { proj, diff, edge: round1(edge), lean }
        : undefined,
    probability,
    bullets,
    flags,
  };
}
