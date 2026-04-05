"use client";

import { useState, useEffect } from "react";
import { getHistory, clearHistory, type HistoryEntry } from "@/lib/history";

const SPORT_EMOJI: Record<string, string> = {
  NBA: "\u{1F3C0}", NFL: "\u{1F3C8}", MLB: "\u26BE", NHL: "\u{1F3D2}",
  Soccer: "\u26BD", Golf: "\u26F3", Tennis: "\u{1F3BE}", MMA: "\u{1F94A}",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function BetHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  if (history.length === 0) return null;

  const shown = expanded ? history : history.slice(0, 5);

  // Stats
  const graded = history.filter((h) => h.grade && h.grade.result !== "pending");
  const hits = graded.filter((h) => h.grade?.result === "hit").length;
  const misses = graded.filter((h) => h.grade?.result === "miss").length;

  // Sport breakdown
  const sportCounts: Record<string, number> = {};
  history.forEach((h) => {
    const s = h.extraction.sport || "Other";
    sportCounts[s] = (sportCounts[s] || 0) + 1;
  });
  const topSports = Object.entries(sportCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Your Bets</h3>
        <button
          onClick={() => {
            clearHistory();
            setHistory([]);
          }}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Dashboard stats */}
      {history.length >= 3 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface rounded-lg p-2.5 text-center border border-border/50">
            <p className="text-lg font-bold">{history.length}</p>
            <p className="text-[10px] text-muted">Bets Analyzed</p>
          </div>
          <div className="bg-surface rounded-lg p-2.5 text-center border border-border/50">
            <p className={`text-lg font-bold ${graded.length > 0 && hits / graded.length >= 0.5 ? "text-emerald-400" : graded.length > 0 ? "text-red-400" : ""}`}>
              {graded.length > 0 ? `${Math.round((hits / graded.length) * 100)}%` : "--"}
            </p>
            <p className="text-[10px] text-muted">Hit Rate</p>
          </div>
          <div className="bg-surface rounded-lg p-2.5 text-center border border-border/50">
            <p className="text-lg font-bold text-emerald-400">{hits}</p>
            <p className="text-[10px] text-muted">{hits === 1 ? "Hit" : "Hits"} / {misses} {misses === 1 ? "Miss" : "Misses"}</p>
          </div>
        </div>
      )}

      {/* Sport breakdown */}
      {topSports.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {topSports.map(([sport, count]) => (
            <span key={sport} className="text-[10px] bg-surface-light text-muted px-2 py-0.5 rounded-full">
              {SPORT_EMOJI[sport] || "\u{1F3C6}"} {sport} ({count})
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {shown.map((entry) => (
          <div
            key={entry.id}
            className="bg-surface rounded-lg p-3 border border-border/50 flex items-center gap-3"
          >
            <span className="text-lg flex-shrink-0">
              {SPORT_EMOJI[entry.extraction.sport] || "\u{1F3C6}"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {entry.extraction.description}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted">
                  {entry.extraction.sport} {entry.isParlay ? `\u2022 ${entry.legCount}-leg parlay` : `\u2022 ${entry.extraction.betType.replace("_", "/")}`}
                </span>
                <span className="text-[10px] text-muted">{timeAgo(entry.timestamp)}</span>
              </div>
            </div>
            {entry.grade && entry.grade.result !== "pending" && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                entry.grade.result === "hit"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : entry.grade.result === "miss"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-yellow-500/20 text-yellow-400"
              }`}>
                {entry.grade.result.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>

      {history.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-xs text-muted hover:text-foreground py-2 transition-colors"
        >
          {expanded ? "Show less" : `Show all ${history.length} bets`}
        </button>
      )}
    </div>
  );
}
