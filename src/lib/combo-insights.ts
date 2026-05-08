/**
 * Combo / threshold props - deterministic fan-out analysis for bets where
 * the outcome depends on multiple sides clearing a condition.
 *
 * Examples:
 *   "Both teams to score 65+ in each half" (NBA)
 *   "Both teams to score 1+ runs in 1st inning" (MLB YRFI)
 *   "Both teams to score in 1st period" (NHL)
 *   "Both teams over 0.5 goals" (Soccer BTTS)
 *
 * The insight: instead of one rate, show four numbers
 *   1) Team A's rate of meeting condition
 *   2) Team B's rate of meeting condition
 *   3) H2H rate (when these two specific teams play)
 *   4) Combined / joint probability if independent (sanity check)
 *
 * Sport-agnostic shape - the caller passes in the per-team game logs and
 * a predicate that decides whether each game cleared the threshold.
 */

export type Tone = "pos" | "neg" | "neutral";

export interface ComboBullet {
  label: string;
  value: string;
  tone: Tone;
}

export interface ComboInsights {
  verdict: string;
  // Fan-out rates as a chart-ready array (each row is one bar / panel)
  breakdown: Array<{ label: string; value: number; pct: number; tone: Tone }>;
  bullets: ComboBullet[];
  flags: string[];
  /** Estimated joint probability (independence assumption) — used to drive
   *  the Swish Score for combo props. */
  probability?: number;
}

interface GameLike {
  date: string;
  opponent?: string;
}

/**
 * Build a 4-way breakdown for a combo prop.
 *
 * @param teamA / teamB - team labels for the chart
 * @param gamesA / gamesB - per-team game logs
 * @param meets - predicate: did this game clear the condition?
 * @param condition - human-readable label, e.g. "1st inning runs scored"
 * @param matchH2H - predicate to identify H2H matches in either log
 */
export function buildComboFanOut(args: {
  teamA: string;
  teamB: string;
  gamesA: GameLike[];
  gamesB: GameLike[];
  meets: (g: GameLike) => boolean;
  condition: string;
  matchH2H?: (g: GameLike, otherTeam: string) => boolean;
}): ComboInsights {
  const { teamA, teamB, gamesA, gamesB, meets, condition, matchH2H } = args;

  const aHits = gamesA.filter(meets).length;
  const aTotal = gamesA.length;
  const bHits = gamesB.filter(meets).length;
  const bTotal = gamesB.length;

  // H2H: matches where teamA played teamB. Use teamA's games filtered by opponent.
  const h2hCheck = matchH2H || ((g: GameLike, opp: string) => {
    const oLow = (g.opponent || "").toLowerCase();
    const targetLow = opp.toLowerCase();
    return oLow.includes(targetLow) || targetLow.includes(oLow);
  });
  const h2hGames = gamesA.filter((g) => h2hCheck(g, teamB));
  const h2hHits = h2hGames.filter(meets).length;
  const h2hTotal = h2hGames.length;

  const pA = aTotal > 0 ? aHits / aTotal : 0;
  const pB = bTotal > 0 ? bHits / bTotal : 0;
  const pH2H = h2hTotal > 0 ? h2hHits / h2hTotal : null;

  // Joint probability assuming independence (a sane baseline for "both teams"
  // type props). Real correlation is non-zero but small for most condition pairs.
  const jointInd = pA * pB;
  // Use H2H rate as a strong override when sample exists
  const probability = pH2H != null && h2hTotal >= 3
    ? Math.max(0.05, Math.min(0.95, pH2H * 0.6 + jointInd * 0.4))
    : Math.max(0.05, Math.min(0.95, jointInd));

  const tone = (rate: number): Tone =>
    rate >= 0.55 ? "pos" : rate <= 0.35 ? "neg" : "neutral";

  const breakdown: ComboInsights["breakdown"] = [
    {
      label: teamA,
      value: aHits,
      pct: Math.round(pA * 100),
      tone: tone(pA),
    },
    {
      label: teamB,
      value: bHits,
      pct: Math.round(pB * 100),
      tone: tone(pB),
    },
  ];
  if (pH2H != null) {
    breakdown.push({
      label: `${teamA} vs ${teamB}`,
      value: h2hHits,
      pct: Math.round(pH2H * 100),
      tone: tone(pH2H),
    });
  }
  breakdown.push({
    label: "Joint (indep.)",
    value: 0,
    pct: Math.round(jointInd * 100),
    tone: tone(jointInd),
  });

  const bullets: ComboBullet[] = [
    { label: teamA, value: `${aHits}/${aTotal} (${Math.round(pA * 100)}%) ${condition}`, tone: tone(pA) },
    { label: teamB, value: `${bHits}/${bTotal} (${Math.round(pB * 100)}%) ${condition}`, tone: tone(pB) },
  ];
  if (pH2H != null) {
    bullets.push({
      label: "H2H",
      value: `${h2hHits}/${h2hTotal} (${Math.round(pH2H * 100)}%) when these two played`,
      tone: tone(pH2H),
    });
  }
  bullets.push({
    label: "Combined",
    value: `~${Math.round(probability * 100)}% chance both clear ${condition}`,
    tone: tone(probability),
  });

  const verdict =
    pH2H != null && h2hTotal >= 3
      ? `Happens in ${h2hHits} of ${h2hTotal} ${teamA}/${teamB} matchups (~${Math.round(probability * 100)}% combined).`
      : `Each-team ${condition} - ${teamA} ${Math.round(pA * 100)}%, ${teamB} ${Math.round(pB * 100)}%, joint ~${Math.round(jointInd * 100)}%.`;

  const flags: string[] = [];
  if (aTotal < 10 || bTotal < 10) {
    flags.push(`Small sample - ${teamA} ${aTotal} games, ${teamB} ${bTotal} games.`);
  }
  if (pH2H != null && h2hTotal < 3) {
    flags.push(`Only ${h2hTotal} H2H meeting${h2hTotal === 1 ? "" : "s"} - independence estimate is the better read.`);
  }

  return { verdict, breakdown, bullets, flags, probability };
}

