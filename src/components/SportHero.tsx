"use client";

/**
 * Stadium/court/rink hero used across MLB, NBA, NHL views - player props,
 * team bets, parlay legs. Compact variant for parlay legs.
 */

import type { BetExtraction } from "@/types";
import { SPORT_THEMES, resolveThemedSport, type ThemedSport } from "@/lib/sport-themes";

interface SwishScore {
  score: number;
  label: string;
  detail: string;
}

interface Props {
  extraction: Pick<BetExtraction, "sport" | "betType" | "teams" | "players" | "line" | "odds" | "market" | "description">;
  visuals?: Record<string, unknown>;
  swishScore?: SwishScore;
  /** "full" = with line/odds row; "compact" = just header */
  variant?: "full" | "compact";
}

function scoreColor(s: number): string {
  if (s <= 3) return "text-red-500";
  if (s <= 4.5) return "text-orange-400";
  if (s <= 5.5) return "text-yellow-400";
  if (s <= 7) return "text-emerald-400";
  return "text-green-300";
}

function scoreBg(s: number): string {
  if (s <= 3) return "bg-red-500/15 border-red-500/40";
  if (s <= 4.5) return "bg-orange-500/15 border-orange-500/40";
  if (s <= 5.5) return "bg-yellow-500/15 border-yellow-500/40";
  if (s <= 7) return "bg-emerald-500/15 border-emerald-500/40";
  return "bg-green-400/15 border-green-400/40";
}

function formatStatLabel(sport: ThemedSport, market?: string, description?: string): string {
  const m = `${market || ""} ${description || ""}`.toLowerCase();
  // Generic team-bet markets first
  if (m.includes("run line") || (sport === "MLB" && m.includes("spread"))) return "Run Line";
  if (m.includes("puck line") || (sport === "NHL" && m.includes("spread"))) return "Puck Line";
  if (m.includes("spread")) return "Spread";
  if (m.includes("moneyline") || m.includes("money line")) return "Moneyline";
  if (m.includes("first inning") || m.includes("nrfi")) return "First Inning";
  if (m.includes("first goal")) return "First Goal";
  if (m.includes("first basket")) return "First Basket";
  if (m.includes("total") && (m.includes("over") || m.includes("under") || m.includes("o/u"))) {
    if (sport === "MLB") return "Total Runs";
    if (sport === "NHL") return "Total Goals";
    if (sport === "NBA") return "Total Points";
    return "Total";
  }

  // MLB-specific
  if (sport === "MLB") {
    if (m.includes("strikeout") || /\bks?\b/.test(m)) return "Strikeouts";
    if (m.includes("total base")) return "Total Bases";
    if (m.includes("home run") || /\bhr\b/.test(m)) return "Home Runs";
    if (m.includes("rbi")) return "RBI";
    if (m.includes("stolen base")) return "Stolen Bases";
    if (m.includes("hit")) return "Hits";
  }
  // NBA-specific
  if (sport === "NBA") {
    if (m.includes("pra") || (m.includes("points") && m.includes("rebounds") && m.includes("assists"))) return "PRA";
    if (m.includes("points") && m.includes("rebounds")) return "Points + Rebounds";
    if (m.includes("points") && m.includes("assists")) return "Points + Assists";
    if (m.includes("rebounds") && m.includes("assists")) return "Rebounds + Assists";
    if (m.includes("three") || /\b3pt\b|\b3s\b/.test(m)) return "3-Pointers Made";
    if (m.includes("rebound")) return "Rebounds";
    if (m.includes("assist")) return "Assists";
    if (m.includes("steal")) return "Steals";
    if (m.includes("block")) return "Blocks";
    if (m.includes("turnover")) return "Turnovers";
    if (m.includes("point")) return "Points";
  }
  // NHL-specific
  if (sport === "NHL") {
    if (m.includes("save")) return "Saves";
    if (m.includes("shot on goal") || m.includes("sog")) return "Shots on Goal";
    if (m.includes("shot")) return "Shots";
    if (m.includes("goal")) return "Goals";
    if (m.includes("assist")) return "Assists";
    if (m.includes("point")) return "Points";
    if (m.includes("hit")) return "Hits";
  }
  return market || "Bet";
}

