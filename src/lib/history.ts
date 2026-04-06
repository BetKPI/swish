/**
 * Bet history — localStorage-based, zero backend cost.
 * Stores last 5 full analyses (clickable to re-view) with charts, stats, summary.
 */

import type { BetExtraction, ChartConfig, StatDataPoint, ParlayLegResult, GameStatusData } from "@/types";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  extraction: BetExtraction;
  summary: string;
  stats: StatDataPoint[];
  charts: ChartConfig[];
  gameStatus?: GameStatusData;
  visuals?: Record<string, unknown>;
  computedData?: Record<string, unknown>;
  grade?: {
    result: "hit" | "miss" | "push" | "pending";
    detail: string;
  };
  swishScore?: { score: number; label: string; detail: string };
  keyInsight?: string;
  isParlay?: boolean;
  legCount?: number;
  parlayLegs?: ParlayLegResult[];
}

const STORAGE_KEY = "swish_history";
const MAX_ENTRIES = 5;

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isFull(): boolean {
  return getHistory().length >= MAX_ENTRIES;
}

export function saveToHistory(entry: Omit<HistoryEntry, "id" | "timestamp">): void {
  if (typeof window === "undefined") return;
  try {
    const history = getHistory();
    if (history.length >= MAX_ENTRIES) return; // don't save if full
    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const updated = [newEntry, ...history].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* storage full or unavailable */ }
}

export function removeFromHistory(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const history = getHistory().filter((h) => h.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch { /* silent */ }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* silent */ }
}