/**
 * Single-team rate of meeting a per-game threshold. Used for "Team X
 * to record N+ points in first 3 quarters" style bets - only one team
 * has to clear the condition.
 */
export function buildSingleTeamThreshold(args: {
  team: string;
  games: GameLike[];
  meets: (g: GameLike) => boolean;
  condition: string;
}): ComboInsights {
  const { team, games, meets, condition } = args;
  const hits = games.filter(meets).length;
  const total = games.length;
  const rate = total > 0 ? hits / total : 0;
  const last10 = games.slice(-10);
  const last10Hits = last10.filter(meets).length;
  const last10Rate = last10.length > 0 ? last10Hits / last10.length : 0;
  const tone = (r: number): Tone => r >= 0.55 ? "pos" : r <= 0.35 ? "neg" : "neutral";

  const breakdown: ComboInsights["breakdown"] = [
    { label: `Last ${last10.length}`, value: last10Hits, pct: Math.round(last10Rate * 100), tone: tone(last10Rate) },
    { label: "Season", value: hits, pct: Math.round(rate * 100), tone: tone(rate) },
  ];
  const bullets: ComboBullet[] = [
    { label: `${team} season`, value: `${hits}/${total} (${Math.round(rate * 100)}%) ${condition}`, tone: tone(rate) },
    { label: `${team} L10`, value: `${last10Hits}/${last10.length} (${Math.round(last10Rate * 100)}%) ${condition}`, tone: tone(last10Rate) },
  ];

  // Probability blends recent form (60%) with season rate (40%)
  const probability = 0.6 * last10Rate + 0.4 * rate;

  const verdict =
    last10Hits >= 7
      ? `${team} hit ${condition} in ${last10Hits} of last ${last10.length} - rolling.`
      : last10Hits <= 3
        ? `${team} only ${last10Hits} of last ${last10.length} for ${condition} - cold.`
        : `${team} clears ${condition} ${Math.round(rate * 100)}% on the season, ${Math.round(last10Rate * 100)}% L10.`;

  const flags: string[] = [];
  if (total < 10) flags.push(`Small sample - only ${total} games loaded.`);

  return { verdict, breakdown, bullets, flags, probability };
}

