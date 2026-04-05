"use client";

import { useState } from "react";
import type { BetExtraction, GameStatusData } from "@/types";
import ShareMenu from "./ShareMenu";

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
        <ShareMenu extraction={extraction} summary={summary} gameStatus={gameStatus} />
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
