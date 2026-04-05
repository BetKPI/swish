"use client";

import { useState } from "react";
import type { BetExtraction, GameStatusData } from "@/types";

interface ShareMenuProps {
  extraction: BetExtraction;
  summary: string;
  gameStatus?: GameStatusData;
  /** CSS selector or ref ID of the element to screenshot */
  captureId?: string;
}

export default function ShareMenu({
  extraction,
  summary,
  gameStatus,
  captureId = "analysis-content",
}: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);

  const gradeText = gameStatus?.grade?.result && gameStatus.grade.result !== "pending"
    ? `${gameStatus.grade.result === "hit" ? "\u2705 HIT" : gameStatus.grade.result === "miss" ? "\u274C MISS" : "\u{1F7E1} PUSH"} \u2014 ${gameStatus.grade.detail}`
    : "";
  const liveText = gameStatus?.state === "in"
    ? `\u{1F534} LIVE: ${gameStatus.awayTeam} ${gameStatus.awayScore}-${gameStatus.homeScore} ${gameStatus.homeTeam}`
    : "";

  const shareText = [
    extraction.description,
    extraction.odds ? `Odds: ${extraction.odds}` : "",
    liveText || gradeText,
    "",
    summary ? summary.slice(0, 180) : "",
    "",
    "swish-jet.vercel.app",
  ].filter(Boolean).join("\n");

  const shareUrl = "https://swish-jet.vercel.app";

  const captureScreenshot = async (): Promise<Blob | null> => {
    setCapturing(true);
    try {
      const el = document.getElementById(captureId);
      if (!el) return null;
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(el, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
    } catch (e) {
      console.error("Screenshot failed:", e);
      return null;
    } finally {
      setCapturing(false);
    }
  };

  const shareNative = async () => {
    const blob = await captureScreenshot();
    if (blob && navigator.share) {
      try {
        const file = new File([blob], "swish-analysis.png", { type: "image/png" });
        await navigator.share({ title: "Swish Analysis", text: shareText, files: [file] });
        setOpen(false);
        return;
      } catch { /* user cancelled or not supported */ }
    }
    // Fallback: just share text
    if (navigator.share) {
      try {
        await navigator.share({ title: "Swish Analysis", text: shareText, url: shareUrl });
        setOpen(false);
        return;
      } catch { /* cancelled */ }
    }
  };

  const shareTwitter = () => {
    const text = encodeURIComponent(shareText.slice(0, 240));
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
    setOpen(false);
  };

  const shareEmail = () => {
    const subject = encodeURIComponent(`Swish: ${extraction.description}`);
    const body = encodeURIComponent(shareText);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    setOpen(false);
  };

  const shareSMS = () => {
    const body = encodeURIComponent(shareText);
    window.open(`sms:?body=${body}`, "_blank");
    setOpen(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  const downloadScreenshot = async () => {
    const blob = await captureScreenshot();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "swish-analysis.png";
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-light hover:bg-border rounded-lg transition-colors text-sm text-muted hover:text-foreground cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
        Share
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Menu */}
          <div className="absolute right-0 bottom-full mb-2 z-50 bg-surface border border-border rounded-xl shadow-xl p-2 min-w-[200px]">
            {/* Native share (mobile) */}
            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
              <button onClick={shareNative} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-light transition-colors text-sm cursor-pointer">
                <span className="text-base">&#128244;</span>
                <span>Share with image</span>
              </button>
            )}

            <button onClick={shareTwitter} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-light transition-colors text-sm cursor-pointer">
              <span className="text-base">&#120143;</span>
              <span>Post to X / Twitter</span>
            </button>

            <button onClick={shareSMS} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-light transition-colors text-sm cursor-pointer">
              <span className="text-base">&#128172;</span>
              <span>Text message</span>
            </button>

            <button onClick={shareEmail} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-light transition-colors text-sm cursor-pointer">
              <span className="text-base">&#9993;</span>
              <span>Email</span>
            </button>

            <button onClick={downloadScreenshot} disabled={capturing} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-light transition-colors text-sm cursor-pointer disabled:opacity-50">
              <span className="text-base">&#128247;</span>
              <span>{capturing ? "Capturing..." : "Save screenshot"}</span>
            </button>

            <div className="border-t border-border/50 my-1" />

            <button onClick={copyToClipboard} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-light transition-colors text-sm cursor-pointer">
              <span className="text-base">&#128203;</span>
              <span>{copied ? "Copied!" : "Copy text"}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
