/**
 * MLB First Inning (NRFI/YRFI) data from models/nrfi-data.json.
 *
 * Pre-built from recent game play-by-play data.
 * Data is per-pitcher: clean first inning rates, recent game results.
 * Updated by research/collect-nrfi.py.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────

export interface NRFIPitcherProfile {
  name: string;
  firstInningCleanRate: number;
  gamesStarted: number;
  cleanFirstInnings: number;
  runsInFirstInning: number[];
}

export interface NRFIRecentGame {
  date: string;
  opponent: string;
  firstInningRuns: number;
  result: "NRFI" | "YRFI";
}

export interface NRFIData {
  pitcher: NRFIPitcherProfile;
  recentGames: NRFIRecentGame[];
}

// ── Static JSON shape ────────────────────────────────────────────

interface NRFIPitcherEntry {
  name: string;
  team: string;
  playerId: number;
  gamesStarted: number;
  cleanFirstInnings: number;
  nrfiRate: number;
  recentGames: { date: string; opponent: string; firstInningRuns: number; result: "NRFI" | "YRFI" }[];
}

interface NRFIDB {
  _meta: { gamesProcessed: number; lastUpdated: string; season: string };
  pitchers: Record<string, NRFIPitcherEntry>;
}

// ── Singleton loader ─────────────────────────────────────────────

let _db: NRFIDB | null = null;

function loadDB(): NRFIDB | null {
  if (_db) return _db;
  try {
    const raw = readFileSync(join(process.cwd(), "models", "nrfi-data.json"), "utf-8");
    _db = JSON.parse(raw);
    return _db;
  } catch {
    return null;
  }
}

// ── Exported function ─────────────────────────────────────────────

/**
 * Look up a pitcher by name in our NRFI database.
 * Returns the raw entry or null.
 */
export function findPitcherInDB(pitcherName: string): NRFIPitcherEntry | null {
  const db = loadDB();
  if (!db) return null;

  const nameLower = pitcherName.toLowerCase();
  for (const [, entry] of Object.entries(db.pitchers)) {
    const entryLower = entry.name.toLowerCase();
    if (entryLower === nameLower || entryLower.includes(nameLower) || nameLower.includes(entryLower)) {
      return entry;
    }
  }
  // Partial last-name match
  const parts = nameLower.split(/\s+/);
  const lastName = parts[parts.length - 1];
  if (lastName.length >= 3) {
    for (const [, entry] of Object.entries(db.pitchers)) {
      if (entry.name.toLowerCase().includes(lastName)) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Get all pitchers for a given team from our NRFI database.
 */
export function getTeamPitchers(teamName: string): NRFIPitcherEntry[] {
  const db = loadDB();
  if (!db) return [];
  const nameLower = teamName.toLowerCase();
  return Object.values(db.pitchers).filter((p) => {
    const team = p.team.toLowerCase();
    return team.includes(nameLower) || nameLower.includes(team) ||
      // Handle partial matches like "Dodgers" matching "Los Angeles Dodgers"
      nameLower.split(/\s+/).some((word) => word.length >= 4 && team.includes(word));
  });
}

/**
 * Get NRFI/YRFI analysis for a specific pitcher.
 * Returns null if the pitcher is not found or no data is available.
 */
export async function getFirstInningData(
  pitcherName: string
): Promise<NRFIData | null> {
  const db = loadDB();
  if (!db) return null;

  const nameLower = pitcherName.toLowerCase();

  // Find the pitcher by name (exact or fuzzy)
  let match: NRFIPitcherEntry | null = null;
  for (const [, entry] of Object.entries(db.pitchers)) {
    const entryLower = entry.name.toLowerCase();
    if (
      entryLower === nameLower ||
      entryLower.includes(nameLower) ||
      nameLower.includes(entryLower)
    ) {
      match = entry;
      break;
    }
  }

  if (!match) {
    // Try partial last-name match
    const parts = nameLower.split(/\s+/);
    const lastName = parts[parts.length - 1];
    if (lastName.length >= 3) {
      for (const [, entry] of Object.entries(db.pitchers)) {
        if (entry.name.toLowerCase().includes(lastName)) {
          match = entry;
          break;
        }
      }
    }
  }

  if (!match) return null;

  const runsArr = match.recentGames.map((g) => g.firstInningRuns);

  return {
    pitcher: {
      name: match.name,
      firstInningCleanRate: match.nrfiRate,
      gamesStarted: match.gamesStarted,
      cleanFirstInnings: match.cleanFirstInnings,
      runsInFirstInning: runsArr,
    },
    recentGames: match.recentGames,
  };
}
