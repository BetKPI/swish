/**
 * Bet history — localStorage-based, zero backend cost.
 * Stores the last 50 analyses with extraction, summary, and grade.
 */

export interface HistoryEntry {
  id: string;
  timestamp: number;
  extraction: {
    sport: string;
    betType: string;
    teams: string[];
    players: string[];
    market?: string;
    line?: number;
    odds: string;
    description: string;
  };
  summary: string;
  grade?: {
    result: "hit" | "miss" | "push" | "pending";
    detail: string;
  };
  isParlay?: boolean;
  legCount?: number;
}

const STORAGE_KEY = "swish_history";
const MAX_ENTRIES = 50;

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: Omit<HistoryEntry, "id" | "timestamp">): void {
  if (typeof window === "undefined") return;
  try {
    const history = getHistory();
    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    // Prepend and cap at MAX_ENTRIES
    const updated = [newEntry, ...history].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* storage full or unavailable */ }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* silent */ }
}
