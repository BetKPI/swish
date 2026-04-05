"use client";

import { useState, useEffect, useRef } from "react";
import type { GameStatusData } from "@/types";

interface GameStatusBannerProps {
  status: GameStatusData;
  // Pass extraction info for auto-refresh polling
  sport?: string;
  teams?: string[];
  betType?: string;
  players?: string[];
  market?: string;
  line?: number;
}

export default function GameStatusBanner({
  status: initialStatus,
  sport,
  teams,
  betType,
  players,
  market,
  line,
}: GameStatusBannerProps) {
  const [status, setStatus] = useState(initialStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh every 30s for live games (ESPN only, no Gemini cost)
  useEffect(() => {
    if (status.state !== "in" || !sport || !teams?.length) return;

    const refresh = async () => {
      try {
        const res = await fetch("/api/game-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sport, teams, betType, players, market, line }),
        });
        const data = await res.json();
        if (data.gameStatus) setStatus(data.gameStatus);
      } catch { /* silent */ }
    };

    intervalRef.current = setInterval(refresh, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status.state, sport, teams, betType, players, market, line]);

  const isLive = status.state === "in";
  const isFinal = status.state === "post";
  const grade = status.grade;

  if (status.state === "pre" || status.state === "unknown") return null;

  return (
    <div className={`rounded-xl p-4 border ${
      isLive
        ? "bg-red-500/10 border-red-500/30"
        : grade?.result === "hit"
        ? "bg-emerald-500/10 border-emerald-500/30"
        : grade?.result === "miss"
        ? "bg-red-500/10 border-red-500/30"
        : grade?.result === "push"
        ? "bg-yellow-500/10 border-yellow-500/30"
        : "bg-surface border-border"
    }`}>
      {/* Live / Final badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              LIVE
            </span>
          )}
          {isFinal && (
            <span className="text-xs font-bold text-muted">
              FINAL
            </span>
          )}
          {status.detail && (
            <span className="text-xs text-muted">
              {status.detail}
            </span>
          )}
        </div>

        {/* Bet result badge */}
        {grade && grade.result !== "pending" && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            grade.result === "hit"
              ? "bg-emerald-500/20 text-emerald-400"
              : grade.result === "miss"
              ? "bg-red-500/20 text-red-400"
              : "bg-yellow-500/20 text-yellow-400"
          }`}>
            {grade.result === "hit" ? "HIT" : grade.result === "miss" ? "MISS" : "PUSH"}
          </span>
        )}

        {/* Live tracking badge for props */}
        {isLive && grade?.result === "pending" && (
          <span className="text-xs font-medium text-yellow-400 px-2.5 py-1 rounded-full bg-yellow-500/10">
            TRACKING
          </span>
        )}
      </div>

      {/* Scoreboard */}
      <div className="flex items-center justify-center gap-4 mb-2">
        <div className="text-right flex-1">
          <p className="font-semibold text-sm truncate">{status.awayTeam}</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-background/50 rounded-lg min-w-[100px] justify-center">
          <span className={`text-2xl font-bold tabular-nums ${isLive ? "text-foreground" : "text-muted"}`}>
            {status.awayScore ?? 0}
          </span>
          <span className="text-muted text-sm">-</span>
          <span className={`text-2xl font-bold tabular-nums ${isLive ? "text-foreground" : "text-muted"}`}>
            {status.homeScore ?? 0}
          </span>
        </div>
        <div className="text-left flex-1">
          <p className="font-semibold text-sm truncate">{status.homeTeam}</p>
        </div>
      </div>

      {/* Player stat line */}
      {status.playerName && status.playerStatLine && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <p className="text-xs text-muted mb-1.5">{status.playerName}&apos;s stat line</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(status.playerStatLine)
              .filter(([k]) => !["MIN", "PF", "+/-", "OREB", "DREB"].includes(k))
              .slice(0, 8)
              .map(([key, val]) => (
                <div key={key} className="text-center">
                  <p className="text-sm font-bold">{String(val)}</p>
                  <p className="text-[10px] text-muted">{key}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Grade detail */}
      {grade && (
        <p className={`text-xs mt-2 ${
          grade.result === "hit"
            ? "text-emerald-400"
            : grade.result === "miss"
            ? "text-red-400"
            : grade.result === "push"
            ? "text-yellow-400"
            : "text-muted"
        }`}>
          {grade.detail}
        </p>
      )}
    </div>
  );
}
