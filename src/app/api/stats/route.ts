import { NextRequest, NextResponse } from "next/server";
import { fetchAllTeamData } from "@/lib/espn";
import { fetchNBAData } from "@/lib/balldontlie";
import { fetchMLBData } from "@/lib/mlbstats";
import { fetchNHLData } from "@/lib/nhlstats";
import { computeAnalysis } from "@/lib/analytics";
import { buildCharts } from "@/lib/charts";
import type { BetExtraction } from "@/types";

// Common bet types that get deterministic charts
const DETERMINISTIC_BET_TYPES = ["spread", "over_under", "moneyline", "player_prop"];

/**
 * Route data fetching to the best API for each sport.
 */
async function fetchSportData(
  extraction: BetExtraction
): Promise<{ data: Record<string, unknown>; source: string }> {
  const sport = extraction.sport.toUpperCase();
  const isNBA = sport === "NBA" || sport === "BASKETBALL";
  const isMLB = sport === "MLB" || sport === "BASEBALL";

  if (isNBA) {
    console.log("[Stats] Using Ball Don't Lie for NBA data");
    const bdlData = await fetchNBAData(
      extraction.teams,
      extraction.players,
      extraction.market,
      extraction.line
    );

    if (!bdlData._unsupported) {
      const espnData = await fetchAllTeamData(extraction.sport, extraction.teams);
      for (const team of extraction.teams) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const espnTeam = (espnData as any)?.[team];
        if (espnTeam && bdlData[team] && typeof bdlData[team] === "object") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const target = bdlData[team] as any;
          if (espnTeam.recentGames) target.recentGames = espnTeam.recentGames;
          if (espnTeam.record) target.record = espnTeam.record;
          if (espnTeam.stats) target.stats = espnTeam.stats;
          if (espnTeam.team) target.espnTeam = espnTeam.team;
        } else if (espnTeam && !bdlData[team]) {
          bdlData[team] = espnTeam;
        }
      }
      return { data: bdlData, source: "balldontlie+espn" };
    }
  }

  if (isMLB) {
    console.log("[Stats] Using MLB Stats API for baseball data");
    const mlbData = await fetchMLBData(
      extraction.teams,
      extraction.players,
      extraction.market,
      extraction.line
    );

    if (!mlbData._unsupported) {
      const espnData = await fetchAllTeamData(extraction.sport, extraction.teams);
      for (const team of extraction.teams) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const espnTeam = (espnData as any)?.[team];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mlbTeam = mlbData[team] as any;
        if (espnTeam && mlbTeam && typeof mlbTeam === "object") {
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

  // NHL: use NHL Stats API
  const isNHL = sport === "NHL" || sport === "HOCKEY";
  if (isNHL) {
    console.log("[Stats] Using NHL Stats API for hockey data");
    const nhlData = await fetchNHLData(
      extraction.teams,
      extraction.players,
      extraction.market,
      extraction.line
    );

    if (!nhlData._unsupported) {
      // Supplement with ESPN for record/schedule data
      const espnData = await fetchAllTeamData(extraction.sport, extraction.teams);
      for (const team of extraction.teams) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const espnTeam = (espnData as any)?.[team];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nhlTeam = nhlData[team] as any;
        if (espnTeam && nhlTeam && typeof nhlTeam === "object") {
          if (!nhlTeam.recentGames?.length && espnTeam.recentGames) {
            nhlTeam.recentGames = espnTeam.recentGames;
          }
          if (!nhlTeam.record && espnTeam.record) {
            nhlTeam.record = espnTeam.record;
          }
        } else if (espnTeam && !nhlData[team]) {
          nhlData[team] = espnTeam;
        }
      }
      return { data: nhlData, source: "nhlstats+espn" };
    }
  }

  // Default: ESPN for NFL, college, soccer, etc.
  console.log(`[Stats] Using ESPN for ${extraction.sport}`);
  const espnData = await fetchAllTeamData(
    extraction.sport,
    extraction.teams,
    extraction.betType === "player_prop" ? extraction.players : undefined
  );
  return { data: espnData, source: "espn" };
}

/**
 * Call Gemini for AI-generated content.
 * Uses Pro for summaries/exotic bets, flash-lite for nothing anymore.
 */
async function callGemini(
  prompt: string,
  apiKey: string,
  model: string = "gemini-2.5-flash"
): Promise<string | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("Gemini API error:", await response.text());
    return null;
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

function parseGeminiJSON(text: string): Record<string, unknown> {
  let jsonText = text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(jsonText);
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

    // 1. Fetch sport-specific data
    const { data: teamData, source } = await fetchSportData(extraction);
    console.log(`[Stats] Data source: ${source}`);

    if (teamData._unsupported) {
      return NextResponse.json({ unsupported: true });
    }

    // 2. Compute metrics
    const computed = computeAnalysis(teamData, extraction);

    // 3. Build charts — deterministic for common bets, AI for exotic
    const isDeterministic = DETERMINISTIC_BET_TYPES.includes(extraction.betType);
    let charts = isDeterministic
      ? buildCharts(extraction.betType, computed, extraction, teamData)
      : [];

    // 4. Build summary prompt (AI always writes the narrative)
    const summaryPrompt = buildSummaryPrompt(extraction, computed, teamData);

    if (isDeterministic && charts.length > 0) {
      // Common bet: AI only writes summary + stats
      const text = await callGemini(summaryPrompt, apiKey);
      if (!text) {
        return NextResponse.json(
          { error: "Failed to generate analysis" },
          { status: 500 }
        );
      }
      const aiResult = parseGeminiJSON(text);
      return NextResponse.json({
        summary: aiResult.summary || "",
        stats: aiResult.stats || [],
        charts,
        _computed: {
          oddsAnalysis: computed.oddsAnalysis,
          source,
        },
      });
    } else {
      // Exotic bet: AI generates everything (smarter model)
      const fullPrompt = buildFullAIPrompt(extraction, computed, teamData);
      const text = await callGemini(fullPrompt, apiKey);
      if (!text) {
        return NextResponse.json(
          { error: "Failed to generate analysis" },
          { status: 500 }
        );
      }
      const aiResult = parseGeminiJSON(text);
      return NextResponse.json({
        summary: aiResult.summary || "",
        stats: aiResult.stats || [],
        charts: aiResult.charts || charts,
        _computed: {
          oddsAnalysis: computed.oddsAnalysis,
          source,
        },
      });
    }
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to generate stats" },
      { status: 500 }
    );
  }
}

