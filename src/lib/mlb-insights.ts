/**
 * MLB player-prop insights -deterministic narrative generation.
 *
 * Takes raw MLB history data + the bet, returns structured punchy insights:
 * verdict, projection vs line, bullet stats, risk flags. No LLM needed -
 * everything here is reproducible from the same inputs.
 */

import type {
  MLBBatterTwoSeason,
  MLBBatterGame,
  MLBPitcherTwoSeason,
  MLBPitcherGame,
  MLBBatterVsPitcher,
  BatterStatcast,
  TeamPitchingStats,
  TeamHittingStats,
  PlatoonSplits,
} from "./mlb-history";
import { getParkFactors } from "./mlb-park-factors";

export type Tone = "pos" | "neg" | "neutral";

export interface InsightBullet {
  label: string;
  value: string;
  tone: Tone;
}

export interface MLBInsights {
  verdict: string;
  projection?: {
    proj: number;
    diff: number;
    edge: number;
    lean: "strong over" | "lean over" | "pass" | "lean under" | "strong under";
  };
  /** Estimated probability the bet hits, 0-1 (drives Swish Score). */
  probability?: number;
  bullets: InsightBullet[];
  flags: string[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Estimate the probability the over hits given empirical hit rates and a
 * projection. Weighted blend of L5/L10/season with bumps for projection
 * spread and bullet tone.
 */
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
  // Projection adjustment: how far is L10 projection from the line?
  if (line > 0) {
    const projEdge = (proj - line) / line;
    p += clamp(projEdge * 0.5, -0.15, 0.15);
  }
  // Bullet tone bump
  p += (posBullets - negBullets) * 0.015;
  return clamp(p, 0.05, 0.95);
}

type HitterStat =
  | "hits" | "homeRuns" | "rbi" | "totalBases" | "runs" | "strikeOuts" | "stolenBases";

const STAT_LABELS: Record<HitterStat, string> = {
  hits: "hits",
  homeRuns: "HR",
  rbi: "RBI",
  totalBases: "total bases",
  runs: "runs",
  strikeOuts: "K's",
  stolenBases: "SB",
};

function pickHitter(g: MLBBatterGame, stat: HitterStat): number {
  switch (stat) {
    case "hits": return g.hits;
    case "homeRuns": return g.hr;
    case "rbi": return g.rbi;
    case "totalBases": return g.totalBases;
    case "runs": return g.runs;
    case "strikeOuts": return g.so;
    case "stolenBases": return g.stolenBases;
  }
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

function leanFromEdge(edge: number): MLBInsights["projection"] extends infer T
  ? T extends { lean: infer L } ? L : never : never {
  if (edge >= 0.20) return "strong over";
  if (edge >= 0.08) return "lean over";
  if (edge <= -0.20) return "strong under";
  if (edge <= -0.08) return "lean under";
  return "pass";
}

// ── Hitter insights ───────────────────────────────────────────────

export function buildHitterInsights(args: {
  batter: MLBBatterTwoSeason;
  stat: HitterStat;
  line: number;
  oppTeam?: string;
  oppPitcher?: MLBPitcherTwoSeason;
  bvp?: MLBBatterVsPitcher;
  isHome?: boolean;
  homeTeam?: string;
  statcast?: BatterStatcast;
  oppPitching?: TeamPitchingStats | null;
  platoonSplits?: PlatoonSplits | null;
  /** Opposing pitcher handedness — drives which platoon split applies */
  oppPitcherHand?: "L" | "R" | null;
}): MLBInsights {
  const { batter, stat, line, oppTeam, oppPitcher, bvp, isHome, homeTeam, statcast, oppPitching, platoonSplits, oppPitcherHand } = args;
  const games = batter.currentSeason;
  const lastSeason = batter.lastSeason;
  const statLabel = STAT_LABELS[stat];

  const values = games.map((g) => pickHitter(g, stat));
  const lastN = (n: number) => values.slice(-n);
  const last10 = lastN(10);
  const last5 = lastN(5);

  const overs = (vs: number[]) => vs.filter((v) => v >= line).length;

  // Projection
  const proj = round1(mean(last10.length ? last10 : values));
  const diff = round1(proj - line);
  const edge = line === 0 ? 0 : diff / line;
  const lean = leanFromEdge(edge);

  // Streak
  const overStreak = streakFromEnd(values, line, "over");
  const underStreak = streakFromEnd(values, line, "under");

  // Verdict
  const total = values.length;
  const totalOvers = overs(values);
  let verdict: string;
  if (overStreak >= 3) {
    verdict = `Cleared ${line} ${statLabel} in ${overs(last10)} of last ${last10.length} -${overStreak} straight.`;
  } else if (underStreak >= 3) {
    verdict = `Under ${line} ${statLabel} in ${last10.length - overs(last10)} of last ${last10.length} -${underStreak} straight under.`;
  } else if (total > 0) {
    verdict = `Cleared ${line} ${statLabel} in ${overs(last10)} of last ${last10.length}, ${totalOvers}/${total} season.`;
  } else {
    verdict = `Limited current-season data -${lastSeason.length} games last year to lean on.`;
  }

  const bullets: InsightBullet[] = [];

  // L5 / L10 / season
  if (last10.length >= 5) {
    const l10Pct = pct(overs(last10), last10.length);
    bullets.push({
      label: `Last ${last10.length}`,
      value: `${overs(last10)}/${last10.length} over (${l10Pct}%)`,
      tone: l10Pct >= 60 ? "pos" : l10Pct <= 40 ? "neg" : "neutral",
    });
  }
  if (last5.length >= 3) {
    const l5Pct = pct(overs(last5), last5.length);
    bullets.push({
      label: "Last 5",
      value: `${overs(last5)}/${last5.length} over (${l5Pct}%)`,
      tone: l5Pct >= 60 ? "pos" : l5Pct <= 40 ? "neg" : "neutral",
    });
  }

  // Streak callout (separate bullet only if not already in verdict)
  if (overStreak >= 5 && overStreak < 10) {
    bullets.push({ label: "Streak", value: `${overStreak} straight over`, tone: "pos" });
  } else if (underStreak >= 5) {
    bullets.push({ label: "Cold streak", value: `${underStreak} straight under`, tone: "neg" });
  }

  // Home / Away split (when known)
  if (typeof isHome === "boolean") {
    const venueGames = games.filter((g) =>
      isHome ? !g.opponent.toLowerCase().includes("@") : g.opponent.toLowerCase().includes("@")
    );
    // The history doesn't tag home/away on batter games; skip if we can't tell
    if (venueGames.length > 0) {
      const venueOvers = venueGames.filter((g) => pickHitter(g, stat) >= line).length;
      bullets.push({
        label: isHome ? "At home" : "On road",
        value: `${venueOvers}/${venueGames.length} (${pct(venueOvers, venueGames.length)}%)`,
        tone: pct(venueOvers, venueGames.length) >= 50 ? "pos" : "neg",
      });
    }
  }

  // Recent vs this opponent
  if (oppTeam) {
    const vsOpp = games.filter((g) =>
      g.opponent.toLowerCase().includes(oppTeam.toLowerCase()) ||
      oppTeam.toLowerCase().includes(g.opponent.toLowerCase().split(/\s+/).pop() || "")
    );
    if (vsOpp.length >= 2) {
      const vsOppOvers = vsOpp.filter((g) => pickHitter(g, stat) >= line).length;
      bullets.push({
        label: `vs ${oppTeam}`,
        value: `${vsOppOvers}/${vsOpp.length} (${pct(vsOppOvers, vsOpp.length)}%)`,
        tone: pct(vsOppOvers, vsOpp.length) >= 60 ? "pos" : pct(vsOppOvers, vsOpp.length) <= 40 ? "neg" : "neutral",
      });
    }
  }

  // Handedness platoon - the matchup read sharps care most about. When we
  // know the opposing pitcher's hand, surface the batter's vs-L or vs-R
  // split so the user sees how the player actually performs against this
  // type of arm.
  if (platoonSplits && oppPitcherHand) {
    const split = oppPitcherHand === "L" ? platoonSplits.vsL : platoonSplits.vsR;
    if (split && split.ab >= 20) {
      const fmtAvg = (n: number) => `.${(Math.round(n * 1000)).toString().padStart(3, "0")}`;
      const tone: Tone =
        stat === "homeRuns" ? (split.slg >= 0.500 ? "pos" : split.slg <= 0.380 ? "neg" : "neutral") :
        stat === "totalBases" ? (split.ops >= 0.800 ? "pos" : split.ops <= 0.650 ? "neg" : "neutral") :
        (split.avg >= 0.290 ? "pos" : split.avg <= 0.230 ? "neg" : "neutral");
      const handLabel = oppPitcherHand === "L" ? "LHP" : "RHP";
      const valStr =
        stat === "homeRuns" ? `${fmtAvg(split.avg)} / ${fmtAvg(split.slg)} SLG, ${split.hr} HR` :
        stat === "totalBases" ? `${fmtAvg(split.ops)} OPS in ${split.ab} AB` :
        `${fmtAvg(split.avg)} in ${split.ab} AB`;
      bullets.push({
        label: `vs ${handLabel}`,
        value: valStr,
        tone,
      });
    }
  }

  // Statcast / xStats - the regression read sharps care about. xBA / xSLG /
  // xwOBA are Statcast-derived "deserved" stats; comparing actual vs expected
  // tells you whether the player is running hot (sell-high) or cold
  // (buy-low / regress up). This is non-Googleable synthesis.
  if (statcast?.available) {
    const fmtAvg = (n?: number) => n != null ? `.${(Math.round(n * 1000)).toString().padStart(3, "0")}` : "?";
    // For HR / total bases, show xSLG vs SLG (power)
    if ((stat === "homeRuns" || stat === "totalBases") && statcast.slg != null && statcast.xslg != null) {
      const delta = statcast.slgDelta || 0;
      const tone: Tone = Math.abs(delta) < 0.025 ? "neutral" : delta < 0 ? "pos" : "neg";
      const trail = Math.abs(delta) >= 0.025
        ? delta > 0 ? " (hot, regress down)" : " (cold, due regress up)"
        : "";
      bullets.push({
        label: "xSLG vs SLG",
        value: `${fmtAvg(statcast.xslg)} vs ${fmtAvg(statcast.slg)}${trail}`,
        tone,
      });
    }
    // For hits / RBI / runs / general — show xBA vs BA (contact quality)
    else if (statcast.ba != null && statcast.xba != null) {
      const delta = statcast.baDelta || 0;
      const tone: Tone = Math.abs(delta) < 0.020 ? "neutral" : delta < 0 ? "pos" : "neg";
      const trail = Math.abs(delta) >= 0.020
        ? delta > 0 ? " (hot, regress down)" : " (cold, due regress up)"
        : "";
      bullets.push({
        label: "xBA vs BA",
        value: `${fmtAvg(statcast.xba)} vs ${fmtAvg(statcast.ba)}${trail}`,
        tone,
      });
    }
    // wOBA always useful as a one-number quality read
    if (statcast.xwoba != null && (stat === "homeRuns" || stat === "totalBases" || stat === "rbi")) {
      const xwoba = statcast.xwoba;
      const tone: Tone = xwoba >= 0.370 ? "pos" : xwoba <= 0.310 ? "neg" : "neutral";
      bullets.push({
        label: "xwOBA",
        value: `${fmtAvg(xwoba)}${xwoba >= 0.400 ? " (elite)" : xwoba >= 0.370 ? " (above avg)" : xwoba <= 0.290 ? " (poor)" : ""}`,
        tone,
      });
    }
  }

  // Ballpark factor -adds context when notable
  if (homeTeam) {
    const pf = getParkFactors(homeTeam);
    if (pf) {
      const factor = stat === "homeRuns" ? pf.hr : stat === "totalBases" ? Math.round((pf.hr + pf.hits) / 2) : stat === "hits" ? pf.hits : pf.runs;
      const diff = factor - 100;
      const sign = diff > 0 ? "+" : "";
      const val = `${pf.parkName} (${sign}${diff}%)`;
      if (Math.abs(diff) >= 5) {
        const tone: Tone = diff > 0 ? "pos" : "neg";
        bullets.push({ label: stat === "homeRuns" ? "Park HR factor" : stat === "hits" ? "Park hits factor" : "Park run factor", value: val, tone });
      }
    }
  }

  // Opposing pitching staff strength - bullpen exposure for late-game props.
  // Hitter sees the starter for ~2 ABs and the bullpen for 1-2 more, so the
  // staff's overall ERA is a reasonable proxy when the starter is OK but the
  // pen is lit up (or vice versa).
  if (oppPitching && oppTeam) {
    const era = oppPitching.era;
    if (Number.isFinite(era) && era > 0) {
      const tone: Tone =
        // For hits / TB / HR / RBI: high opposing ERA = good for over
        era >= 4.50 ? "pos" : era <= 3.50 ? "neg" : "neutral";
      const note =
        era >= 4.80 ? " (lit up)" :
        era <= 3.30 ? " (elite staff)" :
        "";
      bullets.push({
        label: `${oppTeam} staff ERA`,
        value: `${era.toFixed(2)}${note}`,
        tone,
      });
    }
  }

  // Opposing pitcher form -concrete matchup edge
  if (oppPitcher && oppPitcher.currentSeason.length >= 3) {
    const cur = oppPitcher.currentSeason;
    let ip = 0, er = 0, k = 0, h = 0;
    for (const g of cur) { ip += g.ip; er += g.er; k += g.k; h += g.h; }
    const era = ip > 0 ? round1((er / ip) * 9) : 0;
    const kPer9 = ip > 0 ? round1((k / ip) * 9) : 0;
    const hPer9 = ip > 0 ? round1((h / ip) * 9) : 0;
    let value: string;
    let tone: Tone = "neutral";
    if (stat === "strikeOuts") {
      value = `${kPer9} K/9, ${era} ERA`;
      tone = kPer9 >= 10 ? "neg" : kPer9 <= 7.5 ? "pos" : "neutral";
    } else if (stat === "homeRuns") {
      const hrPer9 = ip > 0 ? round1((cur.reduce((s, g) => s + g.hr, 0) / ip) * 9) : 0;
      value = `${era} ERA, ${hrPer9} HR/9`;
      tone = hrPer9 >= 1.5 ? "pos" : hrPer9 <= 0.7 ? "neg" : "neutral";
    } else {
      value = `${era} ERA, ${hPer9} H/9, ${kPer9} K/9`;
      tone = hPer9 >= 9.5 ? "pos" : kPer9 >= 10 ? "neg" : "neutral";
    }
    bullets.push({
      label: `Facing ${oppPitcher.pitcherName}`,
      value,
      tone,
    });
  }

  // BvP -small sample but include if it's there
  if (bvp && bvp.pa >= 5) {
    const tone: Tone =
      stat === "strikeOuts"
        ? bvp.so / bvp.pa >= 0.3 ? "pos" : "neutral"
        : Number(bvp.avg) >= 0.3 ? "pos" : Number(bvp.avg) <= 0.18 ? "neg" : "neutral";
    bullets.push({
      label: `Career vs ${bvp.pitcherName}`,
      value: `${bvp.hits}-${bvp.ab}, ${bvp.hr} HR, ${bvp.so} K (.${(Number(bvp.avg) * 1000).toFixed(0).padStart(3, "0")})`,
      tone,
    });
  } else if (bvp && bvp.pa > 0 && bvp.pa < 5) {
    bullets.push({
      label: `vs ${bvp.pitcherName}`,
      value: `Small sample (${bvp.pa} PA)`,
      tone: "neutral",
    });
  }

  // Projection bullet
  if (last10.length >= 5) {
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
  if (total < 10) flags.push(`Only ${total} games this season -early-season noise.`);
  if (last10.length > 0 && overs(last10) === 0 && totalOvers > 0) {
    flags.push("0-for-10 recently after a stronger season -cold streak.");
  }

  // Probability that the over hits — used to derive Swish Score
  const posBulletsCount = bullets.filter((b) => b.tone === "pos").length;
  const negBulletsCount = bullets.filter((b) => b.tone === "neg").length;
  const probability =
    total > 0
      ? estimateHitProbability({
          l5Rate: last5.length ? overs(last5) / last5.length : 0,
          l5N: last5.length,
          l10Rate: last10.length ? overs(last10) / last10.length : 0,
          l10N: last10.length,
          seasonRate: total > 0 ? totalOvers / total : 0,
          seasonN: total,
          proj,
          line,
          posBullets: posBulletsCount,
          negBullets: negBulletsCount,
        })
      : undefined;

  return {
    verdict,
    projection: last10.length >= 5 ? { proj, diff, edge: round1(edge), lean } : undefined,
    probability,
    bullets,
    flags,
  };
}

// ── Pitcher insights ──────────────────────────────────────────────

function pickPitcher(g: MLBPitcherGame, focus: "strikeouts" | "era" | "innings"): number {
  if (focus === "strikeouts") return g.k;
  if (focus === "era") return round1(g.era);
  return round1(g.ip);
}

export function buildPitcherInsights(args: {
  pitcher: MLBPitcherTwoSeason;
  focus: "strikeouts" | "era" | "innings";
  line?: number;
  oppTeam?: string;
  career?: MLBPitcherGame[];
  homeTeam?: string;
  oppHitting?: TeamHittingStats | null;
}): MLBInsights {
  const { pitcher, focus, line, oppTeam, career, homeTeam, oppHitting } = args;
  const games = pitcher.currentSeason;
  const values = games.map((g) => pickPitcher(g, focus));
  const last10 = values.slice(-10);
  const last5 = values.slice(-5);

  const focusLabel = focus === "strikeouts" ? "K's" : focus === "era" ? "ERA" : "IP";

  const proj = round1(mean(last10.length ? last10 : values));
  const diff = line != null ? round1(proj - line) : 0;
  const edge = line != null && line !== 0 ? diff / line : 0;
  const lean = line != null ? leanFromEdge(edge) : "pass";

  const overs = (arr: number[], l?: number) =>
    l == null ? 0 : arr.filter((v) => v > l).length;

  let verdict: string;
  if (line != null && last10.length > 0) {
    const overStreak = streakFromEnd(values, line, "over");
    const underStreak = streakFromEnd(values, line, "under");
    if (overStreak >= 3) {
      verdict = `Cleared ${line} ${focusLabel} in ${overs(last10, line)} of last ${last10.length} -${overStreak} straight.`;
    } else if (underStreak >= 3) {
      verdict = `Under ${line} ${focusLabel} in ${last10.length - overs(last10, line)} of last ${last10.length} -${underStreak} straight under.`;
    } else {
      verdict = `Cleared ${line} ${focusLabel} in ${overs(last10, line)} of last ${last10.length}.`;
    }
  } else {
    verdict = `Avg ${proj} ${focusLabel} per start over last ${last10.length || values.length}.`;
  }

  const bullets: InsightBullet[] = [];

  if (last10.length >= 3 && line != null) {
    const l10 = overs(last10, line);
    bullets.push({
      label: `Last ${last10.length}`,
      value: `${l10}/${last10.length} over (${pct(l10, last10.length)}%)`,
      tone: pct(l10, last10.length) >= 60 ? "pos" : pct(l10, last10.length) <= 40 ? "neg" : "neutral",
    });
  }
  if (last5.length >= 3 && line != null) {
    const l5 = overs(last5, line);
    bullets.push({
      label: "Last 5",
      value: `${l5}/${last5.length} over (${pct(l5, last5.length)}%)`,
      tone: pct(l5, last5.length) >= 60 ? "pos" : pct(l5, last5.length) <= 40 ? "neg" : "neutral",
    });
  }

  // Pitcher avg (informational)
  if (last10.length > 0) {
    bullets.push({
      label: `Avg ${focusLabel} (L10)`,
      value: `${proj}`,
      tone: "neutral",
    });
  }

  // Ballpark factor for pitcher props
  if (homeTeam) {
    const pf = getParkFactors(homeTeam);
    if (pf) {
      // For K's: higher k factor = more K-friendly = good for over
      // For ERA: higher run factor = bad for ERA (more runs)
      // For IP: park doesn't move IP much, skip
      if (focus === "strikeouts" && Math.abs(pf.k - 100) >= 3) {
        const diff = pf.k - 100;
        const sign = diff > 0 ? "+" : "";
        bullets.push({
          label: "Park K factor",
          value: `${pf.parkName} (${sign}${diff}%)`,
          tone: diff > 0 ? "pos" : "neg",
        });
      } else if (focus === "era" && Math.abs(pf.runs - 100) >= 5) {
        const diff = pf.runs - 100;
        const sign = diff > 0 ? "+" : "";
        bullets.push({
          label: "Park run factor",
          value: `${pf.parkName} (${sign}${diff}%)`,
          tone: diff < 0 ? "pos" : "neg", // fewer runs = pitcher-friendly
        });
      }
    }
  }

  // Opposing lineup K rate - the read sharps want for K props.
  // High K% offense = pitcher Ks come easier; low K% offense = harder.
  if (oppHitting && oppTeam) {
    if (focus === "strikeouts") {
      const kPct = oppHitting.kPct;
      const pctStr = `${(kPct * 100).toFixed(1)}%`;
      const tone: Tone = kPct >= 0.235 ? "pos" : kPct <= 0.205 ? "neg" : "neutral";
      const trail =
        kPct >= 0.250 ? " (Ks easy here)" :
        kPct <= 0.200 ? " (tough K matchup)" : "";
      bullets.push({
        label: `${oppTeam} K%`,
        value: `${pctStr}${trail}`,
        tone,
      });
    } else if (focus === "era") {
      // For ERA props, opposing offense's R/G is the read.
      const rpg = oppHitting.runsPerGame;
      const tone: Tone = rpg >= 5.0 ? "neg" : rpg <= 4.0 ? "pos" : "neutral";
      bullets.push({
        label: `${oppTeam} R/G`,
        value: `${rpg.toFixed(1)}${rpg >= 5.0 ? " (high-scoring offense)" : rpg <= 3.8 ? " (low-scoring)" : ""}`,
        tone,
      });
    }
  }

  // Career vs opponent
  if (oppTeam && career && career.length >= 2) {
    const careerVals = career.map((g) => pickPitcher(g, focus));
    const careerProj = round1(mean(careerVals));
    const careerOvers = line != null ? careerVals.filter((v) => v > line).length : 0;
    if (line != null) {
      bullets.push({
        label: `Career vs ${oppTeam}`,
        value: `${careerOvers}/${career.length} over (avg ${careerProj})`,
        tone: pct(careerOvers, career.length) >= 60 ? "pos" : pct(careerOvers, career.length) <= 40 ? "neg" : "neutral",
      });
    } else {
      bullets.push({
        label: `Career vs ${oppTeam}`,
        value: `${careerProj} avg over ${career.length} starts`,
        tone: "neutral",
      });
    }
  }

  // Projection bullet
  if (last10.length >= 3 && line != null) {
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
  if (games.length < 6) flags.push(`Only ${games.length} starts this season -small sample.`);

  // Probability of hitting the over for pitcher props with a numeric line
  const posBulletsCount = bullets.filter((b) => b.tone === "pos").length;
  const negBulletsCount = bullets.filter((b) => b.tone === "neg").length;
  const probability =
    line != null && line > 0 && last10.length >= 3
      ? estimateHitProbability({
          l5Rate: last5.length ? overs(last5, line) / last5.length : 0,
          l5N: last5.length,
          l10Rate: last10.length ? overs(last10, line) / last10.length : 0,
          l10N: last10.length,
          seasonRate: values.length ? overs(values, line) / values.length : 0,
          seasonN: values.length,
          proj,
          line,
          posBullets: posBulletsCount,
          negBullets: negBulletsCount,
        })
      : undefined;

  return {
    verdict,
    projection:
      line != null && last10.length >= 3
        ? { proj, diff, edge: round1(edge), lean }
        : undefined,
    probability,
    bullets,
    flags,
  };
}
