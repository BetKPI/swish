import { NextRequest, NextResponse } from "next/server";
import { fetchAllTeamData } from "@/lib/espn";
import { fetchNBAData } from "@/lib/balldontlie";
import { fetchMLBData } from "@/lib/mlbstats";
import { fetchNHLData } from "@/lib/nhlstats";
import { computeAnalysis } from "@/lib/analytics";
import { buildCharts } from "@/lib/charts";
import { getMarketContext } from "@/lib/markets";
import { fetchWithRetry } from "@/lib/fetch";
import type { BetExtraction } from "@/types";

export const maxDuration = 60;

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
  const response = await fetchWithRetry(
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
    },
    2, // 2 retries for Gemini (most critical dependency)
    3000
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

async function logParlayToDiscord(
  extraction: BetExtraction,
  legs: { description: string; sport: string; error: boolean; unsupported: boolean; summary: string | null }[]
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const analyzed = legs.filter((l) => !l.error && !l.unsupported);
  const failed = legs.filter((l) => l.error || l.unsupported);

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `\u{1F3B0} ${legs.length}-Leg Parlay Analyzed`,
          color: failed.length === 0 ? 0x10b981 : failed.length === legs.length ? 0xef4444 : 0xf59e0b,
          fields: [
            { name: "Bet", value: extraction.description || `${legs.length}-leg parlay`, inline: false },
            { name: "Analyzed", value: `${analyzed.length}/${legs.length} legs`, inline: true },
            ...(extraction.odds ? [{ name: "Odds", value: extraction.odds, inline: true }] : []),
            ...legs.map((l, i) => ({
              name: `Leg ${i + 1}: ${l.sport}`,
              value: l.error || l.unsupported
                ? `\u274C ${l.description || "Unknown"}`
                : `\u2705 ${l.description || "Unknown"}`,
              inline: false,
            })),
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

/**
 * Core analysis for a single bet — used by both single bets and parlay legs.
 * No HTTP round-trip, runs directly in the same function.
 */
async function analyzeSingleBet(
  extraction: BetExtraction,
  apiKey: string
): Promise<Record<string, unknown>> {
  const { data: teamData, source } = await fetchSportData(extraction);

  if (teamData._unsupported) {
    return { unsupported: true };
  }

  const computed = computeAnalysis(teamData, extraction);
  const isDeterministic = DETERMINISTIC_BET_TYPES.includes(extraction.betType);
  const charts = isDeterministic
    ? buildCharts(extraction.betType, computed, extraction, teamData)
    : [];

  const prompt = isDeterministic && charts.length > 0
    ? buildSummaryPrompt(extraction, computed, teamData)
    : buildFullAIPrompt(extraction, computed, teamData);

  const text = await callGemini(prompt, apiKey);
  let aiResult: Record<string, unknown> = {};
  if (text) {
    try {
      aiResult = parseGeminiJSON(text);
    } catch (e) {
      console.error("[Stats] JSON parse failed:", e);
      aiResult = { summary: "Check the charts below.", stats: [] };
    }
  }

  if (isDeterministic && charts.length > 0) {
    return {
      summary: aiResult.summary || "Check the charts below.",
      stats: aiResult.stats || [],
      charts,
      _computed: { oddsAnalysis: computed.oddsAnalysis, source },
    };
  }

  return {
    summary: aiResult.summary || "",
    stats: aiResult.stats || [],
    charts: (aiResult.charts as unknown[])?.length ? aiResult.charts : charts,
    _computed: { oddsAnalysis: computed.oddsAnalysis, source },
  };
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    if (extraction.betType === "parlay") {
      const legs = extraction.legs || [];
      if (legs.length === 0) {
        logToDiscord("empty_parlay", extraction, "No legs extracted from screenshot");
        return NextResponse.json({ parlay: true, legs: [] });
      }

      // Step 1: Fix up legs — inherit missing teams/sport from parent
      const fixedLegs = legs.slice(0, 6).map((leg) => {
        if (!leg.teams || leg.teams.length === 0) {
          leg.teams = extraction.teams || [];
        }
        if (!leg.sport) leg.sport = extraction.sport;
        return leg;
      });

      // Step 2: Fetch data for ALL legs in parallel (no Gemini calls yet)
      const legData = await Promise.all(
        fixedLegs.map(async (leg) => {
          if (leg.teams.length === 0) return { leg, teamData: null, computed: null, charts: [] };
          try {
            const { data: teamData } = await fetchSportData(leg);
            if (teamData._unsupported) return { leg, teamData: null, computed: null, charts: [] };
            const computed = computeAnalysis(teamData, leg);
            const isDeterministic = DETERMINISTIC_BET_TYPES.includes(leg.betType);
            const charts = isDeterministic
              ? buildCharts(leg.betType, computed, leg, teamData)
              : [];
            return { leg, teamData, computed, charts };
          } catch {
            return { leg, teamData: null, computed: null, charts: [] };
          }
        })
      );

      // Step 3: ONE Gemini call for all leg summaries
      const batchPrompt = buildParlayBatchPrompt(legData);
      const batchText = await callGemini(batchPrompt, apiKey);
      let legSummaries: Record<string, unknown>[] = [];
      if (batchText) {
        try {
          const parsed = parseGeminiJSON(batchText);
          legSummaries = (parsed.legs as Record<string, unknown>[]) || [];
        } catch (e) {
          console.error("[Parlay] Batch summary parse failed:", e);
        }
      }

      // Step 4: Combine charts + summaries
      const finalLegs = legData.map((ld, i) => {
        const aiLeg = legSummaries[i] || {};
        const legCharts = ld.charts.length > 0 ? ld.charts : (aiLeg.charts as unknown[]) || [];
        const legSummary = (aiLeg.summary as string) || null;
        const legStats = (aiLeg.stats as unknown[]) || [];
        const hasAnything = legCharts.length > 0 || legSummary || legStats.length > 0;
        return {
          description: ld.leg.description,
          sport: ld.leg.sport,
          betType: ld.leg.betType,
          teams: ld.leg.teams,
          odds: ld.leg.odds,
          summary: legSummary,
          stats: legStats,
          charts: legCharts,
          error: !hasAnything,
          unsupported: !ld.teamData && !hasAnything,
        };
      });

      // Log successful parlay to Discord
      logParlayToDiscord(extraction, finalLegs);

      return NextResponse.json({
        parlay: true,
        legCount: legs.length,
        legs: finalLegs,
      });
    }

    // Single bet analysis
    const result = await analyzeSingleBet(extraction, apiKey);
    return NextResponse.json(result);
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

  return `You're a sports data analyst writing for 22-year-old bettors. Quick, objective, data-driven. Present what the numbers say — don't tell people to bet or pass. Just the relevant data story in plain English.

${context}${marketContext}

Return JSON with ONLY these keys:

1. **summary**: MAX 2 short sentences. Just the data story — "Brown's averaging 6.8 assists and has gone over 5.5 in 8 of his last 10. Bucks allow the 5th most assists in the league." No recommendations, no "this hits" or "pass". Just facts + context.

2. **stats**: Array of 3-4 stats (NOT 5). Each has:
   - label: short and punchy (4 words max)
   - value: the number/string
   - context: ONE short sentence${marketContext ? " — reference the specific factors that matter for this market" : ""}

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

  return `You're a sports data analyst writing for 22-year-old bettors. Quick, objective, data-driven. Present what the numbers say — no recommendations.

${context}${marketContext}

Return JSON with:

1. **summary**: MAX 2 short sentences. Data story only — no "bet this" or "pass". Just facts + context.

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

// ── Parlay batch prompt — one Gemini call for all legs ─────────────

function buildParlayBatchPrompt(
  legData: { leg: BetExtraction; teamData: Record<string, unknown> | null; computed: ReturnType<typeof computeAnalysis> | null; charts: unknown[] }[]
): string {
  let context = `You're a sports data analyst. Give a quick, objective data summary for each parlay leg. No recommendations — just what the numbers say.

`;

  legData.forEach((ld, i) => {
    context += `\n=== LEG ${i + 1}: ${ld.leg.description} ===\n`;
    if (ld.computed && ld.teamData) {
      context += buildDataContext(ld.leg, ld.computed, ld.teamData);
      const mc = ld.leg.market ? getMarketContext(ld.leg.market, ld.leg.sport) : "";
      if (mc) context += mc;
    } else {
      context += "No data available for this leg.\n";
    }
  });

  return `${context}

Return JSON with ONE key "legs" — an array with ${legData.length} objects (one per leg, same order). Each object has:
- summary: MAX 1-2 sentences, data story only — no "bet" or "pass" recommendations
- stats: array of 2-3 stats, each with label (4 words max), value, context (1 sentence)

Example: {"legs":[{"summary":"...","stats":[...]},{"summary":"...","stats":[...]}]}

Return ONLY valid JSON. No markdown.`;
}

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
    ctx += `\n\nODDS: Implied probability ${oddsAnalysis.impliedProbabilityFormatted}`;
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
