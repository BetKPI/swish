import { NextRequest, NextResponse } from "next/server";
import { fetchAllTeamData } from "@/lib/espn";
import { fetchNBAData } from "@/lib/balldontlie";
import { fetchMLBData } from "@/lib/mlbstats";
import { computeAnalysis } from "@/lib/analytics";
import type { BetExtraction } from "@/types";

/**
 * Route data fetching to the best API for each sport:
 * - NBA/Basketball → Ball Don't Lie (player stats, game logs) + ESPN (team schedule)
 * - MLB/Baseball → MLB Stats API (player stats, splits, game logs) + ESPN (team schedule)
 * - Everything else → ESPN
 */
async function fetchSportData(
  extraction: BetExtraction
): Promise<{ data: Record<string, unknown>; source: string }> {
  const sport = extraction.sport.toUpperCase();
  const isNBA = sport === "NBA" || sport === "BASKETBALL";
  const isMLB = sport === "MLB" || sport === "BASEBALL";

  // NBA: use Ball Don't Lie for rich player/team data, supplement with ESPN for schedule
  if (isNBA) {
    console.log("[Stats] Using Ball Don't Lie for NBA data");
    const bdlData = await fetchNBAData(
      extraction.teams,
      extraction.players,
      extraction.market,
      extraction.line
    );

    if (!bdlData._unsupported) {
      // Supplement with ESPN team schedule data for recent games
      const espnData = await fetchAllTeamData(
        extraction.sport,
        extraction.teams
      );
      // Merge ESPN schedule into BDL data
      for (const team of extraction.teams) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const espnTeam = (espnData as any)?.[team];
        if (espnTeam && bdlData[team]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (bdlData[team] as any).recentGames = espnTeam.recentGames;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (bdlData[team] as any).record = espnTeam.record;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (bdlData[team] as any).stats = espnTeam.stats;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (bdlData[team] as any).espnTeam = espnTeam.team;
        } else if (espnTeam && !bdlData[team]) {
          bdlData[team] = espnTeam;
        }
      }
      return { data: bdlData, source: "balldontlie+espn" };
    }
    // Fall through to ESPN if BDL fails
  }

  // MLB: use MLB Stats API
  if (isMLB) {
    console.log("[Stats] Using MLB Stats API for baseball data");
    const mlbData = await fetchMLBData(
      extraction.teams,
      extraction.players,
      extraction.market,
      extraction.line
    );

    if (!mlbData._unsupported) {
      // Supplement with ESPN for anything missing
      const espnData = await fetchAllTeamData(
        extraction.sport,
        extraction.teams
      );
      for (const team of extraction.teams) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const espnTeam = (espnData as any)?.[team];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mlbTeam = mlbData[team] as any;
        if (espnTeam && mlbTeam) {
          if (!mlbTeam.recentGames?.length && espnTeam.recentGames) {
            mlbTeam.recentGames = espnTeam.recentGames;
          }
          if (!mlbTeam.record && espnTeam.record) {
            mlbTeam.record = espnTeam.record;
          }
        } else if (espnTeam && !mlbData[team]) {
          mlbData[team] = espnTeam;
        }
      }
      return { data: mlbData, source: "mlbstats+espn" };
    }
  }

  // Default: ESPN for NFL, NHL, college, soccer, etc.
  console.log(`[Stats] Using ESPN for ${extraction.sport}`);
  const espnData = await fetchAllTeamData(
    extraction.sport,
    extraction.teams,
    extraction.betType === "player_prop" ? extraction.players : undefined
  );
  return { data: espnData, source: "espn" };
}

export async function POST(request: NextRequest) {
  try {
    const { extraction } = (await request.json()) as {
      extraction: BetExtraction;
    };

    if (!extraction) {
      return NextResponse.json(
        { error: "No extraction provided" },
        { status: 400 }
      );
    }

    // Reject parlays early
    if (extraction.betType === "parlay") {
      return NextResponse.json({ parlay: true });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Fetch data from the best API for this sport
    const { data: teamData, source } = await fetchSportData(extraction);
    console.log(`[Stats] Data source: ${source}`);

    if (teamData._unsupported) {
      return NextResponse.json({ unsupported: true });
    }

    // Compute metrics in code — don't make Gemini do math
    const computed = computeAnalysis(teamData, extraction);

    // Build a bet-type-specific prompt with pre-computed data
    const analysisPrompt = buildAnalysisPrompt(extraction, computed, teamData);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: analysisPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini API error:", err);
      return NextResponse.json(
        { error: "Failed to generate stats" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(
        { error: "No analysis generated" },
        { status: 500 }
      );
    }

    // Parse the JSON response — handle markdown code blocks
    let jsonText = text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
    }
    const analysis = JSON.parse(jsonText);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to generate stats" },
      { status: 500 }
    );
  }
}

