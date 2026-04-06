"use client";

import { useState } from "react";
import type { BetExtraction, ParlayLegResult } from "@/types";
import ChartDisplay from "./ChartDisplay";
import FeedbackShare from "./FeedbackShare";
import AnalysisChat from "./AnalysisChat";
import GameStatusBanner from "./GameStatusBanner";

interface ParlayResultsProps {
  extraction: BetExtraction;
  legs: ParlayLegResult[];
  onReset: () => void;
}

function sportEmoji(sport: string): string {
  const map: Record<string, string> = {
    NBA: "🏀", NFL: "🏈", MLB: "⚾", NHL: "🏒",
    Soccer: "⚽", Tennis: "🎾", MMA: "🥊", Golf: "⛳",
  };
  return map[sport] || "🏆";
}

export default function ParlayResults({
  extraction,
  legs,
  onReset,
}: ParlayResultsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const activeLeg = legs[activeTab];

  const analyzedLegs = legs.filter((l) => !l.error && !l.unsupported);
  const summaryText = analyzedLegs.length > 0
    ? analyzedLegs.map((l) => l.summary).filter(Boolean).join(" ")
    : "";

  // Parlay grading summary
  const gradedLegs = legs.filter((l) => l.gameStatus?.grade && l.gameStatus.grade.result !== "pending");
  const hitLegs = gradedLegs.filter((l) => l.gameStatus?.grade?.result === "hit");
  const missedLegs = gradedLegs.filter((l) => l.gameStatus?.grade?.result === "miss");
  const liveLegs = legs.filter((l) => l.gameStatus?.state === "in");
  const hasGrades = gradedLegs.length > 0 || liveLegs.length > 0;

  return (
    <div className="space-y-6">
      {/* Parlay Header */}
      <div className="bg-surface rounded-xl p-4 border border-border">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🎰</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-tight">
              {extraction.description || `${legs.length}-Leg Parlay`}
            </h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">
                Parlay \u2022 {legs.length} legs
              </span>
              {extraction.odds && (
                <span className="text-xs bg-accent-gold/20 text-accent-gold px-2 py-0.5 rounded-full">
                  {extraction.odds}
                </span>
              )}
              <span className="text-xs bg-surface-light text-muted px-2 py-0.5 rounded-full">
                {analyzedLegs.length}/{legs.length} analyzed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Parlay Grade Summary */}
      {hasGrades && (
        <div className={`rounded-xl p-3 border text-center ${
          missedLegs.length > 0
            ? "bg-red-500/10 border-red-500/30"
            : liveLegs.length > 0
            ? "bg-yellow-500/10 border-yellow-500/30"
            : hitLegs.length === gradedLegs.length && gradedLegs.length === legs.length
            ? "bg-emerald-500/10 border-emerald-500/30"
            : "bg-surface border-border"
        }`}>
          <div className="flex items-center justify-center gap-3 text-sm">
            {hitLegs.length > 0 && (
              <span className="text-emerald-400 font-semibold">{hitLegs.length} hit</span>
            )}
            {missedLegs.length > 0 && (
              <span className="text-red-400 font-semibold">{missedLegs.length} missed</span>
            )}
            {liveLegs.length > 0 && (
              <span className="flex items-center gap-1 text-yellow-400 font-semibold">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                {liveLegs.length} live
              </span>
            )}
            {legs.length - gradedLegs.length - liveLegs.length > 0 && (
              <span className="text-muted">{legs.length - gradedLegs.length - liveLegs.length} upcoming</span>
            )}
          </div>
          {missedLegs.length > 0 && (
            <p className="text-xs text-red-400 mt-1">Parlay busted — {missedLegs[0].gameStatus?.grade?.detail}</p>
          )}
          {missedLegs.length === 0 && hitLegs.length === legs.length && (
            <p className="text-xs text-emerald-400 mt-1">All legs hit!</p>
          )}
        </div>
      )}

      {/* Leg Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {legs.map((leg, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === i
                ? "bg-accent text-black"
                : leg.error || leg.unsupported
                ? "bg-surface-light text-muted/50"
                : leg.gameStatus?.grade?.result === "hit"
                ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                : leg.gameStatus?.grade?.result === "miss"
                ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                : leg.gameStatus?.state === "in"
                ? "bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25"
                : "bg-surface-light text-muted hover:text-foreground hover:bg-border"
            }`}
          >
            <span className="mr-1.5">{sportEmoji(leg.sport)}</span>
            Leg {i + 1}
            {(leg as ParlayLegResult & { swishScore?: { score: number } }).swishScore && (
              <span className="ml-1.5 text-xs opacity-75">
                {(leg as ParlayLegResult & { swishScore?: { score: number } }).swishScore!.score}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active Leg Content */}
      {activeLeg && (
        <div className="space-y-4">
          {/* Leg Header */}
          <div className="bg-surface rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{sportEmoji(activeLeg.sport)}</span>
              <h3 className="font-semibold text-sm">{activeLeg.description}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-surface-light text-muted px-2 py-0.5 rounded-full">
                {activeLeg.betType.replace("_", "/")}
              </span>
              <span className="text-xs bg-surface-light text-muted px-2 py-0.5 rounded-full">
                {activeLeg.sport}
              </span>
              {activeLeg.odds && (
                <span className="text-xs bg-accent-gold/20 text-accent-gold px-2 py-0.5 rounded-full">
                  {activeLeg.odds}
                </span>
              )}
            </div>
          </div>

          {/* Live Score / Final Result */}
          {activeLeg.gameStatus && (activeLeg.gameStatus.state === "in" || activeLeg.gameStatus.state === "post") && (
            <GameStatusBanner
              status={activeLeg.gameStatus}
              sport={activeLeg.sport}
              teams={activeLeg.teams}
              betType={activeLeg.betType}
              players={activeLeg.players}
              market={activeLeg.market}
              line={activeLeg.line}
            />
          )}

          {/* Error / Unsupported state */}
          {(activeLeg.error || activeLeg.unsupported) && (
            <div className="bg-surface-light rounded-xl p-4 text-center">
              <p className="text-muted text-sm">
                {activeLeg.unsupported
                  ? "We don\u2019t have data for this sport yet."
                  : "Couldn\u2019t analyze this leg \u2014 try it as a single bet for more detail."}
              </p>
            </div>
          )}

          {/* Summary */}
          {activeLeg.summary && (
            <div className="bg-surface rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-2 text-accent">
                The Breakdown
              </h3>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {activeLeg.summary}
              </p>
            </div>
          )}

          {/* Stats */}
          {activeLeg.stats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {activeLeg.stats.map((stat, i) => (
                <div key={i} className="bg-surface rounded-xl p-3 text-center">
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
          {activeLeg.charts.map((chart, i) => (
            <ChartDisplay key={i} config={chart} />
          ))}

          {/* Chat — available for analyzed legs */}
          {!activeLeg.error && !activeLeg.unsupported && (
            <AnalysisChat
              key={`chat-${activeTab}`}
              extraction={{
                sport: activeLeg.sport,
                betType: activeLeg.betType as BetExtraction["betType"],
                teams: activeLeg.teams,
                players: activeLeg.players || [],
                market: activeLeg.market,
                line: activeLeg.line,
                odds: activeLeg.odds,
                description: activeLeg.description,
                confidence: 1,
              }}
              computedData={activeLeg.computedData || {}}
            />
          )}
        </div>
      )}

      {/* Feedback + Share */}
      <FeedbackShare extraction={extraction} summary={summaryText} />

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
