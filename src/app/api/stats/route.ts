import { NextRequest, NextResponse } from "next/server";
import { fetchAllTeamData, fetchGolfLeaderboard } from "@/lib/espn";
import { fetchMastersHistory, analyzeHoleHistory, analyzeAmenCorner, analyzeSundayScoring, getAugustaPars, analyzeHoleInOneHistory } from "@/lib/masters";
import { fetchNBAData } from "@/lib/balldontlie";
import { fetchMLBData } from "@/lib/mlbstats";
import { fetchNHLData } from "@/lib/nhlstats";
import { computeAnalysis } from "@/lib/analytics";
import { buildCharts } from "@/lib/charts";
import { getMarketContext } from "@/lib/markets";
import { fetchWithRetry } from "@/lib/fetch";
import { computeSwishScore } from "@/lib/swishScore";
import type { BetExtraction, ChartConfig } from "@/types";
import { checkGameStatus } from "@/lib/gameStatus";
import { getFirstBasketData } from "@/lib/nba-firstbasket";
import { getFirstInningData, getTeamPitchers } from "@/lib/mlb-nrfi";
import { getFirstGoalData } from "@/lib/nhl-firstgoal";
import { detectExoticMarket, isNBASport, isMLBSport, isNHLSport } from "@/lib/market-detect";

export const maxDuration = 60;

// Common bet types that get deterministic charts
const DETERMINISTIC_BET_TYPES = ["spread", "over_under", "moneyline", "player_prop", "game_prop"];

// ── In-memory data cache ─────────────────────────────────────────
// Caches sport data for 10 minutes to avoid re-fetching the same
// teams/players across multiple analyses in the same session.
const dataCache = new Map<string, { data: Record<string, unknown>; source: string; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCacheKey(extraction: BetExtraction): string {
  const sport = (extraction.sport || "").toUpperCase();
  const teams = [...(extraction.teams || [])].sort().join("|");
  const players = [...(extraction.players || [])].sort().join("|");
  const market = extraction.market || "";
  return `${sport}:${teams}:${players}:${market}`;
}

function getCachedData(key: string): { data: Record<string, unknown>; source: string } | null {
  const entry = dataCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    dataCache.delete(key);
    return null;
  }
  return { data: entry.data, source: entry.source };
}

function setCachedData(key: string, data: Record<string, unknown>, source: string) {
  // Cap cache size to prevent memory leaks
  if (dataCache.size > 50) {
    const oldest = [...dataCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) dataCache.delete(oldest[0]);
  }
  dataCache.set(key, { data, source, ts: Date.now() });
}

/**
 * Route data fetching to the best API for each sport.
 */
