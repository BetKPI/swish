"use client";

import { useState, useCallback, useRef } from "react";
import type { AppState, BetExtraction, ChartConfig, StatDataPoint } from "@/types";
import AnalysisResults from "@/components/AnalysisResults";

export default function Home() {
  const [state, setState] = useState<AppState>("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<BetExtraction | null>(null);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [stats, setStats] = useState<StatDataPoint[]>([]);
  const [summary, setSummary] = useState<string>("");
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
      setStatusMsg("Reading your bet...");
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageBase64 }),
      });
      if (!analyzeRes.ok) throw new Error("Failed to analyze bet screenshot");
      const analyzeData = await analyzeRes.json();
      setExtraction(analyzeData.extraction);

      setStatusMsg("Fetching stats...");
      const statsRes = await fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraction: analyzeData.extraction }),
      });
      if (!statsRes.ok) throw new Error("Failed to fetch stats");
      const statsData = await statsRes.json();

      setCharts(statsData.charts || []);
      setStats(statsData.stats || []);
      setSummary(statsData.summary || "");
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
    setError("");
    setStatusMsg("");
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      {state === "upload" && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Analyze Your Bet</h2>
            <p className="text-muted text-sm">
              Upload a screenshot of your sports bet for instant analysis
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-accent bg-accent/10"
                : imagePreview
                ? "border-accent/50 bg-surface"
                : "border-border hover:border-accent/50 bg-surface"
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
                  className="max-h-64 mx-auto rounded-lg"
                />
                <p className="text-muted text-sm">Click to change image</p>
              </div>
            ) : (
              <div className="space-y-3 py-4">
                <div className="text-4xl">📸</div>
                <p className="text-lg font-medium">
                  Drop your bet screenshot here
                </p>
                <p className="text-muted text-sm">
                  or click to browse — PNG, JPG, WEBP up to 10MB
                </p>
              </div>
            )}
          </div>

          {imagePreview && (
            <button
              onClick={analyze}
              className="w-full py-3 px-6 bg-accent hover:bg-accent/90 text-white font-semibold rounded-xl transition-colors text-lg"
            >
              Analyze This Bet
            </button>
          )}
        </div>
      )}

      {state === "analyzing" && (
        <div className="space-y-6 text-center">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Bet screenshot"
              className="max-h-48 mx-auto rounded-lg opacity-75"
            />
          )}
          <div className="space-y-4">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-accent border-t-transparent" />
            <p className="text-lg font-medium animate-pulse">{statusMsg}</p>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="space-y-4 text-center">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
            <p className="text-red-400">{error}</p>
          </div>
          <button
            onClick={reset}
            className="py-2 px-6 bg-surface-light hover:bg-border text-foreground rounded-xl transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {state === "results" && extraction && (
        <AnalysisResults
          extraction={extraction}
          charts={charts}
          stats={stats}
          summary={summary}
          onReset={reset}
        />
      )}
    </div>
  );
}