function extractActionPhrase(sport: ThemedSport, description?: string, market?: string, line?: number): string | null {
  if (line != null) return null;
  const desc = (description || "").trim();
  if (!desc) return market || null;
  const m = `${desc} ${market || ""}`.toLowerCase();

  // Cross-sport
  if (m.includes("first to score")) return "First to Score";

  // MLB
  if (sport === "MLB") {
    if (m.includes("anytime") && (m.includes("hr") || m.includes("home run"))) return "Anytime HR";
    if (m.includes("hit a home run") || m.includes("to homer")) return "To Hit a HR";
    if (m.includes("record a hit") || m.includes("to get a hit")) return "To Record a Hit";
    if (m.includes("stolen base") && (m.includes("record") || m.includes("get"))) return "To Steal a Base";
    if (m.includes("rbi") && (m.includes("record") || m.includes("get"))) return "To Record an RBI";
    if (m.includes("first run")) return "First to Score";
    if (m.includes("nrfi")) return "No Runs 1st Inning";
    if (m.includes("yrfi")) return "Yes Run 1st Inning";
  }
  // NBA
  if (sport === "NBA") {
    if (m.includes("first basket") || m.includes("first field goal")) return "First Basket";
    if (m.includes("anytime") && m.includes("three")) return "Anytime 3PT";
    if (m.includes("double double") || m.includes("double-double")) return "Double-Double";
    if (m.includes("triple double") || m.includes("triple-double")) return "Triple-Double";
  }
  // NHL
  if (sport === "NHL") {
    if (m.includes("first goal")) return "First Goal";
    if (m.includes("anytime") && m.includes("goal")) return "Anytime Goal";
    if (m.includes("hat trick")) return "Hat Trick";
  }

  // Fallback: trim trailing context
  const trimmed = desc
    .replace(/\b(?:in the|of the|from the|@|at|vs\.?)\b.*$/i, "")
    .replace(/\s+to\s+/i, " - ")
    .trim();
  const tail = trimmed.split(/\s+-\s+/).pop() || trimmed;
  return tail.length > 4 && tail.length < 50 ? tail : null;
}

