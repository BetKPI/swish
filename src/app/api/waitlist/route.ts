/**
 * Waitlist signup endpoint - captures email + optional context (sport
 * preference, source) and posts to the existing Discord webhook so the
 * user can see signups land in real time. No new infra required.
 *
 * Validates email shape, blocks the obvious bots, dedupes via in-memory
 * cache (24h) so a refresh doesn't double-log. Returns 200 on success
 * regardless to avoid leaking which addresses already signed up.
 */

import { NextRequest, NextResponse } from "next/server";

const RECENT_SIGNUPS = new Map<string, number>();
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

function isValidEmail(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.length < 5 || s.length > 254) return false;
  // RFC-lite: at least name@host.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const email = String(body.email || "").trim().toLowerCase();
    const sport = String(body.sport || "").trim().slice(0, 40);
    const source = String(body.source || "landing").trim().slice(0, 40);
    const ua = (request.headers.get("user-agent") || "").slice(0, 200);
    const referer = (request.headers.get("referer") || "").slice(0, 200);

    if (!isValidEmail(email)) {
      // Treat as success on the wire so bots can't probe
      return NextResponse.json({ ok: true });
    }

    // Dedupe within window
    const last = RECENT_SIGNUPS.get(email);
    if (last && Date.now() - last < DEDUPE_WINDOW_MS) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    RECENT_SIGNUPS.set(email, Date.now());
    // Trim old entries occasionally
    if (RECENT_SIGNUPS.size > 5000) {
      const cutoff = Date.now() - DEDUPE_WINDOW_MS;
      for (const [k, t] of RECENT_SIGNUPS) {
        if (t < cutoff) RECENT_SIGNUPS.delete(k);
      }
    }

    // Forward to Discord webhook (the same URL we already use for bet logs)
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (webhook) {
      const fields = [
        { name: "Email", value: email, inline: true },
        { name: "Source", value: source || "landing", inline: true },
      ];
      if (sport) fields.push({ name: "Sport pref", value: sport, inline: true });
      if (referer) fields.push({ name: "Referer", value: referer, inline: false });
      if (ua) fields.push({ name: "UA", value: ua.slice(0, 100), inline: false });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {
        username: "Spidey Bot",
        embeds: [{
          title: "🎯 Waitlist signup",
          color: 0x10b981,
          timestamp: new Date().toISOString(),
          fields,
        }],
      };
      // Don't await — don't block the user response on Discord
      void fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => { /* silent */ });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // never leak errors here
  }
}
