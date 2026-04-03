import { NextRequest, NextResponse } from "next/server";

/**
 * Chat endpoint — user asks for a specific analysis based on existing data.
 * Returns either a chart config or a message saying we don't have the data.
 */
export async function POST(request: NextRequest) {
  try {
    const { message, extraction, computedData } = await request.json();

    if (!message || !extraction) {
      return NextResponse.json(
        { error: "Missing message or extraction" },
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

    const prompt = `You are a sports analytics assistant. The user has already analyzed a bet and is asking for additional analysis.

BET CONTEXT:
${JSON.stringify(extraction, null, 2)}

AVAILABLE DATA (this is ALL we have — do not reference data outside of this):
${JSON.stringify(computedData, null, 2)}

USER REQUEST: "${message}"

You must respond with ONLY valid JSON in one of two formats:

FORMAT 1 — If you CAN produce the requested chart from the available data:
{
  "type": "chart",
  "message": "Brief explanation of what the chart shows (1 sentence)",
  "chart": {
    "type": "line" | "bar" | "distribution" | "table",
    "title": "Chart title",
    "relevance": "Why this matters",
    "data": [array of data objects with consistent camelCase keys],
    "xKey": "key for x axis",
    "yKeys": ["keys for y axis"]
  }
}
For tables, use "columns": [{"key": "k", "label": "Label"}] instead of xKey/yKeys.

FORMAT 2 — If you CANNOT produce the chart because the data isn't available:
{
  "type": "no_data",
  "message": "Brief explanation of what data we'd need and why we don't have it (1-2 sentences)"
}

RULES:
- ONLY use data from AVAILABLE DATA above. Never invent numbers.
- If the user asks about something not in the data (e.g. weather, injuries, referee stats), use format 2.
- Keep charts focused — one clear insight per chart.
- Data keys must be camelCase strings.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Chat Gemini error:", await response.text());
      return NextResponse.json(
        { error: "Failed to process request" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(
        { type: "no_data", message: "Couldn't process that — try rephrasing." }
      );
    }

    let jsonText = text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonText);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { type: "no_data", message: "Something went wrong — try again." }
    );
  }
}
