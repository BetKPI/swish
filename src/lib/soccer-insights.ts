/**
 * Soccer-specific deterministic insights for ML / spread / total / BTTS
 * markets. Mirrors mlb-insights / nba-insights structure so the chat
 * and UI consume them via the same insights interface.
 */

import type { SoccerTeamForm } from "./soccer-history";
import { getH2H } from "./soccer-history";

export type Tone = "pos" | "neg" | "neutral";

export interface InsightBullet {
  label: string;
  value: string;
  tone: Tone;
}

export interface SoccerInsights {
  verdict: string;
  probability?: number;
  bullets: InsightBullet[];
  flags: string[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fmtRecord(r: { w: number; d: number; l: number }): string {
  return `${r.w}-${r.d}-${r.l}`;
}

function pointsPerGame(r: { w: number; d: number; l: number }): number {
  const games = r.w + r.d + r.l;
  if (games === 0) return 0;
  return Math.round(((r.w * 3 + r.d) / games) * 100) / 100;
}

/**
 * Build soccer insights for a team-bet (ML / spread / total / BTTS / O-U
 * goals). Frames the analysis around the OWN team's form vs OPP team's form.
 *
 * @param betType One of "moneyline", "spread", "over_under", or "btts"
 * @param market  Market description (helps detect 3-way ML / Asian handicap)
 * @param line    Numeric line for spread / total
 */
export function buildSoccerInsights(args: {
  betType: string;
  market?: string;
  line?: number;
  team: SoccerTeamForm;
  opp?: SoccerTeamForm | null;
  isHome?: boolean;
}): SoccerInsights {
  const { betType, market, line, team, opp, isHome } = args;
  const m = `${market || ""}`.toLowerCase();
  const is3Way = m.includes("3-way") || m.includes("3 way");
  const isBTTS = m.includes("btts") || (m.includes("both") && m.includes("score"));
  const isTotal = betType === "over_under" || m.includes("total goal") || m.includes("over") || m.includes("under");
  const isML = betType === "moneyline" || m.includes("moneyline") || m.includes("money line");

  const bullets: InsightBullet[] = [];
  const flags: string[] = [];

  // Recent form W/D/L
  const formStr = team.recentForm.join("-");
  const formGoals = team.matches.slice(-5).map((mm) => `${mm.teamGoals}-${mm.oppGoals}`).join(" / ");
  const wins5 = team.recentForm.filter((r) => r === "W").length;
  const losses5 = team.recentForm.filter((r) => r === "L").length;
  bullets.push({
    label: "Last 5",
    value: `${formStr} (${formGoals})`,
    tone: wins5 >= 3 ? "pos" : losses5 >= 3 ? "neg" : "neutral",
  });

  // Goal differential per match
  const diff = Math.round((team.avgGoalsFor - team.avgGoalsAgainst) * 10) / 10;
  bullets.push({
    label: "Goals/match",
    value: `${team.avgGoalsFor.toFixed(1)} for, ${team.avgGoalsAgainst.toFixed(1)} against (${diff > 0 ? "+" : ""}${diff})`,
    tone: diff >= 0.5 ? "pos" : diff <= -0.5 ? "neg" : "neutral",
  });

  // PPG - useful league-wide normalizer
  const ppg = pointsPerGame(team.recordOverall);
  bullets.push({
    label: "PPG",
    value: `${ppg.toFixed(2)} (${fmtRecord(team.recordOverall)})`,
    tone: ppg >= 2.0 ? "pos" : ppg <= 1.0 ? "neg" : "neutral",
  });

  // Home / away splits - soccer's home advantage is real
  if (isHome != null) {
    const venueRec = isHome ? team.homeRecord : team.awayRecord;
    const venuePpg = pointsPerGame(venueRec);
    bullets.push({
      label: isHome ? "Home form" : "Away form",
      value: `${fmtRecord(venueRec)}, ${venuePpg.toFixed(2)} PPG`,
      tone: venuePpg >= 1.7 ? "pos" : venuePpg <= 1.0 ? "neg" : "neutral",
    });
  }

  // Opp signals (if we resolved the opposing team's form too)
  if (opp) {
    const oppPpg = pointsPerGame(opp.recordOverall);
    const oppDiff = Math.round((opp.avgGoalsFor - opp.avgGoalsAgainst) * 10) / 10;
    bullets.push({
      label: `${opp.teamName} form`,
      value: `${opp.recentForm.join("-")} · ${oppPpg.toFixed(2)} PPG · ${oppDiff > 0 ? "+" : ""}${oppDiff} GD`,
      tone: oppPpg >= 2.0 ? "neg" : oppPpg <= 1.0 ? "pos" : "neutral",
    });

    // H2H - last meetings
    const h2h = getH2H(team, opp.teamName, 5);
    if (h2h.length > 0) {
      const h2hStr = h2h.map((mm) => `${mm.teamGoals}-${mm.oppGoals}${mm.home ? "(H)" : "(A)"}`).join(" / ");
      const h2hWins = h2h.filter((mm) => mm.result === "W").length;
      bullets.push({
        label: `vs ${opp.teamName}`,
        value: `${h2hWins}/${h2h.length} wins (${h2hStr})`,
        tone: h2hWins >= h2h.length * 0.6 ? "pos" : h2hWins <= h2h.length * 0.4 ? "neg" : "neutral",
      });
    }
  }

  // Total goals context (for O-U bets)
  if (isTotal) {
    const combinedAvg = team.avgGoalsFor + team.avgGoalsAgainst;
    const oppCombined = opp ? opp.avgGoalsFor + opp.avgGoalsAgainst : combinedAvg;
    const projected = Math.round(((combinedAvg + oppCombined) / 2) * 10) / 10;
    if (line != null) {
      const tone: Tone = projected > line + 0.3 ? "pos" : projected < line - 0.3 ? "neg" : "neutral";
      bullets.push({
        label: "Total proj",
        value: `${projected} (${projected > line ? "+" : ""}${(projected - line).toFixed(1)} vs ${line})`,
        tone,
      });
    } else {
      bullets.push({ label: "Total per match avg", value: `${projected}`, tone: "neutral" });
    }
  }

  // BTTS context
  if (isBTTS) {
    const teamBtts = team.bttsRate;
    const oppBtts = opp?.bttsRate ?? 0;
    const combined = opp ? Math.round(((teamBtts + oppBtts) / 2) * 100) : Math.round(teamBtts * 100);
    bullets.push({
      label: "BTTS rate",
      value: `${team.teamName} ${Math.round(teamBtts * 100)}%${opp ? ` · ${opp.teamName} ${Math.round(oppBtts * 100)}%` : ""} (avg ${combined}%)`,
      tone: combined >= 60 ? "pos" : combined <= 40 ? "neg" : "neutral",
    });
  }

  // Clean sheet / failed to score (for relevant ML / spread questions)
  bullets.push({
    label: "Clean sheets",
    value: `${Math.round(team.cleanSheetRate * 100)}% of matches`,
    tone: team.cleanSheetRate >= 0.4 ? "pos" : team.cleanSheetRate <= 0.15 ? "neg" : "neutral",
  });

  if (team.failedToScoreRate >= 0.25) {
    flags.push(`${team.teamName} failed to score in ${Math.round(team.failedToScoreRate * 100)}% of matches.`);
  }

  // Probability estimate
  // For 3-way ML: rough win prob from PPG (3 PPG = 100% wins, 1 PPG ~ 33%)
  // For 2-way ML: similar but inflated since draws aren't a separate outcome
  // For total: probability over the line based on combined per-match
  let probability: number | undefined;
  if (isML) {
    const pWin = clamp(ppg / 3.0, 0.10, 0.90);
    if (is3Way) {
      probability = pWin; // already a win-only probability
    } else {
      // 2-way ML: market often wraps draw with one side; use draws-included losing
      // probability for the underdog
      const draws = team.recordOverall.d;
      const games = team.recordOverall.w + team.recordOverall.d + team.recordOverall.l;
      const drawRate = games > 0 ? draws / games : 0.25;
      probability = clamp(pWin + drawRate * 0.3, 0.10, 0.90);
    }
    // Adjust for opponent strength
    if (opp) {
      const oppPpg = pointsPerGame(opp.recordOverall);
      const strengthDelta = (ppg - oppPpg) / 6.0;
      probability = clamp(probability + strengthDelta, 0.05, 0.95);
    }
    // Home bump
    if (isHome === true) probability = clamp(probability + 0.05, 0.05, 0.95);
    if (isHome === false) probability = clamp(probability - 0.05, 0.05, 0.95);
  }

  // Verdict
  const wDots = formStr;
  const verdict =
    isML
      ? `${team.teamName} ${fmtRecord(team.recordOverall)} (${ppg.toFixed(2)} PPG), L5 ${wDots}`
      : isTotal
        ? `${team.avgGoalsFor.toFixed(1)} GF, ${team.avgGoalsAgainst.toFixed(1)} GA per match.`
        : isBTTS
          ? `${Math.round(team.bttsRate * 100)}% of ${team.teamName} matches see both teams score.`
          : `${team.teamName} L5 ${wDots} · ${team.avgGoalsFor.toFixed(1)} GF / ${team.avgGoalsAgainst.toFixed(1)} GA.`;

  if (team.matches.length < 5) flags.push(`Only ${team.matches.length} matches loaded for ${team.teamName} -small sample.`);

  return {
    verdict,
    probability,
    bullets,
    flags,
  };
}
