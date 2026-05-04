"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  AppState,
  BetExtraction,
  ChartConfig,
  StatDataPoint,
  ParlayLegResult,
  GameStatusData,
  MLBInsights,
  NBAInsights,
} from "@/types";
import AnalysisResults from "@/components/AnalysisResults";
import ParlayResults from "@/components/ParlayResults";
import ExampleShowcase from "@/components/ExampleShowcase";
import BetHistory from "@/components/BetHistory";
import AnalyzingAnimation from "@/components/AnalyzingAnimation";
import { saveToHistory, isFull, savePending, getPending, clearPending, type HistoryEntry } from "@/lib/history";

export default function Home() {
  const [state, setState] = useState<AppState>("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<BetExtraction | null>(null);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [stats, setStats] = useState<StatDataPoint[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [computedData, setComputedData] = useState<Record<string, unknown> | null>(null);
  const [visuals, setVisuals] = useState<Record<string, unknown> | null>(null);
  const [parlayLegs, setParlayLegs] = useState<ParlayLegResult[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatusData | null>(null);
  const [swishScore, setSwishScore] = useState<{ score: number; label: string; detail: string } | null>(null);
  const [keyInsight, setKeyInsight] = useState<string>("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [mlbInsights, setMlbInsights] = useState<MLBInsights | null>(null);
  const [nbaInsights, setNbaInsights] = useState<NBAInsights | null>(null);
  const [error, setError] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared stats-fetching logic used by both fresh analysis and resume
  const fetchStats = useCallback(async (ext: BetExtraction) => {
    const timeout = (ms: number) => new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Taking too long - try again or use a clearer screenshot")), ms)
    );
    const isParlay = ext.betType === "parlay";
    setStatusMsg(isParlay ? "Breaking down each leg..." : "Pulling the numbers that matter...");
    const statsTimeout = isParlay ? 55000 : 30000;
    const statsRes = await Promise.race([
      fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraction: ext }),
      }),
      timeout(statsTimeout),
    ]);
    if (!statsRes.ok) throw new Error("Couldn't pull the stats for this one - try again");
    const statsData = await statsRes.json();

    if (statsData.parlay) {
      setExtraction(ext);
      setParlayLegs(statsData.legs || []);
      setState("parlay");
      const parlayLegsData = statsData.legs || [];
      const parlayGraded = parlayLegsData.filter((l: { gameStatus?: { grade?: { result: string } } }) => l.gameStatus?.grade?.result && l.gameStatus.grade.result !== "pending");
      const allHit = parlayGraded.length === parlayLegsData.length && parlayGraded.every((l: { gameStatus?: { grade?: { result: string } } }) => l.gameStatus?.grade?.result === "hit");
      const anyMiss = parlayGraded.some((l: { gameStatus?: { grade?: { result: string } } }) => l.gameStatus?.grade?.result === "miss");
      saveToHistory({
        extraction: ext,
        summary: parlayLegsData.map((l: { summary?: string }) => l.summary).filter(Boolean).join(" "),
        stats: [],
        charts: [],
        isParlay: true,
        legCount: parlayLegsData.length,
        parlayLegs: parlayLegsData,
        grade: parlayGraded.length > 0 ? {
          result: anyMiss ? "miss" : allHit ? "hit" : "pending",
          detail: anyMiss ? "Parlay busted" : allHit ? "All legs hit!" : `${parlayGraded.length}/${parlayLegsData.length} graded`,
        } : undefined,
      });
      clearPending();
      return;
    }

    if (statsData.unsupported) {
      setExtraction(ext);
      setCharts([]);
      setStats([]);
      setSummary("");
      setState("unsupported");
      clearPending();
      return;
    }

    setCharts(statsData.charts || []);
    setStats(statsData.stats || []);
    setSummary(statsData.summary || "");
    setComputedData(statsData._computed || null);
    setVisuals(statsData.visuals || null);
    setGameStatus(statsData.gameStatus || null);
    setSwishScore(statsData.swishScore || null);
    setKeyInsight(statsData.keyInsight || "");
    setSuggestions(statsData.suggestions || []);
    setMlbInsights(statsData.mlbInsights || null);
    setNbaInsights(statsData.nbaInsights || null);
    setState("results");
    saveToHistory({
      extraction: ext,
      summary: statsData.summary || "",
      stats: statsData.stats || [],
      charts: statsData.charts || [],
      gameStatus: statsData.gameStatus || undefined,
      visuals: statsData.visuals || undefined,
      computedData: statsData._computed || undefined,
      grade: statsData.gameStatus?.grade || undefined,
      swishScore: statsData.swishScore || undefined,
      keyInsight: statsData.keyInsight || undefined,
    });
    clearPending();
  }, []);

  // Auto-resume if the user closed the browser mid-analysis
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    const pending = getPending();
    if (!pending) return;
    resumedRef.current = true;

    setExtraction(pending.extraction);
    setImagePreview(pending.imagePreview);
    setState("analyzing");

    fetchStats(pending.extraction).catch((err) => {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
      clearPending();
    });
  }, [fetchStats]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      setState("error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB.");
      setState("error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const analyze = useCallback(async () => {
    if (!imageBase64) return;
    setState("analyzing");
    setError("");

    try {
      const timeout = (ms: number) => new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Taking too long - try again or use a clearer screenshot")), ms)
      );

      setStatusMsg("Reading your bet...");
      const analyzeRes = await Promise.race([
        fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageBase64 }),
        }),
        timeout(30000),
      ]);
      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json().catch(() => null);
        throw new Error(errData?.error || "Couldn't read that image - try a clearer screenshot");
      }
      const analyzeData = await analyzeRes.json();
      setExtraction(analyzeData.extraction);

      // Save pending state so closing the browser doesn't lose progress
      savePending(analyzeData.extraction, imagePreview || "");

      await fetchStats(analyzeData.extraction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }, [imageBase64, imagePreview, fetchStats]);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    setExtraction(entry.extraction);
    if (entry.isParlay && entry.parlayLegs) {
      setParlayLegs(entry.parlayLegs);
      setState("parlay");
    } else {
      setCharts(entry.charts || []);
      setStats(entry.stats || []);
      setSummary(entry.summary || "");
      setComputedData(entry.computedData || null);
      setVisuals(entry.visuals || null);
      setGameStatus(entry.gameStatus || null);
      setSwishScore(entry.swishScore || null);
      setKeyInsight(entry.keyInsight || "");
      setState("results");
    }
  }, []);

  const reset = useCallback(() => {
    setState("upload");
    setImagePreview(null);
    setImageBase64(null);
    setExtraction(null);
    setCharts([]);
    setStats([]);
    setSummary("");
    setComputedData(null);
    setVisuals(null);
    setParlayLegs([]);
    setGameStatus(null);
    setSwishScore(null);
    setKeyInsight("");
    setMlbInsights(null);
    setNbaInsights(null);
    setError("");
    setStatusMsg("");
    clearPending();
  }, []);

  return (
    <div className="w-full">
      {state === "upload" && (
        <>
          {/* HERO - sport-themed atmospheric backdrop */}
          <div className="relative overflow-hidden">
            {/* Field watermark grid - diamond + court + rink behind the hero */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden
              style={{
                background:
                  "radial-gradient(ellipse at 20% 80%, rgba(16,122,73,0.10) 0%, transparent 55%)," +
                  "radial-gradient(ellipse at 80% 20%, rgba(217,119,6,0.06) 0%, transparent 50%)," +
                  "radial-gradient(ellipse at 50% 100%, rgba(56,189,248,0.05) 0%, transparent 60%)",
              }}
            />
            {/* Diamond left */}
            <div className="absolute -left-12 top-32 w-72 h-72 text-emerald-300/[0.05] pointer-events-none hidden sm:block" aria-hidden>
              <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
                <polygon points="120,200 175,145 120,90 65,145" />
                <circle cx="120" cy="145" r="6" />
                <line x1="120" y1="200" x2="20" y2="180" />
                <line x1="120" y1="200" x2="220" y2="180" />
              </svg>
            </div>
            {/* Court right */}
            <div className="absolute -right-8 top-12 w-56 h-56 text-amber-300/[0.05] pointer-events-none hidden sm:block" aria-hidden>
              <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
                <rect x="86" y="10" width="68" height="80" />
                <circle cx="120" cy="90" r="32" />
                <path d="M 50 10 L 50 70 A 70 70 0 0 0 190 70 L 190 10" />
              </svg>
            </div>

            <div className="relative px-4 pt-12 sm:pt-20 pb-8 sm:pb-12">
              <div className="max-w-2xl mx-auto">
                {/* Logo lockup - sport ticker */}
                <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] font-bold text-muted/70 mb-5">
                  <span>⚾ MLB</span>
                  <span className="text-muted/30">·</span>
                  <span>🏀 NBA</span>
                  <span className="text-muted/30">·</span>
                  <span>🏈 NFL</span>
                  <span className="text-muted/30">·</span>
                  <span>🏒 NHL</span>
                  <span className="text-muted/30">·</span>
                  <span>⛳ PGA</span>
                </div>

                <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[0.95] text-center">
                  The take,
                  <br />
                  <span className="text-accent">before you take the bet.</span>
                </h1>

                <p className="text-foreground/80 text-base sm:text-lg max-w-md mx-auto leading-relaxed mt-6 text-center">
                  Drop a bet slip. We pull every game log, xStat, ballpark factor,
                  and matchup angle, then give you the % chance it hits.
                </p>

                {/* Upload box - prominent, sport-tinted glow */}
                <div className="max-w-lg mx-auto mt-8 sm:mt-10">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative rounded-2xl p-7 sm:p-9 text-center cursor-pointer transition-all overflow-hidden ${
                      dragOver
                        ? "bg-accent/[0.12] border-2 border-dashed border-accent shadow-[0_0_40px_rgba(16,185,129,0.25)]"
                        : imagePreview
                        ? "bg-surface border border-accent/60"
                        : "bg-surface hover:bg-surface-light border-2 border-dashed border-border hover:border-accent/60"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileInput}
                      className="hidden"
                    />

                    {imagePreview ? (
                      <div className="space-y-4 relative">
                        <img
                          src={imagePreview}
                          alt="Bet screenshot"
                          className="max-h-56 mx-auto rounded-lg"
                        />
                        <p className="text-muted text-sm">Tap to swap</p>
                      </div>
                    ) : (
                      <div className="space-y-3 relative">
                        <div className="mx-auto w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                          <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9 4.5-4.5m0 0 4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <p className="text-lg sm:text-xl font-bold">
                          Drop a screenshot
                        </p>
                        <p className="text-muted text-xs">
                          DraftKings · FanDuel · PrizePicks · Underdog · any app
                        </p>
                      </div>
                    )}
                  </div>

                  {imagePreview && (
                    <button
                      onClick={analyze}
                      className="w-full mt-3 py-4 px-6 bg-accent hover:bg-emerald-400 text-black font-bold rounded-2xl transition-colors text-lg cursor-pointer"
                    >
                      Run the numbers
                    </button>
                  )}
                </div>

                {/* Honest one-liner — no marketing fluff */}
                <p className="text-muted/60 text-xs text-center mt-6 max-w-md mx-auto">
                  Free. No account. Charts and probabilities, not picks.
                </p>
              </div>
            </div>
          </div>

          {/* What we actually pull - real signals, not bullet checkmarks */}
          <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
            <p className="text-xs uppercase tracking-[0.25em] font-bold text-muted text-center mb-6">
              What we cross-reference
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: "Game logs", value: "L5 · L10 · season" },
                { label: "xStats", value: "xBA · xSLG · xwOBA" },
                { label: "Park factors", value: "all 30 stadiums" },
                { label: "Opp pitching", value: "ERA · K/9 · staff" },
                { label: "Defensive matchup", value: "ppg vs lg avg" },
                { label: "Pace tilt", value: "fast / slow" },
                { label: "Series leverage", value: "elimination · pivotal" },
                { label: "Probability", value: "% chance to hit" },
              ].map((s) => (
                <div key={s.label} className="bg-surface/50 border border-border/40 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted">{s.label}</div>
                  <div className="text-sm font-bold tabular-nums mt-1">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bet History */}
          <div className="max-w-lg mx-auto px-4 py-2">
            <BetHistory onLoad={loadFromHistory} />
          </div>

          {/* Example output */}
          <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
            <ExampleShowcase />
          </div>
        </>
      )}

      {state === "analyzing" && (
        <AnalyzingAnimation
          sport={extraction?.sport}
          sports={
            extraction?.betType === "parlay" && extraction?.legs && extraction.legs.length > 0
              ? extraction.legs.map((l) => l.sport).filter((s): s is string => !!s)
              : undefined
          }
          statusMsg={statusMsg}
          isParlay={extraction?.betType === "parlay"}
        />
      )}

      {state === "error" && (
        <div className="max-w-4xl mx-auto px-4 space-y-4 text-center pt-20">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md mx-auto">
            <p className="text-red-400">{error}</p>
          </div>
          <button
            onClick={reset}
            className="py-2.5 px-6 bg-surface-light hover:bg-border text-foreground rounded-xl transition-colors cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {state === "unsupported" && extraction && (
        <div className="max-w-4xl mx-auto px-4 space-y-6 text-center pt-20">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Bet screenshot"
              className="max-h-48 mx-auto rounded-lg opacity-40"
            />
          )}
          <div className="bg-surface border border-border rounded-xl p-8 max-w-md mx-auto space-y-4">
            <div className="text-4xl">😬</div>
            <h3 className="text-xl font-bold">We don&apos;t have that yet</h3>
            <p className="text-muted text-sm leading-relaxed">
              We read your bet ({extraction.sport} - {(extraction.betType || "player_prop").replace("_", "/")}) but don&apos;t have the data to break it down right now. Try a different bet - we work best with NFL, NBA, MLB, NHL, Golf, and college sports.
            </p>
          </div>
          <button
            onClick={reset}
            className="py-3 px-8 bg-accent hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors cursor-pointer"
          >
            Try Another Bet
          </button>
        </div>
      )}

      {state === "parlay" && extraction && (
        <div className="max-w-4xl mx-auto px-4 py-8">
          {parlayLegs.length > 0 ? (
            <ParlayResults
              extraction={extraction}
              legs={parlayLegs}
              onReset={reset}
            />
          ) : (
            <div className="space-y-6 text-center pt-12">
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Bet screenshot"
                  className="max-h-48 mx-auto rounded-lg opacity-40"
                />
              )}
              <div className="bg-surface border border-border rounded-xl p-8 max-w-md mx-auto space-y-4">
                <div className="text-4xl">🎰</div>
                <h3 className="text-xl font-bold">Couldn&apos;t break down this parlay</h3>
                <p className="text-muted text-sm leading-relaxed">
                  We detected a parlay but couldn&apos;t identify the individual legs. Try a clearer screenshot or upload each leg separately.
                </p>
              </div>
              <button
                onClick={reset}
                className="py-3 px-8 bg-accent hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {state === "results" && extraction && (
        <div className="max-w-4xl mx-auto px-4 py-8">
          <AnalysisResults
            extraction={extraction}
            charts={charts}
            stats={stats}
            summary={summary}
            computedData={computedData ?? undefined}
            gameStatus={gameStatus ?? undefined}
            visuals={visuals ?? undefined}
            swishScore={swishScore ?? undefined}
            keyInsight={keyInsight || undefined}
            suggestions={suggestions.length > 0 ? suggestions : undefined}
            mlbInsights={mlbInsights ?? undefined}
            nbaInsights={nbaInsights ?? undefined}
            onReset={reset}
          />
        </div>
      )}
    </div>
  );
}
