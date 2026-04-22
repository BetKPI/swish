import { NextRequest, NextResponse } from "next/server";
import { fetchWithRetry } from "@/lib/fetch";

/**
 * Normalize the sport string returned by Gemini into a canonical display name.
 * Gemini sometimes returns tournament names (e.g. "The Masters") or league names
 * (e.g. "PGA", "PGA Tour") instead of the generic sport name. This function maps
 * all known variants to the correct display label so the UI badge is always right.
 */
function normalizeSport(raw: string): string {
  const s = (raw || "").trim().toUpperCase();
  const map: Record<string, string> = {
    // Golf variants — Gemini sometimes returns tournament/league name
    GOLF: "Golf",
    PGA: "Golf",
    "PGA TOUR": "Golf",
    "THE MASTERS": "Golf",
    MASTERS: "Golf",
    LIV: "Golf",
    LPGA: "Golf",
    // Standard sports
    NBA: "NBA",
    NFL: "NFL",
    MLB: "MLB",
    NHL: "NHL",
    NCAAB: "NCAAB",
    NCAAF: "NCAAF",
    WNBA: "WNBA",
    MLS: "Soccer",
    SOCCER: "Soccer",
    EPL: "Soccer",
    "PREMIER LEAGUE": "Soccer",
    "LA LIGA": "Soccer",
    "SERIE A": "Soccer",
    BUNDESLIGA: "Soccer",
    "LIGUE 1": "Soccer",
    TENNIS: "Tennis",
    MMA: "MMA",
    UFC: "MMA",
    BOXING: "Boxing",
    // Common aliases
    BASKETBALL: "NBA",
    FOOTBALL: "NFL",
    BASEBALL: "MLB",
    HOCKEY: "NHL",
    "COLLEGE FOOTBALL": "NCAAF",
    "COLLEGE BASKETBALL": "NCAAB",
    CFB: "NCAAF",
    CBB: "NCAAB",
  };
  return map[s] || raw; // If not found, pass through the original
}

/**
 * Apply normalization to a single extraction (and its parlay legs if present).
 */
function normalizeExtraction(extraction: Record<string, unknown>): void {
  if (extraction.sport && typeof extraction.sport === "string") {
    extraction.sport = normalizeSport(extraction.sport);
  }
  // Also normalize sport in parlay legs
  if (Array.isArray(extraction.legs)) {
    for (const leg of extraction.legs) {
      if (leg && typeof leg === "object" && typeof leg.sport === "string") {
        leg.sport = normalizeSport(leg.sport);
      }
    }
  }
}

/**
 * Detect home/away teams from "@" in the description or team order.
 * Bet slips commonly use "Team A @ Team B" meaning A is away, B is home.
 * Also handles "at" (e.g. "Tigers at Red Sox").
 */
function detectHomeAway(extraction: Record<string, unknown>): void {
  const desc = (extraction.description as string || "").toLowerCase();
  const teams = extraction.teams as string[] || [];

  if (teams.length === 2) {
    // Look for "@ " or " at " pattern in description
    const atMatch = desc.match(/(.+?)\s+(?:@|at)\s+(.+)/i);
    if (atMatch) {
      const awayPart = atMatch[1].trim().toLowerCase();
      const homePart = atMatch[2].trim().toLowerCase();

      // Match against team names (partial match — "tigers" matches "Detroit Tigers")
      const t0Lower = teams[0].toLowerCase();
      const t1Lower = teams[1].toLowerCase();

      // Check which team name appears in the away vs home part
      const t0IsAway = awayPart.includes(t0Lower) || t0Lower.includes(awayPart.split(/\s+/).pop() || "");
      const t1IsAway = awayPart.includes(t1Lower) || t1Lower.includes(awayPart.split(/\s+/).pop() || "");
      const t0IsHome = homePart.includes(t0Lower) || t0Lower.includes(homePart.split(/\s+/).pop() || "");
      const t1IsHome = homePart.includes(t1Lower) || t1Lower.includes(homePart.split(/\s+/).pop() || "");

      if (t0IsAway && t1IsHome) {
        extraction.awayTeam = teams[0];
        extraction.homeTeam = teams[1];
      } else if (t1IsAway && t0IsHome) {
        extraction.awayTeam = teams[1];
        extraction.homeTeam = teams[0];
      }
    }

    // Fallback: in most US sports, the first team listed is the away team
    // (on bet slips the format is typically "AWAY @ HOME" or "AWAY vs HOME")
    if (!extraction.homeTeam && !extraction.awayTeam) {
      // Check for "vs" pattern — first team is typically listed first (away)
      const vsMatch = desc.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/i);
      if (vsMatch) {
        const firstPart = vsMatch[1].trim().toLowerCase();
        const t0Lower = teams[0].toLowerCase();
        // If first team in description matches teams[0], standard order
        if (firstPart.includes(t0Lower.split(/\s+/).pop() || "")) {
          extraction.awayTeam = teams[0];
          extraction.homeTeam = teams[1];
        }
      }
    }
  }

  // Also process parlay legs
  if (Array.isArray(extraction.legs)) {
    for (const leg of extraction.legs) {
      if (leg && typeof leg === "object") {
        detectHomeAway(leg as Record<string, unknown>);
      }
    }
  }
}

