/**
 * Chart relevance scoring - learns from user ratings.
 *
 * Each chart gets a relevance score (0-1) keyed by sport+market+chartPattern.
 * Thumbs up increases score, thumbs down decreases it.
 * Charts below FILTER_THRESHOLD get hidden.
 * Charts are sorted by relevance (highest first).
 *
 * Scores persist in models/chart-relevance.json and update in real-time.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ChartConfig } from "@/types";

const RELEVANCE_PATH = join(process.cwd(), "models", "chart-relevance.json");
const FILTER_THRESHOLD = 0.15; // Hide charts below this
const DEFAULT_SCORE = 0.5;
const LEARNING_RATE = 0.08; // How much each rating moves the score

interface RelevanceDB {
  _meta: { description: string; lastUpdated: string; totalRatings: number };
  [key: string]: unknown;
}

let _db: RelevanceDB | null = null;
let _dirty = false;

function loadDB(): RelevanceDB {
  if (_db) return _db;
  try {
    const raw = readFileSync(RELEVANCE_PATH, "utf-8");
    _db = JSON.parse(raw);
    return _db!;
  } catch {
    _db = { _meta: { description: "Chart relevance scores", lastUpdated: "", totalRatings: 0 } };
    return _db;
  }
}

function saveDB(): void {
  if (!_dirty || !_db) return;
  try {
    _db._meta.lastUpdated = new Date().toISOString().slice(0, 10);
    writeFileSync(RELEVANCE_PATH, JSON.stringify(_db, null, 2));
    _dirty = false;
  } catch {
    // On Vercel filesystem is read-only - scores update in memory only
    // They persist via the daily refresh script reading Discord ratings
  }
}

/**
 * Build a key for a chart based on sport, market, and chart title pattern.
 * e.g. "nba:points:game_log_trend" or "nba:first_basket:tip_off_matchup"
 */
function buildKey(sport: string, market: string, chartTitle: string): string {
  const s = (sport || "unknown").toLowerCase().replace(/\s+/g, "_");
  const m = (market || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
  // Normalize chart title to a pattern - strip player names, numbers, team names
  const t = (chartTitle || "unknown").toLowerCase()
    .replace(/[A-Z][a-z]+ [A-Z][a-z]+/g, "_player_") // "Jalen Brunson" → "_player_"
    .replace(/\d+\.?\d*/g, "_num_") // numbers
    .replace(/[^a-z_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
  return `${s}:${m}:${t}`;
}

/**
 * Get the relevance score for a chart.
 */
function getScore(sport: string, market: string, chartTitle: string): number {
  const db = loadDB();
  const key = buildKey(sport, market, chartTitle);
  const val = db[key];
  if (typeof val === "number") return val;
  return DEFAULT_SCORE;
}

/**
 * Record a user rating for a chart.
 */
export function recordRating(
  sport: string,
  market: string,
  chartTitle: string,
  rating: "up" | "down"
): void {
  const db = loadDB();
  const key = buildKey(sport, market, chartTitle);
  const current = typeof db[key] === "number" ? (db[key] as number) : DEFAULT_SCORE;
  const delta = rating === "up" ? LEARNING_RATE : -LEARNING_RATE;
  db[key] = Math.max(0, Math.min(1, current + delta));
  db._meta.totalRatings = ((db._meta.totalRatings as number) || 0) + 1;
  _dirty = true;
  saveDB();
}

/**
 * Filter and reorder charts based on relevance scores.
 * Removes charts below threshold, sorts remaining by score (highest first).
 */
export function filterAndSortCharts(
  charts: ChartConfig[],
  sport: string,
  market: string
): ChartConfig[] {
  // Score each chart
  const scored = charts.map((chart) => ({
    chart,
    score: getScore(sport, market, chart.title),
  }));

  // Filter out irrelevant charts (below threshold)
  const filtered = scored.filter((s) => s.score >= FILTER_THRESHOLD);

  // Sort by score (highest first), preserving original order for equal scores
  filtered.sort((a, b) => b.score - a.score);

  return filtered.map((s) => s.chart);
}

/**
 * Seed relevance scores from the market taxonomy.
 * Call during daily refresh to update scores based on taxonomy changes.
 */
export function seedFromTaxonomy(
  sport: string,
  market: string,
  idealCharts: string[],
  irrelevantData: string[]
): void {
  const db = loadDB();

  // Seed ideal charts at 0.8 (only if no existing rating)
  for (const chartDesc of idealCharts) {
    const key = buildKey(sport, market, chartDesc);
    if (!(key in db)) {
      db[key] = 0.8;
      _dirty = true;
    }
  }

  // Seed irrelevant at 0.1 (only if no existing rating)
  for (const desc of irrelevantData) {
    const key = buildKey(sport, market, desc);
    if (!(key in db)) {
      db[key] = 0.1;
      _dirty = true;
    }
  }

  saveDB();
}
