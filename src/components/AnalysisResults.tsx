"use client";

import type { BetExtraction, ChartConfig, StatDataPoint, GameStatusData } from "@/types";
import ChartDisplay from "./ChartDisplay";
import AnalysisChat from "./AnalysisChat";
import FeedbackShare from "./FeedbackShare";
import GameStatusBanner from "./GameStatusBanner";

interface SwishScore {
  score: number;
  label: string;
  detail: string;
}

interface AnalysisResultsProps {
  extraction: BetExtraction;
  charts: ChartConfig[];
  stats: StatDataPoint[];
  summary: string;
  computedData?: Record<string, unknown>;
  gameStatus?: GameStatusData;
  visuals?: Record<string, unknown>;
  swishScore?: SwishScore;
  keyInsight?: string;
  onReset: () => void;
}

function scoreColor(score: number): string {
  if (score <= 30) return "text-red-500";
  if (score <= 45) return "text-orange-400";
  if (score <= 55) return "text-yellow-400";
  if (score <= 70) return "text-emerald-400";
  if (score <= 85) return "text-green-400";
  return "text-green-300";
}

function scoreRingColor(score: number): string {
  if (score <= 30) return "stroke-red-500";
  if (score <= 45) return "stroke-orange-400";
  if (score <= 55) return "stroke-yellow-400";
  if (score <= 70) return "stroke-emerald-400";
  if (score <= 85) return "stroke-green-400";
  return "stroke-green-300";
}

export default function AnalysisResults({
  extraction,
  charts,
  stats,
  summary,
  computedData,
  gameStatus,
  visuals,
  swishScore,
  keyInsight,
  onReset,
}: AnalysisResultsProps) {
  // Extract visual metadata
  const teamVisuals = (visuals?.teams || {}) as Record<string, { logo?: string; color?: string }>;
  const playerVisuals = (visuals?.players || {}) as Record<string, { headshot?: string }>;
  const teamLogos = extraction.teams
    .map((t) => teamVisuals[t]?.logo)
    .filter(Boolean) as string[];
  const playerHeadshot = extraction.players.length > 0
    ? playerVisuals[extraction.players[0]]?.headshot
    : undefined;
  const teamColor = extraction.teams.length > 0
    ? teamVisuals[extraction.teams[0]]?.color
    : undefined;

  return (
    <div className="space-y-6" id="analysis-content">
      {/* Live Score / Final Result */}
      {gameStatus && (gameStatus.state === "in" || gameStatus.state === "post") && (
        <GameStatusBanner
          status={gameStatus}
          sport={extraction.sport}
          teams={extraction.teams}
          betType={extraction.betType}
          players={extraction.players}
          market={extraction.market}
          line={extraction.line}
        />
      )}

      {/* Swish Score */}
      {swishScore && (
        <div className="flex flex-col items-center text-center py-4">
          <div className="relative w-28 h-28">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8" className="stroke-surface-light" />
              <circle
                cx="60" cy="60" r="52" fill="none" strokeWidth="8"
                className={scoreRingColor(swishScore.score)}
                strokeLinecap="round"
                strokeDasharray={`${(swishScore.score / 100) * 327} 327`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-3xl font-black ${scoreColor(swishScore.score)}`}>
                {swishScore.score}
              </span>
            </div>
          </div>
          <p className={`text-sm font-bold mt-2 ${scoreColor(swishScore.score)}`}>
            {swishScore.label}
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm">
            {swishScore.detail}
          </p>
        </div>
      )}

      {/* Key Insight Callout */}
      {keyInsight && (
        <div className="bg-accent/10 border-l-4 border-accent rounded-r-xl px-4 py-3">
          <p className="text-sm font-bold text-foreground">{keyInsight}</p>
        </div>
      )}

      {/* Bet Summary Header */}
      <div
        className="bg-surface rounded-xl p-4 border border-border"
        style={teamColor ? { borderLeftColor: teamColor, borderLeftWidth: 3 } : undefined}
      >
        <div className="flex items-start gap-3">
          {/* Team logos or player headshot or sport emoji */}
          {playerHeadshot ? (
            <img src={playerHeadshot} alt="" className="w-10 h-10 rounded-full object-cover bg-surface-light flex-shrink-0" />
          ) : teamLogos.length > 0 ? (
            <div className="flex -space-x-2 flex-shrink-0">
              {teamLogos.slice(0, 2).map((logo, i) => (
                <img key={i} src={logo} alt="" className="w-8 h-8 rounded-full bg-white object-contain border-2 border-surface" />
              ))}
            </div>
          ) : (
            <span className="text-2xl">{sportEmoji(extraction.sport)}</span>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-tight">
              {extraction.description}
            </h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${sportColorClass(extraction.sport)}`}>
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
                Heads up — we&apos;re not 100% sure we read this right. Double-check the details above.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="bg-surface rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-2 text-accent">
            The Breakdown
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

      {/* Interactive Chat */}
      {computedData && (
        <AnalysisChat
          extraction={extraction}
          computedData={computedData}
        />
      )}

      {/* Feedback + Share */}
      <FeedbackShare extraction={extraction} summary={summary} gameStatus={gameStatus} />

      {/* Start Over */}
      <button
        onClick={onReset}
        className="w-full py-3 px-6 bg-accent hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors cursor-pointer"
      >
        Analyze Another Bet
      </button>
    </div>
  );
}

function sportEmoji(sport: string): string {
  const map: Record<string, string> = {
    NBA: "\u{1F3C0}", NFL: "\u{1F3C8}", MLB: "\u26BE", NHL: "\u{1F3D2}",
    Soccer: "\u26BD", Tennis: "\u{1F3BE}", MMA: "\u{1F94A}", Golf: "\u26F3",
  };
  return map[sport] || "\u{1F3C6}";
}

function sportColorClass(sport: string): string {
  const map: Record<string, string> = {
    NBA: "bg-orange-500/20 text-orange-400",
    NFL: "bg-green-500/20 text-green-400",
    MLB: "bg-red-500/20 text-red-400",
    NHL: "bg-blue-500/20 text-blue-400",
    Soccer: "bg-emerald-500/20 text-emerald-400",
    Golf: "bg-emerald-500/20 text-emerald-400",
    NCAAB: "bg-blue-500/20 text-blue-400",
    NCAAF: "bg-amber-500/20 text-amber-400",
  };
  return map[sport] || "bg-accent/20 text-accent";
}