export default function SportHero({ extraction, visuals, swishScore, variant = "full" }: Props) {
  const sport = resolveThemedSport(extraction.sport) || "MLB";
  const theme = SPORT_THEMES[sport];

  const playerName = extraction.players[0];
  const teamVisuals = (visuals?.teams || {}) as Record<string, { logo?: string; color?: string }>;
  const playerVisuals = (visuals?.players || {}) as Record<string, { headshot?: string }>;
  const headshot = playerName ? playerVisuals[playerName]?.headshot : undefined;

  const teamA = extraction.teams[0];
  const teamB = extraction.teams[1];
  const teamALogo = teamA ? teamVisuals[teamA]?.logo : undefined;
  const teamBLogo = teamB ? teamVisuals[teamB]?.logo : undefined;

  const stat = formatStatLabel(sport, extraction.market, extraction.description);
  const line = extraction.line;
  const isPlayerProp = extraction.betType === "player_prop";
  const action = extractActionPhrase(sport, extraction.description, extraction.market, line);

  const compact = variant === "compact";

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border"
      style={{ borderLeftWidth: 3, borderLeftColor: theme.accentBorder }}
    >
      {/* Sport-themed gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{ background: theme.heroGradient }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse at 50% 60%, transparent 0%, rgba(0,0,0,0.55) 90%)",
        }}
      />
      {/* Watermark - positioned bottom-center */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center ${theme.watermarkColor}`}
        aria-hidden
      >
        {theme.fullWatermark}
      </div>

      <div className={`relative ${compact ? "p-4" : "p-5 sm:p-6 min-h-[200px]"}`}>
        <div className="flex items-start gap-3 sm:gap-4">
          {isPlayerProp && headshot ? (
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-emerald-400/15 blur-md" aria-hidden />
              <img
                src={headshot}
                alt=""
                className={`relative ${compact ? "w-14 h-14" : "w-20 h-20 sm:w-24 sm:h-24"} rounded-full object-cover bg-surface-light border-2 border-white/15`}
              />
            </div>
          ) : teamALogo || teamBLogo ? (
            <div className="flex -space-x-2 flex-shrink-0">
              {teamALogo && (
                <img
                  src={teamALogo}
                  alt=""
                  className={`${compact ? "w-12 h-12" : "w-16 h-16"} rounded-full bg-white object-contain p-1.5 border-2 border-white/15`}
                />
              )}
              {teamBLogo && (
                <img
                  src={teamBLogo}
                  alt=""
                  className={`${compact ? "w-12 h-12" : "w-16 h-16"} rounded-full bg-white object-contain p-1.5 border-2 border-white/15`}
                />
              )}
            </div>
          ) : (
            <span className="text-3xl sm:text-4xl flex-shrink-0">
              {sport === "MLB" ? "⚾" : sport === "NBA" ? "\u{1F3C0}" : "\u{1F3D2}"}
            </span>
          )}

          <div className="flex-1 min-w-0">
            <h2 className={`font-black ${compact ? "text-base" : "text-xl sm:text-2xl"} leading-tight tracking-tight uppercase truncate text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]`}>
              {playerName || (teamA && teamB ? `${teamA} vs ${teamB}` : extraction.description)}
            </h2>
            {action && (
              <p className={`${compact ? "text-xs" : "text-sm sm:text-base"} font-bold uppercase tracking-wide text-accent mt-0.5 truncate`}>
                {action}
              </p>
            )}
            <p className="text-xs sm:text-sm text-white/70 mt-1 font-semibold tracking-wide">
              {playerName && teamA ? (
                <>
                  {teamA}
                  {teamB ? <> <span className="text-white/30">•</span> <span className="uppercase">vs {teamB}</span></> : null}
                </>
              ) : (
                <span className="uppercase">{stat}</span>
              )}
            </p>
            {swishScore && !compact && (
              <div className={`inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-md border ${scoreBg(swishScore.score)}`}>
                <span className={`text-sm font-black tabular-nums leading-none ${scoreColor(swishScore.score)}`}>
                  {swishScore.score}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-muted">/ 10</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${scoreColor(swishScore.score)}`}>
                  {swishScore.label}
                </span>
              </div>
            )}
          </div>

          {compact && swishScore && (
            <div className={`flex-shrink-0 self-start rounded-md border px-2 py-1 text-center ${scoreBg(swishScore.score)}`}>
              <div className={`text-base font-black tabular-nums leading-none ${scoreColor(swishScore.score)}`}>
                {swishScore.score}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-muted mt-0.5">/ 10</div>
            </div>
          )}
        </div>

        {/* Line / Odds row - full variant only */}
        {!compact && line != null && (
          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-bold">{stat}</div>
              <div className="text-4xl sm:text-5xl font-black tabular-nums mt-1 leading-none text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
                {isPlayerProp ? <><span className="text-white/60 text-2xl sm:text-3xl">O </span>{line}</> : (line >= 0 ? "+" : "") + line}
              </div>
            </div>
            {extraction.odds && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-bold">Odds</div>
                <div className="text-xl sm:text-2xl font-bold tabular-nums text-accent-gold mt-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                  {extraction.odds}
                </div>
              </div>
            )}
          </div>
        )}

        {compact && (line != null || extraction.odds) && (
          <div className="mt-3 flex items-baseline gap-3 text-xs">
            {line != null && (
              <div>
                <span className="text-white/50 mr-1.5 uppercase tracking-wider text-[10px] font-bold">{stat}</span>
                <span className="text-white font-black tabular-nums text-base">
                  {isPlayerProp ? `O ${line}` : (line >= 0 ? "+" : "") + line}
                </span>
              </div>
            )}
            {extraction.odds && (
              <div>
                <span className="text-white/50 mr-1.5 uppercase tracking-wider text-[10px] font-bold">Odds</span>
                <span className="text-accent-gold font-bold tabular-nums text-sm">{extraction.odds}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
