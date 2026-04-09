/**
 * Market detection — identifies exotic bet types from market strings.
 *
 * Uses keyword presence (not exact substring matching) so "First Team
 * Basket Scorer" matches the same as "First Basket Scorer" or "1st Basket".
 *
 * Single source of truth — used by both stats/route.ts and charts.ts.
 */

export type ExoticMarket =
  | "first_basket"
  | "first_goal"
  | "nrfi"
  | "double_double"
  | "combo_prop"
  | "anytime_td"
  | "hole_in_one"
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
  if (s === "NBA" || s === "BASKETBALL" || s === "NCAAB" || !s) {
    // Match if text contains "first" AND ("basket" or "scorer" or "fg" or "score")
    if (text.includes("first") && (text.includes("basket") || text.includes("scorer") || text.includes(" fg") || text.includes("1st"))) {
      return "first_basket";
    }
    if (text.includes("1st") && (text.includes("basket") || text.includes("score"))) {
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

  // Anytime TD (NFL) — skeleton for when season starts
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
