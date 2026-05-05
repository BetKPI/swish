"use client";

import { useState } from "react";

/**
 * Email capture pitched as "daily edge digest" — gives users a concrete
 * reason to drop their email beyond a vague "join the waitlist". POSTs
 * to /api/waitlist which forwards to the existing Discord webhook.
 */
export default function WaitlistCapture({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "ok" | "err">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@") || state === "submitting") return;
    setState("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      if (res.ok) {
        setState("ok");
        setEmail("");
      } else {
        setState("err");
      }
    } catch {
      setState("err");
    }
  }

  return (
    <div className="bg-surface/60 border border-border/50 rounded-2xl p-5 sm:p-6">
      <div className="text-center sm:text-left mb-4">
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-accent mb-2">
          Free daily digest
        </p>
        <h3 className="text-lg sm:text-xl font-bold leading-tight">
          Tomorrow&apos;s sharpest plays in your inbox by 9am.
        </h3>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">
          The top 5 props with the highest model probability of hitting,
          including the matchup angle that flagged them. No spam, no picks
          for sale.
        </p>
      </div>

      {state === "ok" ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-emerald-400 font-bold">You&apos;re in.</p>
          <p className="text-sm text-emerald-400/80 mt-1">
            First digest hits your inbox tomorrow at 9am ET.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent/60 text-sm"
            disabled={state === "submitting"}
          />
          <button
            type="submit"
            disabled={state === "submitting" || !email.includes("@")}
            className="px-5 py-3 bg-accent hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {state === "submitting" ? "..." : "Get the digest"}
          </button>
        </form>
      )}
      {state === "err" && (
        <p className="text-red-400 text-xs mt-2">Couldn&apos;t reach our servers. Try again?</p>
      )}
    </div>
  );
}
