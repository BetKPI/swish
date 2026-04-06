/**
 * NBA First Basket / First Scorer data.
 *
 * Loads pre-built data from models/first-basket-data.json (generated locally
 * by research/collect-firstbasket.py). The JSON deploys with the app — no
 * live NBA.com fetching from Vercel (which gets blocked).
 *
 * Data includes: first basket scorers, tip-off winners, first shot attempts.
 * Updated daily via local script.
 */

import { readFileSync } from "fs";
import { join } from "path";

interface FirstBasketDB {
  _meta: { gamesProcessed: number; lastUpdated: string };
  players: Record<string, {
    name: string;
    firstBaskets: number;
    firstShots: number;
    games: { vs: string; scoredFirst: boolean; shotFirst: boolean; shotType?: string }[];
  }>;
  tipOff: Record<string, {
    name: string;
    wins: number;
    losses: number;
    total: number;
    winRate: number;
  }>;
  topFirstScorers: { name: string; count: number; shotCount: number }[];
}

let _db: FirstBasketDB | null = null;

function loadDB(): FirstBasketDB | null {
  if (_db) return _db;
  try {
    const raw = readFileSync(join(process.cwd(), "models", "first-basket-data.json"), "utf-8");
    _db = JSON.parse(raw);
    return _db;
  } catch {
    console.log("[FirstBasket] No first-basket-data.json found");
    return null;
  }
}

export interface PlayerFirstBasketProfile {
  playerName: string;
  gamesPlayed: number;
  firstBasketCount: number;
  firstBasketRate: number;
  firstShotAttemptCount: number;
  firstShotAttemptRate: number;
  recentGames: {
    opponent: string;
    scoredFirst: boolean;
    shotFirst: boolean;
    shotType?: string;
  }[];
}

export interface TipOffProfile {
  name: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

/**
 * Get first basket analysis for a specific player.
 */
export async function getFirstBasketData(
  playerName: string,
  teamNames: string[]
): Promise<{
  player: PlayerFirstBasketProfile | null;
  tipOff: TipOffProfile[];
  topFirstScorers: { name: string; rate: number; count: number }[];
  gamesProcessed: number;
} | null> {
  const db = loadDB();
  if (!db) return null;

  // Fuzzy match player
  const nameLower = playerName.toLowerCase();
  let player: PlayerFirstBasketProfile | null = null;

  for (const [key, p] of Object.entries(db.players)) {
    const keyLower = key.toLowerCase();
    if (
      keyLower === nameLower ||
      keyLower.includes(nameLower) ||
      nameLower.includes(keyLower) ||
      // Handle "S. Castle" vs "Stephon Castle" — match last name
      (nameLower.includes(".") && keyLower.endsWith(nameLower.split(". ")[1]?.toLowerCase() || "___"))
    ) {
      const totalGames = Math.max(p.games.length, p.firstBaskets, p.firstShots);
      player = {
        playerName: p.name,
        gamesPlayed: totalGames,
        firstBasketCount: p.firstBaskets,
        firstBasketRate: totalGames > 0 ? Math.round((p.firstBaskets / totalGames) * 100) : 0,
        firstShotAttemptCount: p.firstShots,
        firstShotAttemptRate: totalGames > 0 ? Math.round((p.firstShots / totalGames) * 100) : 0,
        recentGames: p.games.map((g) => ({
          opponent: g.vs,
          scoredFirst: g.scoredFirst,
          shotFirst: g.shotFirst,
          shotType: g.shotType,
        })),
      };
      break;
    }
  }

  // Get tip-off data for the teams' centers
  const tipOff: TipOffProfile[] = [];
  for (const [, t] of Object.entries(db.tipOff)) {
    if (t.total >= 2) {
      tipOff.push(t);
    }
  }
  // Sort by total tips (most active centers first)
  tipOff.sort((a, b) => b.total - a.total);

  // Top first scorers with rate
  const totalGames = db._meta.gamesProcessed;
  const topFirstScorers = db.topFirstScorers.map((p) => ({
    name: p.name,
    rate: totalGames > 0 ? Math.round((p.count / totalGames) * 100) : 0,
    count: p.count,
  }));

  return {
    player,
    tipOff: tipOff.slice(0, 15),
    topFirstScorers,
    gamesProcessed: totalGames,
  };
}