async function fetchSportData(
  extraction: BetExtraction
): Promise<{ data: Record<string, unknown>; source: string }> {
  const sport = (extraction.sport || "").toUpperCase();
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

  // Golf: use leaderboard + player-focused data
  const isGolf = sport === "GOLF" || sport === "PGA" || sport === "PGA TOUR" || sport === "THE MASTERS" || sport === "MASTERS";
  if (isGolf) {
    console.log(`[Stats] Using ESPN golf leaderboard`);
    const golfData = await fetchGolfLeaderboard(extraction.players);

    // For Masters bets, enrich with hole-by-hole history
    const desc = (extraction.description || "").toLowerCase();
    const isMasters = sport === "THE MASTERS" || sport === "MASTERS" ||
      desc.includes("master") || desc.includes("augusta");

    if (isMasters) {
      // Detect if this is a hole-in-one bet
      const exotic = detectExoticMarket(extraction.market || "", extraction.description || "", extraction.sport || "");
      const isHoleInOne = exotic === "hole_in_one";

      if (isHoleInOne) {
        console.log(`[Stats] Fetching Masters hole-in-one history (aggregate)`);
        try {
          // Fetch top players' histories to build aggregate hole-in-one stats
          // Use a well-known set of players who've played multiple Masters
          const topPlayers = extraction.players.length > 0
            ? extraction.players.slice(0, 3)
            : ["Tiger Woods", "Phil Mickelson", "Rory McIlroy"];
          const histories = await Promise.all(
            topPlayers.map((p) => fetchMastersHistory(p).catch(() => null))
          );
          const validHistories = histories.filter((h): h is NonNullable<Awaited<ReturnType<typeof fetchMastersHistory>>> => h != null);
          if (validHistories.length > 0) {
            const hioData = analyzeHoleInOneHistory(validHistories);
            (golfData as Record<string, unknown>)._holeInOne = hioData;
            // Also add per-player data if players specified
            if (extraction.players.length > 0) {
              const mastersData: Record<string, unknown> = {};
              for (let i = 0; i < extraction.players.length && i < 2; i++) {
                const h = validHistories.find((vh) => vh.playerName.toLowerCase().includes(extraction.players[i].toLowerCase()));
                if (h) {
                  mastersData[extraction.players[i]] = {
                    history: h, amenCorner: analyzeAmenCorner(h), sundays: analyzeSundayScoring(h),
                    holeByHole: Array.from({ length: 18 }, (_, j) => analyzeHoleHistory(h, j + 1)),
                    augustaPars: getAugustaPars(),
                  };
                }
              }
              if (Object.keys(mastersData).length > 0) {
                (golfData as Record<string, unknown>)._masters = mastersData;
              }
            }
          }
        } catch (e) {
          console.error("[Stats] Hole-in-one history failed:", e);
        }
      } else if (extraction.players.length > 0) {
        console.log(`[Stats] Fetching Masters hole-by-hole history`);
        try {
          // Timeout after 15s to not block the whole response
          const mastersPromise = async () => {
            const mastersData: Record<string, unknown> = {};
            for (const player of extraction.players.slice(0, 2)) { // cap at 2 players
              const history = await fetchMastersHistory(player);
              if (history) {
                const amenCorner = analyzeAmenCorner(history);
                const sundays = analyzeSundayScoring(history);
                const holeAnalysis = Array.from({ length: 18 }, (_, i) => analyzeHoleHistory(history, i + 1));
                mastersData[player] = { history, amenCorner, sundays, holeByHole: holeAnalysis, augustaPars: getAugustaPars() };
              }
            }
            return mastersData;
          };
          const timeoutPromise = new Promise<Record<string, unknown>>((resolve) =>
            setTimeout(() => { console.log("[Stats] Masters data timed out"); resolve({}); }, 15000)
          );
          const mastersData = await Promise.race([mastersPromise(), timeoutPromise]);
          if (Object.keys(mastersData).length > 0) {
            (golfData as Record<string, unknown>)._masters = mastersData;
          }
        } catch (e) {
          console.error("[Stats] Masters history failed:", e);
        }
      }
    }

    return { data: golfData, source: isMasters ? "espn-golf+masters" : "espn-golf" };
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
  model: string = "gemini-2.5-flash",
  maxOutputTokens: number = 4096
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
          maxOutputTokens,
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
  // Guard against null/undefined sport or betType from failed extraction
  if (!extraction.sport) {
    logToDiscord("error", extraction, "Extraction missing sport field");
    return {
      summary: "We couldn't identify the sport from your bet. Try a clearer screenshot.",
      stats: [],
      charts: [],
      _computed: { source: "error" },
    };
  }

  let teamData: Record<string, unknown>;
  let source: string;

  const cacheKey = getCacheKey(extraction);
  const cached = getCachedData(cacheKey);

  if (cached) {
    console.log(`[Stats] Cache hit for ${cacheKey.slice(0, 60)}`);
    teamData = cached.data;
    source = cached.source + "+cached";
  } else {
    try {
      const result = await fetchSportData(extraction);
      teamData = result.data;
      source = result.source;
      setCachedData(cacheKey, teamData, source);
    } catch (e) {
      console.error("[Stats] fetchSportData failed:", e);
      logToDiscord("error", extraction, `Data fetch failed: ${(e as Error).message}`);
      // Return empty result instead of crashing
      return {
        summary: "We couldn't pull the data for this bet right now. Try again in a moment.",
        stats: [],
        charts: [],
        _computed: { source: "error" },
      };
    }
  }

  if (teamData._unsupported) {
    return { unsupported: true };
  }

  // Enrich with exotic market data using centralized detection
  const exotic = detectExoticMarket(extraction.market || "", extraction.description || "", extraction.sport || "");
  if (exotic === "first_basket" && isNBASport(extraction.sport || "") && extraction.players.length > 0) {
    try {
      const fbData = await getFirstBasketData(extraction.players[0], extraction.teams);
      if (fbData) {
        (teamData as Record<string, unknown>)._firstBasket = fbData;
        console.log(`[Stats] First basket data: ${fbData.gamesProcessed} games`);
      }
    } catch (e) {
      console.error("[Stats] First basket enrichment failed:", e);
    }
  } else if (exotic === "nrfi" && isMLBSport(extraction.sport || "")) {
    try {
      const pitcherName = extraction.players.length > 0 ? extraction.players[0] : null;
      if (pitcherName) {
        // Specific pitcher named
        const nrfiData = await getFirstInningData(pitcherName);
        if (nrfiData) {
          (teamData as Record<string, unknown>)._nrfi = nrfiData;
          console.log(`[Stats] NRFI data: ${nrfiData.pitcher?.cleanFirstInnings || 0} clean 1st innings`);
        }
      }
      // Always build team-level NRFI data from our database
      if (extraction.teams.length >= 2) {
        const team1Pitchers = getTeamPitchers(extraction.teams[0]);
        const team2Pitchers = getTeamPitchers(extraction.teams[1]);
        const teamNrfi = {
          team1: { name: extraction.teams[0], pitchers: team1Pitchers.slice(0, 5).map((p) => ({ name: p.name, nrfiRate: p.nrfiRate, gamesStarted: p.gamesStarted, cleanFirstInnings: p.cleanFirstInnings, recentGames: p.recentGames.slice(0, 5) })) },
          team2: { name: extraction.teams[1], pitchers: team2Pitchers.slice(0, 5).map((p) => ({ name: p.name, nrfiRate: p.nrfiRate, gamesStarted: p.gamesStarted, cleanFirstInnings: p.cleanFirstInnings, recentGames: p.recentGames.slice(0, 5) })) },
        };
        (teamData as Record<string, unknown>)._teamNrfi = teamNrfi;
        console.log(`[Stats] Team NRFI: ${team1Pitchers.length} pitchers for ${extraction.teams[0]}, ${team2Pitchers.length} for ${extraction.teams[1]}`);
      }
    } catch (e) {
      console.error("[Stats] NRFI enrichment failed:", e);
    }
  } else if (exotic === "first_goal" && isNHLSport(extraction.sport || "") && extraction.players.length > 0) {
    try {
      const fgData = await getFirstGoalData(extraction.players[0], extraction.teams);
      if (fgData) {
        (teamData as Record<string, unknown>)._firstGoal = fgData;
        console.log(`[Stats] First goal data loaded`);
      }
    } catch (e) {
      console.error("[Stats] First goal enrichment failed:", e);
    }
  }

  let computed;
  try {
    computed = computeAnalysis(teamData, extraction);
  } catch (e) {
    console.error("[Stats] computeAnalysis failed:", e);
    logToDiscord("error", extraction, `Analysis compute failed: ${(e as Error).message}`);
    // Fall through to AI-only analysis
    computed = computeAnalysis({}, extraction);
  }

  const isDeterministic = DETERMINISTIC_BET_TYPES.includes(extraction.betType);
  let charts: ChartConfig[] = [];
  try {
    charts = isDeterministic
      ? buildCharts(extraction.betType, computed, extraction, teamData)
      : [];
  } catch (e) {
    console.error("[Stats] buildCharts failed:", e);
    // Continue without charts
  }

  const isSummaryOnly = isDeterministic && charts.length > 0;
  const prompt = isSummaryOnly
    ? buildSummaryPrompt(extraction, computed, teamData)
    : buildFullAIPrompt(extraction, computed, teamData);

  // Run Gemini + game status check in parallel
  const [text, gameStatus] = await Promise.all([
    callGemini(
      prompt,
      apiKey,
      isSummaryOnly ? "gemini-2.0-flash-lite" : "gemini-2.5-flash",
      isSummaryOnly ? 2048 : 4096
    ),
    checkGameStatus(
      extraction.sport,
      extraction.teams,
      extraction.betType,
      extraction.players,
      extraction.market,
      extraction.line
    ).catch((e) => {
      console.error("[Stats] Game status check failed:", e);
      return null;
    }),
  ]);

  let aiResult: Record<string, unknown> = {};
  if (text) {
    try {
      aiResult = parseGeminiJSON(text);
    } catch (e) {
      console.error("[Stats] JSON parse failed:", e);
      aiResult = { summary: "Check the charts below.", stats: [] };
    }
  }

  // Compute Swish Score
  const swishScore = computeSwishScore(extraction.betType, computed, extraction, teamData);

  // Compute Key Insight
  const keyInsight = computeKeyInsight(extraction, computed, teamData);

  // Compute smart suggestion chips
  const suggestions = computeSmartSuggestions(extraction, computed, teamData);

  // Extract visual metadata (logos, headshots, colors) from team data
  const visuals = extractVisuals(teamData, extraction);

  // Compute hit rate and prepend to stats
  const hitRate = computeHitRate(extraction, computed, teamData);
  const aiStats = (aiResult.stats || []) as { label: string; value: string; context: string }[];
  const allStats = hitRate ? [hitRate, ...aiStats] : aiStats;

  if (isSummaryOnly) {
    return {
      summary: aiResult.summary || "Check the charts below.",
      stats: allStats,
      charts,
      _computed: { oddsAnalysis: computed.oddsAnalysis, source },
      gameStatus,
      visuals,
      swishScore,
      keyInsight,
      suggestions,
    };
  }

  return {
    summary: aiResult.summary || "",
    stats: allStats,
    charts: (aiResult.charts as unknown[])?.length ? aiResult.charts : charts,
    _computed: { oddsAnalysis: computed.oddsAnalysis, source },
    gameStatus,
    visuals,
    swishScore,
    keyInsight,
    suggestions,
  };
}

/**
 * Compute a one-sentence key insight based on bet type and computed data.
 */
function computeKeyInsight(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const { teamMetrics, betTypeInsights } = computed;
  const teams = Object.values(teamMetrics);

  switch (extraction.betType) {
    case "player_prop": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerData = (rawData as any)?._players;
      const playerName = extraction.players[0] || "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pData = playerData?.[playerName] as any;
      const pa = pData?.propAnalysis;
      if (pa) {
        return `${pa.hitCount}/${pa.totalGames} over the line, ${pa.trend} (avg ${pa.average} vs ${pa.line} line)`;
      }
      return "Limited player prop data available";
    }
    case "spread": {
      const team = teams[0];
      if (team?.ats) {
        const total = team.ats.covers + team.ats.fails;
        const avgMargin = team.recentGames.length > 0
          ? Math.round((team.recentGames.reduce((s, g) => s + g.margin, 0) / team.recentGames.length) * 10) / 10
          : 0;
        return `Covered ${extraction.line} in ${team.ats.covers}/${total}, avg margin ${avgMargin > 0 ? "+" : ""}${avgMargin}`;
      }
      return "Limited spread data available";
    }
    case "over_under": {
      const line = extraction.line ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const combined = betTypeInsights._combined as any;
      if (combined?.projectedTotal && line > 0) {
        const proj = combined.projectedTotal;
        const diff = Math.round(Math.abs(proj - line) * 10) / 10;
        const direction = proj >= line ? "over" : "under";
        return `Games project ~${proj} — ${diff} ${direction} the ${line} line`;
      }
      if (teams.length >= 2 && line > 0) {
        const proj = Math.round((teams[0].scoring.avgPointsFor + teams[1].scoring.avgPointsFor) * 10) / 10;
        const diff = Math.round(Math.abs(proj - line) * 10) / 10;
        const direction = proj >= line ? "over" : "under";
        return `Games project ~${proj} — ${diff} ${direction} the ${line} line`;
      }
      return "Limited over/under data available";
    }
    case "moneyline": {
      const team = teams[0];
      if (team) {
        const winPct = Math.round(team.record.pct * 100);
        const streak = `${team.streak.type}${team.streak.count}`;
        return `${team.name} ${winPct}% win rate, on a ${streak} streak`;
      }
      return "Limited moneyline data available";
    }
    default:
      return "";
  }
}