function buildAnalysisPrompt(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawTeamData: Record<string, unknown>
): string {
  const { teamMetrics, headToHead, oddsAnalysis, betTypeInsights } = computed;

  // Build the context block with pre-computed data
  let context = `BET DETAILS:
Sport: ${extraction.sport}
Type: ${extraction.betType}
Teams: ${extraction.teams.join(" vs ")}
Odds: ${extraction.odds}`;

  if (extraction.line != null) context += `\nLine: ${extraction.line}`;
  if (extraction.market) context += `\nMarket: ${extraction.market}`;
  if (extraction.players.length > 0)
    context += `\nPlayers: ${extraction.players.join(", ")}`;

  // Odds-implied probability section
  if (oddsAnalysis) {
    context += `\n\nODDS ANALYSIS:
Implied Probability: ${oddsAnalysis.impliedProbabilityFormatted}`;
    if (oddsAnalysis.actualWinRate !== undefined) {
      context += `
Historical Rate: ${oddsAnalysis.actualWinRateFormatted}
Edge: ${oddsAnalysis.edgeFormatted} (${oddsAnalysis.hasValue ? "potential value" : "odds may be fair or overpriced"})`;
    }
  }

  // Team metrics section
  context += "\n\nTEAM METRICS (pre-computed from game data):";
  for (const [name, metrics] of Object.entries(teamMetrics)) {
    context += `\n\n${name}:
  Record: ${metrics.record.wins}-${metrics.record.losses} (${(metrics.record.pct * 100).toFixed(0)}%)`;
    if (metrics.homeRecord)
      context += `\n  Home: ${metrics.homeRecord.wins}-${metrics.homeRecord.losses}`;
    if (metrics.awayRecord)
      context += `\n  Away: ${metrics.awayRecord.wins}-${metrics.awayRecord.losses}`;
    context += `
  Current Streak: ${metrics.streak.type}${metrics.streak.count}
  Last 5: ${metrics.recentForm.last5.join("-")} (${metrics.recentForm.wins}-${metrics.recentForm.losses})
  Avg Points For: ${metrics.scoring.avgPointsFor} (Last 5: ${metrics.scoring.last5AvgFor})
  Avg Points Against: ${metrics.scoring.avgPointsAgainst} (Last 5: ${metrics.scoring.last5AvgAgainst})
  Avg Total: ${metrics.scoring.avgTotalPoints} (Last 5: ${metrics.scoring.last5AvgTotal})`;
    if (metrics.restDays !== undefined)
      context += `\n  Rest Days: ${metrics.restDays}`;
    if (metrics.ats)
      context += `\n  ATS: ${metrics.ats.covers}-${metrics.ats.fails}${metrics.ats.pushes > 0 ? `-${metrics.ats.pushes}` : ""} (${(metrics.ats.coverRate * 100).toFixed(0)}% cover rate)`;
    if (metrics.overUnder)
      context += `\n  O/U: ${metrics.overUnder.overs}-${metrics.overUnder.unders}${metrics.overUnder.pushes > 0 ? `-${metrics.overUnder.pushes}` : ""} (${(metrics.overUnder.overRate * 100).toFixed(0)}% over rate, avg total: ${metrics.overUnder.avgTotal})`;

    // Recent game log
    context += "\n  Recent Games:";
    for (const g of metrics.recentGames.slice(-5)) {
      context += `\n    ${g.date ? new Date(g.date).toLocaleDateString() : "?"} vs ${g.opponent}: ${g.teamScore}-${g.opponentScore} (${g.won ? "W" : "L"}, ${g.home ? "Home" : "Away"}, margin: ${g.margin > 0 ? "+" : ""}${g.margin}, total: ${g.totalPoints})`;
    }
  }

  // Head-to-head section
  if (headToHead) {
    context += `\n\nHEAD-TO-HEAD (recent matchups):
  ${extraction.teams[0]} wins: ${headToHead.team1Wins}, ${extraction.teams[1]} wins: ${headToHead.team2Wins}
  Avg Margin: ${headToHead.avgMargin > 0 ? "+" : ""}${headToHead.avgMargin} (${extraction.teams[0]} perspective)
  Avg Total: ${headToHead.avgTotal}`;
    for (const g of headToHead.games) {
      context += `\n    ${g.date ? new Date(g.date).toLocaleDateString() : "?"} vs ${g.opponent}: ${g.teamScore}-${g.opponentScore} (${g.won ? "W" : "L"}, total: ${g.totalPoints})`;
    }
  }

  // Bet-type-specific insights
  if (Object.keys(betTypeInsights).length > 1) {
    context += `\n\nBET-TYPE INSIGHTS (${extraction.betType}):
${JSON.stringify(betTypeInsights, null, 2)}`;
  }

  // Player data for props
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerData = (rawTeamData as any)?._players;
  if (playerData && Object.keys(playerData).length > 0) {
    context += `\n\nPLAYER DATA:
${JSON.stringify(playerData, null, 2)}`;
  }

  return `You are an elite sports analytics expert — the kind that works for sharp betting groups and DFS syndicates. You have pre-computed metrics below. Your job is to produce analysis that goes DEEPER than what DraftKings or FanDuel shows.

${context}

Based on the bet type "${extraction.betType}" and all the data above, produce an analysis with:

1. **summary**: A 2-3 sentence analysis that surfaces NON-OBVIOUS insights. Don't just restate the record — connect the dots: scoring trends + rest days + matchup history + line value. If the odds-implied probability differs from the historical rate, call that out. End with a brief disclaimer. Do NOT name data sources.

2. **stats**: Array of 3-5 key stat data points, each with:
   - label: stat name (make these punchy, not generic — e.g. "ATS Cover Rate" not "Record")
   - value: the value (number or string)
   - context: one sentence on why this matters for THIS specific bet

3. **charts**: Array of 3-5 chart configurations. For each chart:
   - type: "line", "bar", "distribution", or "table"
   - title: descriptive chart title
   - relevance: one sentence explaining why this chart matters for the bet
   - data: array of data point objects with consistent keys
   - xKey: the key to use for X axis
   - yKeys: array of keys to plot on Y axis
   - For tables: include "columns" array with {key, label} objects

CHART REQUIREMENTS BY BET TYPE:
${getBetTypeChartGuidance(extraction.betType)}

CRITICAL RULES:
- Use ONLY the pre-computed data above. Do NOT invent data points.
- The numbers are already computed — reference them directly in stats and charts.
- If the implied probability vs historical rate shows an edge, make that a featured stat.
- Charts should tell a story that helps the bettor understand the bet, not just display numbers.
- Data keys must be camelCase strings.
- Do NOT reference any data sources by name.
- Return ONLY valid JSON with keys: summary, stats, charts.`;
}

