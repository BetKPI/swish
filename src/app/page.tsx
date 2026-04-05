"use client";

import { useState, useCallback, useRef } from "react";
import type {
  AppState,
  BetExtraction,
  ChartConfig,
  StatDataPoint,
  ParlayLegResult,
  GameStatusData,
} from "@/types";
import AnalysisResults from "@/components/AnalysisResults";
import ParlayResults from "@/components/ParlayResults";
import ExampleShowcase from "@/components/ExampleShowcase";

export default function Home() {
  const [state, setState] = useState<AppState>("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<BetExtraction | null>(null);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [stats, setStats] = useState<StatDataPoint[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [computedData, setComputedData] = useState<Record<string, unknown> | null>(null);
  const [parlayLegs, setParlayLegs] = useState<ParlayLegResult[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatusData | null>(null);
  const [error, setError] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      setError("Please upload a PNG, JPG, or WEBP image.");
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
        setTimeout(() => reject(new Error("Taking too long — try again or use a clearer screenshot")), ms)
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
      if (!analyzeRes.ok) throw new Error("Couldn't read that image — try a clearer screenshot");
      const analyzeData = await analyzeRes.json();
      setExtraction(analyzeData.extraction);

      const isParlay = analyzeData.extraction?.betType === "parlay";
      setStatusMsg(isParlay ? "Breaking down each leg..." : "Pulling the numbers that matter...");
      const statsTimeout = isParlay ? 55000 : 30000;
      const statsRes = await Promise.race([
        fetch("/api/stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extraction: analyzeData.extraction }),
        }),
        timeout(statsTimeout),
      ]);
      if (!statsRes.ok) throw new Error("Couldn't pull the stats for this one — try again");
      const statsData = await statsRes.json();

      if (statsData.parlay) {
        setExtraction(analyzeData.extraction);
        setParlayLegs(statsData.legs || []);
        setState("parlay");
        return;
      }

      if (statsData.unsupported) {
        setExtraction(analyzeData.extraction);
        setCharts([]);
        setStats([]);
        setSummary("");
        setState("unsupported");
        return;
      }

      setCharts(statsData.charts || []);
      setStats(statsData.stats || []);
      setSummary(statsData.summary || "");
      setComputedData(statsData._computed || null);
      setGameStatus(statsData.gameStatus || null);
      setState("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }, [imageBase64]);

  const reset = useCallback(() => {
    setState("upload");
    setImagePreview(null);
    setImageBase64(null);
    setExtraction(null);
    setCharts([]);
    setStats([]);
    setSummary("");
    setComputedData(null);
    setParlayLegs([]);
    setGameStatus(null);
    setError("");
    setStatusMsg("");
  }, []);

  return (
    <div className="w-full">
      {state === "upload" && (
        <>
          {/* Hero section */}
          <div className="text-center px-4 pt-8 sm:pt-20 pb-10 sm:pb-16">
            <div className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-3xl sm:text-6xl font-black tracking-tight leading-[1.1]">
                Every bet has a story.
                <br />
                <span className="text-accent">Check the stats first.</span>
              </h2>
              <p className="text-muted text-base sm:text-xl max-w-xl mx-auto">
                Screenshot any sports bet. We&apos;ll pull the stats that
                actually matter — props, spreads, totals across NFL, NBA, MLB, NHL, and more.
              </p>

              {/* Upload CTA */}
              <div className="max-w-lg mx-auto pt-2">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                    dragOver
                      ? "bg-accent/15 border-2 border-dashed border-accent"
                      : imagePreview
                      ? "bg-surface border border-accent/50"
                      : "bg-surface hover:bg-surface-light border-2 border-dashed border-border hover:border-accent/50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileInput}
                    className="hidden"
                  />

                  {imagePreview ? (
                    <div className="space-y-4">
                      <img
                        src={imagePreview}
                        alt="Bet screenshot"
                        className="max-h-56 mx-auto rounded-lg"
                      />
                      <p className="text-muted text-sm">Tap to swap it out</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="mx-auto w-12 h-12 rounded-full bg-surface-light flex items-center justify-center">
                        <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-lg sm:text-xl font-semibold">
                        Upload a screenshot of your bet
                      </p>
                      <p className="text-muted text-sm">
                        Tap here or drag and drop — FanDuel, DraftKings, Bet365, any app
                      </p>
                    </div>
                  )}
                </div>

                {imagePreview && (
                  <button
                    onClick={analyze}
                    className="w-full mt-3 py-4 px-6 bg-accent hover:bg-emerald-400 text-black font-bold rounded-2xl transition-colors text-lg cursor-pointer"
                  >
                    Break It Down
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border/30" />

          {/* Example output */}
          <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
            <ExampleShowcase />
          </div>

          {/* Bottom CTA */}
          <div className="border-t border-border/30" />
          <div className="text-center px-4 py-12 sm:py-16">
            <div className="max-w-lg mx-auto space-y-4">
              <p className="text-2xl sm:text-3xl font-bold">
                Your gut is good.
                <br />
                Your gut + data is better.
              </p>
              <p className="text-muted">Takes 10 seconds. Totally free.</p>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="mt-2 py-3.5 px-8 bg-accent hover:bg-emerald-400 text-black font-bold rounded-2xl transition-colors text-base cursor-pointer"
              >
                Try It Now
              </button>
            </div>
          </div>
        </>
      )}

      {state === "analyzing" && (
        <div className="max-w-4xl mx-auto px-4 space-y-8 text-center pt-20">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Bet screenshot"
              className="max-h-48 mx-auto rounded-lg opacity-60"
            />
          )}
          <div className="space-y-4">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-accent border-t-transparent" />
            <p className="text-lg font-medium animate-pulse">{statusMsg}</p>
          </div>
        </div>
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
              We read your bet ({extraction.sport} — {extraction.betType.replace("_", "/")}) but don&apos;t have the data to break it down right now. Try a different bet — we work best with NFL, NBA, MLB, NHL, and college sports.
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
            onReset={reset}
          />
        </div>
      )}
    </div>
  );
}
