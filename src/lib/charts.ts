/**
 * Deterministic chart builders for common bet types.
 * Charts are built from pre-computed data — no AI involved.
 */

import type { ChartConfig } from "@/types";
import type { ComputedAnalysis, TeamMetrics, GameResult } from "./analytics";
import { filterAndSortCharts } from "./chart-relevance";
import { detectExoticMarket, isGolfSport } from "./market-detect";

// ── Main router ────────────────────────────────────────────────────

export function buildCharts(
  betType: string,
  computed: ComputedAnalysis,
  extraction: {
    sport?: string;
    teams: string[];
    players: string[];
    line?: number;
    odds: string;
    market?: string;
    description?: string;
  },
  rawData: Record<string, unknown>
): ChartConfig[] {
  const sport = (extraction.sport || "").toUpperCase();
  const marketStr = extraction.market || "";
  const descStr = extraction.description || "";

  // Route to the right chart builder using centralized market detection
  let charts: ChartConfig[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = rawData as any;

  // Golf — completely different data structure
  if (isGolfSport(sport)) {
    // Check for hole-in-one market first
    const golfExotic = detectExoticMarket(marketStr, descStr, sport);
    if (golfExotic === "hole_in_one" && raw?._holeInOne) {
      charts = buildHoleInOneCharts(extraction, raw._holeInOne, raw._masters);
    } else {
      charts = buildGolfCharts(extraction, rawData);
    }
  }
  // Exotic markets — detected by keyword presence, not exact substring
  else {
    const exotic = detectExoticMarket(marketStr, descStr, sport);
    if (exotic === "first_basket" && raw?._firstBasket) {
      charts = buildFirstBasketCharts(extraction, raw._firstBasket);
    } else if (exotic === "nrfi" && (raw?._nrfi || raw?._teamNrfi)) {
      charts = buildNRFICharts(extraction, raw._nrfi, raw._teamNrfi);
    } else if (exotic === "first_goal" && raw?._firstGoal) {
      charts = buildFirstGoalCharts(extraction, raw._firstGoal);
    } else if (exotic === "double_double" && betType === "player_prop") {
      charts = buildDoubleDoubleCharts(extraction, rawData);
    } else if (exotic === "combo_prop" && betType === "player_prop") {
      charts = buildComboCharts(extraction, rawData);
    }
  }

  // Standard bet types (only if no exotic match)
  if (charts.length === 0 && !isGolfSport(sport)) {
    switch (betType) {
      case "spread":
        charts = buildSpreadCharts(computed, extraction);
        break;
      case "over_under":
        charts = buildOverUnderCharts(computed, extraction);
        break;
      case "moneyline":
        charts = buildMoneylineCharts(computed, extraction);
        break;
      case "player_prop":
        charts = buildPlayerPropCharts(computed, extraction, rawData);
        break;
    }
  }

  // Validate all charts — remove empty/invalid data before filtering
  const validated = charts.filter((c) => validateChart(c));

  // Filter and reorder all charts through the relevance system
  // This learns from user ratings — irrelevant charts get hidden over time
  return filterAndSortCharts(validated, sport, extraction.market || betType);
}

/**
 * Chart validation layer — catches bad data before it reaches the UI.
 * Filters out charts with empty data, all-zero values, or mismatched stats.
 */
function validateChart(chart: ChartConfig): boolean {
  // Must have data
  if (!chart.data || !Array.isArray(chart.data) || chart.data.length === 0) return false;

  // Tables just need rows
  if (chart.type === "table") return chart.data.length > 0;

  // For numeric charts, check that yKeys have at least some non-null, non-zero values
  const yKeys = chart.yKeys || [];
  if (yKeys.length === 0) return true; // no yKeys specified, let it through

  const hasRealData = chart.data.some((row) =>
    yKeys.some((k) => {
      const v = row[k];
      return v !== null && v !== undefined && v !== 0;
    })
  );
  return hasRealData;
}

// ── Golf charts ───────────────────────────────────────────────────

function buildGolfCharts(
  extraction: { players: string[]; line?: number; market?: string; description?: string },
  rawData: Record<string, unknown>
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players = (rawData as any)?._players;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const masters = (rawData as any)?._masters;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaderboard = (rawData as any)?.leaderboard;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tournamentStatus = (rawData as any)?.status as string | undefined; // "pre" | "in" | "post"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tournamentName = (rawData as any)?.tournament as string | undefined;
  const playerName = extraction.players[0] || "";
  const isTournamentStarted = tournamentStatus !== "pre";

  // Determine which charts are relevant based on market type
  const market = (extraction.market || extraction.description || "").toLowerCase();
  const isTopFinish = market.includes("top 5") || market.includes("top 10") || market.includes("top 20") || market.includes("top finish");
  const isWinner = market.includes("winner") || market.includes("win only") || market.includes("outright");
  const isFirstRound = market.includes("first round") || market.includes("round 1") || market.includes("r1 leader");
  const isMakeCut = market.includes("make cut") || market.includes("miss cut") || market.includes("make/miss");
  const isMatchup = market.includes("matchup") || market.includes("head-to-head") || market.includes("h2h") || market.includes("3-ball") || market.includes("3 ball");

  // 1. Current tournament leaderboard — show for winner/top finish/cut bets when tournament is live
  const showLeaderboard = isTournamentStarted && (isWinner || isTopFinish || isMakeCut || isFirstRound);
  if (showLeaderboard && leaderboard && Array.isArray(leaderboard) && leaderboard.length > 0) {
    const data = leaderboard.slice(0, 10).map((p: { position: number; name: string; score: string }) => ({
      pos: p.position,
      player: p.name === playerName ? `** ${p.name} **` : p.name,
      score: p.score,
      isTarget: p.name === playerName || p.name?.toLowerCase() === (playerName || "").toLowerCase(),
    }));
    const titlePrefix = tournamentStatus === "post" ? "Final Leaderboard" : "Current Leaderboard";
    charts.push({
      type: "table",
      title: tournamentName ? `${titlePrefix} — ${tournamentName}` : titlePrefix,
      relevance: `Where ${playerName} stands right now`,
      data,
      columns: [
        { key: "pos", label: "Pos" },
        { key: "player", label: "Player" },
        { key: "score", label: "Score" },
      ],
    });
  } else if (!isTournamentStarted && tournamentName && (isWinner || isTopFinish || isMakeCut)) {
    // Tournament hasn't started — show a status note only for position-based bets
    charts.push({
      type: "table",
      title: `${tournamentName} — Not Yet Started`,
      relevance: `The tournament hasn't started yet. Leaderboard will be available once play begins.`,
      data: [{ info: `${tournamentName} has not started yet. Check back once the first round begins.` }],
      columns: [{ key: "info", label: "Status" }],
    });
  }

  // 2. Player round-by-round scores — relevant for winner/top finish/cut bets
  const pData = players?.[playerName];
  if (isTournamentStarted && (isWinner || isTopFinish || isMakeCut || isFirstRound) && pData?.rounds && Array.isArray(pData.rounds) && pData.rounds.length > 0) {
    const data = pData.rounds.map((r: { round: number; strokes: number; toPar: string }) => ({
      round: `R${r.round}`,
      strokes: r.strokes,
      toPar: r.toPar,
    }));
    charts.push({
      type: "bar",
      title: `${playerName} — Round-by-Round Scores`,
      relevance: `Stroke totals each round — shows consistency and Sunday form`,
      data,
      xKey: "round",
      yKeys: ["strokes"],
    });
  }

  // 3. Masters hole-by-hole history (if available)
  if (masters && masters[playerName]) {
    const mData = masters[playerName];

    // Amen Corner analysis (holes 11-13) — the most famous stretch in golf
    if (mData.amenCorner && Array.isArray(mData.amenCorner) && mData.amenCorner.length > 0) {
      const data = mData.amenCorner.map((h: { hole: number; holeName: string; par: number; avgStrokes: number; birdieRate: number; bogeyRate: number; totalRounds: number }) => ({
        hole: `#${h.hole} ${h.holeName}`,
        par: h.par,
        avgStrokes: h.avgStrokes,
        birdieRate: `${h.birdieRate}%`,
        bogeyRate: `${h.bogeyRate}%`,
      }));
      charts.push({
        type: "table",
        title: `${playerName} — Amen Corner History`,
        relevance: `Holes 11-13 at Augusta across ${mData.amenCorner[0]?.totalRounds || 0} career rounds — where tournaments are won and lost`,
        data,
        columns: [
          { key: "hole", label: "Hole" },
          { key: "par", label: "Par" },
          { key: "avgStrokes", label: "Avg" },
          { key: "birdieRate", label: "Birdie %" },
          { key: "bogeyRate", label: "Bogey %" },
        ],
      });
    }

    // Full 18-hole performance at Augusta
    if (mData.holeByHole && Array.isArray(mData.holeByHole) && mData.holeByHole.length > 0) {
      const data = mData.holeByHole
        .filter((h: { totalRounds?: number }) => (h.totalRounds ?? 0) > 0)
        .map((h: { hole: number; holeName: string; par: number; avgStrokes: number; birdieRate: number; bogeyRate: number }) => ({
          hole: h.hole,
          name: h.holeName,
          par: h.par,
          avg: h.avgStrokes,
          vsPar: Math.round((h.avgStrokes - h.par) * 100) / 100,
        }));
      charts.push({
        type: "line",
        title: `${playerName} — Augusta Hole-by-Hole Avg vs Par`,
        relevance: `Where ${playerName} gains and loses strokes at Augusta across multiple Masters`,
        data,
        xKey: "hole",
        yKeys: ["vsPar"],
      });
    }

    // Sunday scoring history — only for winner/top finish bets (not relevant for cut/HIO)
    if ((isWinner || isTopFinish) && mData.sundays && Array.isArray(mData.sundays) && mData.sundays.length > 0) {
      const data = mData.sundays.map((s: { year: number; round4Score: number; round4ToPar: string; frontNine: number; backNine: number }) => ({
        year: String(s.year),
        total: s.round4Score,
        toPar: s.round4ToPar,
        front9: s.frontNine,
        back9: s.backNine,
      }));
      charts.push({
        type: "bar",
        title: `${playerName} — Masters Sunday Scores`,
        relevance: `Final round history — ${data.length} Sundays at Augusta. Back 9 pressure is where it matters.`,
        data,
        xKey: "year",
        yKeys: ["front9", "back9"],
      });
    }

    // Year-over-year total scores
    if (mData.history?.years && Array.isArray(mData.history.years) && mData.history.years.length > 0) {
      const data = mData.history.years.map((y: { year: number; totalScore?: number; totalToPar?: string }) => ({
        year: String(y.year),
        totalScore: y.totalScore || 0,
        toPar: y.totalToPar || "E",
      }));
      if (data.length >= 2) {
        charts.push({
          type: "bar",
          title: `${playerName} — Masters History`,
          relevance: `Total scores across ${data.length} Masters appearances`,
          data,
          xKey: "year",
          yKeys: ["totalScore"],
        });
      }
    }
  }

  return charts;
}

// ── Hole-in-One charts ───────────────────────────────────────────

// Known Masters hole-in-ones — public historical record
const MASTERS_HOLE_IN_ONES = [
  // Recent years with well-documented aces
  { year: 2025, player: "N/A (none recorded)", hole: 0, holeName: "-", round: 0 },
  { year: 2023, player: "Multiple", hole: 16, holeName: "Redbud", round: 3 },
  { year: 2020, player: "Tommy Fleetwood", hole: 16, holeName: "Redbud", round: 1 },
  { year: 2019, player: "Bryson DeChambeau", hole: 16, holeName: "Redbud", round: 1 },
  { year: 2018, player: "Matt Kuchar", hole: 16, holeName: "Redbud", round: 3 },
  { year: 2016, player: "Louis Oosthuizen", hole: 16, holeName: "Redbud", round: 1 },
  { year: 2016, player: "Davis Love III", hole: 16, holeName: "Redbud", round: 2 },
  { year: 2012, player: "Louis Oosthuizen", hole: 2, holeName: "Pink Dogwood", round: 4 },
  { year: 2012, player: "Bubba Watson", hole: 16, holeName: "Redbud", round: 2 },
  { year: 2004, player: "Padraig Harrington", hole: 16, holeName: "Redbud", round: 1 },
  { year: 2004, player: "Kirk Triplett", hole: 16, holeName: "Redbud", round: 3 },
  { year: 2004, player: "Chris DiMarco", hole: 6, holeName: "Juniper", round: 1 },
].filter((a) => a.hole > 0); // remove placeholder entries

function buildHoleInOneCharts(
  extraction: { players: string[]; market?: string; description?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hioData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mastersData?: any
): ChartConfig[] {
  const charts: ChartConfig[] = [];

  // 1. Key context — tournament-level HIO probability
  // ~95 aces in Masters history (1934-2025), most tournaments have 0-2
  // In recent era (2004-2025), roughly 60% of Masters have had at least one HIO
  const recentYears = 22; // 2004-2025
  const yearsWithAce = new Set(MASTERS_HOLE_IN_ONES.map((a) => a.year)).size;
  const acesByHole = [
    { hole: "#4 Flowering Crab Apple", par: 3, yards: 240, aces: MASTERS_HOLE_IN_ONES.filter((a) => a.hole === 4).length, note: "Longest par 3 — fewest aces" },
    { hole: "#6 Juniper", par: 3, yards: 180, aces: MASTERS_HOLE_IN_ONES.filter((a) => a.hole === 6).length, note: "Downhill, reachable" },
    { hole: "#12 Golden Bell", par: 3, yards: 155, aces: MASTERS_HOLE_IN_ONES.filter((a) => a.hole === 12).length, note: "Amen Corner — wind is unpredictable" },
    { hole: "#16 Redbud", par: 3, yards: 170, aces: MASTERS_HOLE_IN_ONES.filter((a) => a.hole === 16).length, note: "Most aces in Masters history" },
  ];

  // 2. Historical ace table by hole
  charts.push({
    type: "table",
    title: "Masters Hole-in-One History by Hole",
    relevance: `#16 Redbud produces the most aces. ~${Math.round((yearsWithAce / recentYears) * 100)}% of Masters (2004-2025) had at least one ace.`,
    data: acesByHole,
    columns: [
      { key: "hole", label: "Hole" },
      { key: "yards", label: "Yards" },
      { key: "aces", label: "Aces (recent)" },
      { key: "note", label: "Notes" },
    ],
  });

  // 3. Bar chart — aces by hole
  charts.push({
    type: "bar",
    title: "Aces by Par 3 Hole (2004-2025)",
    relevance: `Redbud (#16) is the ace hole — short, downhill, players go for it`,
    data: acesByHole.map((h) => ({ hole: h.hole.split(" ")[0], aces: h.aces })),
    xKey: "hole",
    yKeys: ["aces"],
  });

  // 4. Year-by-year HIO count
  const yearCounts: Record<number, number> = {};
  for (const ace of MASTERS_HOLE_IN_ONES) {
    yearCounts[ace.year] = (yearCounts[ace.year] || 0) + 1;
  }
  const yearData = Object.entries(yearCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, count]) => ({ year, aces: count }));
  if (yearData.length >= 3) {
    charts.push({
      type: "bar",
      title: "Hole-in-Ones Per Masters (Recent History)",
      relevance: `Shows how many aces per tournament — some years have multiple, some have none`,
      data: yearData,
      xKey: "year",
      yKeys: ["aces"],
    });
  }

  // 5. Full ace log table
  const aceLog = MASTERS_HOLE_IN_ONES.map((a) => ({
    year: a.year,
    player: a.player,
    hole: `#${a.hole} ${a.holeName}`,
    round: `R${a.round}`,
  }));
  if (aceLog.length > 0) {
    charts.push({
      type: "table",
      title: "Masters Hole-in-Ones — Full Record (Recent Era)",
      relevance: `${aceLog.length} recorded aces — #16 Redbud dominates`,
      data: aceLog,
      columns: [
        { key: "year", label: "Year" },
        { key: "player", label: "Player" },
        { key: "hole", label: "Hole" },
        { key: "round", label: "Round" },
      ],
    });
  }

  // 6. Par 3 scoring from our ESPN data (birdie/bogey rates) if available
  const holes = hioData?.holes || [];
  if (holes.length > 0) {
    const scoringData = holes
      .filter((h: { totalRounds?: number }) => (h.totalRounds ?? 0) > 0)
      .map((h: { hole: number; holeName: string; totalRounds: number; aces: number; aceRate: number }) => ({
        hole: `#${h.hole} ${h.holeName}`,
        rounds: h.totalRounds,
        aces: h.aces,
        aceRate: `${h.aceRate}%`,
      }));
    if (scoringData.length > 0) {
      charts.push({
        type: "table",
        title: "Par 3 Ace Rate — From Our Data (2019-2025)",
        relevance: `Computed from ${hioData.totalPar3Rounds} individual par-3 rounds in our dataset`,
        data: scoringData,
        columns: [
          { key: "hole", label: "Hole" },
          { key: "rounds", label: "Rounds" },
          { key: "aces", label: "Aces Found" },
          { key: "aceRate", label: "Ace Rate" },
        ],
      });
    }
  }

  return charts;
}

