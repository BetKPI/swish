/**
 * Sport-specific visual theming used by SportHero — gradients, watermark
 * SVGs, accent borders, page-level tints. Add a new sport by adding an
 * entry here.
 */

import type { ReactElement } from "react";

export type ThemedSport = "MLB" | "NBA" | "NHL";

export interface SportTheme {
  /** Top-to-bottom gradient applied to the hero background. */
  heroGradient: string;
  /** Page-level radial wash (used as a fixed bg behind the page). */
  pageWash: string;
  /** Color used for the left accent border on the hero. */
  accentBorder: string;
  /** Watermark SVG rendered behind the content (full hero variant). */
  fullWatermark: ReactElement;
  /** Compact corner watermark (parlay legs / chart cards). */
  cornerWatermark: ReactElement;
  /** Color class applied to watermark `currentColor`. */
  watermarkColor: string;
  /** Compact corner watermark color (more subtle). */
  cornerWatermarkColor: string;
}

// ── MLB — diamond, navy sky → grass ────────────────────────────────

const mlbFullWatermark = (
  <svg
    viewBox="0 0 240 240"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinejoin="round"
    strokeLinecap="round"
    className="w-[110%] sm:w-[95%] h-auto translate-y-[18%]"
  >
    {/* Outfield arc */}
    <path d="M 10 185 Q 120 -50 230 185" strokeOpacity="0.55" />
    {/* Foul lines */}
    <line x1="120" y1="200" x2="12" y2="184" strokeOpacity="0.5" />
    <line x1="120" y1="200" x2="228" y2="184" strokeOpacity="0.5" />
    {/* Warning track */}
    <path d="M 25 175 Q 120 -30 215 175" strokeOpacity="0.25" strokeDasharray="3 6" />
    {/* Infield diamond */}
    <polygon points="120,200 175,145 120,90 65,145" strokeOpacity="1" strokeWidth="1.8" />
    {/* Infield grass arc */}
    <path d="M 75 165 Q 120 110 165 165" strokeOpacity="0.45" />
    {/* Pitcher's mound */}
    <circle cx="120" cy="145" r="7" strokeOpacity="0.95" />
    {/* Bases */}
    <rect x="115" y="195" width="10" height="10" strokeOpacity="1" fill="currentColor" fillOpacity="0.4" />
    <rect x="170" y="140" width="10" height="10" strokeOpacity="1" fill="currentColor" fillOpacity="0.4" />
    <rect x="115" y="85" width="10" height="10" strokeOpacity="1" fill="currentColor" fillOpacity="0.4" />
    <rect x="60" y="140" width="10" height="10" strokeOpacity="1" fill="currentColor" fillOpacity="0.4" />
  </svg>
);

const mlbCornerWatermark = (
  <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="w-full h-full">
    <polygon points="120,200 175,145 120,90 65,145" />
    <circle cx="120" cy="145" r="5" />
    <line x1="120" y1="200" x2="40" y2="120" strokeOpacity="0.5" />
    <line x1="120" y1="200" x2="200" y2="120" strokeOpacity="0.5" />
  </svg>
);

// ── NBA — half court (top-down), arena dark → wood/amber ───────────

const nbaFullWatermark = (
  <svg
    viewBox="0 0 240 240"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    strokeLinecap="round"
    className="w-[110%] sm:w-[95%] h-auto translate-y-[10%]"
  >
    {/* Court outline (half-court — baseline at top, half-court line at bottom) */}
    <rect x="20" y="10" width="200" height="220" strokeOpacity="0.7" />
    {/* Backboard + rim at top of the key */}
    <line x1="100" y1="22" x2="140" y2="22" strokeOpacity="0.95" strokeWidth="2.5" />
    <circle cx="120" cy="32" r="6" strokeOpacity="1" />
    {/* Key / paint rectangle */}
    <rect x="86" y="10" width="68" height="80" strokeOpacity="0.95" strokeWidth="1.8" />
    {/* Free-throw circle */}
    <circle cx="120" cy="90" r="32" strokeOpacity="0.9" />
    {/* Lower half of FT circle (dashed since it's behind the line) */}
    <path d="M 88 90 A 32 32 0 0 0 152 90" strokeOpacity="0.4" strokeDasharray="3 4" />
    {/* 3-point arc */}
    <path d="M 50 10 L 50 70 A 70 70 0 0 0 190 70 L 190 10" strokeOpacity="0.95" strokeWidth="1.8" />
    {/* Half-court line + center circle */}
    <line x1="20" y1="220" x2="220" y2="220" strokeOpacity="0.95" strokeWidth="2" />
    <circle cx="120" cy="220" r="22" strokeOpacity="0.9" />
    <circle cx="120" cy="220" r="6" strokeOpacity="0.6" />
    {/* Restricted area arc (under hoop) */}
    <path d="M 110 32 A 12 12 0 0 0 130 32" strokeOpacity="0.5" />
  </svg>
);

const nbaCornerWatermark = (
  <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="w-full h-full">
    <rect x="86" y="10" width="68" height="80" strokeOpacity="0.95" />
    <circle cx="120" cy="90" r="32" />
    <path d="M 50 10 L 50 70 A 70 70 0 0 0 190 70 L 190 10" />
    <circle cx="120" cy="32" r="6" />
  </svg>
);

