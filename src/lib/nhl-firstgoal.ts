/**
 * NHL First Goal Scorer data from models/first-goal-data.json.
 *
 * Pre-built from recent game play-by-play data.
 * Data is per-team and per-player: first goal scorer rates.
 * Updated by research/collect-firstgoal.py.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────

export interface FirstGoalPlayerProfile {
  name: string;
  firstGoalCount: number;
  firstGoalRate: number;
  goalsPerGame: number;
  shootingPct: number;
  recentGames: {
    gameId: number;
    date: string;
    opponent: string;
    goals: number;
    wasFirstGoalScorer: boolean;
  }[];
}

export interface TopFirstScorer {
  name: string;
  rate: number;
  count: number;
}

export interface FirstGoalData {
  player: FirstGoalPlayerProfile | null;
  topFirstScorers: TopFirstScorer[];
}

// ── Static JSON shape ────────────────────────────────────────────

interface PlayerEntry {
  name: string;
  playerId: number;
  team: string;
  firstGoalCount: number;
  recentGames: { date: string; vs: string; time: string; period: number }[];
}

interface TeamEntry {
  tricode: string;
  totalGames: number;
  firstScorers: { name: string; count: number; rate: number; games?: { date: string; vs: string; time: string; period: number }[] }[];
}

interface FirstGoalDB {
  _meta: { gamesProcessed: number; totalGames?: number; lastUpdated: string; season: string };
  teams: Record<string, TeamEntry>;
  players?: Record<string, PlayerEntry>;
  topFirstScorers: { name: string; team?: string; count: number; rate: number }[];
}

// ── Singleton loader ─────────────────────────────────────────────

let _db: FirstGoalDB | null = null;

function loadDB(): FirstGoalDB | null {
  if (_db) return _db;
  try {
    const raw = readFileSync(join(process.cwd(), "models", "first-goal-data.json"), "utf-8");
    _db = JSON.parse(raw);
    return _db;
  } catch {
    return null;
  }
}

// ── Exported function ─────────────────────────────────────────────

/**
 * Get first goal scorer analysis for a specific player.
 * Returns player profile (if found) and top first goal scorers.
 */
export async function getFirstGoalData(
  playerName: string,
  teamNames: string[]
): Promise<FirstGoalData | null> {
  const db = loadDB();
  if (!db) return null;

  const nameLower = playerName.toLowerCase();

  // Build top first scorers from static data
  const topFirstScorers: TopFirstScorer[] = db.topFirstScorers.map((s) => ({
    name: s.name,
    count: s.count,
    rate: s.rate,
  }));

  // Find the requested player — search through team firstScorers lists
  let playerProfile: FirstGoalPlayerProfile | null = null;

  // First: search players object if it exists
  if (db.players) {
    for (const [, entry] of Object.entries(db.players)) {
      const entryLower = entry.name.toLowerCase();
      if (entryLower === nameLower || entryLower.includes(nameLower) || nameLower.includes(entryLower)) {
        const totalGames = db._meta.gamesProcessed || 1;
        playerProfile = {
          name: entry.name, firstGoalCount: entry.firstGoalCount,
          firstGoalRate: totalGames > 0 ? Math.round((entry.firstGoalCount / totalGames) * 1000) / 10 : 0,
          goalsPerGame: 0, shootingPct: 0,
          recentGames: entry.recentGames.map((g) => ({ gameId: 0, date: g.date, opponent: g.vs, goals: 1, wasFirstGoalScorer: true })),
        };
        break;
      }
    }
  }

  // Second: search team firstScorers lists (handles name fuzzy matching)
  if (!playerProfile) {
    const lastName = nameLower.split(/\s+/).pop() || "";
    for (const [, teamEntry] of Object.entries(db.teams)) {
      for (const scorer of (teamEntry.firstScorers || [])) {
        const scorerLower = scorer.name.toLowerCase();
        if (scorerLower === nameLower || scorerLower.includes(nameLower) || nameLower.includes(scorerLower) ||
            (lastName.length >= 3 && scorerLower.includes(lastName))) {
          playerProfile = {
            name: scorer.name, firstGoalCount: scorer.count, firstGoalRate: scorer.rate,
            goalsPerGame: 0, shootingPct: 0,
            recentGames: (scorer.games || []).map((g) => ({ gameId: 0, date: g.date, opponent: g.vs, goals: 1, wasFirstGoalScorer: true })),
          };
          break;
        }
      }
      if (playerProfile) break;
    }
  }

  return {
    player: playerProfile,
    topFirstScorers,
  };
}
