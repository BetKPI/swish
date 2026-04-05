"use client";

import { useState, useEffect } from "react";
import { getHistory, clearHistory, removeFromHistory, isFull, type HistoryEntry } from "@/lib/history";

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

interface BetHistoryProps {
  onLoad: (entry: HistoryEntry) => void;
}

export default function BetHistory({ onLoad }: BetHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  if (history.length === 0) return null;

  const full = history.length >= 5;
  const graded = history.filter((h) => h.grade && h.grade.result !== "pending");
  const hits = graded.filter((h) => h.grade?.result === "hit").length;
  const misses = graded.filter((h) => h.grade?.result === "miss").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Your Bets</h3>
        <button
          onClick={() => {
            clearHistory();
            setHistory([]);
          }}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* Stats row */}
      {graded.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{history.length}/5 saved</span>
          <span className="text-border">|</span>
          <span className={hits / graded.length >= 0.5 ? "text-emerald-400" : "text-red-400"}>
            {Math.round((hits / graded.length) * 100)}% hit rate
          </span>
          <span className="text-border">|</span>
          <span className="text-emerald-400">{hits}W</span>
          <span className="text-red-400">{misses}L</span>
        </div>
      )}

      {/* Bet list — clickable */}
      <div className="space-y-2">
        {history.map((entry) => (
          <div
            key={entry.id}
            onClick={() => onLoad(entry)}
            className="bg-surface rounded-lg p-3 border border-border/50 flex items-center gap-3 cursor-pointer hover:border-accent/40 hover:bg-surface-light transition-all group"
          >
            <span className="text-lg flex-shrink-0">
              {SPORT_EMOJI[entry.extraction.sport] || "\u{1F3C6}"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate group-hover:text-accent transition-colors">
                {entry.extraction.description}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted">
                  {entry.extraction.sport} {entry.isParlay ? `\u2022 ${entry.legCount}-leg parlay` : `\u2022 ${entry.extraction.betType?.replace("_", "/") || ""}`}
                </span>
                <span className="text-[10px] text-muted">{timeAgo(entry.timestamp)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {entry.grade && entry.grade.result !== "pending" && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  entry.grade.result === "hit"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : entry.grade.result === "miss"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-yellow-500/20 text-yellow-400"
                }`}>
                  {entry.grade.result.toUpperCase()}
                </span>
              )}
              {/* Delete single entry */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromHistory(entry.id);
                  setHistory(getHistory());
                }}
                className="text-muted/40 hover:text-red-400 transition-colors p-0.5"
                aria-label="Remove"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Full message */}
      {full && (
        <p className="text-xs text-center text-muted bg-surface-light rounded-lg py-2 px-3">
          History full (5/5). Remove a bet or <button onClick={() => { clearHistory(); setHistory([]); }} className="text-accent hover:underline">clear all</button> to save new ones.
        </p>
      )}
    </div>
  );
}
