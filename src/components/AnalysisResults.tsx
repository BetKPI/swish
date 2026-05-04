"use client";

import { useState, useCallback } from "react";
import type { BetExtraction, ChartConfig, StatDataPoint, GameStatusData } from "@/types";
import ChartDisplay from "./ChartDisplay";
import AnalysisChat from "./AnalysisChat";
import FeedbackShare from "./FeedbackShare";
import GameStatusBanner from "./GameStatusBanner";
import MLBPlayerPropCard from "./MLBPlayerPropCard";
import { captureWithWatermark, copyImageToClipboard } from "@/lib/captureWithWatermark";

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
  suggestions?: string[];
  onReset: () => void;
}

/** Score is now 0-10 scale */
function scoreColor(score: number): string {
  if (score <= 3) return "text-red-500";
  if (score <= 4.5) return "text-orange-400";
  if (score <= 5.5) return "text-yellow-400";
  if (score <= 7) return "text-emerald-400";
  if (score <= 8.5) return "text-green-400";
  return "text-green-300";
}

function scoreRingColor(score: number): string {
  if (score <= 3) return "stroke-red-500";
  if (score <= 4.5) return "stroke-orange-400";
  if (score <= 5.5) return "stroke-yellow-400";
  if (score <= 7) return "stroke-emerald-400";
  if (score <= 8.5) return "stroke-green-400";
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
  suggestions,
  onReset,
}: AnalysisResultsProps) {
  const [shareState, setShareState] = useState<"idle" | "capturing" | "copied" | "downloaded">("idle");

  const handleShareAnalysis = useCallback(async () => {
    const el = document.getElementById("analysis-content");
    if (!el) return;
    setShareState("capturing");
    try {
      const blob = await captureWithWatermark(el, "swish-analysis.png");
      if (!blob) { setShareState("idle"); return; }
      const didCopy = await copyImageToClipboard(blob, "swish-analysis.png");
      setShareState(didCopy ? "copied" : "downloaded");
    } catch {
      setShareState("idle");
      return;
    }
    setTimeout(() => setShareState("idle"), 2500);
  }, []);

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

  const isFinal = gameStatus?.state === "post";
  const gradeResult = gameStatus?.grade?.result;
  const isHit = gradeResult === "hit";
  const isMiss = gradeResult === "miss";
  const isGraded = isFinal && (isHit || isMiss);

  // Specialized layout for MLB player props — denser, mobile-first, props.cash-style
  const sportNorm = normalizeSport(extraction.sport);
  if (sportNorm === "MLB" && extraction.betType === "player_prop") {
    return (
      <MLBPlayerPropCard
        extraction={extraction}
        charts={charts}
        summary={summary}
        computedData={computedData}
        gameStatus={gameStatus}
        visuals={visuals}
        swishScore={swishScore}
        keyInsight={keyInsight}
        suggestions={suggestions}
        onReset={onReset}
      />
    );
  }

  return (
    <div className="space-y-6" id="analysis-content">
      {/* Big HIT/MISS banner when game is final */}
      {isGraded && (
        <div className={`rounded-xl p-5 text-center border-2 ${
          isHit ? "bg-emerald-500/15 border-emerald-500/40" : "bg-red-500/15 border-red-500/40"
        }`}>
          <p className={`text-3xl sm:text-4xl font-black ${isHit ? "text-emerald-400" : "text-red-400"}`}>
            {isHit ? "HIT" : "MISS"}
          </p>
          <p className={`text-sm mt-1 ${isHit ? "text-emerald-400/80" : "text-red-400/80"}`}>
            {gameStatus?.grade?.detail || (isHit ? "Your bet cashed!" : "Didn't hit this time.")}
          </p>
        </div>
      )}

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
        <div className="flex flex-col items-center text-center py-6">
          <div className="relative w-32 h-32">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="6" className="stroke-surface-light" />
              <circle
                cx="60" cy="60" r="52" fill="none" strokeWidth="6"
                className={scoreRingColor(swishScore.score)}
                strokeLinecap="round"
                strokeDasharray={`${(swishScore.score / 10) * 327} 327`}
                style={{ filter: "drop-shadow(0 0 6px currentColor)" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-4xl font-black ${scoreColor(swishScore.score)}`}>
                {swishScore.score}
              </span>
              <span className="text-xs text-muted -mt-0.5">/ 10</span>
            </div>
          </div>
          <p className={`text-sm font-bold mt-3 ${scoreColor(swishScore.score)}`}>
            {swishScore.label}
          </p>
          <p className="text-xs text-muted mt-1 max-w-sm leading-relaxed">
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
                {(extraction.betType || "player_prop").replace("_", "/")}
              </span>
              <span className="text-xs bg-surface-light text-muted px-2 py-0.5 rounded-full">
                {normalizeSport(extraction.sport)}
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
        <div className="bg-surface rounded-xl p-5 border border-border/50">
          <h3 className="font-semibold text-sm mb-3 text-accent uppercase tracking-wide">
            The Breakdown
          </h3>
          <p className="text-sm text-foreground/90 leading-[1.7]">
            {summary}
          </p>
        </div>
      )}

      {/* Hit Rate Hero — first stat gets full-width treatment */}
      {stats.length > 0 && stats[0].label?.toLowerCase().includes("rate") && (
        <div className="bg-gradient-to-br from-accent/10 to-surface rounded-xl p-5 text-center border border-accent/30">
          <p className="text-4xl sm:text-5xl font-black text-accent tracking-tight">
            {String(stats[0].value)}
          </p>
          <p className="text-sm font-bold mt-2">{stats[0].label}</p>
          <p className="text-xs text-muted mt-1">{stats[0].context}</p>
        </div>
      )}

      {/* Key Stats */}
      {stats.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.slice(stats[0].label?.toLowerCase().includes("rate") ? 1 : 0).map((stat, i) => (
            <div
              key={i}
              className="bg-surface rounded-xl p-3 text-center border border-border/50"
            >
              <p className="text-xl font-bold text-accent">
                {String(stat.value)}
              </p>
              <p className="text-xs font-semibold mt-1">{stat.label}</p>
              <p className="text-xs text-muted mt-0.5">{stat.context}</p>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {charts.map((chart, i) => (
        <ChartDisplay key={i} config={chart} extraction={extraction} />
      ))}

      {/* Share Analysis — captures the entire analysis as one watermarked image */}
      <button
        onClick={handleShareAnalysis}
        disabled={shareState === "capturing"}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-surface hover:bg-surface-light border border-border rounded-xl transition-colors text-sm text-muted hover:text-foreground cursor-pointer disabled:opacity-50"
      >
        {shareState === "capturing" ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Capturing...
          </>
        ) : shareState === "copied" ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Copied to clipboard!
          </>
        ) : shareState === "downloaded" ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            Downloaded!
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
            Share Analysis
          </>
        )}
      </button>

      {/* Interactive Chat */}
      <AnalysisChat
        extraction={extraction}
        computedData={computedData || {}}
        swishScore={swishScore}
        suggestions={suggestions}
      />

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

function normalizeSport(sport: string): string {
  const s = (sport || "").toUpperCase();
  if (["GOLF", "PGA", "PGA TOUR", "THE MASTERS", "MASTERS"].includes(s)) return "Golf";
  if (["BASKETBALL", "NCAAB"].includes(s)) return s === "BASKETBALL" ? "NBA" : "NCAAB";
  if (["FOOTBALL", "NCAAF"].includes(s)) return s === "FOOTBALL" ? "NFL" : "NCAAF";
  if (["BASEBALL"].includes(s)) return "MLB";
  if (["HOCKEY"].includes(s)) return "NHL";
  if (["ATP", "WTA"].includes(s)) return "Tennis";
  if (["UFC"].includes(s)) return "MMA";
  return sport;
}

function sportEmoji(sport: string): string {
  const map: Record<string, string> = {
    NBA: "\u{1F3C0}", NFL: "\u{1F3C8}", MLB: "\u26BE", NHL: "\u{1F3D2}",
    Soccer: "\u26BD", Tennis: "\u{1F3BE}", MMA: "\u{1F94A}", Golf: "\u26F3",
    NCAAB: "\u{1F3C0}", NCAAF: "\u{1F3C8}",
  };
  return map[normalizeSport(sport)] || "\u{1F3C6}";
}

function sportColorClass(sport: string): string {
  const map: Record<string, string> = {
    NBA: "bg-orange-500/20 text-orange-400",
    NFL: "bg-green-500/20 text-green-400",
    MLB: "bg-red-500/20 text-red-400",
    NHL: "bg-blue-500/20 text-blue-400",
    Soccer: "bg-emerald-500/20 text-emerald-400",
    Golf: "bg-lime-500/20 text-lime-400",
    Tennis: "bg-yellow-500/20 text-yellow-400",
    MMA: "bg-red-500/20 text-red-400",
    Boxing: "bg-red-500/20 text-red-400",
    NCAAB: "bg-blue-500/20 text-blue-400",
    NCAAF: "bg-amber-500/20 text-amber-400",
  };
  return map[normalizeSport(sport)] || "bg-accent/20 text-accent";
}
