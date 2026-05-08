/**
 * Market detection - identifies exotic bet types from market strings.
 *
 * Uses keyword presence (not exact substring matching) so "First Team
 * Basket Scorer" matches the same as "First Basket Scorer" or "1st Basket".
 *
 * Single source of truth - used by both stats/route.ts and charts.ts.
 */

export type ExoticMarket =
  | "first_basket"
  | "first_goal"
  | "nrfi"
  | "double_double"
  | "combo_prop"
  | "anytime_td"
  | "hole_in_one"
  | "futures"
  | "first_5_innings"
  | null;

/**
 * Detect the exotic market type from a market/description string.
 * Returns null if it's a standard prop/spread/ML/O-U.
 */
export function detectExoticMarket(
  market: string,
  description: string = "",
  sport: string = ""
): ExoticMarket {
  const text = `${market} ${description}`.toLowerCase();
  const s = (sport || "").toUpperCase();

  // First basket / first scorer (NBA)
  // CRITICAL: don't match quarter / half props ("1st quarter points",
  // "first half rebounds") - those are intra-game scoring totals, not
  // first-basket props.
  if (s === "NBA" || s === "BASKETBALL" || s === "NCAAB" || !s) {
    const isPeriodBet =
      /\b(quarter|qtr|q[1-4]\b|half|1h\b|2h\b|h1\b|h2\b|first half|second half|1st quarter|2nd quarter|3rd quarter|4th quarter|first quarter|second quarter|third quarter|fourth quarter)/.test(text);
    if (isPeriodBet) return null;
    // First basket / scorer / FG
    if (text.includes("first") && (text.includes("basket") || text.includes("scorer") || text.includes(" fg"))) {
      return "first_basket";
    }
    if (text.includes("1st") && text.includes("basket")) {
      return "first_basket";
    }
  }

  // First goal (NHL)
  if (s === "NHL" || s === "HOCKEY" || !s) {
    if ((text.includes("first") || text.includes("1st")) && text.includes("goal")) {
      return "first_goal";
    }
  }

  // NRFI / YRFI / 1st Inning (MLB)
  if (s === "MLB" || s === "BASEBALL" || !s) {
    if (text.includes("nrfi") || text.includes("yrfi") ||
        (text.includes("first inning") && (text.includes("run") || text.includes("no run"))) ||
        (text.includes("1st inning") && (text.includes("run") || text.includes("over") || text.includes("under") || text.includes("total")))) {
      return "nrfi";
    }
  }

  // Double-double
  if (text.includes("double-double") || text.includes("double double") || text === "dd") {
    return "double_double";
  }

  // Combo props (PRA, pts+reb, H+R+RBI, goals+assists, etc.)
  if (
    // NBA combos
    text.includes("pra") ||
    text.includes("pts+reb+ast") ||
    text.includes("points+rebounds+assists") ||
    text.includes("points rebounds assists") ||
    (text.includes("pts+reb") && !text.includes("ast")) ||
    text.includes("pts+ast") ||
    text.includes("reb+ast") ||
    text.includes("points+rebounds") ||
    text.includes("points+assists") ||
    text.includes("rebounds+assists") ||
    // MLB combos
    text.includes("h+r+rbi") ||
    text.includes("hits+runs+rbi") ||
    text.includes("hits+runs+rbis") ||
    text.includes("hits runs rbis") ||
    text.includes("hits+runs") ||
    text.includes("hits+rbi") ||
    text.includes("runs+rbi") ||
    text.includes("total bases+runs") ||
    // NHL combos
    text.includes("goals+assists") ||
    text.includes("shots+goals") ||
    text.includes("points+shots")
  ) {
    return "combo_prop";
  }

  // Hole-in-one (Golf)
  if (isGolfSport(s)) {
    if (text.includes("hole in one") || text.includes("hole-in-one") || text.includes("holeinone") || text.includes("ace") || text.includes("hio")) {
      return "hole_in_one";
    }
  }

  // Futures - season-long bets (division, conference, win totals, MVP, playoffs, etc.)
  if (text.includes("division") || text.includes("pennant") || text.includes("conference") ||
      text.includes("win total") || text.includes("season wins") || text.includes("world series") ||
      text.includes("super bowl") || text.includes("stanley cup") || text.includes("nba champion") ||
      text.includes("mvp") || text.includes("cy young") || text.includes("rookie of the year") ||
      text.includes("playoffs") || text.includes("make the playoffs") || text.includes("postseason") ||
      text.includes("national league") || text.includes("american league") ||
      text.includes("al east") || text.includes("al west") || text.includes("al central") ||
      text.includes("nl east") || text.includes("nl west") || text.includes("nl central") ||
      (text.includes("win") && (text.includes("east") || text.includes("west") || text.includes("central") || text.includes("atlantic") || text.includes("pacific")))) {
    return "futures";
  }

  // First N Innings (MLB) - "first 5 innings", "first 3 innings", "f5", "1st 7 innings", etc.
  if (s === "MLB" || s === "BASEBALL" || !s) {
    if (/(?:first|1st|f)\s*\d+\s*(?:inning|inn)/i.test(text) ||
        /\bf[357]\b/.test(text)) {
      return "first_5_innings";
    }
  }

  // Anytime TD (NFL) - skeleton for when season starts
  if (s === "NFL" || s === "NCAAF" || !s) {
    if (text.includes("anytime") && (text.includes("touchdown") || text.includes(" td"))) {
      return "anytime_td";
    }
    if ((text.includes("first") || text.includes("1st")) && (text.includes("touchdown") || text.includes(" td"))) {
      return "anytime_td"; // first TD uses same data
    }
  }

  return null;
}

/**
 * Check if a sport string matches NBA.
 */
export function isNBASport(sport: string): boolean {
  const s = (sport || "").toUpperCase();
  return s === "NBA" || s === "BASKETBALL" || s === "NCAAB" || s === "WNBA";
}

export function isMLBSport(sport: string): boolean {
  const s = (sport || "").toUpperCase();
  return s === "MLB" || s === "BASEBALL";
}

export function isNHLSport(sport: string): boolean {
  const s = (sport || "").toUpperCase();
  return s === "NHL" || s === "HOCKEY";
}

export function isGolfSport(sport: string): boolean {
  const s = (sport || "").toUpperCase();
  return s === "GOLF" || s === "PGA" || s === "PGA TOUR" || s === "THE MASTERS" || s === "MASTERS";
}
