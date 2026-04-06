"use client";

import { useState, useEffect } from "react";

interface AnalyzingAnimationProps {
  sport?: string;
  statusMsg: string;
  isParlay?: boolean;
}

const SPORT_ANIMATIONS: Record<string, { emoji: string; label: string }> = {
  NBA: { emoji: "\u{1F3C0}", label: "basketball" },
  NFL: { emoji: "\u{1F3C8}", label: "football" },
  MLB: { emoji: "\u26BE", label: "baseball" },
  NHL: { emoji: "\u{1F3D2}", label: "hockey" },
  Golf: { emoji: "\u26F3", label: "golf" },
  Soccer: { emoji: "\u26BD", label: "soccer" },
  NCAAB: { emoji: "\u{1F3C0}", label: "basketball" },
  NCAAF: { emoji: "\u{1F3C8}", label: "football" },
};

const TIPS = [
  "Swish checks season-long trends, not just last game",
  "Rolling averages smooth out noise to show real trends",
  "The Swish Score rates data strength, not whether to bet",
  "Chat follow-ups can pull deeper stats after analysis",
  "Home/away splits matter more than most people think",
  "Consistency (low std dev) is key for player props",
  "We check opponent defensive stats for matchup context",
];

export default function AnalyzingAnimation({ sport, statusMsg, isParlay }: AnalyzingAnimationProps) {
  const [tipIndex, setTipIndex] = useState(0);
  const [dots, setDots] = useState(0);

  // Rotate tips every 4s
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const anim = sport ? SPORT_ANIMATIONS[sport] || SPORT_ANIMATIONS.NBA : null;

  return (
    <div className="max-w-md mx-auto px-4 pt-16 sm:pt-24 text-center space-y-8">
      {/* Sport animation */}
      <div className="relative mx-auto w-32 h-32">
        {/* Outer ring — spinning */}
        <div className="absolute inset-0 rounded-full border-4 border-accent/20 border-t-accent animate-spin" style={{ animationDuration: "1.5s" }} />

        {/* Inner content — bouncing emoji */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl animate-bounce" style={{ animationDuration: "1s" }}>
            {anim?.emoji || "\u{1F3C6}"}
          </span>
        </div>
      </div>

      {/* Status message */}
      <div>
        <p className="text-xl font-bold text-foreground">
          {statusMsg}{".".repeat(dots)}
        </p>
        {isParlay && (
          <p className="text-sm text-muted mt-1">Parlays take a bit longer — analyzing each leg</p>
        )}
      </div>

      {/* Progress steps */}
      <div className="flex items-center justify-center gap-2">
        {["Read", "Fetch", "Analyze", "Score"].map((step, i) => {
          const isActive = statusMsg.toLowerCase().includes("read") ? i === 0
            : statusMsg.toLowerCase().includes("pull") || statusMsg.toLowerCase().includes("break") ? i === 1
            : i <= 2;
          return (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${
                isActive ? "bg-accent" : "bg-surface-light"
              }`} />
              <span className={`text-xs transition-colors ${
                isActive ? "text-accent font-medium" : "text-muted/50"
              }`}>{step}</span>
              {i < 3 && <span className="text-muted/30 text-xs">\u2014</span>}
            </div>
          );
        })}
      </div>

      {/* Tip */}
      <div className="bg-surface/50 rounded-xl px-4 py-3 transition-opacity">
        <p className="text-xs text-muted">
          <span className="text-accent/70 font-medium">Tip:</span>{" "}
          {TIPS[tipIndex]}
        </p>
      </div>

      {/* Skeleton preview of what's coming */}
      <div className="space-y-3 opacity-30">
        <div className="h-8 bg-surface-light rounded-lg animate-pulse w-3/4 mx-auto" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-14 bg-surface-light rounded-lg animate-pulse" />
          <div className="h-14 bg-surface-light rounded-lg animate-pulse" />
          <div className="h-14 bg-surface-light rounded-lg animate-pulse" />
        </div>
        <div className="h-32 bg-surface-light rounded-lg animate-pulse" />
      </div>
    </div>
  );
}
