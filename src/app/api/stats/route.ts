import { NextRequest, NextResponse } from "next/server";
import { fetchAllTeamData } from "@/lib/espn";
import type { BetExtraction } from "@/types";

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

    // Fetch ESPN data for teams
    const espnData = await fetchAllTeamData(
      extraction.sport,
      extraction.teams
    );

    // Ask Gemini to analyze the data and produce charts
    const analysisPrompt = buildAnalysisPrompt(extraction, espnData);

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
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
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
  espnData: Record<string, unknown>
): string {
  return `You are a sports analytics expert. Analyze this bet and the available data to produce charts and insights.

BET DETAILS:
${JSON.stringify(extraction, null, 2)}

AVAILABLE ESPN DATA:
${JSON.stringify(espnData, null, 2)}

Based on this bet type ("${extraction.betType}") and sport ("${extraction.sport}"), produce an analysis with:

1. **summary**: A 2-3 sentence analysis of what the data suggests about this bet. Be objective — present data, not recommendations. End with a disclaimer note.

2. **stats**: Array of 3-5 key stat data points, each with:
   - label: stat name
   - value: the value (number or string)
   - context: why this matters for the bet (one sentence)

3. **charts**: Array of 3-5 chart configurations. For each chart:
   - type: "line", "bar", "distribution", or "table"
   - title: descriptive chart title
   - relevance: one sentence explaining why this chart matters for the bet
   - data: array of data point objects with consistent keys
   - xKey: the key to use for X axis
   - yKeys: array of keys to plot on Y axis
   - For tables: include "columns" array with {key, label} objects

IMPORTANT GUIDELINES:
- Make charts SPECIFIC to the bet type:
  - For spreads: show ATS trends, margin of victory, H2H results
  - For over/under: show scoring trends, pace data, combined totals
  - For moneyline: show win streaks, win % trends, recent form
  - For player props: show player stat trends, matchup data
- Use real data from ESPN where available. If data is missing, generate reasonable sample data based on what's typical for the sport/team.
- Make data arrays have 5-10 data points each.
- Chart data keys must be simple strings (no spaces, use camelCase).
- Return ONLY valid JSON with keys: summary, stats, charts.`;
}
