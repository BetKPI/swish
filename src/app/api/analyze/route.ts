import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

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

For parlays, set betType to "parlay" and include a "legs" array where each leg has the same structure (without nested legs).

Respond ONLY with valid JSON, no markdown or explanation.`;

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: image,
              },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from Claude" },
        { status: 500 }
      );
    }

    const extraction = JSON.parse(textBlock.text);

    return NextResponse.json({ extraction });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json(
      { error: "Failed to analyze image" },
      { status: 500 }
    );
  }
}
