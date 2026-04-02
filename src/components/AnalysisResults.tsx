"use client";

import type { BetExtraction, ChartConfig, StatDataPoint } from "@/types";
import ChartDisplay from "./ChartDisplay";

interface AnalysisResultsProps {
  extraction: BetExtraction;
  charts: ChartConfig[];
  stats: StatDataPoint[];
  summary: string;
  onReset: () => void;
}

export default function AnalysisResults({
  extraction,
  charts,
  stats,
  summary,
  onReset,
}: AnalysisResultsProps) {
  return (
    <div className="space-y-6">
      {/* Bet Summary Header */}
      <div className="bg-surface rounded-xl p-4 border border-border">
        <div className="flex items-start gap-3">
          <span className="text-2xl">
            {sportEmoji(extraction.sport)}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-tight">
              {extraction.description}
            </h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">
                {extraction.betType.replace("_", "/")}
              </span>
              <span className="text-xs bg-surface-light text-muted px-2 py-0.5 rounded-full">
                {extraction.sport}
              </span>
              {extraction.odds && (
                <span className="text-xs bg-accent-gold/20 text-accent-gold px-2 py-0.5 rounded-full">
                  {extraction.odds}
                </span>
              )}
              {extraction.line != null && (
                <span className="text-xs bg-surface-light text-muted px-2 py-0.5 rounded-full">
                  Line: {extraction.line}
                </span>
              )}
            </div>
            {extraction.confidence < 0.7 && (
              <p className="text-yellow-400 text-xs mt-2">
                Low confidence extraction — double-check the details above
              </p>
            )}
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="bg-surface rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-2 text-accent">
            Analysis
          </h3>
          <p className="text-sm text-foreground/90 leading-relaxed">
            {summary}
          </p>
        </div>
      )}

      {/* Key Stats */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="bg-surface rounded-xl p-3 text-center"
            >
              <p className="text-xl font-bold text-accent">
                {String(stat.value)}
              </p>
              <p className="text-xs font-medium mt-1">{stat.label}</p>
              <p className="text-xs text-muted mt-0.5">{stat.context}</p>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {charts.map((chart, i) => (
        <ChartDisplay key={i} config={chart} />
      ))}

      {/* Reset Button */}
      <button
        onClick={onReset}
        className="w-full py-3 px-6 bg-surface-light hover:bg-border text-foreground font-semibold rounded-xl transition-colors"
      >
        Analyze Another Bet
      </button>
    </div>
  );
}

function sportEmoji(sport: string): string {
  const map: Record<string, string> = {
    NBA: "🏀",
    NFL: "🏈",
    MLB: "⚾",
    NHL: "🏒",
    Soccer: "⚽",
    Tennis: "🎾",
    MMA: "🥊",
    Golf: "⛳",
  };
  return map[sport] || "🏆";
}