/**
 * Detect whether a market description is a "both teams meet condition" combo.
 * Returns the parsed condition or null.
 */
export function detectComboMarket(market?: string, description?: string):
  | { kind: "both_halves_score"; threshold: number }
  | { kind: "both_quarters_score"; threshold: number; quarter?: number }
  | { kind: "yrfi"; }
  | { kind: "btts"; }
  | { kind: "both_period_score"; period: number; sport: "NHL" | "NBA" | "MLB" }
  | { kind: "team_first_3_quarters"; threshold: number }
  | { kind: "team_first_half"; threshold: number }
  | { kind: "team_second_half"; threshold: number }
  | { kind: "team_quarter"; threshold: number; quarter: 1 | 2 | 3 | 4 }
  | null {
  const m = `${market || ""} ${description || ""}`.toLowerCase();

  // YRFI - both teams score in 1st inning
  if (m.includes("yrfi") || (m.includes("1st inning") && m.includes("both"))) {
    return { kind: "yrfi" };
  }

  // BTTS soccer
  if (m.includes("btts") || (m.includes("both") && m.includes("score") && (m.includes("goal") || m.includes("teams")))) {
    return { kind: "btts" };
  }

  // Both teams to score X+ in each half (NBA)
  const halfMatch = m.match(/(\d+)\s*\+?\s*(?:points?|pts?)?\s*(?:in\s+)?each\s+half/);
  if (halfMatch) {
    return { kind: "both_halves_score", threshold: Number(halfMatch[1]) };
  }
  if (m.includes("both") && m.includes("each half")) {
    const num = m.match(/(\d+)\s*\+/);
    return { kind: "both_halves_score", threshold: num ? Number(num[1]) : 0 };
  }

  // Both teams to score X+ in each quarter (NBA)
  const quarterMatch = m.match(/(\d+)\s*\+?\s*(?:points?|pts?)?\s*(?:in\s+)?each\s+quarter/);
  if (quarterMatch) {
    return { kind: "both_quarters_score", threshold: Number(quarterMatch[1]) };
  }

  // Single-team "X+ in first 3 quarters" / "X+ through 3"
  const f3qMatch = m.match(/(\d+)\s*\+?\s*(?:points?|pts?)?\s*(?:in\s+)?(?:the\s+)?(?:first|1st|f)\s*3\s*(?:quarters?|qtrs?|q)\b/);
  if (f3qMatch) return { kind: "team_first_3_quarters", threshold: Number(f3qMatch[1]) };
  if (m.match(/through\s+3/) && /(\d+)\s*\+/.test(m)) {
    const t = m.match(/(\d+)\s*\+/);
    if (t) return { kind: "team_first_3_quarters", threshold: Number(t[1]) };
  }

  // Single-team "X+ in 1st half" / "X+ in first half"
  const fhMatch = m.match(/(\d+)\s*\+?\s*(?:points?|pts?)?\s*(?:in\s+)?(?:the\s+)?(?:first|1st)\s*half\b/);
  if (fhMatch) return { kind: "team_first_half", threshold: Number(fhMatch[1]) };
  const shMatch = m.match(/(\d+)\s*\+?\s*(?:points?|pts?)?\s*(?:in\s+)?(?:the\s+)?(?:second|2nd)\s*half\b/);
  if (shMatch) return { kind: "team_second_half", threshold: Number(shMatch[1]) };

  // Single-team "X+ in 1st/2nd/3rd/4th quarter"
  const qMatch = m.match(/(\d+)\s*\+?\s*(?:points?|pts?)?\s*(?:in\s+)?(?:the\s+)?(?:(\d)(?:st|nd|rd|th)|first|second|third|fourth)\s*quarter\b/);
  if (qMatch) {
    const n = qMatch[2] ? Number(qMatch[2]) : { first: 1, second: 2, third: 3, fourth: 4 }[qMatch[0].match(/first|second|third|fourth/)?.[0] || ""] || 1;
    if (n >= 1 && n <= 4) {
      return { kind: "team_quarter", threshold: Number(qMatch[1]), quarter: n as 1 | 2 | 3 | 4 };
    }
  }

  return null;
}
