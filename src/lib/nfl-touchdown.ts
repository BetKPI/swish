/**
 * NFL Touchdown Scorer data — anytime TD and first TD.
 *
 * Loads from models/nfl-td-data.json (built during NFL season).
 * Currently a skeleton — will be populated when NFL season starts.
 *
 * Data will include:
 * - Per-player TD rate (rushing + receiving TDs / games played)
 * - Red zone targets and goal-line carries (proxy from total targets)
 * - Per-team TD leaders
 */

import { readFileSync } from "fs";
import { join } from "path";

interface NFLTDData {
  _meta: { gamesProcessed: number; lastUpdated: string; season: string };
  teams: Record<string, {
    tricode: string;
    totalGames: number;
    tdLeaders: { name: string; tds: number; rate: number; targets?: number; carries?: number }[];
  }>;
  topScorers: { name: string; tds: number; team: string }[];
}

let _db: NFLTDData | null = null;

function loadDB(): NFLTDData | null {
  if (_db) return _db;
  try {
    const raw = readFileSync(join(process.cwd(), "models", "nfl-td-data.json"), "utf-8");
    _db = JSON.parse(raw);
    return _db;
  } catch {
    return null; // No data during offseason — expected
  }
}

export async function getTouchdownData(
  playerName: string,
  teamNames: string[]
): Promise<{
  playerTeam: NFLTDData["teams"][string] | null;
  opponentTeam: NFLTDData["teams"][string] | null;
  gamesProcessed: number;
} | null> {
  const db = loadDB();
  if (!db) return null;

  // TODO: implement team matching when NFL season starts
  return null;
}