/**
 * Compute a "hit rate" hero stat showing how often this exact bet would have hit
 * historically. Returns null if not enough data.
 */
function computeHitRate(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): { label: string; value: string; context: string } | null {
  const line = extraction.line ?? 0;
  const teams = Object.values(computed.teamMetrics);

  switch (extraction.betType) {
    case "player_prop": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerData = (rawData as any)?._players;
      const playerName = extraction.players?.[0] || "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pData = playerData?.[playerName] as any;
      const pa = pData?.propAnalysis;
      if (pa && pa.totalGames >= 3) {
        const pct = Math.round(pa.hitRate * 100);
        const thin = pa.totalGames < 10;
        // Compute current streak
        const gv = pa.gameValues || [];
        let streak = 0;
        if (gv.length > 0) {
          const lastHit = gv[gv.length - 1]?.hit;
          for (let i = gv.length - 1; i >= 0; i--) {
            if (gv[i].hit === lastHit) streak++;
            else break;
          }
        }
        const streakText = streak >= 3 ? ` | ${gv[gv.length - 1]?.hit ? "Over" : "Under"} ${streak} straight` : "";
        return {
          label: "Line Hit Rate",
          value: `${pct}%`,
          context: `Over ${pa.line} in ${pa.hitCount} of ${pa.totalGames} games${streakText}${thin ? " (small sample)" : ""}`,
        };
      }
      return null;
    }
    case "spread": {
      const team = teams[0];
      if (team?.ats && line !== 0) {
        const total = team.ats.covers + team.ats.fails;
        if (total < 3) return null;
        const pct = Math.round(team.ats.coverRate * 100);
        // ATS streak
        let atsStreak = 0;
        const rg = team.recentGames;
        if (rg.length > 0) {
          const lastCovered = rg[rg.length - 1].margin + line > 0;
          for (let i = rg.length - 1; i >= 0; i--) {
            if ((rg[i].margin + line > 0) === lastCovered) atsStreak++;
            else break;
          }
        }
        const atsStreakText = atsStreak >= 3 ? ` | ${rg[rg.length - 1].margin + line > 0 ? "Covered" : "Failed"} ${atsStreak} straight` : "";
        return {
          label: "Cover Rate",
          value: `${pct}%`,
          context: `Covered ${line > 0 ? "+" : ""}${line} in ${team.ats.covers} of ${total} games${atsStreakText}`,
        };
      }
      return null;
    }
    case "over_under": {
      if (line <= 0 || teams.length < 2) return null;
      // Check each team's games against the line
      const t0Games = teams[0].recentGames;
      const t1Games = teams[1].recentGames;
      const t0Overs = t0Games.filter((g) => g.totalPoints > line).length;
      const t1Overs = t1Games.filter((g) => g.totalPoints > line).length;
      const totalGames = t0Games.length + t1Games.length;
      const totalOvers = t0Overs + t1Overs;
      if (totalGames < 6) return null;
      const pct = Math.round((totalOvers / totalGames) * 100);
      const isOver = (extraction.description || "").toLowerCase().includes("over");
      const isUnder = (extraction.description || "").toLowerCase().includes("under");
      if (isUnder) {
        const underPct = 100 - pct;
        return {
          label: "Under Hit Rate",
          value: `${underPct}%`,
          context: `Under ${line} in ${totalGames - totalOvers} of ${totalGames} combined games`,
        };
      }
      return {
        label: isOver ? "Over Hit Rate" : "O/U Hit Rate",
        value: `${pct}%`,
        context: `Over ${line} in ${totalOvers} of ${totalGames} combined games`,
      };
    }
    case "moneyline": {
      const team = teams[0];
      if (!team || team.recentGames.length < 3) return null;
      const total = team.record.wins + team.record.losses;
      const pct = Math.round(team.record.pct * 100);
      const thin = total < 10;
      const streakText = team.streak.count >= 2 ? ` | ${team.streak.type}${team.streak.count}` : "";
      return {
        label: "Win Rate",
        value: `${pct}%`,
        context: `${team.record.wins}-${team.record.losses} this season${streakText}${thin ? " (early season)" : ""}`,
      };
    }
    default:
      return null;
  }
}

