import { NextRequest, NextResponse } from "next/server";
import { checkGameStatus } from "@/lib/gameStatus";

/**
 * Lightweight game status endpoint — ESPN only, no Gemini calls.
 * Used for live score polling (every 30s).
 */
export async function POST(request: NextRequest) {
  try {
    const { sport, teams, betType, players, market, line } = await request.json();

    if (!sport || !teams) {
      return NextResponse.json({ error: "Missing sport or teams" }, { status: 400 });
    }

    const status = await checkGameStatus(
      sport,
      teams || [],
      betType || "moneyline",
      players || [],
      market,
      line
    );

    return NextResponse.json({ gameStatus: status });
  } catch (error) {
    console.error("[GameStatus] Error:", error);
    return NextResponse.json({ gameStatus: null });
  }
}