// ── Prompt for summary + stats only (common bets) ──────────────────

function buildSummaryPrompt(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const context = buildDataContext(extraction, computed, rawData);

  return `You are an elite sports analyst writing for sharp bettors. You have pre-computed metrics below. Write analysis that goes DEEPER than DraftKings — connect dots, surface non-obvious patterns.

${context}

Return JSON with ONLY these keys:

1. **summary**: 2-3 sentences. Connect the dots between trends, matchup history, rest, and line value. If implied probability differs from historical rate, call it out. Don't just restate numbers — interpret them. End with brief disclaimer. Don't name data sources.

2. **stats**: Array of 3-5 key stats. Each has:
   - label: punchy name (e.g. "ATS Cover Rate" not "Record", "Hit Rate Over 26.5" not "Prop Stats")
   - value: the number/string
   - context: one sentence on why this matters for THIS specific bet

Return ONLY valid JSON. No markdown wrapping.`;
}

// ── Prompt for full AI generation (exotic bets) ────────────────────

function buildFullAIPrompt(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const context = buildDataContext(extraction, computed, rawData);

  return `You are an elite sports analyst. Analyze this exotic/niche bet using the data below.

${context}

Return JSON with:

1. **summary**: 2-3 sharp sentences connecting the data to this specific bet. End with disclaimer. Don't name sources.

2. **stats**: Array of 3-5 stats, each with label, value, context.

3. **charts**: Array of 2-4 chart configs. Each has:
   - type: "line", "bar", "distribution", or "table"
   - title: descriptive title
   - relevance: one sentence on why it matters
   - data: array of objects with consistent keys
   - xKey, yKeys (for line/bar), columns (for table, array of {key, label})
   - ONLY use data from above. Do NOT invent data points.
   - Keys must be camelCase.

Return ONLY valid JSON.`;
}

