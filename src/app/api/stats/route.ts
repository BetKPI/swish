import { NextRequest, NextResponse } from "next/server";
import { fetchAllTeamData } from "@/lib/espn";
import { fetchNBAData } from "@/lib/balldontlie";
import { fetchMLBData } from "@/lib/mlbstats";
import { fetchNHLData } from "@/lib/nhlstats";
import { computeAnalysis } from "@/lib/analytics";
import { buildCharts } from "@/lib/charts";
import { getMarketContext } from "@/lib/markets";
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

  // BDL disabled for now (free tier doesn't include stats/game logs).
  // Code lives in balldontlie.ts — re-enable when upgraded to paid plan.
  // To re-enable: uncomment the block below and set BDL_API_KEY.
  /*
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
        const espnTeam = (espnData as any)?.[team];
        if (espnTeam && bdlData[team] && typeof bdlData[team] === "object") {
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
  */

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

/**
 * Log bet failures/events to Discord automatically — no user action needed.
 */
async function logToDiscord(
  type: "unsupported" | "error" | "empty_parlay" | "analysis_fail",
  extraction: BetExtraction,
  detail?: string
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const colors: Record<string, number> = {
    unsupported: 0xf59e0b,  // yellow
    error: 0xef4444,         // red
    empty_parlay: 0xf59e0b,  // yellow
    analysis_fail: 0xef4444, // red
  };

  const titles: Record<string, string> = {
    unsupported: "Unsupported Bet Submitted",
    error: "Analysis Error",
    empty_parlay: "Parlay — No Legs Detected",
    analysis_fail: "Analysis Returned Empty",
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: titles[type] || type,
          color: colors[type] || 0x6366f1,
          fields: [
            { name: "Bet", value: extraction.description || "Unknown", inline: false },
            { name: "Sport / Type", value: `${extraction.sport} — ${extraction.betType?.replace("_", "/")}`, inline: true },
            { name: "Teams", value: extraction.teams?.join(" vs ") || "?", inline: true },
            ...(extraction.players?.length ? [{ name: "Players", value: extraction.players.join(", "), inline: true }] : []),
            ...(detail ? [{ name: "Detail", value: detail.slice(0, 200), inline: false }] : []),
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch { /* silent */ }
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
      // Analyze each leg individually
      const legs = extraction.legs || [];
      if (legs.length === 0) {
        logToDiscord("empty_parlay", extraction, "No legs extracted from screenshot");
        return NextResponse.json({ parlay: true, legs: [] });
      }

      // Call ourselves for each leg in parallel (max 6 legs to stay in timeout)
      const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "https://swish-jet.vercel.app";

      const legResults = await Promise.all(
        legs.slice(0, 6).map(async (leg) => {
          // Skip legs with no teams — can't analyze without them
          if (!leg.teams || leg.teams.length === 0) {
            return { leg, error: true, data: null };
          }
          try {
            const res = await fetch(`${baseUrl}/api/stats`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ extraction: leg }),
            });
            if (!res.ok) return { leg, error: true, data: null };
            const data = await res.json();
            return { leg, error: false, data };
          } catch {
            return { leg, error: true, data: null };
          }
        })
      );

      return NextResponse.json({
        parlay: true,
        legCount: legs.length,
        legs: legResults.map((r) => ({
          description: r.leg.description,
          sport: r.leg.sport,
          betType: r.leg.betType,
          teams: r.leg.teams,
          odds: r.leg.odds,
          summary: r.data?.summary || null,
          stats: r.data?.stats || [],
          charts: r.data?.charts || [],
          error: r.error,
          unsupported: r.data?.unsupported || false,
        })),
      });
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
      logToDiscord("unsupported", extraction, `Source: ${source}, Reason: ${teamData._reason || "no data"}`);
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
      let aiResult: Record<string, unknown> = {};
      if (text) {
        try {
          aiResult = parseGeminiJSON(text);
        } catch (e) {
          console.error("[Stats] Failed to parse Gemini summary JSON:", e, "\nRaw:", text?.slice(0, 300));
          // Still return charts even if AI summary fails
          aiResult = { summary: "Analysis available in the charts below.", stats: [] };
        }
      }
      return NextResponse.json({
        summary: aiResult.summary || "Analysis available in the charts below.",
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
      let aiResult: Record<string, unknown> = {};
      if (text) {
        try {
          aiResult = parseGeminiJSON(text);
        } catch (e) {
          console.error("[Stats] Failed to parse Gemini full JSON:", e, "\nRaw:", text?.slice(0, 300));
          aiResult = { summary: "We pulled the data but couldn't generate the full analysis. Try again.", stats: [], charts: [] };
        }
      }
      return NextResponse.json({
        summary: aiResult.summary || "",
        stats: aiResult.stats || [],
        charts: (aiResult.charts as unknown[])?.length ? aiResult.charts : charts,
        _computed: {
          oddsAnalysis: computed.oddsAnalysis,
          source,
        },
      });
    }
  } catch (error) {
    console.error("Stats error:", error);
    // Try to log to Discord — extraction may not be available if parsing failed
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.extraction) {
        logToDiscord("error", body.extraction, error instanceof Error ? error.message : "Unknown error");
      }
    } catch { /* silent */ }
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

  // Inject domain-specific market knowledge if available
  const marketContext = extraction.market
    ? getMarketContext(extraction.market, extraction.sport)
    : "";

  return `You write like a sharp friend texting about a bet — confident, brief, no fluff. You have pre-computed data below. Your audience is 22-year-old sports bettors who already know the basics.

CRITICAL: Be HONEST. If the data supports the bet, say so. If the data is mixed or against it, say that too. Don't hype every bet — a friend who says "this hits" on everything is useless. A friend who says "I'd stay away, his numbers drop on the road" is valuable. Call out red flags just as much as green flags.

${context}${marketContext}

Return JSON with ONLY these keys:

1. **summary**: MAX 2 short sentences. Be direct — if the data looks good say it, if it looks bad say that. Examples:
   - Good: "Brown's been dishing 6+ in 8 of his last 10 and the Bucks give up the most assists in the league. Like this a lot."
   - Bad: "His road numbers drop to 3.2 per game and the Bucks are actually solid defending the assist. Pass."
   - Mixed: "He's hit this in 6 of 10 but the Bucks held his position under 5 in both matchups this year. Coin flip."
   No disclaimers. No source names. Just the honest take.

2. **stats**: Array of 3-4 stats (NOT 5). Each has:
   - label: short and punchy (4 words max)
   - value: the number/string
   - context: ONE short sentence, casual tone${marketContext ? " — reference the specific factors that matter for this market" : ""}

Return ONLY valid JSON. No markdown.`;
}

// ── Prompt for full AI generation (exotic bets) ────────────────────

function buildFullAIPrompt(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const context = buildDataContext(extraction, computed, rawData);

  const marketContext = extraction.market
    ? getMarketContext(extraction.market, extraction.sport)
    : "";

  return `You write like a sharp friend texting about a bet — confident, brief, no fluff. 22-year-old sports bettor audience.

${context}${marketContext}

Return JSON with:

1. **summary**: MAX 2 short sentences. Direct, opinionated, no hedge words. No disclaimers. No source names.

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
