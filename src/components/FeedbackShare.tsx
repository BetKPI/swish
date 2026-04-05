"use client";

import { useState } from "react";
import type { BetExtraction, GameStatusData } from "@/types";

interface FeedbackShareProps {
  extraction: BetExtraction;
  summary: string;
  gameStatus?: GameStatusData;
}

export default function FeedbackShare({
  extraction,
  summary,
  gameStatus,
}: FeedbackShareProps) {
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [shareMsg, setShareMsg] = useState("");

  const sendFeedback = async (r: "up" | "down", text?: string) => {
    setRating(r);
    setFeedbackSent(true);

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: r,
          comment: text || "",
          bet: {
            description: extraction.description,
            sport: extraction.sport,
            betType: extraction.betType,
            teams: extraction.teams,
            players: extraction.players,
            odds: extraction.odds,
            line: extraction.line,
          },
        }),
      });
    } catch {
      // Silent fail — don't break UX for feedback
    }
  };

  const handleThumb = (r: "up" | "down") => {
    if (r === "down") {
      setRating(r);
      setShowComment(true);
    } else {
      sendFeedback(r);
    }
  };

  const submitComment = () => {
    sendFeedback(rating || "down", comment);
    setShowComment(false);
  };

  const handleShare = async () => {
    const gradeText = gameStatus?.grade?.result && gameStatus.grade.result !== "pending"
      ? `\n${gameStatus.grade.result === "hit" ? "\u2705 HIT" : gameStatus.grade.result === "miss" ? "\u274C MISS" : "\u{1F7E1} PUSH"} — ${gameStatus.grade.detail}`
      : "";
    const liveText = gameStatus?.state === "in"
      ? `\n\u{1F534} LIVE: ${gameStatus.awayTeam} ${gameStatus.awayScore} - ${gameStatus.homeScore} ${gameStatus.homeTeam}`
      : "";
    const text = [
      `${extraction.sport} ${extraction.betType.replace("_", "/")}`,
      extraction.description,
      extraction.odds ? `Odds: ${extraction.odds}` : "",
      liveText || gradeText || "",
      "",
      summary ? summary.slice(0, 200) + (summary.length > 200 ? "..." : "") : "",
      "",
      "Analyzed with Swish \u2014 swish-jet.vercel.app",
    ]
      .filter(Boolean)
      .join("\n");

    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Swish Bet Analysis",
          text,
          url: "https://swish-jet.vercel.app",
        });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      setShareMsg("Copied!");
      setTimeout(() => setShareMsg(""), 2000);
    } catch {
      setShareMsg("Couldn't copy");
      setTimeout(() => setShareMsg(""), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Share + Feedback row */}
      <div className="flex items-center justify-between bg-surface rounded-xl px-4 py-3">
        {/* Feedback */}
        <div className="flex items-center gap-3">
          {feedbackSent && !showComment ? (
            <span className="text-sm text-muted">Thanks for the feedback</span>
          ) : !showComment ? (
            <>
              <span className="text-sm text-muted">Was this useful?</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleThumb("up")}
                  className="p-1.5 rounded-lg hover:bg-surface-light transition-colors cursor-pointer text-lg leading-none"
                  aria-label="Thumbs up"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted hover:text-accent"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>
                </button>
                <button
                  onClick={() => handleThumb("down")}
                  className="p-1.5 rounded-lg hover:bg-surface-light transition-colors cursor-pointer text-lg leading-none"
                  aria-label="Thumbs down"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted hover:text-red-400"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>
                </button>
              </div>
            </>
          ) : null}
        </div>

        {/* Share */}
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-light hover:bg-border rounded-lg transition-colors text-sm text-muted hover:text-foreground cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
          {shareMsg || "Share"}
        </button>
      </div>

      {/* Comment box for negative feedback */}
      {showComment && (
        <div className="bg-surface rounded-xl px-4 py-3 space-y-2">
          <p className="text-sm text-muted">What could be better?</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder="e.g. wrong team, bad chart, missing data..."
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50"
              autoFocus
            />
            <button
              onClick={submitComment}
              className="px-3 py-2 bg-accent hover:bg-emerald-400 text-black font-semibold rounded-lg text-sm cursor-pointer"
            >
              Send
            </button>
            <button
              onClick={() => { setShowComment(false); sendFeedback("down"); }}
              className="px-3 py-2 bg-surface-light hover:bg-border text-muted rounded-lg text-sm cursor-pointer"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
