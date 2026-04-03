"use client";

import { useState, useRef } from "react";
import type { BetExtraction, ChartConfig } from "@/types";
import ChartDisplay from "./ChartDisplay";

interface AnalysisChatProps {
  extraction: BetExtraction;
  computedData: Record<string, unknown>;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  chart?: ChartConfig;
  noData?: boolean;
}

const SUGGESTIONS_BY_SPORT: Record<string, string[]> = {
  MLB: [
    "Show the starting pitchers' records",
    "How have these pitchers done against each other?",
    "Show home vs away splits",
    "Compare the pitchers' recent game logs",
  ],
  NBA: [
    "Show home vs away splits",
    "Pull up the player's last 10 games",
    "How do they perform on rest?",
    "Show recent opponent strength",
  ],
  NHL: [
    "Show the goalie's recent save percentage",
    "Compare power play efficiency",
    "Show home vs away splits",
    "Pull up the player's game log",
  ],
  DEFAULT: [
    "Show home vs away splits",
    "Show recent scoring trends",
    "How do they perform on rest?",
    "Show recent opponent strength",
  ],
};

export default function AnalysisChat({
  extraction,
  computedData,
}: AnalysisChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          extraction,
          computedData,
        }),
      });

      const data = await res.json();

      if (data.type === "chart" && data.chart) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message || "Here you go.",
            chart: data.chart,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message || "We don't have the data for that.",
            noData: true,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong — try again.",
          noData: true,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="border-t border-border/30 pt-4">
        <h3 className="text-sm font-semibold text-muted mb-3">
          Ask for more analysis
        </h3>

        {/* Suggestion chips — only show if no messages yet */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {(SUGGESTIONS_BY_SPORT[extraction.sport?.toUpperCase()] || SUGGESTIONS_BY_SPORT.DEFAULT).map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs px-3 py-1.5 bg-surface-light hover:bg-border text-muted hover:text-foreground rounded-full transition-colors cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Chat messages */}
        {messages.length > 0 && (
          <div className="space-y-3 mb-3 max-h-[600px] overflow-y-auto">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="bg-accent/20 text-accent px-3 py-2 rounded-xl rounded-br-sm text-sm max-w-[80%]">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div
                      className={`px-3 py-2 rounded-xl rounded-bl-sm text-sm max-w-[90%] ${
                        msg.noData
                          ? "bg-surface-light text-muted"
                          : "bg-surface text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.chart && <ChartDisplay config={msg.chart} />}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:0.3s]" />
                <span className="text-xs text-muted ml-1">Looking into it...</span>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="e.g. &quot;Show road performance&quot; or &quot;Compare scoring trends&quot;"
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50"
            disabled={loading}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-accent hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-accent text-black font-semibold rounded-xl transition-colors text-sm cursor-pointer"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