const EXTRACTION_PROMPT = `You are an expert sports betting analyst. Analyze this screenshot of a sports bet and extract structured information.

Return a JSON object with these fields:
- sport: The sport (e.g., "NBA", "NFL", "MLB", "NHL", "Soccer", "Golf", "Tennis", "MMA")
- betType: One of "moneyline", "spread", "over_under", "player_prop", "game_prop", "parlay"
- teams: Array of team names involved
- players: Array of player names (if relevant, otherwise empty array)
- line: The line/number (spread value, total, prop line) as a number, or null if not applicable
- odds: The odds as a string (e.g., "-110", "+150", "1.95")
- market: The specific market name (e.g., "First Basket Scorer", "Anytime TD Scorer", "Points Spread")
- description: A human-readable one-sentence summary of the bet. IMPORTANT: If the bet slip shows "Team A @ Team B" or "Team A at Team B", preserve the "@" or "at" in the description — this tells us which team is away (before @) and which is home (after @).
- confidence: Your confidence in the extraction from 0 to 1 (1 = very confident)

CRITICAL — PARLAY DETECTION:
If the screenshot shows MORE THAN ONE bet selection (multiple lines/rows of bets, a bet slip with 2+ picks, or any indication of a multi-leg bet), you MUST set betType to "parlay" and include ALL legs. Signs of a parlay:
- Multiple bet lines visible in the screenshot
- "Parlay", "SGP", "Same Game Parlay", "Multi", "Accumulator", "Combo" in the UI
- Multiple odds/selections stacked in a bet slip
- A total/combined odds line at the bottom

For parlays, set betType to "parlay" and include a "legs" array where EVERY VISIBLE BET is its own leg with the FULL structure above (sport, betType, teams, players, line, odds, market, description, confidence). Do NOT skip any legs. Do NOT extract just one leg from a multi-leg slip. CRITICAL for each parlay leg:
- "teams" array MUST include the team names involved — even for player props, include the teams playing in that game. Without teams, we cannot analyze the leg.
- "market" MUST be specific and accurate — for player props, state the exact stat: "Shots on Goal", "Points", "Assists", "Rebounds", "Strikeouts", "Hits", "Total Bases", "Goals", "Saves", etc. Do NOT default to "Points" for non-points props. For shots bets, use "Shots on Goal". For goals, use "Goals". This is critical for showing the correct charts.
- "players" array MUST include any player names in the leg.
- Even if bets span different sports, include them ALL as legs.

For golf bets, set sport to "Golf". For tournament winner/matchup bets, use the golfer names as "players" and tournament name as team (e.g., teams: ["The Masters"]). For golf, market might be "Tournament Winner", "Top 5", "Top 10", "Top 20", "Make/Miss Cut", "Head-to-Head", "Round Score", etc.

Respond ONLY with valid JSON, no markdown or explanation.`;

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const geminiBody = JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: image,
              },
            },
            {
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    });

    const geminiHeaders = { "Content-Type": "application/json" };
    const MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"];

    let response: Response | null = null;
    for (const model of MODELS) {
      response = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: geminiHeaders, body: geminiBody },
        2,
        3000
      );
      if (response.ok) break;
      // If 503/429, try the next model
      if (response.status === 503 || response.status === 429 || response.status === 404) {
        console.log(`[Analyze] ${model} returned ${response.status}, trying fallback...`);
        continue;
      }
      break; // Other errors — don't retry with different model
    }

    if (!response || !response.ok) {
      const err = response ? await response.text() : "All models unavailable";
      const status = response?.status ?? 503;
      console.error("Gemini API error:", status, err);
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [{ title: "Gemini API Error", color: 0xef4444, fields: [{ name: "Status", value: `${status}`, inline: true }, { name: "Error", value: err.slice(0, 500), inline: false }], timestamp: new Date().toISOString() }] }),
        }).catch(() => {});
      }
      // User-friendly error for server overload vs actual failures
      const isOverloaded = status === 503 || status === 429 || status === 404;
      return NextResponse.json(
        { error: isOverloaded
          ? "Our AI is temporarily overloaded — wait a few seconds and try again"
          : "Failed to analyze image" },
        { status: isOverloaded ? 503 : 500 }
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [{ title: "Gemini Empty Response", color: 0xf59e0b, fields: [{ name: "Detail", value: JSON.stringify(data?.candidates?.[0] || "no candidates").slice(0, 500), inline: false }], timestamp: new Date().toISOString() }] }),
        }).catch(() => {});
      }
      return NextResponse.json(
        { error: "No response from Gemini" },
        { status: 500 }
      );
    }

    // Parse JSON — handle markdown code blocks and truncation
    let jsonText = text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let extraction;
    try {
      extraction = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error("JSON parse failed:", (parseErr as Error).message, "Raw text length:", text.length);
      // Log truncated response to Discord for debugging
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [{ title: "Screenshot Analysis — JSON Parse Failed", color: 0xef4444, fields: [
            { name: "Error", value: (parseErr as Error).message.slice(0, 200), inline: false },
            { name: "Raw text (last 200 chars)", value: jsonText.slice(-200), inline: false },
          ], timestamp: new Date().toISOString() }] }),
        }).catch(() => {});
      }
      return NextResponse.json(
        { error: "Couldn't read the bet from that image — try a clearer or closer screenshot" },
        { status: 422 }
      );
    }

    // Normalize sport names so the UI badge is always correct
    // (Gemini sometimes returns "PGA", "The Masters", etc. instead of "Golf")
    normalizeExtraction(extraction);

    // Detect home/away from "@" in description — "Tigers @ Red Sox" means Tigers away, Red Sox home
    detectHomeAway(extraction);

    // Log parlay extractions to Discord for debugging
    if (extraction.betType === "parlay") {
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        const legs = extraction.legs || [];
        const legSummary = legs.map((l: { description?: string; teams?: string[]; sport?: string }, i: number) =>
          `Leg ${i + 1}: ${l.description || "?"} | Teams: ${l.teams?.join(", ") || "MISSING"} | Sport: ${l.sport || "MISSING"}`
        ).join("\n");
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [{
              title: `Parlay Extracted — ${legs.length} legs`,
              color: legs.every((l: { teams?: string[] }) => (l.teams?.length || 0) > 0) ? 0x10b981 : 0xf59e0b,
              fields: [
                { name: "Description", value: (extraction.description || "?").slice(0, 200), inline: false },
                { name: "Legs", value: legSummary.slice(0, 1024) || "No legs", inline: false },
              ],
              timestamp: new Date().toISOString(),
            }],
          }),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ extraction });
  } catch (error) {
    console.error("Analyze error:", error);
    // Log to Discord
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "Screenshot Analysis Failed",
            color: 0xef4444,
            fields: [
              { name: "Error", value: (error instanceof Error ? error.message : "Unknown").slice(0, 200), inline: false },
            ],
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(() => {});
    }
    return NextResponse.json(
      { error: "Failed to analyze image" },
      { status: 500 }
    );
  }
}
