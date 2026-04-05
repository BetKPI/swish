/**
 * Deterministic chart builders for common bet types.
 * Charts are built from pre-computed data — no AI involved.
 */

import type { ChartConfig } from "@/types";
import type { ComputedAnalysis, TeamMetrics, GameResult } from "./analytics";

// ── Main router ────────────────────────────────────────────────────

export function buildCharts(
  betType: string,
  computed: ComputedAnalysis,
  extraction: {
    teams: string[];
    players: string[];
    line?: number;
    odds: string;
    market?: string;
  },
  rawData: Record<string, unknown>
): ChartConfig[] {
  switch (betType) {
    case "spread":
      return buildSpreadCharts(computed, extraction);
    case "over_under":
      return buildOverUnderCharts(computed, extraction);
    case "moneyline":
      return buildMoneylineCharts(computed, extraction);
    case "player_prop":
      return buildPlayerPropCharts(computed, extraction, rawData);
    default:
      return []; // exotic bets handled by AI fallback
  }
}

// ── Spread charts ──────────────────────────────────────────────────

function buildSpreadCharts(
  computed: ComputedAnalysis,
  extraction: { teams: string[]; line?: number }
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const teams = Object.values(computed.teamMetrics);
  const line = extraction.line ?? 0;

  // 1. Margin of victory trend with spread line + rolling avg
  for (const team of teams) {
    if (team.recentGames.length < 3) continue;
    const recent = team.recentGames.slice(-10);
    const coversInWindow = recent.filter((g) => g.margin + line > 0).length;
    const data = recent.map((g, i) => {
      const window = recent.slice(Math.max(0, i - 2), i + 1);
      const rollingMargin = Math.round((window.reduce((s, w) => s + w.margin, 0) / window.length) * 10) / 10;
      return {
        game: shortenName(g.opponent),
        margin: g.margin,
        rollingMargin: i >= 2 ? rollingMargin : undefined,
        spreadLine: -line,
      };
    });
    const avgMargin = Math.round((recent.reduce((s, g) => s + g.margin, 0) / recent.length) * 10) / 10;
    const trending = recent.slice(-3).reduce((s, g) => s + g.margin, 0) / 3 > avgMargin ? "trending up" : "trending down";
    charts.push({
      type: "line",
      title: `${team.name} — Margin of Victory vs Spread`,
      relevance: `Covered ${line > 0 ? "+" : ""}${line} in ${coversInWindow} of last ${recent.length} (avg margin ${avgMargin > 0 ? "+" : ""}${avgMargin}, ${trending})`,
      data,
      xKey: "game",
      yKeys: ["margin", "rollingMargin", "spreadLine"],
    });
  }

  // 2. Close games record — games decided by 6 or fewer
  if (teams.length === 2) {
    const closeGamesData = teams.map((t) => {
      const close = t.recentGames.filter((g) => Math.abs(g.margin) <= 6);
      const closeWins = close.filter((g) => g.won).length;
      return {
        team: shortenName(t.name),
        closeWins,
        closeLosses: close.length - closeWins,
        closeGames: close.length,
        avgCloseMargin: close.length > 0 ? Math.round((close.reduce((s, g) => s + g.margin, 0) / close.length) * 10) / 10 : 0,
      };
    });
    if (closeGamesData.some((d) => d.closeGames >= 2)) {
      charts.push({
        type: "bar",
        title: "Close Games Record (decided by 6 or fewer)",
        relevance: `Spreads often come down to close games — ${closeGamesData.map((d) => `${shortenName(d.team)} ${d.closeWins}-${d.closeLosses}`).join(", ")} in tight ones`,
        data: closeGamesData,
        xKey: "team",
        yKeys: ["closeWins", "closeLosses"],
      });
    }
  }

  // 3. Margin distribution — how often they win by buckets
  const primary = teams[0];
  if (primary && primary.recentGames.length >= 5) {
    const buckets = marginDistribution(primary.recentGames);
    const mostCommon = buckets.reduce((a, b) => (b.count > a.count ? b : a), buckets[0]);
    charts.push({
      type: "bar",
      title: `${primary.name} — Win/Loss Margin Distribution`,
      relevance: `Most common outcome: ${mostCommon.range} (${mostCommon.count} games) — ${line !== 0 ? `the ${line > 0 ? "+" : ""}${line} spread needs margins above that` : ""}`,
      data: buckets,
      xKey: "range",
      yKeys: ["count"],
    });
  }

  // 4. Rest + venue comparison table
  if (teams.length === 2) {
    const t0 = teams[0], t1 = teams[1];
    const data = [
      { stat: "Record", [shortenName(t0.name)]: `${t0.record.wins}-${t0.record.losses}`, [shortenName(t1.name)]: `${t1.record.wins}-${t1.record.losses}` },
      { stat: "ATS Cover Rate", [shortenName(t0.name)]: `${Math.round((t0.ats?.coverRate ?? 0) * 100)}%`, [shortenName(t1.name)]: `${Math.round((t1.ats?.coverRate ?? 0) * 100)}%` },
      { stat: "Home Win %", [shortenName(t0.name)]: `${Math.round((t0.homeRecord?.pct ?? 0) * 100)}%`, [shortenName(t1.name)]: `${Math.round((t1.homeRecord?.pct ?? 0) * 100)}%` },
      { stat: "Away Win %", [shortenName(t0.name)]: `${Math.round((t0.awayRecord?.pct ?? 0) * 100)}%`, [shortenName(t1.name)]: `${Math.round((t1.awayRecord?.pct ?? 0) * 100)}%` },
      { stat: "Avg Margin", [shortenName(t0.name)]: `${(t0.scoring.avgPointsFor - t0.scoring.avgPointsAgainst) > 0 ? "+" : ""}${(t0.scoring.avgPointsFor - t0.scoring.avgPointsAgainst).toFixed(1)}`, [shortenName(t1.name)]: `${(t1.scoring.avgPointsFor - t1.scoring.avgPointsAgainst) > 0 ? "+" : ""}${(t1.scoring.avgPointsFor - t1.scoring.avgPointsAgainst).toFixed(1)}` },
      { stat: "Rest Days", [shortenName(t0.name)]: t0.restDays !== undefined ? `${t0.restDays}d` : "?", [shortenName(t1.name)]: t1.restDays !== undefined ? `${t1.restDays}d` : "?" },
      { stat: "Streak", [shortenName(t0.name)]: `${t0.streak.type}${t0.streak.count}`, [shortenName(t1.name)]: `${t1.streak.type}${t1.streak.count}` },
    ];
    const restAdv = (t0.restDays ?? 0) > (t1.restDays ?? 0) ? t0.name : (t1.restDays ?? 0) > (t0.restDays ?? 0) ? t1.name : null;
    charts.push({
      type: "table",
      title: "Matchup Comparison",
      relevance: restAdv ? `${restAdv} has the rest advantage here` : "Side-by-side matchup fundamentals",
      data,
      columns: [
        { key: "stat", label: "Stat" },
        { key: shortenName(t0.name), label: t0.name },
        { key: shortenName(t1.name), label: t1.name },
      ],
    });
  }

  // 5. H2H table
  if (computed.headToHead && computed.headToHead.games.length > 0) {
    charts.push(buildH2HTable(computed, extraction.teams));
  }

  return charts;
}

