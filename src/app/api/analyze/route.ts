import { NextRequest, NextResponse } from "next/server";

const EXTRACTION_PROMPT = `You are an expert sports betting analyst. Analyze this screenshot of a sports bet and extract structured information.

Return a JSON object with these fields:
- sport: The sport (e.g., "NBA", "NFL", "MLB", "NHL", "Soccer", "Tennis", "MMA")
- betType: One of "moneyline", "spread", "over_under", "player_prop", "game_prop", "parlay"
- teams: Array of team names involved
- players: Array of player names (if relevant, otherwise empty array)
- line: The line/number (spread value, total, prop line) as a number, or null if not applicable
- odds: The odds as a string (e.g., "-110", "+150", "1.95")
- market: The specific market name (e.g., "First Basket Scorer", "Anytime TD Scorer", "Points Spread")
- description: A human-readable one-sentence summary of the bet
- confidence: Your confidence in the extraction from 0 to 1 (1 = very confident)

For parlays, set betType to "parlay" and include a "legs" array where each leg has the FULL structure above (sport, betType, teams, players, line, odds, market, description, confidence). CRITICAL: each leg MUST include the "teams" array with the team names involved in that leg — even for player props, include the teams playing in that game. Without teams, we cannot analyze the leg.

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini API error:", err);
      return NextResponse.json(
        { error: "Failed to analyze image" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(
        { error: "No response from Gemini" },
        { status: 500 }
      );
    }

    // Parse JSON — handle markdown code blocks
    let jsonText = text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const extraction = JSON.parse(jsonText);

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
