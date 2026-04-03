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
  extraction: { players: string[]; line?: number; market?: string; teams?: string[] },
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
    const market = extraction.market || "Points";

    // Determine stat key from market
    const statKey = mapMarketToStatKey(market);
    const statLabel = formatStatLabel(statKey);

    // ESPN game log label mapping
    const espnStatMap: Record<string, string> = {
      pts: "PTS", reb: "REB", ast: "AST", stl: "STL", blk: "BLK",
      fg3m: "3PT", turnover: "TO", pra: "_pra",
      // MLB
      hits: "H", homeRuns: "HR", rbi: "RBI", strikeOuts: "SO",
      stolenBases: "SB", totalBases: "TB",
    };

    // Try propAnalysis first (BDL/MLB), fall back to ESPN game log
    let propAnalysis = pData.propAnalysis;
    const gameLog = pData.gameLog;

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

    // 1. Game log trend with prop line — THE key chart
    const gameValues = propAnalysis?.gameValues;
    if (gameValues && gameValues.length > 0) {
      const data = gameValues
        .slice(-15)
        .map((g: { date: string; value: number; hit: boolean; opponent?: string }, i: number) => ({
          game: g.opponent ? shortenName(g.opponent) : `G${i + 1}`,
          [statLabel]: g.value,
          propLine: line,
        }));
      charts.push({
        type: "line",
        title: `${playerName} — ${statLabel} This Season`,
        relevance: `Game-by-game ${statLabel} with the ${line} prop line — ${propAnalysis?.hitCount || 0}/${propAnalysis?.totalGames || 0} over`,
        data,
        xKey: "game",
        yKeys: [statLabel, "propLine"],
      });
    }

    // 2. Hit rate summary bar
    if (propAnalysis && propAnalysis.totalGames > 0) {
      const data = [
        { label: "Over", count: propAnalysis.hitCount },
        { label: "Under", count: propAnalysis.totalGames - propAnalysis.hitCount },
      ];
      charts.push({
        type: "bar",
        title: `Hit Rate: ${statLabel} Over ${line}`,
        relevance: `${propAnalysis.hitCount}/${propAnalysis.totalGames} games (${Math.round(propAnalysis.hitRate * 100)}%) — season hit rate`,
        data,
        xKey: "label",
        yKeys: ["count"],
      });
    }

    // 3. Season average vs line vs last 5 comparison
    if (propAnalysis && propAnalysis.average > 0) {
      const data = [
        { metric: "Season Avg", value: propAnalysis.average },
        { metric: "Last 5 Avg", value: propAnalysis.last5Avg },
        { metric: "Prop Line", value: line },
      ];
      charts.push({
        type: "bar",
        title: `${playerName} — Average vs Line`,
        relevance: `Season average (${propAnalysis.average}) and recent form (${propAnalysis.last5Avg}) compared to the ${line} line`,
        data,
        xKey: "metric",
        yKeys: ["value"],
      });
    }

    // 4. Home/away split from game log
    if (gameValues && gameValues.length > 3) {
      const homeGames = gameValues.filter((g: { home?: boolean }) => g.home);
      const awayGames = gameValues.filter((g: { home?: boolean }) => !g.home);
      if (homeGames.length >= 2 && awayGames.length >= 2) {
        const avg = (arr: { value: number }[]) => Math.round((arr.reduce((s: number, v: { value: number }) => s + v.value, 0) / arr.length) * 10) / 10;
        charts.push({
          type: "bar",
          title: `${playerName} — ${statLabel} Home vs Away`,
          relevance: `Home avg: ${avg(homeGames)}, Away avg: ${avg(awayGames)}`,
          data: [
            { venue: "Home", average: avg(homeGames), propLine: line },
            { venue: "Away", average: avg(awayGames), propLine: line },
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

  // 1. Odds implied probability if available
  if (computed.oddsAnalysis) {
    charts.push({
      type: "bar",
      title: `${playerName} ${statLabel} — Odds Breakdown`,
      relevance: `The odds imply ${computed.oddsAnalysis.impliedProbabilityFormatted} probability of hitting this prop`,
      data: [
        { metric: "Odds Imply", probability: Math.round(computed.oddsAnalysis.impliedProbability * 100) },
      ],
      xKey: "metric",
      yKeys: ["probability"],
    });
  }

  // 2. Opponent scoring allowed trend (relevant for most props)
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

  // 3. Team comparison table (always useful context)
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

  // 4. H2H if available
  if (computed.headToHead && computed.headToHead.games.length > 0 && extraction.teams) {
    charts.push(buildH2HTable(computed, extraction.teams));
  }

  return charts;
}

function mapMarketToStatKey(market: string): string {
  const m = market.toLowerCase();
  if (m.includes("point") || m.includes("pts")) return "pts";
  if (m.includes("rebound") || m.includes("reb")) return "reb";
  if (m.includes("assist") || m.includes("ast")) return "ast";
  if (m.includes("three") || m.includes("3p")) return "fg3m";
  if (m.includes("steal")) return "stl";
  if (m.includes("block")) return "blk";
  if (m.includes("strikeout")) return "strikeOuts";
  if (m.includes("hit")) return "hits";
  if (m.includes("home run")) return "homeRuns";
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