// ── First Basket / First Scorer charts ─────────────────────────────

function buildFirstBasketCharts(
  extraction: { players: string[]; teams: string[]; market?: string; description?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fbData: any
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const playerName = extraction.players[0] || "";
  const shortPlayer = playerName.split(" ").pop() || playerName;
  const pTeam = fbData.playerTeam;
  const oTeam = fbData.opponentTeam;
  const pTip = fbData.playerTipCenter;
  const oTip = fbData.opponentTipCenter;
  const tipMatchup = fbData.tipMatchup;

  // Helper: last name from "F. LastName" format
  const lastName = (n: string) => n.split(". ")[1] || n.split(" ").pop() || n;

  // 1. Tip-off matchup — head to head, compact
  const tipH2H = fbData.tipH2H;
  if (pTip && oTip) {
    const data: Record<string, unknown>[] = [
      { stat: "Center", [pTip.team + " *"]: lastName(pTip.name), [oTip.team]: lastName(oTip.name) },
    ];
    // H2H record first — most relevant
    if (tipH2H && tipH2H.total > 0) {
      data.push({ stat: "H2H Tips", [pTip.team + " *"]: `${tipH2H.playerWins}-${tipH2H.opponentWins}`, [oTip.team]: `${tipH2H.opponentWins}-${tipH2H.playerWins}` });
    }
    data.push(
      { stat: "Season", [pTip.team + " *"]: `${pTip.wins}-${pTip.losses} (${pTip.winRate}%)`, [oTip.team]: `${oTip.wins}-${oTip.losses} (${oTip.winRate}%)` },
    );
    const h2hNote = tipH2H && tipH2H.total > 0
      ? ` H2H: ${lastName(tipH2H.playerWins > tipH2H.opponentWins ? tipH2H.player : tipH2H.opponent)} leads ${Math.max(tipH2H.playerWins, tipH2H.opponentWins)}-${Math.min(tipH2H.playerWins, tipH2H.opponentWins)}.`
      : "";
    charts.push({
      type: "table",
      title: "Tip-Off Matchup",
      relevance: `${tipMatchup?.headToHead || "Who wins the tip?"}${h2hNote}`,
      data,
      columns: [
        { key: "stat", label: "" },
        { key: pTip.team + " *", label: `${pTip.team} *` },
        { key: oTip.team, label: oTip.team },
      ],
    });
  }

  // 2. First shot + first basket combined — one table per team
  // Player's team (marked with *)
  if (pTeam?.firstScorers?.length > 0) {
    const data = pTeam.firstScorers.slice(0, 5).map((p: { name: string; count: number; rate: number }, i: number) => {
      const fs = pTeam.firstShots?.find((s: { name: string }) => s.name === p.name);
      const isTarget = p.name.toLowerCase().includes(playerName.toLowerCase()) || playerName.toLowerCase().includes(p.name.toLowerCase());
      return {
        rank: i + 1,
        player: isTarget ? `${lastName(p.name)} *` : lastName(p.name),
        scored: `${p.count} (${p.rate}%)`,
        shot: fs ? `${fs.count} (${fs.rate}%)` : "-",
      };
    });
    charts.push({
      type: "table",
      title: `${pTeam.tricode} — First Basket (Your Bet)`,
      relevance: `${pTeam.totalGames} games. * = your player. Who scores first and who shoots first.`,
      data,
      columns: [
        { key: "rank", label: "#" },
        { key: "player", label: "Player" },
        { key: "scored", label: "1st Basket" },
        { key: "shot", label: "1st Shot" },
      ],
    });
  }

  // Opponent's team
  if (oTeam?.firstScorers?.length > 0) {
    const data = oTeam.firstScorers.slice(0, 5).map((p: { name: string; count: number; rate: number }, i: number) => {
      const fs = oTeam.firstShots?.find((s: { name: string }) => s.name === p.name);
      return {
        rank: i + 1,
        player: lastName(p.name),
        scored: `${p.count} (${p.rate}%)`,
        shot: fs ? `${fs.count} (${fs.rate}%)` : "-",
      };
    });
    charts.push({
      type: "table",
      title: `${oTeam.tricode} — First Basket (Opponent)`,
      relevance: `${oTeam.totalGames} games. Who scores first on the other side.`,
      data,
      columns: [
        { key: "rank", label: "#" },
        { key: "player", label: "Player" },
        { key: "scored", label: "1st Basket" },
        { key: "shot", label: "1st Shot" },
      ],
    });
  }

  // 3. Bar chart — both teams' top first basket scorers (only if BOTH teams have data)
  if (pTeam?.firstScorers?.length > 0 && oTeam?.firstScorers?.length > 0) {
    const barData: { player: string; rate: number; team: string }[] = [];
    for (const p of (pTeam.firstScorers).slice(0, 3)) {
      barData.push({ player: `${lastName(p.name)}`, rate: p.rate, team: pTeam.tricode || "?" });
    }
    for (const p of (oTeam.firstScorers).slice(0, 3)) {
      barData.push({ player: `${lastName(p.name)}`, rate: p.rate, team: oTeam.tricode || "?" });
    }
    charts.push({
      type: "bar",
      title: `First Basket Rate — ${pTeam.tricode} vs ${oTeam.tricode}`,
      relevance: `% of games each player scores first. ${shortPlayer} vs the field.`,
      data: barData,
      xKey: "player",
      yKeys: ["rate"],
    });
  }

  return charts;
}

// ── NRFI / First Inning charts ────────────────────────────────────

function buildNRFICharts(
  extraction: { players: string[]; teams: string[]; market?: string; description?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nrfiData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  teamNrfi?: any
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const pitcher = nrfiData?.pitcher;
  const recentGames = nrfiData?.recentGames || [];

  // 1. Specific pitcher data (if we have it)
  if (pitcher) {
    if (recentGames.length > 0) {
      const data = recentGames.map((g: { date: string; opponent: string; firstInningRuns: number; result: string }) => ({
        game: `vs ${g.opponent}`,
        runs: g.firstInningRuns,
        result: g.result,
        overLine: g.firstInningRuns > 0,
      }));
      charts.push({
        type: "hitrate",
        title: `${pitcher.name} — First Inning Results`,
        relevance: `${pitcher.cleanFirstInnings}/${pitcher.gamesStarted} clean first innings (${pitcher.firstInningCleanRate}% NRFI rate)`,
        data,
        xKey: "game",
        yKeys: ["runs"],
      });
    }

    charts.push({
      type: "table",
      title: `${pitcher.name} — First Inning Profile`,
      relevance: `How often this pitcher keeps the first inning scoreless`,
      data: [
        { stat: "NRFI Rate", value: `${pitcher.firstInningCleanRate}%` },
        { stat: "Games Started", value: String(pitcher.gamesStarted) },
        { stat: "Clean 1st Innings", value: String(pitcher.cleanFirstInnings) },
        { stat: "Avg 1st Inning Runs", value: pitcher.runsInFirstInning?.length > 0
          ? (pitcher.runsInFirstInning.reduce((a: number, b: number) => a + b, 0) / pitcher.runsInFirstInning.length).toFixed(2)
          : "N/A" },
      ],
      columns: [
        { key: "stat", label: "Stat" },
        { key: "value", label: "Value" },
      ],
    });
  }

  // 2. Team-level NRFI data — both teams' pitching staffs
  if (teamNrfi) {
    const team1 = teamNrfi.team1;
    const team2 = teamNrfi.team2;

    // Combined pitcher comparison table
    const allPitchers: { pitcher: string; team: string; nrfiRate: number; games: number; clean: number }[] = [];
    for (const p of (team1?.pitchers || [])) {
      allPitchers.push({ pitcher: p.name, team: shortenName(team1.name), nrfiRate: Math.round(p.nrfiRate), games: p.gamesStarted, clean: p.cleanFirstInnings });
    }
    for (const p of (team2?.pitchers || [])) {
      allPitchers.push({ pitcher: p.name, team: shortenName(team2.name), nrfiRate: Math.round(p.nrfiRate), games: p.gamesStarted, clean: p.cleanFirstInnings });
    }

    if (allPitchers.length > 0) {
      // Sort by games started descending (likely starters first)
      allPitchers.sort((a, b) => b.games - a.games);

      charts.push({
        type: "table",
        title: `Pitching Staff — First Inning NRFI Rates`,
        relevance: `Both teams' pitchers and how often they keep the 1st inning clean`,
        data: allPitchers.map((p) => ({
          pitcher: p.pitcher,
          team: p.team,
          nrfiRate: `${p.nrfiRate}%`,
          record: `${p.clean}/${p.games}`,
        })),
        columns: [
          { key: "pitcher", label: "Pitcher" },
          { key: "team", label: "Team" },
          { key: "nrfiRate", label: "NRFI %" },
          { key: "record", label: "Clean/GS" },
        ],
      });

      // Bar chart comparing NRFI rates — top pitchers from each team
      const topPitchers = allPitchers.filter((p) => p.games >= 2).slice(0, 8);
      if (topPitchers.length >= 2) {
        charts.push({
          type: "bar",
          title: `NRFI Rate Comparison — Likely Starters`,
          relevance: `Higher NRFI % = cleaner first innings. Look for the probable starter.`,
          data: topPitchers.map((p) => ({ pitcher: `${p.pitcher.split(" ").pop()} (${p.team})`, nrfiRate: p.nrfiRate })),
          xKey: "pitcher",
          yKeys: ["nrfiRate"],
        });
      }
    }

    // Recent first inning results for each team's top pitcher
    for (const team of [team1, team2]) {
      if (!team?.pitchers?.length) continue;
      const topP = team.pitchers.sort((a: { gamesStarted: number }, b: { gamesStarted: number }) => b.gamesStarted - a.gamesStarted)[0];
      if (topP?.recentGames?.length > 0) {
        const data = topP.recentGames.map((g: { opponent: string; firstInningRuns: number; result: string }) => ({
          game: `vs ${g.opponent}`,
          runs: g.firstInningRuns,
          overLine: g.firstInningRuns > 0,
        }));
        charts.push({
          type: "hitrate",
          title: `${topP.name} (${shortenName(team.name)}) — Recent 1st Innings`,
          relevance: `${topP.cleanFirstInnings}/${topP.gamesStarted} clean (${Math.round(topP.nrfiRate)}% NRFI)`,
          data,
          xKey: "game",
          yKeys: ["runs"],
        });
      }
    }
  }

  return charts;
}

// ── NHL First Goal charts ─────────────────────────────────────────

function buildFirstGoalCharts(
  extraction: { players: string[]; teams: string[] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fgData: any
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const playerName = extraction.players[0] || "";
  const player = fgData.player;
  const topScorers = fgData.topFirstScorers || [];

  // 1. Top first goal scorers leaderboard
  if (topScorers.length > 0) {
    const data = topScorers.map((p: { name: string; rate: number; count: number }) => ({
      player: p.name,
      firstGoalRate: `${p.rate}%`,
      timesFirst: p.count,
    }));
    if (player && player.firstGoalCount > 0 && !data.some((d: { player: string }) => d.player.toLowerCase().includes(playerName.toLowerCase()))) {
      data.push({ player: player.name, firstGoalRate: `${player.firstGoalRate}%`, timesFirst: player.firstGoalCount });
    }
    charts.push({
      type: "table",
      title: "First Goal Scorers — Recent Games",
      relevance: `Who actually scores first in NHL games. ${playerName}'s rate vs the league leaders.`,
      data,
      columns: [
        { key: "player", label: "Player" },
        { key: "firstGoalRate", label: "1st Goal %" },
        { key: "timesFirst", label: "Times First" },
      ],
    });
  }

  // 2. Player goal scoring profile
  if (player) {
    charts.push({
      type: "table",
      title: `${playerName} — Goal Scoring Profile`,
      relevance: `Goals per game, shooting %, and first goal rate`,
      data: [
        { stat: "First Goal Rate", value: `${player.firstGoalRate}%` },
        { stat: "Goals/Game", value: String(player.goalsPerGame) },
        { stat: "Shooting %", value: `${player.shootingPct}%` },
        { stat: "First Goals", value: String(player.firstGoalCount) },
      ],
      columns: [
        { key: "stat", label: "Stat" },
        { key: "value", label: "Value" },
      ],
    });

    // 3. Recent games bar chart
    if (player.recentGames?.length > 0) {
      const data = player.recentGames.map((g: { opponent: string; scoredFirst: boolean; goals: number }) => ({
        game: `vs ${g.opponent}`,
        goals: g.goals || 0,
        scoredFirst: g.scoredFirst ? "YES" : "No",
      }));
      charts.push({
        type: "bar",
        title: `${playerName} — Goals Per Game`,
        relevance: `Recent goal output — more goals = more chances to score first`,
        data,
        xKey: "game",
        yKeys: ["goals"],
      });
    }
  }

  return charts;
}

// ── Double-Double charts ──────────────────────────────────────────

function buildDoubleDoubleCharts(
  extraction: { players: string[]; line?: number; market?: string },
  rawData: Record<string, unknown>
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players = (rawData as any)?._players;
  const playerName = extraction.players[0] || "";
  const pData = players?.[playerName];
  if (!pData) return [];

  // Try to get game log values for PTS, REB, AST
  const gameLog = pData.gameLog || pData.gameLogs || [];
  if (!Array.isArray(gameLog) || gameLog.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = gameLog.slice(-15).map((g: any) => {
    const pts = Number(g.PTS || g.points || g.pts || 0);
    const reb = Number(g.REB || g.totalRebounds || g.reb || g.rebounds || 0);
    const ast = Number(g.AST || g.assists || g.ast || 0);
    const blk = Number(g.BLK || g.blocks || g.blk || 0);
    const stl = Number(g.STL || g.steals || g.stl || 0);
    const cats = [pts >= 10, reb >= 10, ast >= 10, blk >= 10, stl >= 10].filter(Boolean).length;
    return {
      game: g.opponent ? `vs ${shortenName(String(g.opponent))}` : `G${gameLog.indexOf(g) + 1}`,
      pts, reb, ast,
      isDD: cats >= 2,
      categories: cats,
    };
  });

  const ddCount = games.filter((g: { isDD: boolean }) => g.isDD).length;
  const ddRate = Math.round((ddCount / games.length) * 100);

  // 1. DD hit rate chart
  charts.push({
    type: "hitrate",
    title: `${playerName} — Double-Double Rate (Last ${games.length})`,
    relevance: `${ddCount}/${games.length} double-doubles (${ddRate}%)`,
    data: games.map((g: { game: string; isDD: boolean; categories: number }) => ({
      game: g.game,
      value: g.categories,
      overLine: g.isDD,
      line: 2,
    })),
    xKey: "game",
    yKeys: ["value"],
  });

  // 2. Game log table with all stats
  charts.push({
    type: "table",
    title: `${playerName} — Recent Multi-Stat Game Log`,
    relevance: `PTS/REB/AST per game — need 10+ in two categories for a double-double`,
    data: games.map((g: { game: string; pts: number; reb: number; ast: number; isDD: boolean }) => ({
      game: g.game,
      pts: g.pts,
      reb: g.reb,
      ast: g.ast,
      dd: g.isDD ? "DD" : "-",
    })),
    columns: [
      { key: "game", label: "Game" },
      { key: "pts", label: "PTS" },
      { key: "reb", label: "REB" },
      { key: "ast", label: "AST" },
      { key: "dd", label: "DD?" },
    ],
  });

  return charts;
}

// ── Combo Prop charts (PRA, Pts+Reb, etc.) ────────────────────────

function buildComboCharts(
  extraction: { players: string[]; line?: number; market?: string; description?: string; sport?: string },
  rawData: Record<string, unknown>
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players = (rawData as any)?._players;
  const playerName = extraction.players[0] || "";
  const pData = players?.[playerName];
  if (!pData) return [];

  const gameLog = pData.gameLog || pData.gameLogs || [];
  if (!Array.isArray(gameLog) || gameLog.length === 0) return [];

  const market = (extraction.market || extraction.description || "").toLowerCase();
  const line = extraction.line || 0;

  // Detect game log format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sample = gameLog[0] as any;
  const isBDL = sample?.game && (sample?.pts !== undefined || sample?.reb !== undefined); // BDLGameStats
  const isNHL = sample?.gameDate && (sample?.goals !== undefined || sample?.assists !== undefined || sample?.shots !== undefined);
  const isMLB = sample?.stat && typeof sample.stat === "object"; // MLBGameLog — nested stat object
  // ESPN format: has stats (not stat) object
  const isESPN = sample?.stats && typeof sample.stats === "object";

  // Determine which stats to combine based on market AND sport
  type StatExtractor = { key: string; label: string; extract: (g: Record<string, unknown>) => number };
  let statKeys: StatExtractor[] = [];

  // --- NBA combos ---
  if (market.includes("pra") || market.includes("pts+reb+ast") || market.includes("points+rebounds+assists") || market.includes("points rebounds assists")) {
    statKeys = nbaComboExtractors(["pts", "reb", "ast"], isBDL, isESPN);
  } else if (market.includes("pts+reb") || market.includes("points+rebounds")) {
    statKeys = nbaComboExtractors(["pts", "reb"], isBDL, isESPN);
  } else if (market.includes("pts+ast") || market.includes("points+assists")) {
    statKeys = nbaComboExtractors(["pts", "ast"], isBDL, isESPN);
  } else if (market.includes("reb+ast") || market.includes("rebounds+assists")) {
    statKeys = nbaComboExtractors(["reb", "ast"], isBDL, isESPN);
  }
  // --- NHL combos ---
  else if (market.includes("goals+assists") || market.includes("g+a")) {
    statKeys = [
      { key: "goals", label: "G", extract: (g) => Number(g.goals) || 0 },
      { key: "assists", label: "A", extract: (g) => Number(g.assists) || 0 },
    ];
  } else if (market.includes("shots+goals") || market.includes("sog+g")) {
    statKeys = [
      { key: "shots", label: "SOG", extract: (g) => Number(g.shots) || 0 },
      { key: "goals", label: "G", extract: (g) => Number(g.goals) || 0 },
    ];
  } else if (market.includes("points+shots") || market.includes("pts+sog")) {
    statKeys = [
      { key: "points", label: "PTS", extract: (g) => (Number(g.goals) || 0) + (Number(g.assists) || 0) },
      { key: "shots", label: "SOG", extract: (g) => Number(g.shots) || 0 },
    ];
  }
  // --- MLB combos ---
  else if (market.includes("h+r+rbi") || market.includes("hits+runs+rbi") || market.includes("hits runs rbi")) {
    statKeys = mlbComboExtractors(["hits", "runs", "rbi"]);
  } else if (market.includes("hits+runs") || market.includes("h+r")) {
    statKeys = mlbComboExtractors(["hits", "runs"]);
  } else if (market.includes("hits+rbi") || market.includes("h+rbi")) {
    statKeys = mlbComboExtractors(["hits", "rbi"]);
  } else if (market.includes("runs+rbi") || market.includes("r+rbi")) {
    statKeys = mlbComboExtractors(["runs", "rbi"]);
  } else if (market.includes("total bases+runs") || market.includes("tb+r")) {
    statKeys = mlbComboExtractors(["totalBases", "runs"]);
  }
  // --- Default: PRA (NBA) ---
  else {
    statKeys = nbaComboExtractors(["pts", "reb", "ast"], isBDL, isESPN);
  }

  const comboLabel = statKeys.map((s) => s.label).join("+");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = gameLog.slice(-15).map((g: any, i: number) => {
    // For MLB, extract from nested stat object
    const source = isMLB ? { ...g, ...g.stat } : g;
    const values: Record<string, number> = {};
    let total = 0;
    for (const sk of statKeys) {
      const v = sk.extract(source);
      values[sk.key] = v;
      total += v;
    }

    // Get opponent label depending on format
    let gameLabel: string;
    if (isBDL) {
      const playerTeamId = g.team?.id || g.player?.team_id || g.player?.team?.id;
      const homeTeamId = g.game?.home_team_id || g.game?.home_team?.id;
      const oppAbbr = playerTeamId === homeTeamId
        ? g.game?.visitor_team?.abbreviation
        : g.game?.home_team?.abbreviation;
      gameLabel = oppAbbr ? `vs ${oppAbbr}` : `G${i + 1}`;
    } else if (isNHL) {
      const opp = typeof g.opponentAbbrev === "string"
        ? g.opponentAbbrev
        : g.opponentAbbrev?.default || g.opponentCommonName?.default || "?";
      gameLabel = `vs ${opp}`;
    } else if (g.opponent) {
      gameLabel = `vs ${shortenName(String(g.opponent))}`;
    } else {
      gameLabel = `G${i + 1}`;
    }

    return {
      game: gameLabel,
      ...values,
      total,
      overLine: line > 0 ? total > line : false,
    };
  });

  const hitCount = line > 0 ? games.filter((g: { overLine: boolean }) => g.overLine).length : 0;
  const hitRate = line > 0 ? Math.round((hitCount / games.length) * 100) : 0;
  const avgTotal = games.length > 0 ? Math.round((games.reduce((s: number, g: { total: number }) => s + g.total, 0) / games.length) * 10) / 10 : 0;

  // 1. Hit rate bar chart
  if (line > 0) {
    charts.push({
      type: "hitrate",
      title: `${playerName} — ${comboLabel} vs ${line} Line`,
      relevance: `${hitCount}/${games.length} over the line (${hitRate}%) | avg ${avgTotal}`,
      data: games.map((g: { game: string; total: number; overLine: boolean }) => ({
        game: g.game,
        value: g.total,
        overLine: g.overLine,
        line,
      })),
      xKey: "game",
      yKeys: ["value"],
    });
  }

  // 2. Trend line with rolling average
  if (games.length >= 3) {
    const data = games.map((g: Record<string, unknown>, i: number) => {
      const window = games.slice(Math.max(0, i - 4), i + 1);
      const rollingAvg = Math.round((window.reduce((s: number, w: { total: number }) => s + w.total, 0) / window.length) * 10) / 10;
      const row: Record<string, unknown> = {
        game: g.game,
        [comboLabel]: g.total,
        rollingAvg: i >= 2 ? rollingAvg : undefined,
      };
      if (line > 0) row.propLine = line;
      return row;
    });
    const last3 = games.slice(-3);
    const last3Avg = Math.round((last3.reduce((s: number, g: { total: number }) => s + g.total, 0) / last3.length) * 10) / 10;
    const trendWord = last3Avg > avgTotal * 1.1 ? "hot streak" : last3Avg < avgTotal * 0.9 ? "cold stretch" : "steady";
    charts.push({
      type: "line",
      title: `${playerName} — ${comboLabel} Trend`,
      relevance: `Avg ${avgTotal}, last 3 avg ${last3Avg} — ${trendWord}`,
      data,
      xKey: "game",
      yKeys: [comboLabel, "rollingAvg", ...(line > 0 ? ["propLine"] : [])],
    });
  }

  // 3. Component breakdown table
  charts.push({
    type: "table",
    title: `${playerName} — ${comboLabel} Breakdown`,
    relevance: `Each stat component per game${line > 0 ? ` — need ${line}+ combined` : ""}`,
    data: games.map((g: Record<string, unknown>) => {
      const row: Record<string, unknown> = { game: g.game };
      for (const sk of statKeys) row[sk.key] = g[sk.key];
      row.total = g.total;
      return row;
    }),
    columns: [
      { key: "game", label: "Game" },
      ...statKeys.map((s) => ({ key: s.key, label: s.label })),
      { key: "total", label: "Total" },
    ],
  });

  // 4. Hit rate by window (last 5, 10, season) — only if we have a line
  if (line > 0 && games.length >= 5) {
    const last5 = games.slice(-5);
    const last10 = games.slice(-10);
    const l5Hit = last5.filter((g: { overLine: boolean }) => g.overLine).length;
    const l10Hit = last10.filter((g: { overLine: boolean }) => g.overLine).length;
    charts.push({
      type: "bar",
      title: `Hit Rate: ${comboLabel} Over ${line}`,
      relevance: `Hit rate by recency — trending ${l5Hit / Math.min(5, last5.length) > hitCount / games.length ? "up" : "down"}`,
      data: [
        { window: "Last 5", hitRate: Math.round((l5Hit / Math.min(5, last5.length)) * 100), games: `${l5Hit}/${Math.min(5, last5.length)}` },
        { window: "Last 10", hitRate: Math.round((l10Hit / Math.min(10, last10.length)) * 100), games: `${l10Hit}/${Math.min(10, last10.length)}` },
        { window: "Season", hitRate: hitRate, games: `${hitCount}/${games.length}` },
      ],
      xKey: "window",
      yKeys: ["hitRate"],
    });
  }

  return charts;
}

// Helper: build NBA combo extractors that handle BDL, ESPN, and generic formats
function nbaComboExtractors(
  stats: ("pts" | "reb" | "ast")[],
  isBDL: boolean,
  isESPN: boolean
): { key: string; label: string; extract: (g: Record<string, unknown>) => number }[] {
  const labelMap: Record<string, string> = { pts: "PTS", reb: "REB", ast: "AST" };
  return stats.map((s) => ({
    key: s,
    label: labelMap[s],
    extract: (g: Record<string, unknown>) => {
      if (isBDL) return Number(g[s]) || 0;
      if (isESPN) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const st = (g as any).stats;
        const espnKey = s === "pts" ? "PTS" : s === "reb" ? "REB" : "AST";
        return Number(st?.[espnKey]) || 0;
      }
      // Generic/fallback — covers multiple field names
      if (s === "pts") return Number(g.PTS || g.points || g.pts || 0);
      if (s === "reb") return Number(g.REB || g.totalRebounds || g.reb || g.rebounds || 0);
      if (s === "ast") return Number(g.AST || g.assists || g.ast || 0);
      return 0;
    },
  }));
}

// Helper: build MLB combo extractors (always use nested stat object, flattened before call)
function mlbComboExtractors(
  stats: string[]
): { key: string; label: string; extract: (g: Record<string, unknown>) => number }[] {
  const labelMap: Record<string, string> = {
    hits: "H", runs: "R", rbi: "RBI", totalBases: "TB",
    stolenBases: "SB", homeRuns: "HR",
  };
  return stats.map((s) => ({
    key: s,
    label: labelMap[s] || s,
    extract: (g: Record<string, unknown>) => Number(g[s]) || 0,
  }));
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
    const recent = team.recentGames.slice(-15);
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

  // 2. Matchup comparison table (0.69 effect — win%, opponent strength)
  if (teams.length === 2) {
    const t0 = teams[0], t1 = teams[1];
    const data = [
      { stat: "Record", [shortenName(t0.name)]: `${t0.record.wins}-${t0.record.losses}`, [shortenName(t1.name)]: `${t1.record.wins}-${t1.record.losses}` },
      // For alt spreads (cover rate > 90%), show blowout context instead of useless 100%
      ...(((t0.ats?.coverRate ?? 0) > 0.9 && (t1.ats?.coverRate ?? 0) > 0.9) ? [
        { stat: "Worst Loss", [shortenName(t0.name)]: `${Math.min(...t0.recentGames.map(g => g.margin))}`, [shortenName(t1.name)]: `${Math.min(...t1.recentGames.map(g => g.margin))}` },
        { stat: "Avg Loss Margin", [shortenName(t0.name)]: (() => { const losses = t0.recentGames.filter(g => g.margin < 0); return losses.length > 0 ? `${Math.round(losses.reduce((s, g) => s + g.margin, 0) / losses.length)}` : "N/A"; })(), [shortenName(t1.name)]: (() => { const losses = t1.recentGames.filter(g => g.margin < 0); return losses.length > 0 ? `${Math.round(losses.reduce((s, g) => s + g.margin, 0) / losses.length)}` : "N/A"; })() },
        { stat: "Blowout Losses (15+)", [shortenName(t0.name)]: `${t0.recentGames.filter(g => g.margin <= -15).length}/${t0.recentGames.length}`, [shortenName(t1.name)]: `${t1.recentGames.filter(g => g.margin <= -15).length}/${t1.recentGames.length}` },
      ] : [
        { stat: "ATS Cover Rate", [shortenName(t0.name)]: `${Math.round((t0.ats?.coverRate ?? 0) * 100)}%`, [shortenName(t1.name)]: `${Math.round((t1.ats?.coverRate ?? 0) * 100)}%` },
      ]),
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

  // 3. Margin distribution — how often they win by buckets (0.79 effect)
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

  // 4. H2H table
  if (computed.headToHead && computed.headToHead.games.length > 0) {
    charts.push(buildH2HTable(computed, extraction.teams));
  }

  // 5. Home vs Away Splits table
  for (const team of teams) {
    const homeGames = team.recentGames.filter((g) => g.home);
    const awayGames = team.recentGames.filter((g) => !g.home);
    if (homeGames.length >= 2 && awayGames.length >= 2) {
      const avgG = (arr: GameResult[], fn: (g: GameResult) => number) =>
        arr.length > 0 ? Math.round((arr.reduce((s, g) => s + fn(g), 0) / arr.length) * 10) / 10 : 0;
      const homeWins = homeGames.filter((g) => g.won).length;
      const awayWins = awayGames.filter((g) => g.won).length;
      const homeCovers = homeGames.filter((g) => g.margin + line > 0).length;
      const awayCovers = awayGames.filter((g) => g.margin + line > 0).length;
      const data = [
        { stat: "Record", Home: `${homeWins}-${homeGames.length - homeWins}`, Away: `${awayWins}-${awayGames.length - awayWins}` },
        { stat: "Win %", Home: `${Math.round((homeWins / homeGames.length) * 100)}%`, Away: `${Math.round((awayWins / awayGames.length) * 100)}%` },
        { stat: "Avg Points For", Home: `${avgG(homeGames, (g) => g.teamScore)}`, Away: `${avgG(awayGames, (g) => g.teamScore)}` },
        { stat: "Avg Points Against", Home: `${avgG(homeGames, (g) => g.opponentScore)}`, Away: `${avgG(awayGames, (g) => g.opponentScore)}` },
        { stat: "ATS Cover Rate", Home: `${Math.round((homeCovers / homeGames.length) * 100)}%`, Away: `${Math.round((awayCovers / awayGames.length) * 100)}%` },
      ];
      charts.push({
        type: "table",
        title: `${team.name} — Home vs Away Splits`,
        relevance: `Home ${homeWins}-${homeGames.length - homeWins} (${Math.round((homeCovers / homeGames.length) * 100)}% ATS), Away ${awayWins}-${awayGames.length - awayWins} (${Math.round((awayCovers / awayGames.length) * 100)}% ATS)`,
        data,
        columns: [
          { key: "stat", label: "" },
          { key: "Home", label: "Home" },
          { key: "Away", label: "Away" },
        ],
      });
    }
  }

  // 6. Close games record — games decided by 6 or fewer (0.25 effect — weakly useful)
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
      // Table format avoids confusing side-by-side bars comparing different teams' W/L
      const tableData = closeGamesData.map((d) => ({
        team: d.team,
        record: `${d.closeWins}-${d.closeLosses}`,
        winPct: d.closeGames > 0 ? `${Math.round((d.closeWins / d.closeGames) * 100)}%` : "-",
        avgMargin: d.avgCloseMargin > 0 ? `+${d.avgCloseMargin}` : `${d.avgCloseMargin}`,
        games: `${d.closeGames}`,
      }));
      charts.push({
        type: "table",
        title: "Close Games Record (decided by 6 or fewer)",
        relevance: `Spreads often come down to close games — ${closeGamesData.map((d) => `${d.team} ${d.closeWins}-${d.closeLosses}`).join(", ")} in tight ones`,
        data: tableData,
        columns: [
          { key: "team", label: "Team" },
          { key: "record", label: "Record" },
          { key: "winPct", label: "Win %" },
          { key: "avgMargin", label: "Avg Margin" },
          { key: "games", label: "Games" },
        ],
      });
    }
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
    const maxLen = Math.min(teams[0].recentGames.length, teams[1].recentGames.length, 15);
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

  // Scoring & Defense Trend removed — backtesting shows scoring trend
  // has near-zero predictive power for O/U (0.02–0.07 effect size).

  return charts;
}

// ── Moneyline charts ───────────────────────────────────────────────

function buildMoneylineCharts(
  computed: ComputedAnalysis,
  extraction: { teams: string[]; odds: string }
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const teams = Object.values(computed.teamMetrics);

  // 1. Team comparison table (0.54 effect — win%, margin, differential)
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

  // 2. Point differential trend — best ML predictor
  for (const team of teams) {
    if (team.recentGames.length < 3) continue;
    let runningDiff = 0;
    const data = team.recentGames.slice(-15).map((g, i) => {
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

  // Scoring Trend removed — raw scoring numbers are noise for ML
  // (0.02 effect size). Point differential (above) is what matters.

  // 3. Home vs Away Splits table — full season
  for (const team of teams) {
    const homeGames = team.recentGames.filter((g) => g.home);
    const awayGames = team.recentGames.filter((g) => !g.home);
    if (homeGames.length >= 2 && awayGames.length >= 2) {
      const avgG = (arr: GameResult[], fn: (g: GameResult) => number) =>
        arr.length > 0 ? Math.round((arr.reduce((s, g) => s + fn(g), 0) / arr.length) * 10) / 10 : 0;
      const homeWins = homeGames.filter((g) => g.won).length;
      const awayWins = awayGames.filter((g) => g.won).length;
      const homeAvgMargin = avgG(homeGames, (g) => g.margin);
      const awayAvgMargin = avgG(awayGames, (g) => g.margin);
      const data = [
        { stat: "Record", Home: `${homeWins}-${homeGames.length - homeWins}`, Away: `${awayWins}-${awayGames.length - awayWins}` },
        { stat: "Win %", Home: `${Math.round((homeWins / homeGames.length) * 100)}%`, Away: `${Math.round((awayWins / awayGames.length) * 100)}%` },
        { stat: "Avg Margin", Home: `${homeAvgMargin > 0 ? "+" : ""}${homeAvgMargin}`, Away: `${awayAvgMargin > 0 ? "+" : ""}${awayAvgMargin}` },
        { stat: "Avg Points For", Home: `${avgG(homeGames, (g) => g.teamScore)}`, Away: `${avgG(awayGames, (g) => g.teamScore)}` },
        { stat: "Avg Points Against", Home: `${avgG(homeGames, (g) => g.opponentScore)}`, Away: `${avgG(awayGames, (g) => g.opponentScore)}` },
        { stat: "Games", Home: `${homeGames.length}`, Away: `${awayGames.length}` },
      ];
      charts.push({
        type: "table",
        title: `${team.name} — Home vs Away (Full Season)`,
        relevance: `Home ${homeWins}-${homeGames.length - homeWins} (${Math.round((homeWins / homeGames.length) * 100)}% W), Away ${awayWins}-${awayGames.length - awayWins} (${Math.round((awayWins / awayGames.length) * 100)}% W) across ${team.recentGames.length} games`,
        data,
        columns: [
          { key: "stat", label: "" },
          { key: "Home", label: `Home (${homeGames.length}g)` },
          { key: "Away", label: `Away (${awayGames.length}g)` },
        ],
      });
    }
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
      "pts+reb": "_pts+reb", "pts+ast": "_pts+ast", "reb+ast": "_reb+ast",
      // NHL
      shots: "SOG", goals: "G", saves: "SV",
      "goals+assists": "_goals+assists", "shots+goals": "_shots+goals", "points+shots": "_points+shots",
      // MLB
      hits: "H", homeRuns: "HR", rbi: "RBI", strikeOuts: "SO",
      stolenBases: "SB", totalBases: "TB",
      "hits+runs+rbi": "_hits+runs+rbi", "hits+runs": "_hits+runs",
      "hits+rbi": "_hits+rbi", "runs+rbi": "_runs+rbi", "totalBases+runs": "_totalBases+runs",
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
        // Combo stats map to themselves — handled below
        "goals+assists": "goals+assists", "shots+goals": "shots+goals", "points+shots": "points+shots",
      };
      const nhlKey = nhlStatMap[statKey] || statKey;
      const values = gameLog.map((g: { gameDate: string; opponentAbbrev?: string | { default: string }; opponentCommonName?: { default: string }; homeRoadFlag?: string; [k: string]: unknown }) => {
        let val: number;
        if (statKey === "points" || nhlKey === "points") {
          val = (Number(g.goals) || 0) + (Number(g.assists) || 0);
        } else if (statKey === "goals+assists") {
          val = (Number(g.goals) || 0) + (Number(g.assists) || 0);
        } else if (statKey === "shots+goals") {
          val = (Number(g.shots) || 0) + (Number(g.goals) || 0);
        } else if (statKey === "points+shots") {
          val = (Number(g.goals) || 0) + (Number(g.assists) || 0) + (Number(g.shots) || 0);
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
        } else if (statKey === "pts+reb") {
          val = (Number(g.stats.PTS) || 0) + (Number(g.stats.REB) || 0);
        } else if (statKey === "pts+ast") {
          val = (Number(g.stats.PTS) || 0) + (Number(g.stats.AST) || 0);
        } else if (statKey === "reb+ast") {
          val = (Number(g.stats.REB) || 0) + (Number(g.stats.AST) || 0);
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
        // Combo stats map to themselves — handled below
        "hits+runs+rbi": "hits+runs+rbi", "hits+runs": "hits+runs",
        "hits+rbi": "hits+rbi", "runs+rbi": "runs+rbi", "totalBases+runs": "totalBases+runs",
      };
      const mlbKey = mlbStatKeyMap[statKey] || statKey;
      const values = gameLog.map((g: { date: string; opponent: string; stat: Record<string, unknown>; isHome?: boolean }) => {
        let val: number;
        if (statKey === "hits+runs+rbi") {
          val = (Number(g.stat.hits) || 0) + (Number(g.stat.runs) || 0) + (Number(g.stat.rbi) || 0);
        } else if (statKey === "hits+runs") {
          val = (Number(g.stat.hits) || 0) + (Number(g.stat.runs) || 0);
        } else if (statKey === "hits+rbi") {
          val = (Number(g.stat.hits) || 0) + (Number(g.stat.rbi) || 0);
        } else if (statKey === "runs+rbi") {
          val = (Number(g.stat.runs) || 0) + (Number(g.stat.rbi) || 0);
        } else if (statKey === "totalBases+runs") {
          val = (Number(g.stat.totalBases) || 0) + (Number(g.stat.runs) || 0);
        } else if (mlbKey === "inningsPitched") {
          val = parseFloat(String(g.stat[mlbKey] || "0"));
        } else {
          val = Number(g.stat[mlbKey]) || 0;
        }
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

    // 1. Hit Rate visual — Props.Cash-style per-game bar chart (green/red)
    const gameValues = propAnalysis?.gameValues;
    if (gameValues && gameValues.length > 0 && line > 0) {
      const hitRateRecent = gameValues.slice(-15);
      const hitRateN = hitRateRecent.length;
      const hitRateOverCount = hitRateRecent.filter((g: { hit: boolean }) => g.hit).length;
      const hitRatePct = Math.round((hitRateOverCount / hitRateN) * 100);
      const hitRateData = hitRateRecent.map((g: { date: string; value: number; hit: boolean; opponent?: string }, i: number) => ({
        game: g.opponent ? shortenName(g.opponent) : `G${i + 1}`,
        value: g.value,
        overLine: g.hit,
        hitRate: hitRatePct,
        line,
      }));
      charts.push({
        type: "hitrate" as ChartConfig["type"],
        title: `${playerName} — Last ${hitRateN} Games vs ${line} ${statLabel} Line`,
        relevance: `${hitRateOverCount}/${hitRateN} over the line (${hitRatePct}%)`,
        data: hitRateData,
        xKey: "game",
        yKeys: ["value"],
      });
    }

    // 2. Game log trend with rolling average — THE key chart
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
      // Trend direction: last 5 avg vs season avg
      const last5Vals = recent.slice(-5);
      const last5TrendAvg = last5Vals.length > 0 ? Math.round((last5Vals.reduce((s: number, g: { value: number }) => s + g.value, 0) / last5Vals.length) * 10) / 10 : 0;
      const trendDirection = last5TrendAvg > seasonAvg * 1.05 ? "Trending up" : last5TrendAvg < seasonAvg * 0.95 ? "Trending down" : "Trending flat";
      charts.push({
        type: "line",
        title: `${playerName} — ${statLabel} Trend (Last ${recent.length})`,
        relevance: `${trendDirection} — last 5 avg ${last5TrendAvg} vs season avg ${seasonAvg} | ${propAnalysis?.hitCount || 0}/${propAnalysis?.totalGames || 0} over ${line} (${Math.round((propAnalysis?.hitRate || 0) * 100)}%), on a ${trendWord} (last 3: ${Math.round(last3Avg * 10) / 10})`,
        data,
        xKey: "game",
        yKeys: [statLabel, "rollingAvg", "propLine"],
      });
    }

    // 3. Hit rate breakdown by window — last 5, 10, and full season
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

    // 4. Value distribution — how often does he hit each range
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

    // 6. vs Opponent if we have enough data
    if (gameValues && extraction.teams && extraction.teams.length >= 2) {
      // Figure out which team is the opponent (not the player's team)
      // The player's team will NOT appear in their game log opponents
      // The opponent team WILL appear if they've played against them
      const teamMatchCounts = extraction.teams.map((t) => ({
        name: t,
        matches: gameValues.filter((g: { opponent?: string }) => {
          const opp = g.opponent?.toLowerCase() || "";
          return opp.includes(t.toLowerCase()) || t.toLowerCase().includes(opp);
        }).length,
      }));
      // The team with MORE matches in the opponent column is the actual opponent
      // (the player's own team should have 0 matches since you don't play against yourself)
      const sorted = [...teamMatchCounts].sort((a, b) => b.matches - a.matches);
      const opponentName = sorted[0].matches > 0 ? sorted[0].name : sorted[1]?.name || extraction.teams[1];

      const vsOpponent = gameValues.filter((g: { opponent?: string }) => {
        const opp = g.opponent?.toLowerCase() || "";
        return opp.includes(opponentName.toLowerCase()) || opponentName.toLowerCase().includes(opp);
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
      // Find the opponent team: check which team the player is NOT on
      // by seeing which team shows up in the game log opponents
      const opponentTeamName = gameValues ? (() => {
        const counts = extraction.teams!.map((t) => ({
          name: t,
          matches: gameValues.filter((g: { opponent?: string }) => {
            const opp = g.opponent?.toLowerCase() || "";
            return opp.includes(t.toLowerCase()) || t.toLowerCase().includes(opp);
          }).length,
        }));
        const sorted = [...counts].sort((a, b) => b.matches - a.matches);
        return sorted[0]?.matches > 0 ? sorted[0].name : extraction.teams![1];
      })() : extraction.teams[1];
      const opponentMetrics = computed.teamMetrics[opponentTeamName] || Object.values(computed.teamMetrics)[1] || Object.values(computed.teamMetrics)[0];
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

    // 8. Rest day impact — performance by days of rest between games
    if (gameValues && gameValues.length >= 6) {
      // Sort by date ascending to compute rest days
      const sorted = [...gameValues]
        .filter((g: { date: string }) => g.date)
        .sort((a: { date: string }, b: { date: string }) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const buckets: { name: string; games: number; totalVal: number; hits: number }[] = [
        { name: "Back-to-back (0-1d)", games: 0, totalVal: 0, hits: 0 },
        { name: "Normal rest (2-3d)", games: 0, totalVal: 0, hits: 0 },
        { name: "Extended rest (4+d)", games: 0, totalVal: 0, hits: 0 },
      ];

      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1].date).getTime();
        const curr = new Date(sorted[i].date).getTime();
        const restDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        const g = sorted[i] as { value: number; hit: boolean };
        const bucketIdx = restDays <= 1 ? 0 : restDays <= 3 ? 1 : 2;
        buckets[bucketIdx].games++;
        buckets[bucketIdx].totalVal += g.value;
        if (g.hit) buckets[bucketIdx].hits++;
      }

      const activeBuckets = buckets.filter((b) => b.games >= 2);
      if (activeBuckets.length >= 2) {
        const data = activeBuckets.map((b) => ({
          bucket: b.name,
          games: b.games,
          avgValue: Math.round((b.totalVal / b.games) * 10) / 10,
          hitRate: Math.round((b.hits / b.games) * 100),
        }));
        const avgs = activeBuckets.map((b) => b.totalVal / b.games);
        const maxAvg = Math.max(...avgs);
        const minAvg = Math.min(...avgs);
        const diffPct = minAvg > 0 ? Math.round(((maxAvg - minAvg) / minAvg) * 100) : 0;
        const bestBucket = activeBuckets[avgs.indexOf(maxAvg)].name;
        const meaningful = diffPct >= 10;
        charts.push({
          type: "table" as ChartConfig["type"],
          title: `${playerName} — ${statLabel} by Rest Days`,
          relevance: meaningful
            ? `Meaningful rest impact: best with ${bestBucket} (${diffPct}% higher avg) — consider schedule context`
            : `Minimal rest impact (${diffPct}% difference between buckets) — rest days not a major factor`,
          data,
          xKey: "bucket",
          yKeys: ["games", "avgValue", "hitRate"],
        });
      }
    }

    // 9. Minutes / TOI correlation — performance in high vs low playing-time games
    if (gameValues && gameValues.length >= 6 && Array.isArray(gameLog) && gameLog.length > 0) {
      // Extract minutes from raw game logs — supports NBA (min), NHL (toi), ESPN (stats.MIN / stats.minutes)
      const parseMinutes = (raw: string | number | undefined): number | null => {
        if (raw === undefined || raw === null || raw === "") return null;
        if (typeof raw === "number") return raw;
        const str = String(raw);
        // "34:20" or "18:45" format
        if (str.includes(":")) {
          const [m, s] = str.split(":");
          return Number(m) + (Number(s) || 0) / 60;
        }
        const n = parseFloat(str);
        return isNaN(n) ? null : n;
      };

      // Try to get minutes from each game log entry
      const minutesValues: (number | null)[] = gameLog.map((g: Record<string, unknown>) => {
        // BDL NBA: min field
        if (g.min !== undefined) return parseMinutes(g.min as string | number);
        // NHL: toi or timeOnIce
        if (g.toi !== undefined) return parseMinutes(g.toi as string);
        if (g.timeOnIce !== undefined) return parseMinutes(g.timeOnIce as string);
        // ESPN: stats.MIN or stats.minutes
        const stats = g.stats as Record<string, unknown> | undefined;
        if (stats) {
          if (stats.MIN !== undefined) return parseMinutes(stats.MIN as string | number);
          if (stats.minutes !== undefined) return parseMinutes(stats.minutes as string | number);
        }
        return null;
      });

      // Only proceed if we have minutes data (skip MLB which won't have it)
      const validCount = minutesValues.filter((m) => m !== null && m > 0).length;
      if (validCount >= 6) {
        // Correlate game log entries with gameValues by index (both should be same order)
        // Build paired data: { value, hit, minutes }
        const paired: { value: number; hit: boolean; minutes: number }[] = [];
        const len = Math.min(gameValues.length, minutesValues.length);
        for (let i = 0; i < len; i++) {
          const mins = minutesValues[i];
          if (mins !== null && mins > 0) {
            const gv = gameValues[i] as { value: number; hit: boolean };
            paired.push({ value: gv.value, hit: gv.hit, minutes: mins });
          }
        }

        if (paired.length >= 6) {
          // Find median minutes
          const sortedMins = paired.map((p) => p.minutes).sort((a, b) => a - b);
          const median = sortedMins[Math.floor(sortedMins.length / 2)];

          const highMin = paired.filter((p) => p.minutes >= median);
          const lowMin = paired.filter((p) => p.minutes < median);

          if (highMin.length >= 2 && lowMin.length >= 2) {
            const avg = (arr: { value: number }[]) =>
              Math.round((arr.reduce((s, v) => s + v.value, 0) / arr.length) * 10) / 10;
            const hitPct = (arr: { hit: boolean }[]) =>
              Math.round((arr.filter((g) => g.hit).length / arr.length) * 100);

            const highAvg = avg(highMin);
            const lowAvg = avg(lowMin);
            const highHitRate = hitPct(highMin);
            const lowHitRate = hitPct(lowMin);
            const medianRounded = Math.round(median * 10) / 10;

            const data = [
              { group: `High (≥${medianRounded} min)`, games: highMin.length, avgValue: highAvg, hitRate: highHitRate },
              { group: `Low (<${medianRounded} min)`, games: lowMin.length, avgValue: lowAvg, hitRate: lowHitRate },
            ];

            const diffPct = lowAvg > 0 ? Math.round(((highAvg - lowAvg) / lowAvg) * 100) : 0;
            const meaningful = Math.abs(diffPct) >= 10;
            charts.push({
              type: "table" as ChartConfig["type"],
              title: `${playerName} — ${statLabel} by Playing Time`,
              relevance: meaningful
                ? `Playing time matters: ${diffPct > 0 ? "higher" : "lower"} ${statLabel} in high-minutes games (${highAvg} vs ${lowAvg}, ${Math.abs(diffPct)}% diff) — monitor minutes projection`
                : `Minimal playing time impact (${highAvg} vs ${lowAvg}) — stat output relatively stable regardless of minutes`,
              data,
              xKey: "group",
              yKeys: ["games", "avgValue", "hitRate"],
            });
          }
        }
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

  // --- Combo stats (check BEFORE singles to avoid false matches) ---
  // NBA combos
  if (desc.includes("pts+reb+ast") || desc.includes("pra") || (desc.includes("points") && desc.includes("rebounds") && desc.includes("assists"))) return "Pts+Reb+Ast";
  if (desc.includes("pts+reb") || (desc.includes("points") && desc.includes("rebounds") && !desc.includes("assists"))) return "Pts+Reb";
  if (desc.includes("pts+ast") || (desc.includes("points") && desc.includes("assists") && !desc.includes("rebounds"))) return "Pts+Ast";
  if (desc.includes("reb+ast") || (desc.includes("rebounds") && desc.includes("assists") && !desc.includes("points"))) return "Reb+Ast";
  // MLB combos
  if (desc.includes("h+r+rbi") || desc.includes("hits+runs+rbi") || (desc.includes("hits") && desc.includes("runs") && desc.includes("rbi"))) return "Hits+Runs+RBIs";
  if (desc.includes("hits+runs") || desc.includes("h+r")) return "Hits+Runs";
  if (desc.includes("hits+rbi") || desc.includes("h+rbi")) return "Hits+RBI";
  if (desc.includes("runs+rbi") || desc.includes("r+rbi")) return "Runs+RBI";
  if (desc.includes("total bases+runs") || desc.includes("tb+r")) return "TB+Runs";
  // NHL combos
  if (desc.includes("goals+assists") || desc.includes("g+a")) return "Goals+Assists";
  if (desc.includes("shots+goals") || desc.includes("sog+g")) return "Shots+Goals";
  if (desc.includes("points+shots") || desc.includes("pts+sog")) return "Points+Shots";

  // --- Single stats ---
  // NHL
  if (desc.includes("shot") && (desc.includes("goal") || desc.includes("sog"))) return "Shots on Goal";
  if (/\bsog\b/.test(desc)) return "Shots on Goal";
  if (desc.includes("shot")) return "Shots";
  if (desc.includes("save")) return "Saves";
  if (desc.includes("power play") || desc.includes("pp goal")) return "Power Play Goals";
  if (desc.includes("goals against")) return "Goals Against";

  // NBA
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
  const m = (market || "").toLowerCase();

  // ── Combo stats FIRST (order matters — combos contain single-stat keywords) ──
  // NBA combos
  if (m.includes("pts+reb+ast") || m === "pra" || m.includes("points rebounds assists") || m.includes("points+rebounds+assists")) return "pra";
  if (m.includes("pts+reb") || m.includes("points+rebounds")) return "pts+reb";
  if (m.includes("pts+ast") || m.includes("points+assists")) return "pts+ast";
  if (m.includes("reb+ast") || m.includes("rebounds+assists")) return "reb+ast";
  if (m.includes("double-double") || m.includes("double double")) return "dd";
  // NHL combos
  if (m.includes("goals+assists") || m.includes("g+a")) return "goals+assists";
  if (m.includes("shots+goals") || m.includes("sog+g")) return "shots+goals";
  if (m.includes("points+shots") || m.includes("pts+sog")) return "points+shots";
  // MLB combos (before singles so "h+r+rbi" isn't caught by "rbi" or "hit")
  if (m.includes("h+r+rbi") || m.includes("hits+runs+rbi") || m.includes("hits runs rbi")) return "hits+runs+rbi";
  if (m.includes("hits+runs") || m.includes("h+r")) return "hits+runs";
  if (m.includes("hits+rbi") || m.includes("h+rbi")) return "hits+rbi";
  if (m.includes("runs+rbi") || m.includes("r+rbi")) return "runs+rbi";
  if (m.includes("total bases+runs") || m.includes("tb+r")) return "totalBases+runs";

  // ── Single stats ──
  // NHL singles
  if (m.includes("shot") || /\bsog\b/.test(m)) return "shots";
  if (m.includes("save")) return "saves";
  if (m.includes("goals against")) return "goalsAgainst";
  if (m.includes("goal") && !m.includes("against")) return "goals";
  if (m.includes("power play") || m.includes("pp goal")) return "powerPlayGoals";
  // NBA singles
  if (m.includes("three") || m.includes("3p") || m.includes("3pt")) return "fg3m";
  if (m.includes("point") || m.includes("pts")) return "pts";
  if (m.includes("rebound") || m.includes("reb")) return "reb";
  if (m.includes("assist") || m.includes("ast")) return "ast";
  if (m.includes("steal")) return "stl";
  if (m.includes("block") || m.includes("blk")) return "blk";
  if (m.includes("turnover")) return "turnover";
  // MLB singles
  if (m.includes("strikeout") || m.includes("k's")) return "strikeOuts";
  if (m.includes("home run") || m.includes("hr")) return "homeRuns";
  if (m.includes("rbi") || m.includes("runs batted")) return "rbi";
  if (m.includes("stolen base") || m.includes("sb")) return "stolenBases";
  if (m.includes("total bases") || m.includes("tb")) return "totalBases";
  if (m.includes("run") && !m.includes("home run")) return "runs";
  if (m.includes("hit")) return "hits";
  // NHL points (distinct from NBA pts — "points" in NHL context = goals+assists)
  if (m.includes("point") || m.includes("pts")) return "pts";
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
    // NHL combos
    "goals+assists": "Goals+Assists",
    "shots+goals": "Shots+Goals",
    "points+shots": "Points+Shots",
    // MLB combos
    "hits+runs+rbi": "H+R+RBI",
    "hits+runs": "Hits+Runs",
    "hits+rbi": "Hits+RBI",
    "runs+rbi": "Runs+RBI",
    "totalBases+runs": "TB+Runs",
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