// ── Over/Under charts ──────────────────────────────────────────────

function buildOverUnderCharts(
  computed: ComputedAnalysis,
  extraction: { teams: string[]; line?: number }
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const teams = Object.values(computed.teamMetrics);
  const line = extraction.line ?? 0;

  // 1. Combined scoring trend with O/U line
  if (teams.length === 2) {
    const maxLen = Math.min(teams[0].recentGames.length, teams[1].recentGames.length, 10);
    if (maxLen >= 3) {
      const data = [];
      for (let i = 0; i < maxLen; i++) {
        const g1 = teams[0].recentGames[teams[0].recentGames.length - maxLen + i];
        const g2 = teams[1].recentGames[teams[1].recentGames.length - maxLen + i];
        data.push({
          game: `G${i + 1}`,
          [`${shortenName(teams[0].name)}Total`]: g1.totalPoints,
          [`${shortenName(teams[1].name)}Total`]: g2.totalPoints,
          ouLine: line,
        });
      }
      // Count how many would go over
      const t0Overs = teams[0].recentGames.slice(-maxLen).filter((g) => g.totalPoints > line).length;
      const t1Overs = teams[1].recentGames.slice(-maxLen).filter((g) => g.totalPoints > line).length;
      charts.push({
        type: "line",
        title: "Game Totals vs O/U Line",
        relevance: `${shortenName(teams[0].name)} games went over ${line} in ${t0Overs}/${maxLen}, ${shortenName(teams[1].name)} in ${t1Overs}/${maxLen}`,
        data,
        xKey: "game",
        yKeys: [
          `${shortenName(teams[0].name)}Total`,
          `${shortenName(teams[1].name)}Total`,
          "ouLine",
        ],
      });
    }
  }

  // 2. Pace & scoring context table
  if (teams.length === 2) {
    const t0 = teams[0], t1 = teams[1];
    const combinedAvg = Math.round((t0.scoring.avgPointsFor + t1.scoring.avgPointsFor) * 10) / 10;
    const combinedL5 = Math.round((t0.scoring.last5AvgFor + t1.scoring.last5AvgFor) * 10) / 10;
    const data = [
      { stat: "Avg Points For", [shortenName(t0.name)]: `${t0.scoring.avgPointsFor}`, [shortenName(t1.name)]: `${t1.scoring.avgPointsFor}` },
      { stat: "Avg Points Against", [shortenName(t0.name)]: `${t0.scoring.avgPointsAgainst}`, [shortenName(t1.name)]: `${t1.scoring.avgPointsAgainst}` },
      { stat: "Avg Game Total", [shortenName(t0.name)]: `${t0.scoring.avgTotalPoints}`, [shortenName(t1.name)]: `${t1.scoring.avgTotalPoints}` },
      { stat: "Last 5 Avg Total", [shortenName(t0.name)]: `${t0.scoring.last5AvgTotal}`, [shortenName(t1.name)]: `${t1.scoring.last5AvgTotal}` },
      { stat: "Over Rate", [shortenName(t0.name)]: `${Math.round((t0.overUnder?.overRate ?? 0) * 100)}%`, [shortenName(t1.name)]: `${Math.round((t1.overUnder?.overRate ?? 0) * 100)}%` },
    ];
    const projection = Math.round(((combinedAvg + combinedL5) / 2) * 10) / 10;
    charts.push({
      type: "table",
      title: "Pace & Scoring Comparison",
      relevance: `Combined scoring projects ~${projection} — ${projection > line ? `${(projection - line).toFixed(1)} over` : `${(line - projection).toFixed(1)} under`} the ${line} line`,
      data,
      columns: [
        { key: "stat", label: "" },
        { key: shortenName(t0.name), label: t0.name },
        { key: shortenName(t1.name), label: t1.name },
      ],
    });
  }

  // 3. Each team's offensive output trend with rolling avg
  for (const team of teams) {
    if (team.recentGames.length < 3) continue;
    const recent = team.recentGames.slice(-10);
    const data = recent.map((g, i) => {
      const window = recent.slice(Math.max(0, i - 2), i + 1);
      const rollingTotal = Math.round((window.reduce((s, w) => s + w.totalPoints, 0) / window.length) * 10) / 10;
      return {
        game: shortenName(g.opponent),
        scored: g.teamScore,
        allowed: g.opponentScore,
        rollingTotal: i >= 2 ? rollingTotal : undefined,
      };
    });
    const scoringTrend = recent.slice(-3).reduce((s, g) => s + g.totalPoints, 0) / 3 > team.scoring.avgTotalPoints ? "games getting higher-scoring" : "games getting lower-scoring";
    charts.push({
      type: "line",
      title: `${team.name} — Scoring & Defense Trend`,
      relevance: `Avg total ${team.scoring.avgTotalPoints}, ${scoringTrend} recently`,
      data,
      xKey: "game",
      yKeys: ["scored", "allowed", "rollingTotal"],
    });
  }

  return charts;
}