// ── Shared data context builder ────────────────────────────────────

function buildDataContext(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const { teamMetrics, headToHead, oddsAnalysis, betTypeInsights } = computed;

  let ctx = `BET: ${extraction.sport} ${extraction.betType} — ${extraction.teams.join(" vs ")}`;
  if (extraction.odds) ctx += ` (${extraction.odds})`;
  if (extraction.line != null) ctx += ` Line: ${extraction.line}`;
  if (extraction.market) ctx += ` Market: ${extraction.market}`;
  if (extraction.players.length > 0) ctx += ` Players: ${extraction.players.join(", ")}`;

  if (oddsAnalysis) {
    ctx += `\n\nODDS: Implied ${oddsAnalysis.impliedProbabilityFormatted}`;
    if (oddsAnalysis.actualWinRate !== undefined) {
      ctx += `, Historical ${oddsAnalysis.actualWinRateFormatted}, Edge ${oddsAnalysis.edgeFormatted}`;
    }
  }

  for (const [name, m] of Object.entries(teamMetrics)) {
    ctx += `\n\n${name}: ${m.record.wins}-${m.record.losses} (${(m.record.pct * 100).toFixed(0)}%)`;
    if (m.homeRecord) ctx += ` | Home ${m.homeRecord.wins}-${m.homeRecord.losses}`;
    if (m.awayRecord) ctx += ` | Away ${m.awayRecord.wins}-${m.awayRecord.losses}`;
    ctx += `\n  Streak: ${m.streak.type}${m.streak.count} | Last 5: ${m.recentForm.last5.join("")}`;
    ctx += `\n  Scoring: ${m.scoring.avgPointsFor} for / ${m.scoring.avgPointsAgainst} against (L5: ${m.scoring.last5AvgFor}/${m.scoring.last5AvgAgainst})`;
    ctx += `\n  Avg Total: ${m.scoring.avgTotalPoints} (L5: ${m.scoring.last5AvgTotal})`;
    if (m.restDays !== undefined) ctx += ` | Rest: ${m.restDays}d`;
    if (m.ats) ctx += `\n  ATS: ${m.ats.covers}-${m.ats.fails} (${(m.ats.coverRate * 100).toFixed(0)}%)`;
    if (m.overUnder) ctx += `\n  O/U: ${m.overUnder.overs}-${m.overUnder.unders} over (${(m.overUnder.overRate * 100).toFixed(0)}%, avg ${m.overUnder.avgTotal})`;

    for (const g of m.recentGames.slice(-5)) {
      ctx += `\n    ${g.date ? new Date(g.date).toLocaleDateString() : "?"} ${g.won ? "W" : "L"} ${g.teamScore}-${g.opponentScore} vs ${g.opponent} (${g.home ? "H" : "A"}, margin ${g.margin > 0 ? "+" : ""}${g.margin})`;
    }
  }

  if (headToHead) {
    ctx += `\n\nH2H: ${headToHead.team1Wins}-${headToHead.team2Wins}, avg margin ${headToHead.avgMargin > 0 ? "+" : ""}${headToHead.avgMargin}, avg total ${headToHead.avgTotal}`;
  }

  if (Object.keys(betTypeInsights).length > 1) {
    ctx += `\n\nINSIGHTS: ${JSON.stringify(betTypeInsights)}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerData = (rawData as any)?._players;
  if (playerData) {
    for (const [pName, pData] of Object.entries(playerData)) {
      if (!pData) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = pData as any;
      if (p.propAnalysis) {
        const pa = p.propAnalysis;
        ctx += `\n\n${pName} PROP: ${pa.stat} over ${pa.line} — hit ${pa.hitCount}/${pa.totalGames} (${Math.round(pa.hitRate * 100)}%), avg ${pa.average}, L5 avg ${pa.last5Avg}, trend ${pa.trend}`;
      }
      if (p.seasonAverages || p.seasonStats) {
        ctx += `\n  Season: ${JSON.stringify(p.seasonAverages || p.seasonStats)}`;
      }
    }
  }

  return ctx;
}