/**
 * Extract visual metadata (logos, headshots, team colors) from raw team data.
 * These are ESPN CDN URLs — no extra API calls needed.
 */
function extractVisuals(
  teamData: Record<string, unknown>,
  extraction: BetExtraction
): Record<string, unknown> {
  const teams: Record<string, { logo?: string; color?: string }> = {};
  const players: Record<string, { headshot?: string }> = {};

  // Team logos and colors
  for (const name of extraction.teams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = teamData[name] as any;
    if (data?.team) {
      const t = data.team;
      teams[name] = {
        logo: t.logos?.[0]?.href || t.logo,
        color: t.color ? `#${t.color}` : undefined,
      };
    }
  }

  // Player headshots
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerData = (teamData as any)?._players;
  if (playerData) {
    for (const [pName, pData] of Object.entries(playerData)) {
      if (!pData) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = pData as any;
      const headshot = p.player?.headshot?.href || p.player?.headshot ||
        (p.player?.id ? `https://a.espncdn.com/i/headshots/nba/players/full/${p.player.id}.png` : undefined);
      if (headshot) players[pName] = { headshot };
    }
  }

  return { teams, players };
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

    // Log every bet submission to Discord
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const isParlay = extraction.betType === "parlay";
      const legCount = extraction.legs?.length || 0;
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `${isParlay ? "🎰" : "📊"} Bet Submitted`,
            color: 0x6366f1,
            fields: [
              { name: "Bet", value: (extraction.description || "?").slice(0, 200), inline: false },
              { name: "Sport", value: extraction.sport || "?", inline: true },
              { name: "Type", value: extraction.betType?.replace("_", "/") || "?", inline: true },
              ...(extraction.market ? [{ name: "Market", value: extraction.market, inline: true }] : []),
              ...(extraction.players?.length ? [{ name: "Players", value: extraction.players.join(", "), inline: true }] : []),
              { name: "Teams", value: extraction.teams?.join(" vs ") || "?", inline: true },
              ...(isParlay ? [{ name: "Legs", value: String(legCount), inline: true }] : []),
            ],
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(() => {});
    }

    if (extraction.betType === "parlay") {
      const legs = extraction.legs || [];
      if (legs.length === 0) {
        logToDiscord("empty_parlay", extraction, "No legs extracted from screenshot");
        return NextResponse.json({ parlay: true, legs: [] });
      }

      // Step 1: Fix up legs — inherit missing teams/sport from parent
      // Gemini can return null for any field, so guard everything
      const fixedLegs = legs.slice(0, 6).map((leg) => {
        if (!leg.teams || leg.teams.length === 0) {
          leg.teams = extraction.teams || [];
        }
        // Filter out any null/undefined team names inside the array
        leg.teams = (leg.teams || []).filter((t): t is string => !!t);
        if (!leg.sport) leg.sport = extraction.sport || "";
        if (!leg.market) leg.market = "";
        if (!leg.description) leg.description = "";
        if (!leg.players) leg.players = [];
        // Filter out null player names
        leg.players = (leg.players || []).filter((p): p is string => !!p);
        if (!leg.betType) leg.betType = leg.market ? "player_prop" : "moneyline";
        if (!leg.odds) leg.odds = "";
        return leg;
      });

      // Step 2: Fetch data for ALL legs in parallel (no Gemini calls yet)
      const legData = await Promise.all(
        fixedLegs.map(async (leg) => {
          if (leg.teams.length === 0) return { leg, teamData: null, computed: null, charts: [] };
          try {
            const { data: teamData } = await fetchSportData(leg);
            if (teamData._unsupported) return { leg, teamData: null, computed: null, charts: [] };

            // Enrich with exotic market data (centralized detection)
            const legExotic = detectExoticMarket(leg.market || "", leg.description || "", leg.sport || "");
            if (legExotic === "first_basket" && isNBASport(leg.sport || "") && leg.players.length > 0) {
              try {
                const fbData = await getFirstBasketData(leg.players[0], leg.teams);
                if (fbData) (teamData as Record<string, unknown>)._firstBasket = fbData;
              } catch { /* non-blocking */ }
            } else if (legExotic === "nrfi" && isMLBSport(leg.sport || "") && leg.players.length > 0) {
              try {
                const nrfiData = await getFirstInningData(leg.players[0]);
                if (nrfiData) (teamData as Record<string, unknown>)._nrfi = nrfiData;
              } catch { /* non-blocking */ }
            } else if (legExotic === "first_goal" && isNHLSport(leg.sport || "") && leg.players.length > 0) {
              try {
                const fgData = await getFirstGoalData(leg.players[0], leg.teams);
                if (fgData) (teamData as Record<string, unknown>)._firstGoal = fgData;
              } catch { /* non-blocking */ }
            }

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

      // Step 4: Check game statuses for all legs in parallel
      const legGameStatuses = await Promise.all(
        fixedLegs.map(async (leg) => {
          try {
            return await checkGameStatus(
              leg.sport, leg.teams, leg.betType,
              leg.players || [], leg.market, leg.line
            );
          } catch { return null; }
        })
      );

      // Step 5: Combine charts + summaries + game status + swish scores
      const finalLegs = legData.map((ld, i) => {
        const aiLeg = legSummaries[i] || {};
        const legCharts = ld.charts.length > 0 ? ld.charts : (aiLeg.charts as unknown[]) || [];
        const legSummary = (aiLeg.summary as string) || null;
        const legStats = (aiLeg.stats as unknown[]) || [];
        const hasAnything = legCharts.length > 0 || legSummary || legStats.length > 0;

        // Per-leg Swish Score
        let legSwishScore = undefined;
        if (ld.computed && ld.teamData) {
          legSwishScore = computeSwishScore(ld.leg.betType, ld.computed, ld.leg, ld.teamData);
        }

        // Per-leg Hit Rate
        const legHitRate = ld.computed && ld.teamData
          ? computeHitRate(ld.leg, ld.computed, ld.teamData)
          : null;

        // Per-leg smart suggestions
        const legSuggestions = ld.computed && ld.teamData
          ? computeSmartSuggestions(ld.leg, ld.computed, ld.teamData)
          : undefined;
        const allLegStats = legHitRate ? [legHitRate, ...legStats] : legStats;

        return {
          description: ld.leg.description,
          sport: ld.leg.sport,
          betType: ld.leg.betType || "player_prop",
          teams: ld.leg.teams,
          players: ld.leg.players || [],
          market: ld.leg.market,
          line: ld.leg.line,
          odds: ld.leg.odds,
          summary: legSummary,
          stats: allLegStats,
          charts: legCharts,
          error: !hasAnything,
          unsupported: !ld.teamData && !hasAnything,
          computedData: ld.teamData || undefined,
          gameStatus: legGameStatuses[i] || undefined,
          swishScore: legSwishScore,
          suggestions: legSuggestions,
        };
      });

      // Compute average Swish Score across all legs (scores are 0-10 scale)
      const legScores = finalLegs
        .map((l) => l.swishScore?.score)
        .filter((s): s is number => s != null);
      const avgScore = legScores.length > 0
        ? Math.round((legScores.reduce((s, v) => s + v, 0) / legScores.length) * 10) / 10
        : undefined;
      const parlaySwishScore = avgScore != null
        ? { score: avgScore, label: avgScore <= 3 ? "Weak" : avgScore <= 4.5 ? "Shaky" : avgScore <= 5.5 ? "Toss-Up" : avgScore <= 7 ? "Solid" : avgScore <= 8.5 ? "Strong" : "Lock", detail: `Average across ${legScores.length} legs` }
        : undefined;

      // Log successful parlay to Discord
      logParlayToDiscord(extraction, finalLegs);

      return NextResponse.json({
        parlay: true,
        legCount: legs.length,
        legs: finalLegs,
        swishScore: parlaySwishScore,
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

  return `You're a sports data analyst writing for 22-year-old bettors. Quick, punchy, data-driven. Present what the numbers say — no recommendations.

${context}${marketContext}

Return JSON with ONLY these keys:

1. **summary**: MAX 2 short sentences. Lead with the KEY number (hit rate, avg, trend direction), then add opponent/matchup context. Example: "Brunson has cleared 26.5 points in 9 of his last 12 and is averaging 28.4 over that stretch. The Bulls rank 27th in opponent points allowed per game." No fluff, no "this looks good" — just the data story.

2. **stats**: Array of 3-4 stats (NOT 5). Each has:
   - label: short and punchy (4 words max). Use action words: "Hit Rate L10", "Season Avg", "Opp Allows", "Last 5 Trend"
   - value: the number/string (use % for rates, plain numbers for counts)
   - context: ONE short sentence — must reference either (a) trend direction (rising/falling/stable), (b) opponent context, or (c) home/away split${marketContext ? " — reference the specific factors that matter for this market" : ""}

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

/**
 * Generate context-aware suggestion chips based on the actual analysis data.
 * Returns 3-4 short strings that make sense for what the data reveals.
 */
function computeSmartSuggestions(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string[] {
  const suggestions: string[] = [];
  const sport = (extraction.sport || "").toUpperCase();
  const { teamMetrics, headToHead } = computed;
  const teams = Object.values(teamMetrics);

  if (extraction.betType === "player_prop") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerData = (rawData as any)?._players;
    const playerName = extraction.players?.[0] || "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pData = playerData?.[playerName] as any;
    const pa = pData?.propAnalysis;

    // Home/away split difference
    if (pa?.homeAvg != null && pa?.awayAvg != null) {
      const diff = Math.abs(pa.homeAvg - pa.awayAvg);
      const total = (pa.homeAvg + pa.awayAvg) / 2 || 1;
      if (diff / total > 0.15) {
        suggestions.push("Show home vs away breakdown");
      }
    }

    // Streak detection
    if (pa?.gameValues?.length >= 3) {
      const gv = pa.gameValues;
      let streak = 1;
      const lastHit = gv[gv.length - 1]?.hit;
      for (let i = gv.length - 2; i >= 0; i--) {
        if (gv[i].hit === lastHit) streak++;
        else break;
      }
      if (streak >= 3) {
        suggestions.push("Show last 5 games");
      }
    }

    // Opponent history
    if (extraction.teams.length >= 2) {
      const opponent = extraction.teams[1] || extraction.teams[0];
      suggestions.push(`How does he do vs ${opponent}?`);
    }

    // Sport-specific deep dive
    if (sport === "NBA") {
      suggestions.push("Show assist-to-turnover ratio trend");
    } else if (sport === "MLB" || sport === "BASEBALL") {
      suggestions.push("Compare vs lefty and righty pitchers");
    } else if (sport === "NHL" || sport === "HOCKEY") {
      suggestions.push("Show power play vs even strength");
    } else if (sport === "NFL" || sport === "FOOTBALL") {
      suggestions.push("Show red zone targets");
    }

    // Small sample fallback
    if (pa && pa.totalGames < 15) {
      suggestions.push("Show last season stats");
    }
  } else {
    // Team bets: spread, moneyline, over/under
    const team0 = teams[0];

    // Home/away suggestion based on where tonight's game likely is
    if (team0?.homeRecord && team0?.awayRecord) {
      // If we can detect home/away from recent games or description
      const desc = (extraction.description || "").toLowerCase();
      if (desc.includes("@") || desc.includes("away") || desc.includes("road")) {
        suggestions.push("Show away games only");
      } else {
        suggestions.push("Show home games only");
      }
    } else {
      suggestions.push("Show home vs away splits");
    }

    suggestions.push("Show last 10 games");

    // Head-to-head if both teams available
    if (headToHead && extraction.teams.length >= 2) {
      suggestions.push("Head-to-head history");
    }

    // Regular season vs playoffs
    if (team0?.recentGames?.some((g) => g.seasonType === "playoffs")) {
      suggestions.push("Regular season only");
    }
  }

  // Cap at 4 suggestions
  return suggestions.slice(0, 4);
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