// ── Moneyline charts ───────────────────────────────────────────────

function buildMoneylineCharts(
  computed: ComputedAnalysis,
  extraction: { teams: string[]; odds: string }
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const teams = Object.values(computed.teamMetrics);

  // 1. Point differential trend
  for (const team of teams) {
    if (team.recentGames.length < 3) continue;
    let runningDiff = 0;
    const data = team.recentGames.slice(-10).map((g, i) => {
      runningDiff += g.margin;
      return {
        game: `G${i + 1}`,
        margin: g.margin,
        cumulativeDiff: runningDiff,
        opponent: shortenName(g.opponent),
      };
    });
    charts.push({
      type: "bar",
      title: `${team.name} — Game-by-Game Margin`,
      relevance: "Shows if the team is winning comfortably or squeaking by",
      data,
      xKey: "game",
      yKeys: ["margin"],
    });
  }

  // 2. Team comparison table
  if (teams.length === 2) {
    const data = [
      { stat: "Record", [shortenName(teams[0].name)]: `${teams[0].record.wins}-${teams[0].record.losses}`, [shortenName(teams[1].name)]: `${teams[1].record.wins}-${teams[1].record.losses}` },
      { stat: "Win %", [shortenName(teams[0].name)]: `${Math.round(teams[0].record.pct * 100)}%`, [shortenName(teams[1].name)]: `${Math.round(teams[1].record.pct * 100)}%` },
      { stat: "Streak", [shortenName(teams[0].name)]: `${teams[0].streak.type}${teams[0].streak.count}`, [shortenName(teams[1].name)]: `${teams[1].streak.type}${teams[1].streak.count}` },
      { stat: "Last 5", [shortenName(teams[0].name)]: teams[0].recentForm.last5.join("-"), [shortenName(teams[1].name)]: teams[1].recentForm.last5.join("-") },
      { stat: "Avg Pts For", [shortenName(teams[0].name)]: `${teams[0].scoring.avgPointsFor}`, [shortenName(teams[1].name)]: `${teams[1].scoring.avgPointsFor}` },
      { stat: "Avg Pts Against", [shortenName(teams[0].name)]: `${teams[0].scoring.avgPointsAgainst}`, [shortenName(teams[1].name)]: `${teams[1].scoring.avgPointsAgainst}` },
      { stat: "Pt Differential", [shortenName(teams[0].name)]: `${(teams[0].scoring.avgPointsFor - teams[0].scoring.avgPointsAgainst).toFixed(1)}`, [shortenName(teams[1].name)]: `${(teams[1].scoring.avgPointsFor - teams[1].scoring.avgPointsAgainst).toFixed(1)}` },
    ];
    charts.push({
      type: "table",
      title: "Head-to-Head Comparison",
      relevance: "Side-by-side team fundamentals",
      data,
      columns: [
        { key: "stat", label: "Stat" },
        { key: shortenName(teams[0].name), label: teams[0].name },
        { key: shortenName(teams[1].name), label: teams[1].name },
      ],
    });
  }

  // 3. Scoring trend — scored vs allowed
  for (const team of teams) {
    if (team.recentGames.length < 3) continue;
    const data = team.recentGames.slice(-10).map((g, i) => ({
      game: `G${i + 1}`,
      scored: g.teamScore,
      allowed: g.opponentScore,
      opponent: shortenName(g.opponent),
    }));
    charts.push({
      type: "line",
      title: `${team.name} — Scoring Trend`,
      relevance: "Points scored vs allowed — shows offensive and defensive form",
      data,
      xKey: "game",
      yKeys: ["scored", "allowed"],
    });
  }

  // 4. H2H if available
  if (computed.headToHead && computed.headToHead.games.length > 0) {
    charts.push(buildH2HTable(computed, extraction.teams));
  }

  return charts;
}

// ── Player prop charts ─────────────────────────────────────────────