function getBetTypeChartGuidance(betType: string): string {
  switch (betType) {
    case "spread":
      return `- Margin of victory trend (line chart showing last games' margins)
- ATS performance breakdown (bar chart: covers vs fails)
- Home/away margin comparison (bar chart)
- Head-to-head results table (if available)
- Scoring trend showing if team is trending toward or away from covering`;

    case "over_under":
      return `- Combined scoring trend (line chart: total points per game)
- Each team's scoring output trend (line chart)
- Over/under hit rate (bar chart: overs vs unders at this line)
- Pace comparison or scoring averages (bar chart)
- If available, head-to-head totals`;

    case "moneyline":
      return `- Win probability comparison (bar chart: implied vs historical)
- Recent form trend (line chart: wins/losses over last games)
- Home/away win rate comparison
- Point differential trend (line chart)
- Head-to-head results if available`;

    case "player_prop":
      return `- Player stat trend over recent games (line chart)
- Player average vs prop line comparison (bar chart)
- Hit rate for this prop (how often the player exceeds the line)
- Game log table with relevant stat
- If available, performance vs this opponent`;

    case "game_prop":
      return `- Relevant stat trends for both teams
- Historical rate of this prop hitting
- Comparison table of relevant metrics`;

    default:
      return `- Use charts that best illustrate the key factors for this bet
- Show trends, comparisons, and historical rates`;
  }
}