// ── NHL — full rink top-down, arena dark → ice blue ───────────────

const nhlFullWatermark = (
  <svg
    viewBox="0 0 240 160"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    strokeLinecap="round"
    className="w-[110%] sm:w-[100%] h-auto translate-y-[15%]"
  >
    {/* Boards (rounded rectangle) */}
    <rect x="10" y="20" width="220" height="120" rx="28" ry="28" strokeOpacity="0.9" strokeWidth="1.8" />
    {/* Goal lines */}
    <line x1="28" y1="20" x2="28" y2="140" strokeOpacity="0.85" />
    <line x1="212" y1="20" x2="212" y2="140" strokeOpacity="0.85" />
    {/* Blue lines */}
    <line x1="92" y1="20" x2="92" y2="140" strokeOpacity="0.95" strokeWidth="2" />
    <line x1="148" y1="20" x2="148" y2="140" strokeOpacity="0.95" strokeWidth="2" />
    {/* Center red line */}
    <line x1="120" y1="20" x2="120" y2="140" strokeOpacity="0.95" strokeWidth="2.5" />
    {/* Center face-off circle */}
    <circle cx="120" cy="80" r="18" strokeOpacity="0.85" />
    <circle cx="120" cy="80" r="3" strokeOpacity="0.9" fill="currentColor" fillOpacity="0.5" />
    {/* Defensive/offensive zone face-off circles (4 corners-ish) */}
    <circle cx="55" cy="50" r="12" strokeOpacity="0.7" />
    <circle cx="55" cy="110" r="12" strokeOpacity="0.7" />
    <circle cx="185" cy="50" r="12" strokeOpacity="0.7" />
    <circle cx="185" cy="110" r="12" strokeOpacity="0.7" />
    {/* Crease semi-circles in front of each goal */}
    <path d="M 28 70 A 12 12 0 0 1 28 90" strokeOpacity="0.85" />
    <path d="M 212 70 A 12 12 0 0 0 212 90" strokeOpacity="0.85" />
    {/* Goal mouths (small rectangles on goal lines) */}
    <rect x="22" y="74" width="6" height="12" strokeOpacity="0.9" />
    <rect x="212" y="74" width="6" height="12" strokeOpacity="0.9" />
  </svg>
);

const nhlCornerWatermark = (
  <svg viewBox="0 0 240 160" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="w-full h-full">
    <rect x="10" y="20" width="220" height="120" rx="28" ry="28" />
    <circle cx="120" cy="80" r="18" />
    <line x1="120" y1="20" x2="120" y2="140" strokeWidth="2.5" />
  </svg>
);

// ── Theme registry ─────────────────────────────────────────────────

export const SPORT_THEMES: Record<ThemedSport, SportTheme> = {
  MLB: {
    heroGradient:
      "linear-gradient(180deg, #0c2340 0%, #0a1a2e 35%, #0a0a0a 55%, #0a3a23 100%)",
    pageWash:
      "radial-gradient(ellipse at 50% 100%, rgba(16, 122, 73, 0.08) 0%, transparent 60%)",
    accentBorder: "#c8102e",
    fullWatermark: mlbFullWatermark,
    cornerWatermark: mlbCornerWatermark,
    watermarkColor: "text-emerald-300/35",
    cornerWatermarkColor: "text-emerald-400/[0.06]",
  },
  NBA: {
    // Arena dark → court wood (warm brown/amber)
    heroGradient:
      "linear-gradient(180deg, #0a0a0a 0%, #1a1308 35%, #2a1d0c 65%, #4a3217 100%)",
    pageWash:
      "radial-gradient(ellipse at 50% 100%, rgba(217, 119, 6, 0.08) 0%, transparent 60%)",
    accentBorder: "#f97316",
    fullWatermark: nbaFullWatermark,
    cornerWatermark: nbaCornerWatermark,
    watermarkColor: "text-amber-200/30",
    cornerWatermarkColor: "text-amber-400/[0.07]",
  },
  NHL: {
    // Arena dark → ice blue
    heroGradient:
      "linear-gradient(180deg, #0a0a0a 0%, #0d1620 35%, #102a3e 65%, #1e4d6e 100%)",
    pageWash:
      "radial-gradient(ellipse at 50% 100%, rgba(56, 189, 248, 0.08) 0%, transparent 60%)",
    accentBorder: "#3b82f6",
    fullWatermark: nhlFullWatermark,
    cornerWatermark: nhlCornerWatermark,
    watermarkColor: "text-sky-200/35",
    cornerWatermarkColor: "text-sky-400/[0.08]",
  },
};

/** Resolve a sport string (case-insensitive) to a themed sport, or null. */
export function resolveThemedSport(sport: string): ThemedSport | null {
  const s = (sport || "").toUpperCase();
  if (s === "MLB" || s === "BASEBALL") return "MLB";
  if (s === "NBA" || s === "BASKETBALL") return "NBA";
  if (s === "NHL" || s === "HOCKEY") return "NHL";
  return null;
}
