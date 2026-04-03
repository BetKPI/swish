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

  // 1. Margin of victory trend with spread line
  for (const team of teams) {
    if (team.recentGames.length < 3) continue;
    const data = team.recentGames.slice(-10).map((g, i) => ({
      game: `G${i + 1}`,
      margin: g.margin,
      spreadLine: -line, // negative because spread is from opponent perspective
      opponent: shortenName(g.opponent),
    }));
    charts.push({
      type: "line",
      title: `${team.name} — Margin of Victory vs Spread`,
      relevance: `Shows whether ${team.name} is winning/losing by enough to cover ${line > 0 ? "+" : ""}${line}`,
      data,
      xKey: "game",
      yKeys: ["margin", "spreadLine"],
    });
  }

  // 2. Margin distribution — how often they win by buckets
  const primary = teams[0];
  if (primary && primary.recentGames.length >= 5) {
    const buckets = marginDistribution(primary.recentGames);
    charts.push({
      type: "bar",
      title: `${primary.name} — Win/Loss Margin Distribution`,
      relevance: `Shows clustering of margins — key for a ${line > 0 ? "+" : ""}${line} spread`,
      data: buckets,
      xKey: "range",
      yKeys: ["count"],
    });
  }

  // 3. Home/Away ATS comparison
  if (teams.length === 2) {
    const atsData = teams.map((t) => ({
      team: shortenName(t.name),
      coverRate: Math.round((t.ats?.coverRate ?? 0) * 100),
      homeWinPct: Math.round((t.homeRecord?.pct ?? 0) * 100),
      awayWinPct: Math.round((t.awayRecord?.pct ?? 0) * 100),
    }));
    charts.push({
      type: "bar",
      title: "ATS Cover Rate & Home/Away Win %",
      relevance: "Compares each team's ability to cover spreads and their venue splits",
      data: atsData,
      xKey: "team",
      yKeys: ["coverRate", "homeWinPct", "awayWinPct"],
    });
  }

  // 4. H2H table
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
      charts.push({
        type: "line",
        title: "Game Totals vs O/U Line",
        relevance: `Each team's recent game totals compared to the ${line} line`,
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

  // 2. Each team's offensive output trend
  for (const team of teams) {
    if (team.recentGames.length < 3) continue;
    const data = team.recentGames.slice(-10).map((g, i) => ({
      game: `G${i + 1}`,
      scored: g.teamScore,
      allowed: g.opponentScore,
      total: g.totalPoints,
    }));
    charts.push({
      type: "line",
      title: `${team.name} — Scoring & Defense Trend`,
      relevance: `Offensive and defensive output drives whether games go over or under`,
      data,
      xKey: "game",
      yKeys: ["scored", "allowed"],
    });
  }

  // 3. Over/Under hit rate bar
  if (line > 0) {
    const ouData = teams.map((t) => ({
      team: shortenName(t.name),
      overRate: Math.round((t.overUnder?.overRate ?? 0) * 100),
      overs: t.overUnder?.overs ?? 0,
      unders: t.overUnder?.unders ?? 0,
      avgTotal: t.overUnder?.avgTotal ?? 0,
    }));
    charts.push({
      type: "bar",
      title: `Over Rate at ${line}`,
      relevance: `How often each team's games go over ${line}`,
      data: ouData,
      xKey: "team",
      yKeys: ["overRate"],
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

  // 1. Implied probability vs actual win rate
  if (computed.oddsAnalysis) {
    const primary = teams[0];
    if (primary) {
      const data = [
        {
          metric: "Odds Imply",
          probability: Math.round(computed.oddsAnalysis.impliedProbability * 100),
        },
        {
          metric: "Actual Win %",
          probability: Math.round(primary.record.pct * 100),
        },
      ];
      if (primary.homeRecord) {
        data.push({
          metric: "Home Win %",
          probability: Math.round(primary.homeRecord.pct * 100),
        });
      }
      if (primary.awayRecord) {
        data.push({
          metric: "Away Win %",
          probability: Math.round(primary.awayRecord.pct * 100),
        });
      }
      charts.push({
        type: "bar",
        title: `${primary.name} — Odds vs Reality`,
        relevance: `Compares what the odds imply (${computed.oddsAnalysis.impliedProbabilityFormatted}) to actual performance`,
        data,
        xKey: "metric",
        yKeys: ["probability"],
      });
    }
  }

  // 2. Point differential trend
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

  // 3. Team comparison table
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

  // 4. H2H if available
  if (computed.headToHead && computed.headToHead.games.length > 0) {
    charts.push(buildH2HTable(computed, extraction.teams));
  }

  return charts;
}

// ── Player prop charts ─────────────────────────────────────────────

function buildPlayerPropCharts(
  computed: ComputedAnalysis,
  extraction: { players: string[]; line?: number; market?: string },
  rawData: Record<string, unknown>
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players = (rawData as any)?._players;
  if (!players) return charts;

  for (const playerName of extraction.players) {
    const pData = players[playerName];
    if (!pData) continue;

    const propAnalysis = pData.propAnalysis;
    const gameLog = pData.gameLog;
    const seasonAverages = pData.seasonAverages || pData.seasonStats;
    const line = extraction.line ?? 0;
    const stat = propAnalysis?.stat || "pts";
    const statLabel = formatStatLabel(stat);

    // 1. Game log trend with prop line — THE key chart
    if (propAnalysis?.gameValues?.length > 0) {
      const data = propAnalysis.gameValues
        .slice(-15)
        .reverse()
        .map((g: { date: string; value: number; hit: boolean; opponent?: string }, i: number) => ({
          game: `G${i + 1}`,
          [statLabel]: g.value,
          propLine: line,
          hit: g.hit ? "Over" : "Under",
        }));
      charts.push({
        type: "line",
        title: `${playerName} — ${statLabel} vs ${line} Line`,
        relevance: `Game-by-game ${statLabel} with the prop line overlaid — instantly see the hit rate`,
        data,
        xKey: "game",
        yKeys: [statLabel, "propLine"],
      });
    }

    // 2. Hit rate summary bar
    if (propAnalysis) {
      const data = [
        { label: "Over", count: propAnalysis.hitCount },
        { label: "Under", count: propAnalysis.totalGames - propAnalysis.hitCount },
      ];
      charts.push({
        type: "bar",
        title: `Hit Rate: ${statLabel} Over ${line}`,
        relevance: `${propAnalysis.hitCount}/${propAnalysis.totalGames} games (${Math.round(propAnalysis.hitRate * 100)}%) — ${propAnalysis.trend} trend`,
        data,
        xKey: "label",
        yKeys: ["count"],
      });
    }

    // 3. Season average vs line vs last 5 comparison
    if (propAnalysis || seasonAverages) {
      const avg = propAnalysis?.average ?? getSeasonAvgForStat(seasonAverages, stat);
      const last5 = propAnalysis?.last5Avg ?? avg;
      if (avg > 0) {
        const data = [
          { metric: "Season Avg", value: avg },
          { metric: "Last 5 Avg", value: last5 },
          { metric: "Prop Line", value: line },
        ];
        charts.push({
          type: "bar",
          title: `${playerName} — Average vs Line`,
          relevance: `Season average (${avg}) and recent form (${last5}) compared to the ${line} line`,
          data,
          xKey: "metric",
          yKeys: ["value"],
        });
      }
    }

    // 4. Home/away split if we have game log data
    if (gameLog && Array.isArray(gameLog) && gameLog.length > 0) {
      const homeAway = computeHomeAwaySplit(gameLog, stat);
      if (homeAway) {
        charts.push({
          type: "bar",
          title: `${playerName} — ${statLabel} Home vs Away`,
          relevance: "Venue split can reveal significant performance differences",
          data: homeAway,
          xKey: "venue",
          yKeys: ["average", "propLine"],
        });
      }
    }

    // Only build charts for the first player (primary prop target)
    break;
  }

  return charts;
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
function computeHomeAwaySplit(gameLog: any[], stat: string): { venue: string; average: number; propLine: number }[] | null {
  // BDL game logs have game.home_team_id — check if player's team is home
  // MLB game logs don't have this cleanly, so we try both patterns
  // For now, return null if we can't determine home/away
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const home: number[] = [];
  const away: number[] = [];

  for (const g of gameLog) {
    // BDL pattern
    if (g.game && g.team) {
      const isHome = g.game.home_team_id === g.team.id;
      const val = getStatFromGameLog(g, stat);
      if (isHome) home.push(val);
      else away.push(val);
    }
  }

  if (home.length < 2 || away.length < 2) return null;

  const avg = (arr: number[]) => Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
  return [
    { venue: "Home", average: avg(home), propLine: 0 },
    { venue: "Away", average: avg(away), propLine: 0 },
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