function buildPlayerPropCharts(
  computed: ComputedAnalysis,
  extraction: { players: string[]; line?: number; market?: string; teams?: string[]; description?: string },
  rawData: Record<string, unknown>
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players = (rawData as any)?._players;

  // If no player data at all, build team-context charts that are relevant to the prop
  if (!players || extraction.players.every((p) => !players[p])) {
    return buildPlayerPropFallbackCharts(computed, extraction);
  }

  for (const playerName of extraction.players) {
    const pData = players[playerName];
    if (!pData) continue;

    const line = extraction.line ?? 0;
    const market = extraction.market || inferMarketFromDescription(extraction) || "Points";

    // Determine stat key from market
    const statKey = mapMarketToStatKey(market);
    const statLabel = formatStatLabel(statKey);

    // ESPN game log label mapping
    const espnStatMap: Record<string, string> = {
      pts: "PTS", reb: "REB", ast: "AST", stl: "STL", blk: "BLK",
      fg3m: "3PT", turnover: "TO", pra: "_pra",
      // NHL
      shots: "SOG", goals: "G", saves: "SV",
      // MLB
      hits: "H", homeRuns: "HR", rbi: "RBI", strikeOuts: "SO",
      stolenBases: "SB", totalBases: "TB",
    };

    // Try propAnalysis first (BDL/MLB), fall back to ESPN game log
    let propAnalysis = pData.propAnalysis;
    const gameLog = pData.gameLog;

    // If no prop analysis but we have NHL-format game logs (stats on object directly), compute it
    if (!propAnalysis && Array.isArray(gameLog) && gameLog.length > 0 && gameLog[0]?.gameDate && !gameLog[0]?.stats) {
      const nhlStatMap: Record<string, string> = {
        shots: "shots", goals: "goals", assists: "assists", points: "points",
        saves: "saves", goalsAgainst: "goalsAgainst", powerPlayGoals: "powerPlayGoals",
        plusMinus: "plusMinus",
      };
      const nhlKey = nhlStatMap[statKey] || statKey;
      const values = gameLog.map((g: { gameDate: string; opponentAbbrev?: string | { default: string }; opponentCommonName?: { default: string }; homeRoadFlag?: string; [k: string]: unknown }) => {
        let val: number;
        if (statKey === "points" || nhlKey === "points") {
          val = (Number(g.goals) || 0) + (Number(g.assists) || 0);
        } else {
          val = Number(g[nhlKey]) || 0;
        }
        const opp = typeof g.opponentAbbrev === "string"
          ? g.opponentAbbrev
          : (g.opponentAbbrev as { default: string })?.default || g.opponentCommonName?.default || "?";
        return {
          date: g.gameDate,
          value: val,
          hit: val > line,
          opponent: opp,
          home: g.homeRoadFlag === "H",
        };
      });

      const hitCount = values.filter((v) => v.hit).length;
      const total = values.length;
      const average = total > 0 ? Math.round((values.reduce((s, v) => s + v.value, 0) / total) * 10) / 10 : 0;
      const last5 = values.slice(-5);
      const last5Avg = last5.length > 0 ? Math.round((last5.reduce((s, v) => s + v.value, 0) / last5.length) * 10) / 10 : 0;

      propAnalysis = {
        stat: statKey,
        line,
        hitCount,
        totalGames: total,
        hitRate: total > 0 ? hitCount / total : 0,
        average,
        last5Avg,
        trend: "stable" as const,
        gameValues: values,
      };
    }

    // If no prop analysis but we have ESPN game logs, compute it
    if (!propAnalysis && Array.isArray(gameLog) && gameLog.length > 0 && gameLog[0]?.stats) {
      const espnLabel = espnStatMap[statKey] || statLabel;
      const values = gameLog.map((g: { date: string; opponent: string; home: boolean; stats: Record<string, string | number> }) => {
        let val: number;
        if (statKey === "pra") {
          val = (Number(g.stats.PTS) || 0) + (Number(g.stats.REB) || 0) + (Number(g.stats.AST) || 0);
        } else if (statKey === "fg3m" && g.stats["3PT"]) {
          // "3PT" is "4-10" format, extract made
          const parts = String(g.stats["3PT"]).split("-");
          val = Number(parts[0]) || 0;
        } else {
          val = Number(g.stats[espnLabel]) || 0;
        }
        return { date: g.date, value: val, hit: val > line, opponent: g.opponent, home: g.home };
      });

      const hitCount = values.filter((v) => v.hit).length;
      const total = values.length;
      const average = total > 0 ? Math.round((values.reduce((s, v) => s + v.value, 0) / total) * 10) / 10 : 0;
      const last5 = values.slice(-5);
      const last5Avg = last5.length > 0 ? Math.round((last5.reduce((s, v) => s + v.value, 0) / last5.length) * 10) / 10 : 0;

      propAnalysis = {
        stat: statKey,
        line,
        hitCount,
        totalGames: total,
        hitRate: total > 0 ? hitCount / total : 0,
        average,
        last5Avg,
        trend: "stable" as const,
        gameValues: values,
      };
    }

    // If no prop analysis but we have MLB-format game logs (stat object, not stats), compute it
    if (!propAnalysis && Array.isArray(gameLog) && gameLog.length > 0 && gameLog[0]?.stat && !gameLog[0]?.stats) {
      const mlbStatKeyMap: Record<string, string> = {
        hits: "hits", homeRuns: "homeRuns", rbi: "rbi", runs: "runs",
        stolenBases: "stolenBases", totalBases: "totalBases", strikeOuts: "strikeOuts",
        baseOnBalls: "baseOnBalls", strikeOuts_pitching: "strikeOuts",
        earnedRuns: "earnedRuns", inningsPitched: "inningsPitched",
      };
      const mlbKey = mlbStatKeyMap[statKey] || statKey;
      const values = gameLog.map((g: { date: string; opponent: string; stat: Record<string, unknown>; isHome?: boolean }) => {
        const val = mlbKey === "inningsPitched"
          ? parseFloat(String(g.stat[mlbKey] || "0"))
          : Number(g.stat[mlbKey]) || 0;
        return { date: g.date, value: val, hit: val > line, opponent: g.opponent, home: g.isHome ?? false };
      });

      const hitCount = values.filter((v) => v.hit).length;
      const total = values.length;
      const average = total > 0 ? Math.round((values.reduce((s, v) => s + v.value, 0) / total) * 10) / 10 : 0;
      const last5 = values.slice(-5);
      const last5Avg = last5.length > 0 ? Math.round((last5.reduce((s, v) => s + v.value, 0) / last5.length) * 10) / 10 : 0;

      propAnalysis = {
        stat: statKey,
        line,
        hitCount,
        totalGames: total,
        hitRate: total > 0 ? hitCount / total : 0,
        average,
        last5Avg,
        trend: "stable" as const,
        gameValues: values,
      };
    }

    // 1. Game log trend with rolling average — THE key chart
    const gameValues = propAnalysis?.gameValues;
    if (gameValues && gameValues.length > 0) {
      const recent = gameValues.slice(-15);
      const data = recent.map((g: { date: string; value: number; hit: boolean; opponent?: string }, i: number) => {
        // 5-game rolling average
        const window = recent.slice(Math.max(0, i - 4), i + 1);
        const rollingAvg = Math.round((window.reduce((s: number, w: { value: number }) => s + w.value, 0) / window.length) * 10) / 10;
        return {
          game: g.opponent ? shortenName(g.opponent) : `G${i + 1}`,
          [statLabel]: g.value,
          rollingAvg: i >= 2 ? rollingAvg : undefined, // only show after 3 games
          propLine: line,
        };
      });
      // Compute trend from rolling avg
      const last3Avg = recent.slice(-3).reduce((s: number, g: { value: number }) => s + g.value, 0) / Math.min(3, recent.length);
      const seasonAvg = propAnalysis?.average || 0;
      const trendWord = last3Avg > seasonAvg * 1.1 ? "hot streak" : last3Avg < seasonAvg * 0.9 ? "cold stretch" : "steady";
      charts.push({
        type: "line",
        title: `${playerName} — ${statLabel} Game Log`,
        relevance: `${propAnalysis?.hitCount || 0}/${propAnalysis?.totalGames || 0} over ${line} (${Math.round((propAnalysis?.hitRate || 0) * 100)}%) — avg ${seasonAvg}, on a ${trendWord} (last 3: ${Math.round(last3Avg * 10) / 10})`,
        data,
        xKey: "game",
        yKeys: [statLabel, "rollingAvg", "propLine"],
      });
    }

    // 2. Hit rate breakdown by window — last 5, 10, and full season
    if (propAnalysis && propAnalysis.totalGames > 0 && gameValues) {
      const last5 = gameValues.slice(-5);
      const last10 = gameValues.slice(-10);
      const l5Hit = last5.filter((g: { hit: boolean }) => g.hit).length;
      const l10Hit = last10.filter((g: { hit: boolean }) => g.hit).length;

      // Current streak
      let streak = 0;
      const streakType = gameValues[gameValues.length - 1]?.hit ? "over" : "under";
      for (let i = gameValues.length - 1; i >= 0; i--) {
        if ((streakType === "over" && gameValues[i].hit) || (streakType === "under" && !gameValues[i].hit)) streak++;
        else break;
      }

      const data = [
        { window: "Last 5", hitRate: Math.round((l5Hit / Math.min(5, last5.length)) * 100), games: `${l5Hit}/${Math.min(5, last5.length)}` },
        { window: "Last 10", hitRate: Math.round((l10Hit / Math.min(10, last10.length)) * 100), games: `${l10Hit}/${Math.min(10, last10.length)}` },
        { window: "Season", hitRate: Math.round(propAnalysis.hitRate * 100), games: `${propAnalysis.hitCount}/${propAnalysis.totalGames}` },
      ];
      const streakNote = streak >= 2 ? ` | ${streakType === "over" ? "Over" : "Under"} in last ${streak} straight` : "";
      charts.push({
        type: "bar",
        title: `Hit Rate: ${statLabel} Over ${line}`,
        relevance: `Hit rate by recency — trending ${l5Hit / Math.min(5, last5.length) > propAnalysis.hitRate ? "up" : l5Hit / Math.min(5, last5.length) < propAnalysis.hitRate ? "down" : "steady"}${streakNote}`,
        data,
        xKey: "window",
        yKeys: ["hitRate"],
      });
    }

    // 3. Value distribution — how often does he hit each range
    if (gameValues && gameValues.length >= 5) {
      const values = gameValues.map((g: { value: number }) => g.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;

      // Create meaningful buckets based on the stat
      const bucketSize = range <= 5 ? 1 : range <= 15 ? 2 : range <= 30 ? 5 : 10;
      const bucketStart = Math.floor(min / bucketSize) * bucketSize;
      const buckets: { range: string; count: number; overLine: boolean }[] = [];

      for (let b = bucketStart; b <= max; b += bucketSize) {
        const bEnd = b + bucketSize - (bucketSize === 1 ? 0 : 1);
        const label = bucketSize === 1 ? `${b}` : `${b}-${bEnd}`;
        const count = values.filter((v: number) => v >= b && v < b + bucketSize).length;
        if (count > 0) {
          buckets.push({ range: label, count, overLine: b >= line });
        }
      }

      if (buckets.length >= 3) {
        // Compute standard deviation for consistency
        const avg = values.reduce((s: number, v: number) => s + v, 0) / values.length;
        const variance = values.reduce((s: number, v: number) => s + (v - avg) ** 2, 0) / values.length;
        const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
        const consistency = stdDev < avg * 0.2 ? "very consistent" : stdDev < avg * 0.35 ? "moderately consistent" : "high variance";

        charts.push({
          type: "bar",
          title: `${playerName} — ${statLabel} Distribution`,
          relevance: `${consistency} (std dev ${stdDev}) — shows how often he lands in each range`,
          data: buckets,
          xKey: "range",
          yKeys: ["count"],
        });
      }
    }

    // 4. Season average vs line vs recent form
    if (propAnalysis && propAnalysis.average > 0) {
      const last3 = gameValues ? gameValues.slice(-3) : [];
      const last3Avg = last3.length > 0 ? Math.round((last3.reduce((s: number, v: { value: number }) => s + v.value, 0) / last3.length) * 10) / 10 : 0;
      const data = [
        { metric: "Season Avg", value: propAnalysis.average },
        { metric: "Last 5 Avg", value: propAnalysis.last5Avg },
        { metric: "Last 3 Avg", value: last3Avg },
        { metric: "Prop Line", value: line },
      ];
      charts.push({
        type: "bar",
        title: `${playerName} — Averages vs Line`,
        relevance: `Season (${propAnalysis.average}), last 5 (${propAnalysis.last5Avg}), last 3 (${last3Avg}) vs the ${line} line`,
        data,
        xKey: "metric",
        yKeys: ["value"],
      });
    }

    // 5. Home/away split from game log
    if (gameValues && gameValues.length > 3) {
      const homeGames = gameValues.filter((g: { home?: boolean }) => g.home);
      const awayGames = gameValues.filter((g: { home?: boolean }) => !g.home);
      if (homeGames.length >= 2 && awayGames.length >= 2) {
        const avg = (arr: { value: number }[]) => Math.round((arr.reduce((s: number, v: { value: number }) => s + v.value, 0) / arr.length) * 10) / 10;
        const homeAvg = avg(homeGames);
        const awayAvg = avg(awayGames);
        const diff = Math.abs(homeAvg - awayAvg);
        const venueNote = diff > line * 0.15 ? (homeAvg > awayAvg ? "notably better at home" : "notably better on the road") : "similar home and away";
        charts.push({
          type: "bar",
          title: `${playerName} — ${statLabel} Home vs Away`,
          relevance: `Home: ${homeAvg}, Away: ${awayAvg} — ${venueNote}`,
          data: [
            { venue: "Home", average: homeAvg, propLine: line },
            { venue: "Away", average: awayAvg, propLine: line },
          ],
          xKey: "venue",
          yKeys: ["average", "propLine"],
        });
      }
    }

    // 5. vs Opponent if we have enough data
    if (gameValues && extraction.teams && extraction.teams.length > 0) {
      const opponentName = extraction.teams.find((t) =>
        !gameValues.some((g: { opponent?: string }) => g.opponent?.toLowerCase().includes(t.toLowerCase()))
      ) || extraction.teams[1] || extraction.teams[0];

      const vsOpponent = gameValues.filter((g: { opponent?: string }) => {
        const opp = g.opponent?.toLowerCase() || "";
        return extraction.teams?.some((t) => opp.includes(t.toLowerCase()) || t.toLowerCase().includes(opp));
      });

      if (vsOpponent.length > 0) {
        const avg = (arr: { value: number }[]) => Math.round((arr.reduce((s: number, v: { value: number }) => s + v.value, 0) / arr.length) * 10) / 10;
        const data = vsOpponent.map((g: { date: string; value: number; opponent?: string }, i: number) => ({
          game: g.date ? new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : `G${i + 1}`,
          [statLabel]: g.value,
          propLine: line,
        }));
        charts.push({
          type: "bar",
          title: `${playerName} — ${statLabel} vs ${opponentName}`,
          relevance: `${vsOpponent.length} games against this opponent — avg ${avg(vsOpponent)}`,
          data,
          xKey: "game",
          yKeys: [statLabel, "propLine"],
        });
      }
    }

    // 7. Opponent defensive context — how much does the other team allow?
    if (extraction.teams && extraction.teams.length >= 2 && Object.keys(computed.teamMetrics).length >= 2) {
      const teamNames = Object.keys(computed.teamMetrics);
      // Find the opponent team (not the player's team)
      const opponentMetrics = computed.teamMetrics[teamNames[1]] || computed.teamMetrics[teamNames[0]];
      if (opponentMetrics) {
        const oppAllows = opponentMetrics.scoring.avgPointsAgainst;
        const oppL5Allows = opponentMetrics.scoring.last5AvgAgainst;
        const data = [
          { metric: `${shortenName(opponentMetrics.name)} Season Avg Allowed`, value: oppAllows },
          { metric: `${shortenName(opponentMetrics.name)} Last 5 Avg Allowed`, value: oppL5Allows },
          { metric: `${playerName} Season Avg`, value: propAnalysis?.average || 0 },
          { metric: "Prop Line", value: line },
        ];
        const defTrend = oppL5Allows > oppAllows ? "allowing more recently — defense slipping" : "allowing less recently — defense tightening";
        charts.push({
          type: "bar",
          title: `Matchup Context — Opponent Defense`,
          relevance: `${opponentMetrics.name} allows ${oppAllows} pts/game, ${defTrend}`,
          data,
          xKey: "metric",
          yKeys: ["value"],
        });
      }
    }

    // Only build charts for the first player (primary prop target)
    break;
  }

  return charts;
}

// ── Player prop fallback (no player data available) ────────────────

function buildPlayerPropFallbackCharts(
  computed: ComputedAnalysis,
  extraction: { players: string[]; line?: number; market?: string; teams?: string[] }
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const teams = Object.values(computed.teamMetrics);
  const playerName = extraction.players[0] || "Player";
  const line = extraction.line ?? 0;
  const market = extraction.market || "Points";
  const statLabel = formatStatLabel(mapMarketToStatKey(market));

  // 1. Opponent scoring allowed trend (relevant for most props)
  if (teams.length > 0) {
    // Find the opponent team (not the player's team)
    const opponentTeam = teams.length > 1 ? teams[1] : teams[0];
    if (opponentTeam.recentGames.length >= 3) {
      const data = opponentTeam.recentGames.slice(-8).map((g, i) => ({
        game: `G${i + 1}`,
        allowed: g.opponentScore,
        scored: g.teamScore,
        opponent: shortenName(g.opponent),
      }));
      charts.push({
        type: "line",
        title: `${opponentTeam.name} — Points Allowed Trend`,
        relevance: `How much the opponent gives up — context for ${playerName}'s ${statLabel} prop`,
        data,
        xKey: "game",
        yKeys: ["allowed"],
      });
    }
  }

  // 2. Team comparison table (always useful context)
  if (teams.length === 2) {
    const data = [
      { stat: "Record", [shortenName(teams[0].name)]: `${teams[0].record.wins}-${teams[0].record.losses}`, [shortenName(teams[1].name)]: `${teams[1].record.wins}-${teams[1].record.losses}` },
      { stat: "Avg Pts For", [shortenName(teams[0].name)]: `${teams[0].scoring.avgPointsFor}`, [shortenName(teams[1].name)]: `${teams[1].scoring.avgPointsFor}` },
      { stat: "Avg Pts Against", [shortenName(teams[0].name)]: `${teams[0].scoring.avgPointsAgainst}`, [shortenName(teams[1].name)]: `${teams[1].scoring.avgPointsAgainst}` },
      { stat: "Pace (Avg Total)", [shortenName(teams[0].name)]: `${teams[0].scoring.avgTotalPoints}`, [shortenName(teams[1].name)]: `${teams[1].scoring.avgTotalPoints}` },
      { stat: "Last 5", [shortenName(teams[0].name)]: teams[0].recentForm.last5.join("-"), [shortenName(teams[1].name)]: teams[1].recentForm.last5.join("-") },
    ];
    charts.push({
      type: "table",
      title: "Team Context",
      relevance: `Team matchup context for ${playerName}'s ${statLabel} prop`,
      data,
      columns: [
        { key: "stat", label: "Stat" },
        { key: shortenName(teams[0].name), label: teams[0].name },
        { key: shortenName(teams[1].name), label: teams[1].name },
      ],
    });
  }

  // 3. H2H if available
  if (computed.headToHead && computed.headToHead.games.length > 0 && extraction.teams) {
    charts.push(buildH2HTable(computed, extraction.teams));
  }

  return charts;
}

/**
 * Infer market from bet description when market field is missing.
 * Handles common patterns like "3+ shots on goal", "over 5.5 assists", etc.
 */
function inferMarketFromDescription(extraction: { market?: string; description?: string }): string | null {
  const desc = (extraction.description || "").toLowerCase();
  if (!desc) return null;

  // NHL
  if (desc.includes("shot") && (desc.includes("goal") || desc.includes("sog"))) return "Shots on Goal";
  if (desc.includes("shot")) return "Shots";
  if (desc.includes("save")) return "Saves";
  if (desc.includes("power play") || desc.includes("pp goal")) return "Power Play Goals";
  if (desc.includes("goals against")) return "Goals Against";

  // NBA
  if (desc.includes("pts+reb+ast") || desc.includes("pra") || (desc.includes("points") && desc.includes("rebounds") && desc.includes("assists"))) return "Pts+Reb+Ast";
  if (desc.includes("three") || desc.includes("3-pointer") || desc.includes("3pt") || desc.includes("made three")) return "3-Pointers";
  if (desc.includes("rebound")) return "Rebounds";
  if (desc.includes("assist")) return "Assists";
  if (desc.includes("steal")) return "Steals";
  if (desc.includes("block") && !desc.includes("blocked shot")) return "Blocks";
  if (desc.includes("turnover")) return "Turnovers";
  if (desc.includes("point")) return "Points";

  // MLB
  if (desc.includes("strikeout") || desc.includes("k's")) return "Strikeouts";
  if (desc.includes("home run") || desc.includes("homer")) return "Home Runs";
  if (desc.includes("rbi") || desc.includes("runs batted")) return "RBIs";
  if (desc.includes("stolen base")) return "Stolen Bases";
  if (desc.includes("total bases")) return "Total Bases";
  if (desc.includes("hit") && !desc.includes("hit rate")) return "Hits";

  // Golf
  if (desc.includes("birdie")) return "Birdies";
  if (desc.includes("bogey")) return "Bogeys";

  // Generic goals (NHL/Soccer)
  if (desc.includes("goal") && !desc.includes("against")) return "Goals";

  return null;
}

function mapMarketToStatKey(market: string): string {
  const m = market.toLowerCase();
  // NHL
  if (m.includes("shot")) return "shots";
  if (m.includes("save")) return "saves";
  if (m.includes("goal") && !m.includes("against")) return "goals";
  if (m.includes("goals against")) return "goalsAgainst";
  if (m.includes("power play") || m.includes("pp goal")) return "powerPlayGoals";
  // NBA
  if (m.includes("point") || m.includes("pts")) return "pts";
  if (m.includes("rebound") || m.includes("reb")) return "reb";
  if (m.includes("assist") || m.includes("ast")) return "ast";
  if (m.includes("three") || m.includes("3p")) return "fg3m";
  if (m.includes("steal")) return "stl";
  if (m.includes("block") || m.includes("blk")) return "blk";
  if (m.includes("turnover")) return "turnover";
  if (m.includes("pts+reb+ast") || m.includes("pra")) return "pra";
  // MLB
  if (m.includes("strikeout") || m.includes("k's")) return "strikeOuts";
  if (m.includes("home run") || m.includes("hr")) return "homeRuns";
  if (m.includes("rbi") || m.includes("runs batted")) return "rbi";
  if (m.includes("stolen base") || m.includes("sb")) return "stolenBases";
  if (m.includes("total bases") || m.includes("tb")) return "totalBases";
  if (m.includes("hit")) return "hits";
  return "pts";
}

// ── Shared helpers ─────────────────────────────────────────────────

function buildH2HTable(
  computed: ComputedAnalysis,
  teamNames: string[]
): ChartConfig {
  const h2h = computed.headToHead!;
  const data = h2h.games.map((g) => ({
    date: g.date ? new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?",
    opponent: shortenName(g.opponent),
    result: g.won ? "W" : "L",
    score: `${g.teamScore}-${g.opponentScore}`,
    margin: g.margin > 0 ? `+${g.margin}` : `${g.margin}`,
    total: g.totalPoints,
  }));
  return {
    type: "table",
    title: `${teamNames[0]} vs ${teamNames[1]} — Recent Matchups`,
    relevance: `H2H record: ${h2h.team1Wins}-${h2h.team2Wins}, avg total: ${h2h.avgTotal}`,
    data,
    columns: [
      { key: "date", label: "Date" },
      { key: "result", label: "W/L" },
      { key: "score", label: "Score" },
      { key: "margin", label: "Margin" },
      { key: "total", label: "Total" },
    ],
  };
}

function marginDistribution(games: GameResult[]): { range: string; count: number }[] {
  const buckets: Record<string, number> = {
    "Loss 10+": 0,
    "Loss 5-9": 0,
    "Loss 1-4": 0,
    "Win 1-4": 0,
    "Win 5-9": 0,
    "Win 10+": 0,
  };
  for (const g of games) {
    const m = g.margin;
    if (m <= -10) buckets["Loss 10+"]++;
    else if (m <= -5) buckets["Loss 5-9"]++;
    else if (m < 0) buckets["Loss 1-4"]++;
    else if (m <= 4) buckets["Win 1-4"]++;
    else if (m <= 9) buckets["Win 5-9"]++;
    else buckets["Win 10+"]++;
  }
  return Object.entries(buckets).map(([range, count]) => ({ range, count }));
}

function shortenName(name: string): string {
  // "Los Angeles Lakers" → "Lakers", "Golden State Warriors" → "Warriors"
  const parts = name.split(" ");
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function formatStatLabel(stat: string): string {
  const map: Record<string, string> = {
    // NHL
    shots: "Shots",
    goals: "Goals",
    saves: "Saves",
    goalsAgainst: "Goals Against",
    powerPlayGoals: "PP Goals",
    // NBA
    pts: "Points",
    reb: "Rebounds",
    ast: "Assists",
    stl: "Steals",
    blk: "Blocks",
    fg3m: "3-Pointers",
    turnover: "Turnovers",
    pra: "Pts+Reb+Ast",
    "pts+reb": "Pts+Reb",
    "pts+ast": "Pts+Ast",
    "reb+ast": "Reb+Ast",
    // MLB
    hits: "Hits",
    homeRuns: "Home Runs",
    rbi: "RBIs",
    runs: "Runs",
    stolenBases: "Stolen Bases",
    totalBases: "Total Bases",
    strikeOuts: "Strikeouts",
    strikeOuts_pitching: "Strikeouts",
    earnedRuns: "Earned Runs",
    inningsPitched: "Innings Pitched",
    baseOnBalls: "Walks",
  };
  return map[stat] || stat;
}

function getSeasonAvgForStat(seasonAvg: Record<string, unknown> | null, stat: string): number {
  if (!seasonAvg) return 0;
  return (seasonAvg[stat] as number) || 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeHomeAwaySplit(gameLog: any[], stat: string, line: number = 0): { venue: string; average: number; propLine: number }[] | null {
  const home: number[] = [];
  const away: number[] = [];

  for (const g of gameLog) {
    // BDL pattern: game.home_team_id vs team.id
    if (g.game && g.team) {
      const isHome = g.game.home_team_id === g.team.id;
      const val = getStatFromGameLog(g, stat);
      if (isHome) home.push(val);
      else away.push(val);
    }
    // NHL pattern: homeRoadFlag
    else if (g.homeRoadFlag) {
      const val = g[stat] || 0;
      if (g.homeRoadFlag === "H") home.push(val);
      else away.push(val);
    }
  }

  if (home.length < 2 || away.length < 2) return null;

  const avg = (arr: number[]) => Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
  return [
    { venue: "Home", average: avg(home), propLine: line },
    { venue: "Away", average: avg(away), propLine: line },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStatFromGameLog(game: any, stat: string): number {
  // BDL has stats directly on the game object
  switch (stat) {
    case "pts": return game.pts || 0;
    case "reb": return game.reb || 0;
    case "ast": return game.ast || 0;
    case "stl": return game.stl || 0;
    case "blk": return game.blk || 0;
    case "fg3m": return game.fg3m || 0;
    case "turnover": return game.turnover || 0;
    case "pra": return (game.pts || 0) + (game.reb || 0) + (game.ast || 0);
    default: return game[stat] || 0;
  }
}
