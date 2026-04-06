/**
 * SWISH — Comprehensive Sports Betting Market Taxonomy
 *
 * This file is the single source of truth for how Swish maps a detected bet
 * to the analysis it should display.  Every entry describes:
 *   - the exact market name(s) as they appear on DraftKings / FanDuel /
 *     PrizePicks / Underdog Fantasy
 *   - which sport(s) the market applies to
 *   - what data is RELEVANT for someone betting this market
 *   - what data is IRRELEVANT (common mistakes to show)
 *   - what the ideal analysis looks like (charts, stats, context)
 *
 * Categories are organized into logical groups that mirror how sportsbooks
 * present their menus.
 *
 * Last updated: 2026-04-06
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Sport =
  | "NBA"
  | "NFL"
  | "MLB"
  | "NHL"
  | "GOLF"
  | "SOCCER"
  | "NCAAB"
  | "NCAAF"
  | "WNBA"
  | "MLS";

export type Platform =
  | "DraftKings"
  | "FanDuel"
  | "PrizePicks"
  | "Underdog";

export type ChartType = "line" | "bar" | "distribution" | "table" | "scatter";

export interface MarketDefinition {
  /** Canonical key used internally (snake_case) */
  id: string;
  /** Human-readable category */
  category: string;
  /** Sub-category within the group */
  subcategory: string;
  /** Exact market names as they appear on sportsbooks */
  marketNames: string[];
  /** Which sportsbooks carry this market */
  platforms: Platform[];
  /** Which sports this market applies to */
  sports: Sport[];
  /** The stat(s) the bet resolves on */
  resolutionStats: string[];
  /** What data/analysis is RELEVANT */
  relevantData: string[];
  /** What the ideal charts look like */
  idealCharts: { type: ChartType; title: string; description: string }[];
  /** What data is commonly shown but IRRELEVANT — mistakes to avoid */
  irrelevantData: string[];
  /** Additional context for the AI summary */
  analysisNotes: string;
}

// ---------------------------------------------------------------------------
// 1. STANDARD STAT PROPS — Points, Rebounds, Assists, Yards, etc.
// ---------------------------------------------------------------------------

const standardStatProps: MarketDefinition[] = [
  // ---- NBA ----
  {
    id: "nba_points",
    category: "Standard Stat Props",
    subcategory: "Scoring",
    marketNames: [
      "Points O/U",
      "Player Points Over/Under",
      "Points (Over/Under)",
      "Pts",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA", "NCAAB", "WNBA"],
    resolutionStats: ["points"],
    relevantData: [
      "Player game log (points per game last 10/20 games)",
      "Minutes played trend (more minutes = more points opportunity)",
      "Usage rate trend",
      "Home vs away scoring splits",
      "Matchup: opponent defensive rating",
      "Matchup: opponent points allowed to position",
      "Pace of play (both teams)",
      "Projected game total (higher total = more scoring environment)",
      "Back-to-back / rest days",
      "Teammate injury impact (more shots available?)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Points Per Game — Last 15 Games",
        description:
          "Show the player's actual points each game with the prop line drawn as a horizontal reference. Highlight games above/below.",
      },
      {
        type: "bar",
        title: "Points vs Opponent Defensive Rating",
        description:
          "Bar chart showing player's points in recent games, color-coded by opponent defensive rating (good D vs bad D).",
      },
      {
        type: "distribution",
        title: "Points Distribution This Season",
        description:
          "Histogram of all game point totals this season. Show where the prop line falls in the distribution and the over/under hit rate.",
      },
      {
        type: "table",
        title: "Key Context",
        description:
          "Minutes trend, usage rate, pace, opponent rank vs position, rest days.",
      },
    ],
    irrelevantData: [
      "Career averages (too diluted, recent form matters more)",
      "Team win/loss record (doesn't correlate with individual scoring)",
      "Player's season-long PPG (masks hot/cold streaks)",
      "Opponent's overall record",
    ],
    analysisNotes:
      "Points props are the most popular NBA prop. The key insight is RECENT form + matchup + minutes. A player averaging 25 PPG season-long but only 18 PPG in the last 5 games is a different bet than the season average suggests. Pace matters — two fast teams = more possessions = more scoring opportunities.",
  },
  {
    id: "nba_rebounds",
    category: "Standard Stat Props",
    subcategory: "Rebounds",
    marketNames: [
      "Rebounds O/U",
      "Player Rebounds Over/Under",
      "Rebounds (Over/Under)",
      "Rebs",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA", "NCAAB", "WNBA"],
    resolutionStats: ["rebounds"],
    relevantData: [
      "Player game log (rebounds per game last 10/20 games)",
      "Minutes played trend",
      "Offensive vs defensive rebound split",
      "Opponent rebound rate allowed to position",
      "Opponent offensive rebound rate (more misses = more defensive boards)",
      "Team rebound share (does this player dominate the glass?)",
      "Pace — more possessions = more missed shots = more rebounds",
      "Projected game total and spread (blowouts change rebounding)",
      "Matchup: opponent FG% (lower FG% = more rebounds available)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Rebounds Per Game — Last 15 Games",
        description:
          "Player's actual rebounds each game with prop line as horizontal reference.",
      },
      {
        type: "bar",
        title: "Rebounds vs Opponent Rebound Rate",
        description:
          "Show rebounds in games against good vs bad rebounding teams.",
      },
      {
        type: "distribution",
        title: "Rebound Distribution This Season",
        description:
          "Histogram with prop line marked. Show O/U hit rate.",
      },
    ],
    irrelevantData: [
      "Player's scoring stats (not relevant to rebounding)",
      "Team record",
      "Opponent's scoring numbers",
      "Career rebounding averages",
    ],
    analysisNotes:
      "Rebounds are more matchup-dependent than points. A center facing a team that shoots poorly from 3 (more long rebounds) will get more opportunities. Also check if a teammate center is out — that opens up boards.",
  },
  {
    id: "nba_assists",
    category: "Standard Stat Props",
    subcategory: "Playmaking",
    marketNames: [
      "Assists O/U",
      "Player Assists Over/Under",
      "Assists (Over/Under)",
      "Asts",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA", "NCAAB", "WNBA"],
    resolutionStats: ["assists"],
    relevantData: [
      "Player game log (assists last 10/20 games)",
      "Usage rate and assist percentage",
      "Teammate shooting efficiency (good shooters convert more assists)",
      "Matchup: opponent assists allowed to position",
      "Pace of play",
      "Home vs away assist splits",
      "Minutes trend",
      "Point guard vs wing — role-based assist expectations",
      "Teammate injuries — does this player handle the ball more?",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Assists Per Game — Last 15 Games",
        description: "Game-by-game assists with prop line reference.",
      },
      {
        type: "bar",
        title: "Assists When Key Teammates Play vs Sit",
        description:
          "Compare assist numbers with/without key rotation players.",
      },
      {
        type: "distribution",
        title: "Assists Distribution This Season",
        description: "Histogram with hit rate overlay.",
      },
    ],
    irrelevantData: [
      "Player's scoring numbers (separate skill)",
      "Team defensive stats",
      "Opponent's offensive rating",
      "Player's rebound numbers",
    ],
    analysisNotes:
      "Assists depend heavily on teammates converting. A player can create the same number of opportunities but get more assists if teammates shoot well. Check teammate FG% trends. Also, some players see a spike in assists when another playmaker is injured.",
  },
  {
    id: "nba_turnovers",
    category: "Standard Stat Props",
    subcategory: "Turnovers",
    marketNames: ["Turnovers O/U", "Player Turnovers Over/Under"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA"],
    resolutionStats: ["turnovers"],
    relevantData: [
      "Player game log (turnovers last 10/20 games)",
      "Usage rate (higher usage = more turnover risk)",
      "Matchup: opponent steals per game / forced turnovers",
      "Pace (more possessions = more turnover opportunities)",
      "Home vs away turnover splits",
      "Minutes trend",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Turnovers Per Game — Last 15 Games",
        description: "Game log with prop line reference.",
      },
      {
        type: "distribution",
        title: "Turnover Distribution This Season",
        description: "Histogram showing frequency at each turnover count.",
      },
    ],
    irrelevantData: [
      "Team record",
      "Player scoring averages",
      "Opponent's scoring stats",
    ],
    analysisNotes:
      "Turnovers are fairly consistent for high-usage players. The main variable is opponent defense — teams like the Heat that force turnovers will push the over.",
  },
  {
    id: "nba_free_throws_made",
    category: "Standard Stat Props",
    subcategory: "Free Throws",
    marketNames: ["Free Throws Made O/U", "FTM Over/Under"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks"],
    sports: ["NBA"],
    resolutionStats: ["free_throws_made"],
    relevantData: [
      "Player FTA per game trend",
      "Player FT% (high volume but low % = risk of under)",
      "Matchup: opponent fouls per game",
      "Matchup: opponent foul rate in the paint",
      "Player drives to the basket per game",
      "Game script — close games = more free throws late",
      "Projected spread (blowout = less FT opportunity in 4th Q)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Free Throws Made — Last 15 Games",
        description: "Game-by-game FTM with prop line.",
      },
      {
        type: "bar",
        title: "FTA vs Opponent Foul Rate",
        description:
          "Show free throw attempts against high-fouling vs low-fouling opponents.",
      },
    ],
    irrelevantData: [
      "Player's 3PT shooting",
      "Team's overall scoring",
      "Career FT averages (recent volume matters more)",
    ],
    analysisNotes:
      "Free throws made depends on two things: getting to the line (drives, opponent foul tendencies) and making them (FT%). A player who shoots 90% from the line but only gets 3 FTA is very different from someone who shoots 65% but gets 10 FTA.",
  },

  // ---- NFL ----
  {
    id: "nfl_passing_yards",
    category: "Standard Stat Props",
    subcategory: "Passing",
    marketNames: [
      "Passing Yards O/U",
      "Player Passing Yards Over/Under",
      "Pass Yds",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NFL", "NCAAF"],
    resolutionStats: ["passing_yards"],
    relevantData: [
      "QB game log (passing yards last 5-8 games)",
      "Matchup: opponent pass yards allowed per game",
      "Matchup: opponent pass defense DVOA/EPA",
      "Projected game script — trailing teams throw more",
      "Projected game total and spread (high total = pass-heavy environment)",
      "Weather (wind/rain kills passing)",
      "Indoor vs outdoor venue",
      "WR/TE availability — key weapons healthy?",
      "Offensive line pass protection grades",
      "Opponent blitz rate",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Passing Yards — Last 8 Games",
        description:
          "QB passing yards each game with the line drawn. Annotate opponent quality.",
      },
      {
        type: "bar",
        title: "Passing Yards vs Opponent Pass D Rank",
        description:
          "Color-code games by opponent pass defense quality.",
      },
      {
        type: "distribution",
        title: "Passing Yards Distribution This Season",
        description:
          "Histogram of all game passing totals. Show hit rate above/below line.",
      },
      {
        type: "table",
        title: "Key Context",
        description:
          "Weather, game total, spread, WR availability, opponent pass D rank.",
      },
    ],
    irrelevantData: [
      "QB's rushing stats (separate market)",
      "QB's career averages",
      "Team's overall record",
      "Opponent's rushing defense (irrelevant to pass yards)",
      "Red zone efficiency (yards, not TDs)",
    ],
    analysisNotes:
      "Passing yards are heavily influenced by game script. A team trailing by 14 in the 2nd half will abandon the run and throw. Check the spread — big underdogs often push QB passing yards OVER. Weather is a silent killer for overs — always check wind speed.",
  },
  {
    id: "nfl_rushing_yards",
    category: "Standard Stat Props",
    subcategory: "Rushing",
    marketNames: [
      "Rushing Yards O/U",
      "Player Rushing Yards Over/Under",
      "Rush Yds",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NFL", "NCAAF"],
    resolutionStats: ["rushing_yards"],
    relevantData: [
      "RB game log (rushing yards last 5-8 games)",
      "Carries per game trend (volume is king for rushing)",
      "Matchup: opponent rush yards allowed per game",
      "Matchup: opponent run defense DVOA/EPA",
      "Projected game script — leading teams run more",
      "Projected spread (favorites run more to protect leads)",
      "Offensive line run blocking grades",
      "Snap share and backfield split (workhorse vs committee)",
      "Weather (rain = more rushing)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Rushing Yards — Last 8 Games",
        description:
          "Game-by-game rushing yards with prop line and carry count annotated.",
      },
      {
        type: "scatter",
        title: "Carries vs Rushing Yards",
        description:
          "Scatter plot showing the relationship between volume and output.",
      },
      {
        type: "bar",
        title: "Rushing Yards vs Opponent Run D Rank",
        description: "Performance against good vs bad run defenses.",
      },
    ],
    irrelevantData: [
      "RB's receiving stats (separate market)",
      "Team passing stats",
      "Opponent's pass defense",
      "Career averages",
      "Yards per carry (misleading without volume context)",
    ],
    analysisNotes:
      "Rushing yards = carries x efficiency. Carries are more predictable than efficiency. A bellcow back getting 20+ carries will almost always hit differently than a committee back getting 12. Game script matters — favorites expected to lead will run more.",
  },
  {
    id: "nfl_receiving_yards",
    category: "Standard Stat Props",
    subcategory: "Receiving",
    marketNames: [
      "Receiving Yards O/U",
      "Player Receiving Yards Over/Under",
      "Rec Yds",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NFL", "NCAAF"],
    resolutionStats: ["receiving_yards"],
    relevantData: [
      "WR/TE game log (receiving yards last 5-8 games)",
      "Targets per game trend (targets = opportunity)",
      "Target share percentage",
      "Matchup: opponent pass yards allowed to position (WR1 vs WR2 vs TE)",
      "Matchup: cornerback assignment if trackable",
      "Air yards per game",
      "Projected game script — trailing teams throw more",
      "Projected game total",
      "QB-WR chemistry (completion % when targeted)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Receiving Yards — Last 8 Games",
        description:
          "Game-by-game with target count annotated on each bar.",
      },
      {
        type: "bar",
        title: "Targets vs Receiving Yards",
        description:
          "Show targets and yards side by side to visualize conversion.",
      },
      {
        type: "distribution",
        title: "Receiving Yards Distribution",
        description: "Histogram with prop line and hit rate.",
      },
    ],
    irrelevantData: [
      "WR's rushing stats",
      "Team rushing stats",
      "Opponent rushing defense",
      "Career receiving averages",
      "Touchdowns (yards, not TDs)",
    ],
    analysisNotes:
      "Receiving yards are volatile. Even elite WRs have 30-yard games. Focus on target volume and air yards — those predict opportunity. A WR getting 10 targets per game has a much higher floor than one getting 5, even if the latter has a higher YPC.",
  },
  {
    id: "nfl_receptions",
    category: "Standard Stat Props",
    subcategory: "Receiving",
    marketNames: [
      "Receptions O/U",
      "Player Receptions Over/Under",
      "Receptions",
      "Catches",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NFL", "NCAAF"],
    resolutionStats: ["receptions"],
    relevantData: [
      "Targets per game trend",
      "Catch rate / completion percentage when targeted",
      "Projected game script (trailing = more short passes)",
      "Route types — short/intermediate routes = more catches",
      "Matchup: opponent receptions allowed to position",
      "Game total — high-scoring games often mean more passing",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Receptions — Last 8 Games",
        description: "Game log with targets overlaid.",
      },
      {
        type: "distribution",
        title: "Receptions Distribution",
        description: "Histogram with prop line.",
      },
    ],
    irrelevantData: [
      "Receiving yards (correlated but separate)",
      "Touchdowns",
      "Team rushing stats",
    ],
    analysisNotes:
      "Receptions are driven by targets and catch rate. Slot receivers and pass-catching RBs tend to have higher, more consistent reception counts. PPR-style analysis matters here — look at short-route rate.",
  },
  {
    id: "nfl_completions",
    category: "Standard Stat Props",
    subcategory: "Passing",
    marketNames: [
      "Completions O/U",
      "Player Completions Over/Under",
      "Pass Completions",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["completions"],
    relevantData: [
      "QB completion % trend",
      "Pass attempts per game",
      "Game script projection (trailing = more attempts = more completions)",
      "Weather (wind/rain reduce completion %)",
      "Opponent pass defense — pressure rate reduces completions",
      "WR drop rate",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Completions — Last 8 Games",
        description: "Game log with attempts overlaid.",
      },
      {
        type: "scatter",
        title: "Attempts vs Completions",
        description: "Show the relationship and consistency of completion rate.",
      },
    ],
    irrelevantData: [
      "Passing TDs",
      "Rushing stats",
      "Team defensive stats",
    ],
    analysisNotes:
      "Completions = attempts x completion rate. Check-down QBs (high completion %, short passes) are more consistent for this prop than gunslingers. Game script is the biggest driver of attempts.",
  },
  {
    id: "nfl_passing_tds",
    category: "Standard Stat Props",
    subcategory: "Passing",
    marketNames: [
      "Passing Touchdowns O/U",
      "Player Passing TDs Over/Under",
      "Pass TDs",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NFL", "NCAAF"],
    resolutionStats: ["passing_touchdowns"],
    relevantData: [
      "QB passing TD game log",
      "Red zone passing attempts and efficiency",
      "Matchup: opponent passing TDs allowed",
      "Matchup: opponent red zone defense",
      "Game total (high total = more TDs expected)",
      "Goal-line play calling (pass vs rush in RZ)",
    ],
    idealCharts: [
      {
        type: "distribution",
        title: "Passing TDs Distribution",
        description:
          "Histogram showing how often QB throws 0, 1, 2, 3+ TDs.",
      },
      {
        type: "bar",
        title: "Passing TDs by Opponent Quality",
        description: "TDs against top-10 vs bottom-10 pass defenses.",
      },
    ],
    irrelevantData: [
      "Passing yards (yards don't equal TDs)",
      "Rushing TDs",
      "Team record",
    ],
    analysisNotes:
      "Passing TDs are low-count and volatile. Even elite QBs have 0-TD games. The line is usually 1.5 — the real question is how often this QB hits 2+. Red zone efficiency matters more than total yards.",
  },
  {
    id: "nfl_interceptions",
    category: "Standard Stat Props",
    subcategory: "Passing",
    marketNames: [
      "Interceptions Thrown O/U",
      "QB Interceptions Over/Under",
      "INTs Thrown",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["interceptions_thrown"],
    relevantData: [
      "QB INT game log",
      "QB INT rate under pressure",
      "Matchup: opponent INT rate / takeaways",
      "Matchup: opponent blitz rate (pressure causes INTs)",
      "Weather (rain/wind increase INT risk)",
      "Game script (trailing and desperate = more INT risk)",
    ],
    idealCharts: [
      {
        type: "distribution",
        title: "INTs Thrown Distribution",
        description: "How often QB throws 0, 1, 2+ INTs.",
      },
      {
        type: "bar",
        title: "INTs vs Opponent Takeaway Rate",
        description: "Performance against ball-hawking defenses.",
      },
    ],
    irrelevantData: [
      "Passing yards",
      "Passing TDs",
      "Team rushing stats",
    ],
    analysisNotes:
      "INTs are rare events — most QBs throw 0 in a given game. The line is usually 0.5. Focus on QB's tendency under pressure and opponent's INT generation rate. Bad weather significantly increases INT risk.",
  },

  // ---- MLB ----
  {
    id: "mlb_hits",
    category: "Standard Stat Props",
    subcategory: "Hitting",
    marketNames: ["Hits O/U", "Player Hits Over/Under", "Total Hits"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["hits"],
    relevantData: [
      "Batter game log (hits last 15-20 games)",
      "Batting average trend (recent BA vs season BA)",
      "Matchup: career stats vs opposing pitcher",
      "Matchup: batter vs LHP or RHP split",
      "Matchup: opposing pitcher's hits allowed rate",
      "Batting order position (more ABs = more hit chances)",
      "Ballpark factors (hitter-friendly vs pitcher-friendly)",
      "Weather (wind direction, temperature affect carry)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Hits Per Game — Last 20 Games",
        description: "Game-by-game hit count with prop line.",
      },
      {
        type: "bar",
        title: "Batting Average vs LHP / RHP",
        description: "Split performance based on pitcher handedness.",
      },
      {
        type: "table",
        title: "Career vs Opposing Pitcher",
        description: "H2H stats if sample size is meaningful (10+ ABs).",
      },
    ],
    irrelevantData: [
      "Home run stats (hits, not power)",
      "RBI numbers (separate outcome)",
      "Team win/loss record",
      "Pitcher's strikeout rate (affects Ks, not necessarily hits)",
    ],
    analysisNotes:
      "Hit props are usually set at 0.5 or 1.5. For 0.5, you need at least one hit — batting average and ABs matter. For 1.5, check multi-hit game frequency. Platoon splits (vs LHP/RHP) are significant in baseball. Always check the lineup is confirmed.",
  },
  {
    id: "mlb_home_runs",
    category: "Standard Stat Props",
    subcategory: "Power Hitting",
    marketNames: [
      "Home Run (Yes/No)",
      "Player to Hit a Home Run",
      "Home Runs O/U",
      "To Record a HR",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["home_runs"],
    relevantData: [
      "HR rate (HRs per AB or per game)",
      "Barrel rate and hard-hit rate",
      "Matchup: career vs opposing pitcher (HR history)",
      "Matchup: opposing pitcher HR rate allowed",
      "Matchup: LHP/RHP splits for power numbers",
      "Ballpark HR factor (Coors vs Oracle)",
      "Weather: wind blowing out, temperature (warm = carry)",
      "Recent power trend (hot/cold streak in ISO/SLG)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Home Runs — Last 30 Games",
        description:
          "Mark games where HRs occurred. Show HR rate as a rolling average.",
      },
      {
        type: "table",
        title: "Ballpark & Weather Context",
        description:
          "Park HR factor, wind direction, temperature, opposing pitcher HR/9.",
      },
      {
        type: "bar",
        title: "Barrel Rate Trend",
        description:
          "Recent barrel rate to show if player is making quality contact.",
      },
    ],
    irrelevantData: [
      "Batting average (BA doesn't predict HR)",
      "Stolen bases",
      "Team pitching stats",
      "Career HR totals (rate matters, not counting stats)",
    ],
    analysisNotes:
      "Home runs are rare events — even elite hitters only HR in ~8-10% of games. The line is almost always Yes/No. Focus on barrel rate, park factor, and opposing pitcher tendencies. A flyball hitter at Coors with wind blowing out is a different bet than one at Oracle Park.",
  },
  {
    id: "mlb_total_bases",
    category: "Standard Stat Props",
    subcategory: "Power Hitting",
    marketNames: [
      "Total Bases O/U",
      "Player Total Bases Over/Under",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["total_bases"],
    relevantData: [
      "Total bases per game trend",
      "Slugging percentage trend",
      "Extra-base hit rate",
      "Matchup: opposing pitcher extra-base hits allowed",
      "Matchup: LHP/RHP splits for SLG",
      "Ballpark factors",
      "Batting order position (more ABs)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Total Bases — Last 20 Games",
        description: "Game-by-game total bases with prop line.",
      },
      {
        type: "distribution",
        title: "Total Bases Distribution",
        description: "How often player reaches each total bases count.",
      },
    ],
    irrelevantData: [
      "Walks (don't count as total bases)",
      "RBIs (different outcome)",
      "Stolen bases",
    ],
    analysisNotes:
      "Total bases = singles(1) + doubles(2) + triples(3) + HRs(4). It combines hit frequency with power. Lines are usually 1.5. Even 0-for-3 games are common, making the under viable. SLG% is the best quick predictor.",
  },
  {
    id: "mlb_rbis",
    category: "Standard Stat Props",
    subcategory: "Hitting",
    marketNames: ["RBIs O/U", "Player RBIs Over/Under"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["rbis"],
    relevantData: [
      "RBIs per game trend",
      "Batting order position (3-4-5 hitters get more RBI chances)",
      "Runners on base frequency for hitters ahead in lineup",
      "Matchup: opposing pitcher OBP allowed (more runners = more RBI chances)",
      "Team runs scored trend",
      "Situational hitting (RISP batting average)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "RBIs — Last 20 Games",
        description: "Game-by-game RBI count.",
      },
      {
        type: "bar",
        title: "RBIs by Lineup Position",
        description: "Show how batting order affects RBI opportunity.",
      },
    ],
    irrelevantData: [
      "Leadoff hitter RBI potential is limited (fewer runners ahead)",
      "Pitcher win/loss record",
      "Defensive stats",
    ],
    analysisNotes:
      "RBIs are highly dependent on teammates getting on base. A great hitter batting 1st will have fewer RBI chances than a mediocre hitter batting 4th on a high-OBP team. Always check who bats ahead of them.",
  },
  {
    id: "mlb_runs_scored",
    category: "Standard Stat Props",
    subcategory: "Hitting",
    marketNames: ["Runs Scored O/U", "Player Runs Over/Under"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["runs_scored"],
    relevantData: [
      "Runs per game trend",
      "OBP trend (get on base first to score)",
      "Batting order position (leadoff and top of order score more)",
      "Team scoring trend",
      "Stolen base ability (advances into scoring position)",
      "Speed / baserunning metrics",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Runs Scored — Last 20 Games",
        description: "Game log with team total runs annotated.",
      },
    ],
    irrelevantData: [
      "Power stats (runs scored is about getting on base, not extra bases)",
      "Pitcher K rate",
      "Defensive metrics",
    ],
    analysisNotes:
      "Runs scored depends on getting on base AND having teammates behind you to drive you in. Leadoff hitters with high OBP on high-scoring teams are the best candidates for overs.",
  },
  {
    id: "mlb_stolen_bases",
    category: "Standard Stat Props",
    subcategory: "Baserunning",
    marketNames: [
      "Stolen Bases O/U",
      "Player Stolen Bases Over/Under",
      "To Record a Stolen Base",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["stolen_bases"],
    relevantData: [
      "SB per game rate this season",
      "SB attempt rate (frequency of trying)",
      "SB success rate",
      "Matchup: opposing pitcher's pickoff rate / time to plate",
      "Matchup: opposing catcher's pop time / CS%",
      "Game script (close games = more SB attempts)",
      "Sprint speed (Statcast)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Stolen Bases — Last 30 Games",
        description: "Mark games with SBs. Show attempt frequency.",
      },
      {
        type: "table",
        title: "Matchup Context",
        description:
          "Opposing pitcher delivery time, catcher CS%, player sprint speed.",
      },
    ],
    irrelevantData: [
      "Batting average (irrelevant to SB)",
      "Home runs",
      "Team pitching stats",
    ],
    analysisNotes:
      "Stolen bases are binary and infrequent. Even speed demons only steal in ~20-30% of games. The key is matchup: slow pitcher delivery + bad catcher arm + fast runner = green light. The 2023 rule changes (bigger bases, pickoff limits) increased SB rates league-wide.",
  },

  // ---- NHL ----
  {
    id: "nhl_goals",
    category: "Standard Stat Props",
    subcategory: "Scoring",
    marketNames: ["Goals O/U", "Player Goals Over/Under"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NHL"],
    resolutionStats: ["goals"],
    relevantData: [
      "Goals per game trend",
      "Shots on goal per game (more shots = more goal probability)",
      "Shooting percentage trend",
      "Power play time / PP unit",
      "Matchup: opponent goals against per game",
      "Matchup: opponent PK% (if player is on PP)",
      "Matchup: opposing goaltender save percentage",
      "Home vs away goal splits",
      "Line placement (1st line vs lower lines)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Goals — Last 15 Games",
        description: "Game log marking goal games.",
      },
      {
        type: "scatter",
        title: "Shots on Goal vs Goals",
        description: "Show shot volume and conversion.",
      },
      {
        type: "table",
        title: "Matchup Context",
        description:
          "Opposing goalie save %, team GA/game, PP time expected.",
      },
    ],
    irrelevantData: [
      "Assists (separate stat)",
      "Plus/minus (team stat noise)",
      "Career goal totals",
      "Team win/loss record",
    ],
    analysisNotes:
      "Goals are rare events in hockey — even top scorers average 0.4-0.6 goals per game. Shot volume is the best predictor of goals. A player averaging 4+ shots on goal has more chances than one averaging 2. Power play time is a multiplier.",
  },
  {
    id: "nhl_assists",
    category: "Standard Stat Props",
    subcategory: "Playmaking",
    marketNames: ["Assists O/U", "Player Assists Over/Under"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NHL"],
    resolutionStats: ["assists"],
    relevantData: [
      "Assists per game trend",
      "Primary vs secondary assists",
      "Power play time (PP generates more assists)",
      "Linemates' shooting ability",
      "Matchup: opponent goals against / GA per game",
      "Matchup: opponent PK%",
      "Home vs away splits",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Assists — Last 15 Games",
        description: "Game log with assists.",
      },
      {
        type: "bar",
        title: "Assists by Game Context",
        description: "Home/away, PP vs even strength.",
      },
    ],
    irrelevantData: [
      "Player goal totals",
      "Plus/minus",
      "Penalty minutes",
    ],
    analysisNotes:
      "Assists in hockey depend heavily on linemates. A playmaker centering two elite wingers will rack up more assists. Power play quarterbacks (D-men running the PP) are consistent assist generators.",
  },
  {
    id: "nhl_points",
    category: "Standard Stat Props",
    subcategory: "Scoring",
    marketNames: [
      "Points O/U",
      "Player Points Over/Under",
      "Goals + Assists O/U",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NHL"],
    resolutionStats: ["points"],
    relevantData: [
      "Points per game trend (goals + assists)",
      "Shots on goal per game",
      "Power play involvement",
      "Linemate quality",
      "Matchup: opponent goals against per game",
      "Matchup: opposing goaltender save %",
      "Home vs away point splits",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Points (G+A) — Last 15 Games",
        description: "Game-by-game points with goal/assist breakdown.",
      },
      {
        type: "distribution",
        title: "Points Distribution",
        description: "How often player records 0, 1, 2+ points.",
      },
    ],
    irrelevantData: [
      "Plus/minus",
      "Penalty minutes",
      "Team record (not directly correlated)",
    ],
    analysisNotes:
      "Points (G+A) is the most popular NHL prop. Line is usually 0.5. The over requires just one goal or assist. Focus on involvement — shots, PP time, linemate quality. Players on the top PP unit have the best chance of recording a point each game.",
  },
  {
    id: "nhl_shots_on_goal",
    category: "Standard Stat Props",
    subcategory: "Shot Volume",
    marketNames: [
      "Shots on Goal O/U",
      "Player Shots Over/Under",
      "SOG",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NHL"],
    resolutionStats: ["shots_on_goal"],
    relevantData: [
      "Shots on goal per game trend (one of the stickiest stats in hockey)",
      "Time on ice trend",
      "Power play time",
      "Matchup: opponent shots against per game",
      "Matchup: game total (high-scoring games = more shots)",
      "Playing style (shoot-first vs pass-first)",
      "Home vs away SOG splits",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Shots on Goal — Last 15 Games",
        description:
          "Game-by-game SOG with prop line. One of the most consistent NHL stats.",
      },
      {
        type: "distribution",
        title: "SOG Distribution",
        description:
          "Histogram — SOG is one of the most normally distributed sports stats.",
      },
    ],
    irrelevantData: [
      "Goals scored (separate outcome from shots)",
      "Assists",
      "Plus/minus",
      "Penalty minutes",
    ],
    analysisNotes:
      "Shots on goal is the most predictable prop in hockey. High-volume shooters (4-5 SOG/game average) are remarkably consistent. This is considered one of the best props for consistent bettors. Look for players with a high floor on shots.",
  },
  {
    id: "nhl_saves",
    category: "Standard Stat Props",
    subcategory: "Goaltending",
    marketNames: [
      "Saves O/U",
      "Goaltender Saves Over/Under",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NHL"],
    resolutionStats: ["saves"],
    relevantData: [
      "Goaltender saves per game trend",
      "Shots against per game (team defense quality)",
      "Matchup: opponent shots on goal per game",
      "Matchup: opponent offensive rating",
      "Save percentage trend",
      "Home vs away saves splits",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Saves — Last 10 Starts",
        description: "Game-by-game save count with shots faced.",
      },
      {
        type: "scatter",
        title: "Shots Faced vs Saves",
        description: "Shows relationship between workload and saves.",
      },
    ],
    irrelevantData: [
      "Goaltender win/loss record (luck-based)",
      "Goals against average in isolation (need shots faced context)",
    ],
    analysisNotes:
      "Saves = shots faced x save percentage. A goalie on a bad defensive team faces more shots and thus records more saves. Counterintuitively, goalies on bad teams often hit save overs more easily.",
  },
];

// ---------------------------------------------------------------------------
// 2. FIRST SCORER / FIRST BASKET / FIRST TD MARKETS
// ---------------------------------------------------------------------------

const firstScorerProps: MarketDefinition[] = [
  {
    id: "nba_first_basket",
    category: "First Scorer",
    subcategory: "NBA First Basket",
    marketNames: [
      "First Basket Scorer",
      "First Basket",
      "First FG Scorer",
      "1st Basket",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NCAAB"],
    resolutionStats: ["first_field_goal"],
    relevantData: [
      "Tip-off win % for each team's center",
      "Team's first possession play type (who gets the ball?)",
      "Player's first basket rate this season (% of games where they scored first)",
      "Player's first shot attempt rate",
      "Player's scoring in first 2 minutes of games",
      "Team's opening play tendencies (post-up, PnR, iso?)",
      "Player usage rate in first quarter",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "First Basket Rate This Season",
        description:
          "Show each team's top 3-4 candidates and their first basket frequency.",
      },
      {
        type: "table",
        title: "Opening Possession Context",
        description:
          "Team tip-off win %, first possession play type, player first-shot attempt rate.",
      },
    ],
    irrelevantData: [
      "Overall PPG (irrelevant — this is about the FIRST shot, not volume)",
      "Career scoring averages",
      "Defensive stats",
      "Second half performance",
      "Rebounding/assists",
    ],
    analysisNotes:
      "First basket is a unique market driven by team opening plays and tip-off dynamics. Centers who win the tip give their team possession. Then it's about who the offense goes to first. Some players are designated early-shot guys. Track actual first basket rates — some players hit this at 15-20% while others are under 5%. This is one of the most data-rich props if you have the right data.",
  },
  {
    id: "nfl_first_td_scorer",
    category: "First Scorer",
    subcategory: "NFL First Touchdown",
    marketNames: [
      "First Touchdown Scorer",
      "First TD Scorer",
      "1st TD Scorer",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL", "NCAAF"],
    resolutionStats: ["first_touchdown"],
    relevantData: [
      "Player's first TD rate this season",
      "Team's opening drive TD rate",
      "Team's opening drive play calling (run vs pass, who gets touches)",
      "Player's red zone touches / targets",
      "Player's TD rate overall (more TDs = more likely to score first)",
      "Team scripted plays tendency (first 15 plays)",
      "Coin toss / receiving team data",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "First TD Scorer Frequency",
        description:
          "Top candidates with their first TD rate this season.",
      },
      {
        type: "table",
        title: "Opening Drive Context",
        description:
          "Team opening drive TD %, run/pass ratio on opening drive, scripted play tendencies.",
      },
    ],
    irrelevantData: [
      "Total receiving/rushing yards (about TDs, not yards)",
      "Overall team record",
      "Defensive stats of opposing team",
      "Second half performance",
    ],
    analysisNotes:
      "First TD scorer is a fun but high-variance market. Key factors: which team receives the opening kickoff (they get first crack), what is that team's opening-drive TD rate, and who does that offense go to in the red zone. Goal-line backs and red-zone TEs are often undervalued here.",
  },
  {
    id: "nfl_last_td_scorer",
    category: "First Scorer",
    subcategory: "NFL Last Touchdown",
    marketNames: [
      "Last Touchdown Scorer",
      "Last TD Scorer",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["last_touchdown"],
    relevantData: [
      "Player's overall TD rate",
      "Late-game usage (4th quarter touches/targets)",
      "Team's tendency in garbage time",
      "Projected game script (blowout = garbage time TDs from backups?)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "4th Quarter TD Rate",
        description: "Which players score late TDs most frequently.",
      },
    ],
    irrelevantData: [
      "First half performance",
      "Opening drive stats",
      "Season-long yardage",
    ],
    analysisNotes:
      "Last TD scorer is less predictable than first TD. It depends heavily on game flow. Close games = starters scoring. Blowouts = backups and garbage time TDs.",
  },
  {
    id: "nhl_first_goal_scorer",
    category: "First Scorer",
    subcategory: "NHL First Goal",
    marketNames: [
      "First Goal Scorer",
      "1st Goal Scorer",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NHL"],
    resolutionStats: ["first_goal"],
    relevantData: [
      "Player's first goal rate this season",
      "Player's goals per game",
      "Player's shots on goal in first period",
      "Team's first period scoring rate",
      "Line placement (top-6 forwards)",
      "Power play 1st unit (early penalties = PP goals)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "First Goal Scorer Rate",
        description: "Frequency of scoring the first goal this season.",
      },
      {
        type: "table",
        title: "First Period Scoring Context",
        description:
          "Player shots in 1st period, team 1st period goals for/against.",
      },
    ],
    irrelevantData: [
      "Assists",
      "Blocked shots",
      "Career goal totals",
      "Third period stats",
    ],
    analysisNotes:
      "Similar to first basket in NBA — track actual first goal rates. Top-line forwards who shoot frequently in the first period are the best candidates. Power play time also helps — an early penalty can create a first goal opportunity.",
  },
  {
    id: "soccer_first_goalscorer",
    category: "First Scorer",
    subcategory: "Soccer First Goalscorer",
    marketNames: [
      "First Goalscorer",
      "1st Goalscorer",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["SOCCER", "MLS"],
    resolutionStats: ["first_goal"],
    relevantData: [
      "Player goals per 90 minutes",
      "Player first goal rate this season",
      "Penalty kick taker (PKs can be first goals)",
      "Team's early scoring tendency (goals in first 15 mins)",
      "Expected goals (xG) per 90",
      "Shots per 90",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "First Goalscorer Rate",
        description: "Frequency of each candidate scoring first.",
      },
      {
        type: "table",
        title: "Early Scoring Context",
        description: "Team goals in first 15/30 minutes, penalty taker status.",
      },
    ],
    irrelevantData: [
      "Assists (not scoring goals)",
      "Clean sheet stats",
      "Possession stats",
    ],
    analysisNotes:
      "Penalty takers have an edge because a PK in the first half could be the first goal. Also look at set piece specialists — free kicks and corners can produce early goals. Own goals typically void first goalscorer bets.",
  },
];

// ---------------------------------------------------------------------------
// 3. ANYTIME SCORER MARKETS
// ---------------------------------------------------------------------------

const anytimeScorerProps: MarketDefinition[] = [
  {
    id: "nfl_anytime_td",
    category: "Anytime Scorer",
    subcategory: "NFL Anytime Touchdown",
    marketNames: [
      "Anytime Touchdown Scorer",
      "Anytime TD Scorer",
      "Anytime TD",
      "ATTS",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL", "NCAAF"],
    resolutionStats: ["touchdowns"],
    relevantData: [
      "Player's TD rate (TDs per game this season)",
      "Red zone touches / targets per game",
      "Red zone snap share",
      "Goal-line carries (inside the 5)",
      "Matchup: opponent red zone defense rank",
      "Matchup: opponent TDs allowed to position",
      "Projected game total (high game total = more TDs available)",
      "Projected spread (blowout = more TDs from the better team)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Touchdowns — Last 10 Games",
        description:
          "Game-by-game TD count. Show games with 0, 1, 2+ TDs.",
      },
      {
        type: "distribution",
        title: "TD Frequency Distribution",
        description:
          "What % of games does this player score 0, 1, 2+ TDs.",
      },
      {
        type: "table",
        title: "Red Zone Usage",
        description:
          "RZ touches, RZ targets, goal-line carries, opponent RZ D rank.",
      },
    ],
    irrelevantData: [
      "Total yards (a player can have 150 yards and 0 TDs, or 20 yards and 2 TDs)",
      "Career TD totals",
      "Team defensive stats (unless relevant to game total)",
      "Receiving yards for RBs (unless they catch TDs)",
    ],
    analysisNotes:
      "Anytime TD is one of the most popular NFL props. The key stat is red zone usage — a goal-line back with 3 carries inside the 5 per game is more likely to score than a WR with 10 targets between the 20s. Game total matters — a game with a total of 52 will have ~7 TDs, giving more chances than a game totaling 38.",
  },
  {
    id: "nhl_anytime_goal",
    category: "Anytime Scorer",
    subcategory: "NHL Anytime Goal",
    marketNames: [
      "Anytime Goal Scorer",
      "Anytime Goal",
      "To Score a Goal",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NHL"],
    resolutionStats: ["goals"],
    relevantData: [
      "Goals per game rate",
      "Shots on goal per game (volume creates chances)",
      "Shooting percentage (sustainability check)",
      "Power play involvement (PP goals are a big chunk)",
      "Matchup: opponent goals against per game",
      "Matchup: opposing goaltender save %",
      "Home vs away goal rates",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Goals — Last 15 Games",
        description: "Mark games with goals. Show rolling goal rate.",
      },
      {
        type: "table",
        title: "Shot Volume & Matchup",
        description:
          "SOG/game, shooting %, PP time, opponent GA/game, opposing goalie save %.",
      },
    ],
    irrelevantData: [
      "Assists (different stat)",
      "Blocked shots",
      "Team record",
      "Plus/minus",
    ],
    analysisNotes:
      "Anytime goal in hockey is a high-variance bet. Even 40-goal scorers only score in about half their games. Shots on goal is the best volume predictor. Power play time is a multiplier — PP goals account for ~25% of all goals. Check if the opposing goalie is a backup.",
  },
  {
    id: "soccer_anytime_goalscorer",
    category: "Anytime Scorer",
    subcategory: "Soccer Anytime Goalscorer",
    marketNames: [
      "Anytime Goalscorer",
      "To Score Anytime",
      "Anytime Goal",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["SOCCER", "MLS"],
    resolutionStats: ["goals"],
    relevantData: [
      "Goals per 90 minutes",
      "Expected goals (xG) per 90",
      "Shots per 90 / shots on target per 90",
      "Penalty kick taker status",
      "Matchup: opponent goals conceded per game",
      "Matchup: opponent xG against per 90",
      "Minutes played (injury concerns / rotation risk)",
      "Home vs away goal rate",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Goals — Last 15 Matches",
        description: "Game-by-game goal tally.",
      },
      {
        type: "scatter",
        title: "xG vs Actual Goals",
        description:
          "Show if player is overperforming or underperforming their expected goals.",
      },
      {
        type: "table",
        title: "Key Context",
        description:
          "xG/90, shots/90, penalty taker, opponent defensive quality, minutes risk.",
      },
    ],
    irrelevantData: [
      "Assists (separate stat)",
      "Possession percentage (team stat)",
      "Pass completion rate",
      "Clean sheet stats",
    ],
    analysisNotes:
      "Anytime goalscorer in soccer is about shot volume, shot quality (xG), and penalty duty. A striker on PK duty has a significant edge because PKs are converted ~75% of the time. Also check if the player is likely to play the full 90 — substitution risk can void a late goal.",
  },
];

// ---------------------------------------------------------------------------
// 4. MULTI-STAT / COMBO PROPS
// ---------------------------------------------------------------------------

const multiStatProps: MarketDefinition[] = [
  {
    id: "nba_pra",
    category: "Multi-Stat Combos",
    subcategory: "Points + Rebounds + Assists",
    marketNames: [
      "Pts+Rebs+Asts",
      "Points + Rebounds + Assists",
      "PRA",
      "Pts+Reb+Ast",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA", "NCAAB", "WNBA"],
    resolutionStats: ["points", "rebounds", "assists"],
    relevantData: [
      "PRA per game trend (combined total)",
      "Individual breakdown: how much comes from pts vs reb vs ast",
      "Minutes played trend (PRA correlates strongly with minutes)",
      "Usage rate",
      "Pace of play (both teams)",
      "Matchup: opponent pace",
      "Back-to-back / rest days",
      "Teammate absences (more usage = higher PRA)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "PRA — Last 15 Games",
        description:
          "Combined PRA per game with prop line. Stack the chart to show pts/reb/ast composition.",
      },
      {
        type: "bar",
        title: "PRA Breakdown by Component",
        description:
          "Stacked bar showing how much of PRA comes from each stat.",
      },
      {
        type: "distribution",
        title: "PRA Distribution",
        description: "Histogram of PRA totals with prop line marked.",
      },
    ],
    irrelevantData: [
      "Individual stat props analysis (PRA is about the aggregate)",
      "Team record",
      "Opponent's scoring stats",
      "Career PRA averages",
    ],
    analysisNotes:
      "PRA is the best stat for versatile players (LeBron, Jokic, Luka types). It smooths out variance — a player might have a low-scoring game but grab 12 boards and 8 assists. Minutes are the strongest predictor of PRA. Pace matters — two fast teams create more counting stat opportunities.",
  },
  {
    id: "nba_pts_rebs",
    category: "Multi-Stat Combos",
    subcategory: "Points + Rebounds",
    marketNames: [
      "Pts+Rebs",
      "Points + Rebounds",
      "Points and Rebounds",
      "PA",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA"],
    resolutionStats: ["points", "rebounds"],
    relevantData: [
      "Combined pts+rebs trend",
      "Minutes trend",
      "Matchup: opponent points and rebounds allowed to position",
      "Pace",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Pts+Rebs — Last 15 Games",
        description: "Combined total with stacked breakdown.",
      },
    ],
    irrelevantData: [
      "Assist numbers",
      "Team record",
      "Opponent scoring stats",
    ],
    analysisNotes:
      "Good for big men who score and rebound but don't pass much. Same minutes/pace logic as PRA.",
  },
  {
    id: "nba_pts_asts",
    category: "Multi-Stat Combos",
    subcategory: "Points + Assists",
    marketNames: [
      "Pts+Asts",
      "Points + Assists",
      "Points and Assists",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA"],
    resolutionStats: ["points", "assists"],
    relevantData: [
      "Combined pts+asts trend",
      "Usage rate and assist rate",
      "Minutes trend",
      "Pace",
      "Teammate shooting (affects assist conversion)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Pts+Asts — Last 15 Games",
        description: "Combined total with stacked breakdown.",
      },
    ],
    irrelevantData: [
      "Rebounding numbers",
      "Team defensive stats",
    ],
    analysisNotes:
      "Ideal for guards and playmakers who score and distribute. Trae Young, Luka Doncic types are the prototypical pts+asts prop targets.",
  },
  {
    id: "nba_rebs_asts",
    category: "Multi-Stat Combos",
    subcategory: "Rebounds + Assists",
    marketNames: [
      "Rebs+Asts",
      "Rebounds + Assists",
      "Rebounds and Assists",
      "RA",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks"],
    sports: ["NBA"],
    resolutionStats: ["rebounds", "assists"],
    relevantData: [
      "Combined rebs+asts trend",
      "Minutes",
      "Role — point-forward types (Jokic, Draymond) are the targets",
      "Pace",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Rebs+Asts — Last 15 Games",
        description: "Combined total with stacked breakdown.",
      },
    ],
    irrelevantData: [
      "Scoring stats",
      "Team record",
    ],
    analysisNotes:
      "Niche prop for do-everything players. Best for point-center types like Jokic or versatile forwards like Draymond Green.",
  },
  {
    id: "nba_double_double",
    category: "Multi-Stat Combos",
    subcategory: "Double-Double",
    marketNames: [
      "Double-Double (Yes/No)",
      "To Record a Double-Double",
      "Double Double",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks"],
    sports: ["NBA", "NCAAB"],
    resolutionStats: ["points", "rebounds", "assists"],
    relevantData: [
      "Double-double rate this season (% of games)",
      "Which stat pair they usually double-double with (pts+rebs vs pts+asts)",
      "How close they typically are (averaging 9.5 rebs is close to DD territory)",
      "Minutes trend",
      "Matchup: opponent allowing double-doubles to position",
    ],
    idealCharts: [
      {
        type: "distribution",
        title: "Double-Double Frequency",
        description:
          "Pie chart or bar showing DD% this season. Break down by which stat pair.",
      },
      {
        type: "scatter",
        title: "Points vs Rebounds (or Assists)",
        description:
          "Scatter plot of each game — show which games fell in DD territory.",
      },
    ],
    irrelevantData: [
      "Triple-double stats (different prop)",
      "Team record",
      "Opponent offensive stats",
    ],
    analysisNotes:
      "Double-doubles are achievable for ~15-20 NBA players on any given night. The key question is consistency — does the player hover around 10/10 or does one stat frequently dip below 10? Check the game log for near-misses (9 rebounds with 20 points).",
  },
  {
    id: "nba_triple_double",
    category: "Multi-Stat Combos",
    subcategory: "Triple-Double",
    marketNames: [
      "Triple-Double (Yes/No)",
      "To Record a Triple-Double",
      "Triple Double",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA"],
    resolutionStats: ["points", "rebounds", "assists"],
    relevantData: [
      "Triple-double rate this season",
      "How often player is close (near-triple-doubles)",
      "Minutes trend (needs extended playing time)",
      "Pace — faster games create more stat opportunities",
      "Game script — blowouts can pull starters early",
    ],
    idealCharts: [
      {
        type: "table",
        title: "Triple-Double Likelihood",
        description:
          "Season TD rate, near-misses, average gap from 10 in weakest stat.",
      },
    ],
    irrelevantData: [
      "Team record",
      "Opponent's defensive stats in isolation",
      "Career triple-double count",
    ],
    analysisNotes:
      "Only 5-8 NBA players have realistic triple-double potential. Westbrook, Jokic, Luka, LeBron types. The bet is usually priced at long odds. Check if the player's weakest category is consistently near 10.",
  },
  {
    id: "nba_blks_stls",
    category: "Multi-Stat Combos",
    subcategory: "Blocks + Steals",
    marketNames: [
      "Blks+Stls",
      "Blocks + Steals",
      "Steals + Blocks",
      "Stocks",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks"],
    sports: ["NBA"],
    resolutionStats: ["blocks", "steals"],
    relevantData: [
      "Combined blocks+steals per game trend",
      "Individual block and steal rates",
      "Minutes",
      "Matchup: opponent turnover rate (steals) and shot attempts at rim (blocks)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Blocks + Steals — Last 15 Games",
        description: "Combined game log.",
      },
    ],
    irrelevantData: [
      "Scoring stats",
      "Rebounding",
      "Team record",
    ],
    analysisNotes:
      "This is a defensive stat combo. Blocks + steals are low-count and volatile. The line is usually 1.5-3.5 for elite defenders. Big men tend to get blocks, guards tend to get steals. Versatile defenders like AD or Giannis accumulate both.",
  },
  {
    id: "mlb_hits_runs_rbis",
    category: "Multi-Stat Combos",
    subcategory: "Hits + Runs + RBIs",
    marketNames: [
      "Hits+Runs+RBIs",
      "H+R+RBI",
      "Total Hits + Runs + RBIs",
    ],
    platforms: ["PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["hits", "runs", "rbis"],
    relevantData: [
      "Combined H+R+RBI trend",
      "Batting average and OBP (hit component)",
      "Lineup position (affects runs and RBI opportunity)",
      "Team scoring trend (more team runs = more individual runs and RBIs)",
      "Matchup: opposing pitcher quality",
    ],
    idealCharts: [
      {
        type: "line",
        title: "H+R+RBI — Last 20 Games",
        description: "Combined total with stacked breakdown.",
      },
    ],
    irrelevantData: [
      "Pitching stats",
      "Defensive metrics",
      "Stolen bases",
    ],
    analysisNotes:
      "This is a PrizePicks / Underdog favorite. It rewards hitters on good offenses who bat in the middle of the order. A 3-hole hitter on a high-scoring team accumulates all three. Line is usually 1.5-3.5.",
  },
  {
    id: "mlb_fantasy_score",
    category: "Multi-Stat Combos",
    subcategory: "Fantasy Score",
    marketNames: [
      "Fantasy Score",
      "Fantasy Points",
    ],
    platforms: ["PrizePicks", "Underdog"],
    sports: ["NBA", "NFL", "MLB", "NHL"],
    resolutionStats: ["all_stats"],
    relevantData: [
      "Platform-specific scoring formula",
      "Player's recent fantasy score trend",
      "Minutes/snaps/plate appearances (volume)",
      "Matchup quality",
      "All relevant individual stats weighted by scoring formula",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Fantasy Score — Last 10-15 Games",
        description:
          "Game-by-game fantasy score with platform scoring formula shown.",
      },
      {
        type: "bar",
        title: "Fantasy Score Composition",
        description: "Stacked bars showing which stats contribute most.",
      },
    ],
    irrelevantData: [
      "Any stat not in the scoring formula",
      "Team stats",
    ],
    analysisNotes:
      "Fantasy score props require knowing the EXACT scoring formula. PrizePicks NBA: Pts(1) + Rebs(1.2) + Asts(1.5) + Stl(3) + Blk(3) - TO(1). This means steals and blocks are massively overweighted. A player with 10 pts, 5 reb, 3 ast, 2 stl, 1 blk = 10+6+4.5+6+3-1 = 28.5 fantasy points.",
  },
];

// ---------------------------------------------------------------------------
// 5. GAME PROPS
// ---------------------------------------------------------------------------

const gameProps: MarketDefinition[] = [
  {
    id: "game_total",
    category: "Game Props",
    subcategory: "Game Total (Over/Under)",
    marketNames: [
      "Total Points O/U",
      "Game Total",
      "Over/Under",
      "Total",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF", "SOCCER", "MLS"],
    resolutionStats: ["total_points"],
    relevantData: [
      "Both teams' scoring averages (home and away splits)",
      "Both teams' defensive averages (points allowed)",
      "Pace / possessions per game (NBA/NCAAB)",
      "Recent scoring trends (last 5-10 games)",
      "H2H scoring history",
      "Weather (NFL outdoor, MLB)",
      "Venue (dome vs outdoor, park factor for MLB)",
      "Key injuries affecting scoring",
      "Referee/umpire tendencies (some crews call more fouls = more FTs)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Combined Score — Last 10 Games for Each Team",
        description:
          "Two lines showing each team's combined game totals. Draw the O/U line.",
      },
      {
        type: "distribution",
        title: "Game Total Distribution",
        description:
          "Histogram of combined scores in each team's recent games.",
      },
      {
        type: "bar",
        title: "Scoring by Venue",
        description:
          "Home team scoring at home vs away team scoring on the road.",
      },
      {
        type: "table",
        title: "Key Context",
        description:
          "Pace, weather, injuries, H2H history, referee assignment.",
      },
    ],
    irrelevantData: [
      "Individual player props",
      "ATS records (spread, not total)",
      "Win/loss records in isolation",
    ],
    analysisNotes:
      "The game total is the market's estimate of combined scoring. The best approach combines pace (how many possessions?), efficiency (how well do they score per possession?), and environment (weather, altitude, park). Totals have tightened in recent years — look for edges in pace mismatches.",
  },
  {
    id: "team_total",
    category: "Game Props",
    subcategory: "Team Total",
    marketNames: [
      "Team Total O/U",
      "Team Points O/U",
      "Team Total Points",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF"],
    resolutionStats: ["team_points"],
    relevantData: [
      "Team scoring average (home/away split)",
      "Opponent defensive rating / points allowed",
      "Pace",
      "Key offensive injuries",
      "Weather (NFL)",
      "Recent scoring form",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Team Points Scored — Last 10 Games",
        description: "Game-by-game scoring with the team total line drawn.",
      },
      {
        type: "distribution",
        title: "Team Scoring Distribution",
        description: "Histogram of team scores this season.",
      },
    ],
    irrelevantData: [
      "Opponent's scoring (that's the other team's total)",
      "Individual player career stats",
    ],
    analysisNotes:
      "Team totals are derived from the game total and spread. If the total is 220 and the spread is -6, the favorite's team total is ~113 and the underdog's is ~107. Sometimes there's value in a team total that doesn't align with this math.",
  },
  {
    id: "race_to_x",
    category: "Game Props",
    subcategory: "Race to X Points",
    marketNames: [
      "Race to 20 Points",
      "Race to 10 Points",
      "Race to 25 Points",
      "Race to X Points",
      "Race to X Goals",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "NHL", "NCAAB"],
    resolutionStats: ["first_to_score_x"],
    relevantData: [
      "Team's first quarter / first period scoring average",
      "Team's start-of-game performance",
      "Pace (faster pace = reaching X sooner)",
      "Which team scores first historically",
      "Opening possession tendencies",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Early Game Scoring",
        description:
          "Average points/goals in the first quarter/period for each team.",
      },
      {
        type: "table",
        title: "Race-to Context",
        description: "First-to-score rate, early scoring pace for each team.",
      },
    ],
    irrelevantData: [
      "Full game totals (only early game matters)",
      "Second half performance",
      "Individual player stats",
    ],
    analysisNotes:
      "Race-to props are about early game tendencies. Some teams are fast starters, others are slow starters. Check first quarter/period scoring, not full game averages.",
  },
  {
    id: "first_to_score",
    category: "Game Props",
    subcategory: "First to Score",
    marketNames: [
      "First Team to Score",
      "First Scoring Play",
      "First Scoring Method",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL", "NBA", "NHL", "SOCCER"],
    resolutionStats: ["first_score"],
    relevantData: [
      "Team first-to-score rate this season",
      "NFL: coin toss stats, opening drive success rate",
      "NBA: tip-off win rate",
      "NHL: first period scoring",
      "Soccer: early goal tendency",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "First to Score Rate",
        description:
          "Each team's rate of scoring first this season.",
      },
    ],
    irrelevantData: [
      "Full game results",
      "Point differentials",
    ],
    analysisNotes:
      "First-to-score is binary. For NFL, the team receiving the opening kickoff has an edge. For NBA, the team winning the tip. Track the actual first-to-score rates.",
  },
  {
    id: "game_to_go_overtime",
    category: "Game Props",
    subcategory: "Overtime",
    marketNames: [
      "Will the Game Go to Overtime?",
      "Overtime Yes/No",
      "Extra Innings Yes/No",
      "Extra Time Yes/No",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "NHL", "MLB", "SOCCER"],
    resolutionStats: ["overtime"],
    relevantData: [
      "Spread (close spread = more OT likelihood)",
      "Both teams' OT frequency this season",
      "Historical OT rate for the sport (~6% NBA, ~5% NFL)",
      "Competitiveness of the matchup",
    ],
    idealCharts: [
      {
        type: "table",
        title: "Overtime Likelihood",
        description:
          "Each team's OT frequency, spread, sport-wide OT rate.",
      },
    ],
    irrelevantData: [
      "Individual player stats",
      "Scoring averages",
    ],
    analysisNotes:
      "OT is rare in all sports. Close spreads increase the probability. This is usually a heavy juice prop on the 'No' side. Only worthwhile when two evenly-matched teams meet.",
  },
  {
    id: "nfl_first_scoring_method",
    category: "Game Props",
    subcategory: "First Scoring Method",
    marketNames: [
      "First Scoring Method",
      "First Score Type",
      "1st Scoring Play",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["first_scoring_method"],
    relevantData: [
      "NFL-wide rates: ~45% TD, ~45% FG, ~5% safety, ~5% other",
      "Each team's red zone TD rate (high = TD, low = FG)",
      "Each team's opening drive tendencies",
      "Defensive strength (good D = more FGs from opponent)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "First Scoring Method Distribution",
        description: "League-wide and team-specific first scoring method rates.",
      },
    ],
    irrelevantData: [
      "Total game scoring",
      "Individual player stats",
    ],
    analysisNotes:
      "Touchdowns and field goals are roughly equal for first scoring play in the NFL. Teams with elite red zone offenses lean toward TD. Good defenses force field goals. Safety is a longshot but can offer value at 30-40:1.",
  },
  {
    id: "highest_scoring_period",
    category: "Game Props",
    subcategory: "Highest Scoring Quarter/Half/Period",
    marketNames: [
      "Highest Scoring Quarter",
      "Highest Scoring Half",
      "Highest Scoring Period",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "NHL"],
    resolutionStats: ["period_scoring"],
    relevantData: [
      "Team's scoring by quarter/period breakdown",
      "Historical rates (NBA: 4th quarter is often highest; NFL: 2nd quarter)",
      "Game script expectations",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Average Scoring by Quarter/Period",
        description: "Both teams' scoring breakdown by period.",
      },
    ],
    irrelevantData: [
      "Individual player stats",
      "Full game totals",
    ],
    analysisNotes:
      "In the NBA, the 3rd quarter tends to be lowest scoring (adjustments, rest). In the NFL, the 2nd quarter is historically the highest scoring. These tendencies are fairly stable across the league.",
  },
  {
    id: "both_teams_to_score",
    category: "Game Props",
    subcategory: "Both Teams to Score",
    marketNames: [
      "Both Teams to Score (BTTS)",
      "Both Teams to Score Yes/No",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["SOCCER", "MLS"],
    resolutionStats: ["both_teams_score"],
    relevantData: [
      "Each team's goals scored per game",
      "Each team's goals conceded per game",
      "Each team's clean sheet rate",
      "BTTS rate in each team's matches this season",
      "H2H BTTS history",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "BTTS Rate — Both Teams",
        description: "Percentage of each team's games where both teams scored.",
      },
      {
        type: "table",
        title: "Clean Sheet & Scoring Context",
        description:
          "Goals per game, goals conceded, clean sheet %, H2H record.",
      },
    ],
    irrelevantData: [
      "Possession stats",
      "Individual player stats",
      "Corners/cards",
    ],
    analysisNotes:
      "BTTS is one of soccer's most popular markets. Two attacking teams with poor defenses are ideal BTTS Yes candidates. Teams with high clean sheet rates suggest BTTS No. Check the specific H2H — some matchups consistently produce goals from both sides.",
  },
];

// ---------------------------------------------------------------------------
// 6. PERIOD / HALF / QUARTER PROPS
// ---------------------------------------------------------------------------

const periodProps: MarketDefinition[] = [
  {
    id: "first_half_spread",
    category: "Period/Half/Quarter Props",
    subcategory: "First Half Spread",
    marketNames: [
      "1st Half Spread",
      "First Half Point Spread",
      "1H Spread",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "NCAAB", "NCAAF"],
    resolutionStats: ["first_half_score"],
    relevantData: [
      "Team's first half scoring average",
      "Team's first half margin trend",
      "Opponent's first half scoring allowed",
      "Are they a fast starter or slow starter?",
      "NFL: scripted opening plays favor some teams early",
    ],
    idealCharts: [
      {
        type: "line",
        title: "First Half Margin — Last 10 Games",
        description: "How each team performs in the first half.",
      },
      {
        type: "bar",
        title: "1st Half vs 2nd Half Scoring",
        description: "Compare first and second half tendencies.",
      },
    ],
    irrelevantData: [
      "Full game spread record (different dynamics)",
      "Second half performance in isolation",
      "Individual player props",
    ],
    analysisNotes:
      "Some teams are notorious first-half teams (jump out to big leads) while others are comeback teams. The 1H spread is usually roughly half the full-game spread but teams with extreme half-by-half splits create edges.",
  },
  {
    id: "first_half_total",
    category: "Period/Half/Quarter Props",
    subcategory: "First Half Total",
    marketNames: [
      "1st Half Total O/U",
      "First Half Over/Under",
      "1H Total",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "NCAAB", "NCAAF"],
    resolutionStats: ["first_half_total"],
    relevantData: [
      "Both teams' first half scoring averages",
      "First half total trends",
      "Pace comparison",
      "NFL: weather for first half specifically",
    ],
    idealCharts: [
      {
        type: "line",
        title: "First Half Combined Scoring — Last 10 Games",
        description: "Combined 1H scoring for each team's recent games.",
      },
    ],
    irrelevantData: [
      "Full game totals (1H has its own dynamics)",
      "Second half trends",
    ],
    analysisNotes:
      "First half totals are about 48-52% of the full game total depending on sport. Some teams consistently play higher-scoring first halves. In the NBA, 1Q and 2Q tend to be moderate; in the NFL, the 2nd quarter is often the highest-scoring.",
  },
  {
    id: "quarter_props",
    category: "Period/Half/Quarter Props",
    subcategory: "Individual Quarter/Period",
    marketNames: [
      "1st Quarter O/U",
      "2nd Quarter O/U",
      "3rd Quarter O/U",
      "4th Quarter O/U",
      "1st Period O/U",
      "2nd Period O/U",
      "3rd Period O/U",
      "Quarter/Period Winner",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "NHL", "NCAAB"],
    resolutionStats: ["period_score"],
    relevantData: [
      "Team's scoring average by specific quarter/period",
      "Opponent's scoring allowed by quarter/period",
      "Historical patterns (NBA 3Q is typically lowest scoring)",
      "Pace by quarter",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Scoring by Quarter/Period",
        description:
          "Both teams' average scoring in each quarter/period.",
      },
    ],
    irrelevantData: [
      "Full game totals",
      "Other quarter/period stats",
    ],
    analysisNotes:
      "Quarter/period props have their own patterns. NBA: Q3 is often lowest scoring (halftime adjustments, rest). NFL: Q2 is highest (both teams have seen each other's tendencies). NHL: scoring is relatively flat across periods but 3rd periods can spike with empty-net goals.",
  },
  {
    id: "first_inning_run",
    category: "Period/Half/Quarter Props",
    subcategory: "MLB First Inning",
    marketNames: [
      "Run in the First Inning (Yes/No)",
      "First Inning Run",
      "1st Inning Total O/U",
      "NRFI/YRFI",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["MLB"],
    resolutionStats: ["first_inning_run"],
    relevantData: [
      "Starting pitcher's first inning ERA / runs allowed",
      "Starting pitcher's NRFI/YRFI rate this season",
      "Opposing lineup's first-inning OBP/SLG",
      "Both pitchers' command / walk rate in first inning",
      "Ballpark factor",
      "Weather",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "NRFI/YRFI Rate — Both Pitchers",
        description:
          "Each starter's rate of allowing first-inning runs this season.",
      },
      {
        type: "table",
        title: "First Inning Context",
        description:
          "Pitcher 1st-inning ERA, lineup OBP vs pitcher, ballpark factor.",
      },
    ],
    irrelevantData: [
      "Full game pitching stats (only 1st inning matters)",
      "Bullpen stats",
      "Late-inning performance",
    ],
    analysisNotes:
      "NRFI (No Run First Inning) / YRFI is a hugely popular market. It's entirely about the two starting pitchers' first-inning tendencies. Some pitchers are notoriously shaky in the 1st (more walks, feel-out pitches). Others are dominant early. Track first-inning-specific stats, not overall ERA.",
  },
];

// ---------------------------------------------------------------------------
// 7. TOURNAMENT / FUTURES
// ---------------------------------------------------------------------------

const futuresProps: MarketDefinition[] = [
  {
    id: "golf_tournament_winner",
    category: "Tournament/Futures",
    subcategory: "Golf Outright Winner",
    marketNames: [
      "Tournament Winner",
      "Outright Winner",
      "To Win",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["GOLF"],
    resolutionStats: ["tournament_finish"],
    relevantData: [
      "Player's recent form (last 5-10 tournaments, finishes and strokes gained)",
      "Course history (previous results at this specific course)",
      "Course fit — player strengths vs course demands (distance, accuracy, putting surface)",
      "Strokes gained breakdown (off the tee, approach, around the green, putting)",
      "Current world ranking and form trajectory",
      "Weather forecast for the tournament",
      "Field strength (is the field weak this week?)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Recent Tournament Finishes",
        description:
          "Last 10 tournament finishes (lower = better). Annotate missed cuts.",
      },
      {
        type: "bar",
        title: "Strokes Gained Breakdown",
        description:
          "SG: Off the Tee, SG: Approach, SG: Around the Green, SG: Putting — compared to field average.",
      },
      {
        type: "table",
        title: "Course History",
        description:
          "Past results at this course, course par/yardage, key features.",
      },
    ],
    irrelevantData: [
      "Career win count (recent form matters more)",
      "Money earned (vanity stat)",
      "FedExCup standing (not relevant to this week)",
      "Head-to-head record against one player",
    ],
    analysisNotes:
      "Golf tournament winner is the hardest bet to hit — a 156-player field means even favorites win only ~10-15% of the time. Focus on course fit and recent form. Strokes gained is the gold standard stat for golf analysis. Course history matters — some players consistently perform well at specific courses (e.g., Rahm at Augusta).",
  },
  {
    id: "golf_top_finish",
    category: "Tournament/Futures",
    subcategory: "Golf Top Finish",
    marketNames: [
      "Top 5 Finish",
      "Top 10 Finish",
      "Top 20 Finish",
      "Top 40 Finish",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["GOLF"],
    resolutionStats: ["tournament_finish"],
    relevantData: [
      "Same as tournament winner but with a different threshold",
      "Top-5/10/20 rate this season (what % of tournaments)",
      "Consistency metrics (cuts made streak, top-25 rate)",
      "Course history",
      "Strokes gained total (consistent positive = consistent finishes)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Tournament Finishes This Season",
        description:
          "All tournament finishes with top-5/10/20 zones highlighted.",
      },
      {
        type: "table",
        title: "Consistency Profile",
        description:
          "Top-5 rate, top-10 rate, top-20 rate, cuts made rate this season.",
      },
    ],
    irrelevantData: [
      "Win count (top-10 doesn't need to win)",
      "Single-round scores (full tournament matters)",
    ],
    analysisNotes:
      "Top-finish bets are a better value entry point than outright winner. A player doesn't need to win — just finish well. Look for players who are consistently in the top-20 even without winning. Consistency (SG total) is more important than ceiling.",
  },
  {
    id: "golf_make_cut",
    category: "Tournament/Futures",
    subcategory: "Golf Make/Miss Cut",
    marketNames: [
      "To Make the Cut",
      "To Miss the Cut",
      "Make/Miss Cut",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["GOLF"],
    resolutionStats: ["made_cut"],
    relevantData: [
      "Cuts made rate this season and career at this course",
      "Recent form in first two rounds specifically",
      "Course history (some players just don't fit a course)",
      "Field strength (weak field = easier cut)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Cuts Made — Last 15 Tournaments",
        description: "Binary made/missed with result annotated.",
      },
    ],
    irrelevantData: [
      "Weekend performance (cut is determined after 2 rounds)",
      "Win count",
    ],
    analysisNotes:
      "The cut eliminates roughly half the field after round 2. Players with high variance (boom or bust) miss more cuts. Steady players who rarely have blow-up rounds are the best 'make the cut' candidates.",
  },
  {
    id: "golf_matchup",
    category: "Tournament/Futures",
    subcategory: "Golf Head-to-Head Matchup",
    marketNames: [
      "72-Hole Matchup",
      "Round Matchup",
      "Head-to-Head",
      "2-Ball",
      "3-Ball",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["GOLF"],
    resolutionStats: ["matchup_result"],
    relevantData: [
      "Both players' recent form (strokes gained)",
      "Both players' course history",
      "Course fit comparison",
      "Round-specific: tee time / weather conditions for that tee time",
      "H2H record if sample exists",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Strokes Gained Comparison",
        description: "Side-by-side SG breakdown for both players.",
      },
      {
        type: "line",
        title: "Recent Form Comparison",
        description: "Last 10 tournament finishes for both players.",
      },
    ],
    irrelevantData: [
      "World ranking (misleading for individual matchup)",
      "Career earnings",
    ],
    analysisNotes:
      "Golf matchups are the most 'handicappable' golf bet — it's just Player A vs Player B. Strokes gained total is the best predictor. For round matchups, check tee times — morning/afternoon waves can face different conditions.",
  },
  {
    id: "golf_round_score",
    category: "Tournament/Futures",
    subcategory: "Golf Round Props",
    marketNames: [
      "Round Score O/U",
      "Round Leader",
      "First Round Leader",
      "Birdies in a Round",
      "Bogey-Free Round",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["GOLF"],
    resolutionStats: ["round_score"],
    relevantData: [
      "Player's scoring average this season",
      "Player's round-by-round scoring trend",
      "Course scoring average",
      "Weather forecast for specific tee time",
      "Birdie rate / bogey rate",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Round Scores — Last 10 Tournaments",
        description: "All round scores plotted, with the O/U line.",
      },
      {
        type: "table",
        title: "Round Context",
        description:
          "Course par, scoring average, weather forecast, player's scoring avg.",
      },
    ],
    irrelevantData: [
      "Tournament finish positions",
      "Career stats",
    ],
    analysisNotes:
      "Round props isolate a single day's performance. Weather is critical — wind and rain can add 3-5 strokes to a round. First round leaders are a popular market — some players consistently start fast.",
  },
  {
    id: "season_futures",
    category: "Tournament/Futures",
    subcategory: "Season-Long Futures",
    marketNames: [
      "Super Bowl Winner",
      "NBA Championship Winner",
      "World Series Winner",
      "Stanley Cup Winner",
      "Conference Winner",
      "Division Winner",
      "MVP",
      "Win Total O/U",
      "Playoff Make/Miss",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF"],
    resolutionStats: ["season_result"],
    relevantData: [
      "Preseason projections / power ratings",
      "Current record and strength of schedule remaining",
      "Roster changes (trades, injuries, additions)",
      "Pythagorean win expectation (expected record based on run differential / point differential)",
      "Historical comparable teams",
      "Playoff odds models",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Win Probability Over Time",
        description: "How the team's championship/playoff odds have moved.",
      },
      {
        type: "bar",
        title: "Strength of Schedule Remaining",
        description: "Remaining schedule difficulty.",
      },
      {
        type: "table",
        title: "Key Context",
        description:
          "Current record, point differential, SOS remaining, key injuries.",
      },
    ],
    irrelevantData: [
      "Individual game outcomes (too granular for futures)",
      "Single game player stats",
    ],
    analysisNotes:
      "Futures are long-term bets. The value is in identifying teams whose odds don't reflect their true probability. Point differential and Pythagorean wins are better predictors of future performance than raw record. Check for schedule difficulty and health trajectory.",
  },
];

// ---------------------------------------------------------------------------
// 8. DEFENSIVE PROPS
// ---------------------------------------------------------------------------

const defensiveProps: MarketDefinition[] = [
  {
    id: "nba_blocks",
    category: "Defensive Props",
    subcategory: "NBA Blocks",
    marketNames: ["Blocks O/U", "Player Blocks Over/Under"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA"],
    resolutionStats: ["blocks"],
    relevantData: [
      "Blocks per game trend",
      "Minutes played",
      "Matchup: opponent shot attempts at the rim",
      "Matchup: opponent drives per game",
      "Player block rate / blocks per 36 minutes",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Blocks — Last 15 Games",
        description: "Game log with prop line.",
      },
      {
        type: "distribution",
        title: "Blocks Distribution",
        description: "Histogram showing frequency of 0, 1, 2, 3+ block games.",
      },
    ],
    irrelevantData: [
      "Scoring stats",
      "Assist stats",
      "Opponent 3-point shooting (blocks happen at the rim)",
    ],
    analysisNotes:
      "Blocks are low-count and volatile. Even elite shot-blockers have many 0-block games. The line is usually 0.5-2.5. Look for matchups against teams that attack the rim frequently (high paint points, lots of drives).",
  },
  {
    id: "nba_steals",
    category: "Defensive Props",
    subcategory: "NBA Steals",
    marketNames: ["Steals O/U", "Player Steals Over/Under"],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA"],
    resolutionStats: ["steals"],
    relevantData: [
      "Steals per game trend",
      "Minutes played",
      "Matchup: opponent turnovers per game",
      "Player steal rate",
      "Matchup: opponent ball-handling quality (sloppy teams = more steals)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Steals — Last 15 Games",
        description: "Game log with prop line.",
      },
      {
        type: "distribution",
        title: "Steals Distribution",
        description: "Frequency of 0, 1, 2, 3+ steal games.",
      },
    ],
    irrelevantData: [
      "Scoring stats",
      "Rebounding",
      "Opponent scoring stats",
    ],
    analysisNotes:
      "Steals are the most random major NBA stat — very hard to predict game-to-game. The line is usually 0.5-1.5. Active-hands defenders (guards who jump passing lanes) are the best targets. Matchup against turnover-prone teams helps.",
  },
  {
    id: "nfl_sacks",
    category: "Defensive Props",
    subcategory: "NFL Sacks",
    marketNames: [
      "Sacks O/U",
      "Player Sacks Over/Under",
      "Total Sacks",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["sacks"],
    relevantData: [
      "Player sacks per game rate",
      "Pressure rate (pressures are more stable than sacks)",
      "Matchup: opponent sacks allowed / OL ranking",
      "Matchup: opposing QB time to throw",
      "Game script (trailing teams throw more = more sack opportunities)",
      "Projected spread and total",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Sacks — Last 10 Games",
        description: "Game log marking sack games. Show pressures as well.",
      },
      {
        type: "table",
        title: "Matchup Context",
        description:
          "Opponent OL rank, sacks allowed, opposing QB time to throw.",
      },
    ],
    irrelevantData: [
      "Defensive player's tackle stats (different skill)",
      "Team win/loss record",
      "Opponent rushing stats",
    ],
    analysisNotes:
      "Sacks are rare — even elite pass rushers average 0.5-1.0 per game. Pressure rate is a more stable predictor. The key matchup is pass rusher vs OT. Weak offensive lines facing elite edge rushers create the best sack prop opportunities.",
  },
  {
    id: "nfl_def_interceptions",
    category: "Defensive Props",
    subcategory: "NFL Defensive Interceptions",
    marketNames: [
      "Interceptions O/U",
      "Player to Record an Interception",
      "Defensive INT",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["defensive_interceptions"],
    relevantData: [
      "Player's INT rate this season",
      "Player's targets / balls thrown their direction",
      "Matchup: opposing QB INT rate",
      "Matchup: opposing QB under pressure INT rate",
      "Team pass rush quality (pressure causes INTs)",
      "Weather (rain/wind increase INT risk)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Interceptions — Season Log",
        description: "Mark games with INTs.",
      },
      {
        type: "table",
        title: "Matchup Context",
        description: "Opposing QB INT rate, balls thrown at defender per game.",
      },
    ],
    irrelevantData: [
      "Defender's tackle stats",
      "Team scoring stats",
      "Defender's career INT total",
    ],
    analysisNotes:
      "Defensive INTs are extremely rare individually. Even elite CBs only have ~5 INTs per season (1 every 3 games). The matchup matters more than the defender — turnover-prone QBs in bad weather create INT opportunities for anyone in the secondary.",
  },
  {
    id: "nfl_forced_fumbles",
    category: "Defensive Props",
    subcategory: "NFL Forced Fumbles",
    marketNames: [
      "Forced Fumbles",
      "Player to Force a Fumble",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["forced_fumbles"],
    relevantData: [
      "Player FF rate",
      "Opponent fumble rate",
      "Weather (wet conditions increase fumbles)",
    ],
    idealCharts: [
      {
        type: "table",
        title: "Fumble Context",
        description: "Player FF rate, opponent fumble rate, weather.",
      },
    ],
    irrelevantData: [
      "Most other defensive stats",
      "Scoring stats",
    ],
    analysisNotes:
      "Forced fumbles are among the most random stats in football. Very low hit rate. Only bet this when offered at extreme plus money.",
  },
  {
    id: "nhl_blocked_shots",
    category: "Defensive Props",
    subcategory: "NHL Blocked Shots",
    marketNames: [
      "Blocked Shots O/U",
      "Player Blocked Shots Over/Under",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NHL"],
    resolutionStats: ["blocked_shots"],
    relevantData: [
      "Blocked shots per game trend",
      "Time on ice (more TOI = more block opportunities)",
      "PK time (penalty kill = more blocking)",
      "Matchup: opponent shots per game",
      "Playing style (stay-at-home D-men block more)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Blocked Shots — Last 15 Games",
        description: "Game log with prop line.",
      },
    ],
    irrelevantData: [
      "Goals and assists",
      "Plus/minus",
      "Penalty minutes",
    ],
    analysisNotes:
      "Blocked shots are a niche NHL prop. Defensive defensemen who kill penalties are the most consistent blockers. High-volume shot teams as opponents create more blocking opportunities.",
  },
  {
    id: "nhl_hits",
    category: "Defensive Props",
    subcategory: "NHL Hits",
    marketNames: ["Hits O/U", "Player Hits Over/Under"],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NHL"],
    resolutionStats: ["hits"],
    relevantData: [
      "Hits per game trend",
      "Time on ice",
      "Playing style (physical players)",
      "Matchup: rivalry games tend to be more physical",
      "Home vs away hit splits",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Hits — Last 15 Games",
        description: "Game log with prop line.",
      },
    ],
    irrelevantData: [
      "Scoring stats",
      "Shots on goal",
      "Penalty minutes (correlated but separate)",
    ],
    analysisNotes:
      "Hits are tracked inconsistently between arenas — home scorers are generous to home players. Be wary of splits between home and away. Physical players on physical teams in rivalry games hit more.",
  },
];

// ---------------------------------------------------------------------------
// 9. PITCHER PROPS
// ---------------------------------------------------------------------------

const pitcherProps: MarketDefinition[] = [
  {
    id: "mlb_strikeouts",
    category: "Pitcher Props",
    subcategory: "Strikeouts",
    marketNames: [
      "Strikeouts O/U",
      "Pitcher Strikeouts Over/Under",
      "Ks",
      "Pitcher Ks",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["strikeouts"],
    relevantData: [
      "Pitcher K/9 rate and K% this season",
      "Pitcher game log (Ks per start, last 5-8 starts)",
      "Matchup: opponent team strikeout rate (K%)",
      "Matchup: specific lineup's K rate vs LHP/RHP",
      "Pitcher's pitch count / innings trend (more innings = more Ks)",
      "Swinging strike rate (predictive of Ks)",
      "Umpire K zone tendencies",
      "Weather (cold = more Ks, less bat speed)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Strikeouts — Last 8 Starts",
        description:
          "Game-by-game Ks with innings pitched annotated. Show prop line.",
      },
      {
        type: "scatter",
        title: "Innings Pitched vs Strikeouts",
        description: "Correlation between workload and Ks.",
      },
      {
        type: "bar",
        title: "Opponent K Rate Comparison",
        description:
          "Today's opponent K rate vs league average vs pitcher's K rate.",
      },
      {
        type: "table",
        title: "Key Context",
        description:
          "K/9, swinging strike rate, opponent K%, umpire, weather.",
      },
    ],
    irrelevantData: [
      "Pitcher win/loss record (luck-based)",
      "ERA (doesn't predict Ks directly)",
      "Batting stats of the pitcher",
      "Bullpen quality",
    ],
    analysisNotes:
      "Strikeouts are the most predictable pitcher prop. K/9 and swinging strike rate are the best predictors. The matchup matters hugely — a high-K pitcher vs a high-K lineup is the dream scenario for overs. Innings pitched is the volume component — if a pitcher only goes 4 innings, the K count is capped.",
  },
  {
    id: "mlb_pitcher_outs",
    category: "Pitcher Props",
    subcategory: "Outs Recorded / Innings Pitched",
    marketNames: [
      "Outs Recorded O/U",
      "Pitcher Outs Over/Under",
      "Pitching Outs",
      "Innings Pitched O/U",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["outs_recorded", "innings_pitched"],
    relevantData: [
      "Average innings per start (IP/GS)",
      "Pitch count trend per start",
      "Manager's pitching philosophy (short leash vs long leash)",
      "Recent pitch count limits (workload management)",
      "Matchup: opponent OBP (low OBP = quicker innings = more outs)",
      "Game script risk (getting shelled early = short outing)",
      "Pitch efficiency (pitches per inning)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Innings Pitched — Last 8 Starts",
        description: "Game-by-game IP with pitch counts annotated.",
      },
      {
        type: "bar",
        title: "Outs Recorded Breakdown",
        description:
          "Show outs by inning — did they finish the 5th, 6th, 7th?",
      },
    ],
    irrelevantData: [
      "Strikeout numbers (Ks don't determine innings)",
      "Win/loss record",
      "ERA (related but separate)",
    ],
    analysisNotes:
      "Outs recorded (3 outs = 1 inning) is about how deep a pitcher goes. Pitch count, efficiency, and manager tendencies matter more than stuff. A pitcher averaging 85 pitches through 5 innings won't go 7 even with dominant stuff. The line is usually 15.5-17.5 outs (5.1-5.2 innings).",
  },
  {
    id: "mlb_earned_runs",
    category: "Pitcher Props",
    subcategory: "Earned Runs Allowed",
    marketNames: [
      "Earned Runs O/U",
      "Pitcher Earned Runs Over/Under",
      "ERs Allowed",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["MLB"],
    resolutionStats: ["earned_runs"],
    relevantData: [
      "Pitcher ERA and recent ERA trend",
      "FIP (Fielding Independent Pitching) — better predictor than ERA",
      "WHIP trend",
      "Matchup: opponent runs scored per game",
      "Matchup: opponent OPS vs LHP/RHP",
      "Ballpark factor (Coors = more runs)",
      "Weather (wind, temperature)",
      "Innings pitched expectation (more IP = more ER risk)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Earned Runs — Last 8 Starts",
        description: "Game-by-game ER with IP annotated.",
      },
      {
        type: "bar",
        title: "ERA vs FIP",
        description:
          "Compare ERA (actual) to FIP (expected). If ERA >> FIP, regression likely.",
      },
    ],
    irrelevantData: [
      "Win/loss record",
      "Strikeouts (don't directly predict runs)",
      "Career ERA (recent form matters more)",
    ],
    analysisNotes:
      "Earned runs are about pitcher quality + matchup + environment. FIP is a better predictor than ERA because ERA includes luck (BABIP, sequencing). If a pitcher's ERA is much higher than FIP, expect improvement (and vice versa). Ballpark and weather are significant factors.",
  },
  {
    id: "mlb_hits_allowed",
    category: "Pitcher Props",
    subcategory: "Hits Allowed",
    marketNames: [
      "Hits Allowed O/U",
      "Pitcher Hits Allowed Over/Under",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["MLB"],
    resolutionStats: ["hits_allowed"],
    relevantData: [
      "Pitcher H/9 rate",
      "BABIP (Batting Average on Balls in Play) — luck factor",
      "Matchup: opponent team batting average",
      "Matchup: opponent contact rate",
      "Defense quality behind the pitcher",
      "Ground ball vs fly ball rate",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Hits Allowed — Last 8 Starts",
        description: "Game-by-game hits allowed.",
      },
    ],
    irrelevantData: [
      "Strikeout rate (K rate reduces hits somewhat but not perfectly correlated)",
      "Win/loss record",
    ],
    analysisNotes:
      "Hits allowed has more noise than strikeouts or walks because BABIP (luck on batted balls) is highly variable. A pitcher's BABIP normalizes around .290-.310 over time. If recent BABIP is extreme (.350+ or .240-), expect regression. Contact-heavy lineups (low K%) will accumulate more hits.",
  },
  {
    id: "mlb_walks_allowed",
    category: "Pitcher Props",
    subcategory: "Walks Allowed",
    marketNames: [
      "Walks Allowed O/U",
      "Pitcher Walks Over/Under",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["MLB"],
    resolutionStats: ["walks_allowed"],
    relevantData: [
      "Pitcher BB/9 rate and BB%",
      "First-pitch strike % (command indicator)",
      "Matchup: opponent walk rate (patient lineups draw walks)",
      "Recent control trend (are they wild lately?)",
      "Umpire zone (tight zone = more walks)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Walks — Last 8 Starts",
        description: "Game-by-game walks with first-pitch strike % annotated.",
      },
    ],
    irrelevantData: [
      "Strikeout numbers",
      "ERA",
      "Win/loss record",
    ],
    analysisNotes:
      "Walks are a command stat. Pitchers who throw fewer first-pitch strikes walk more batters. The umpire assignment matters — some umps have a tight zone that inflates walk counts. Discipline-heavy lineups (high OBP, low chase rate) draw more walks.",
  },
  {
    id: "mlb_pitches_thrown",
    category: "Pitcher Props",
    subcategory: "Pitches Thrown",
    marketNames: [
      "Pitches Thrown O/U",
      "Pitch Count O/U",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["MLB"],
    resolutionStats: ["pitches_thrown"],
    relevantData: [
      "Average pitch count per start",
      "Innings pitched trend",
      "Pitch efficiency (pitches per inning)",
      "Matchup: opponent at-bats per game",
      "Manager tendencies with pitch count",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Pitch Count — Last 8 Starts",
        description: "Game-by-game pitch count with IP annotated.",
      },
    ],
    irrelevantData: [
      "ERA",
      "Win/loss",
      "Batting stats",
    ],
    analysisNotes:
      "Pitch count is a workload prop. It depends on innings depth and efficiency. A pitcher who goes deep but is efficient (under 15 pitches/inning) might throw fewer total pitches than one who labors through 5 innings at 20 pitches/inning.",
  },
];

// ---------------------------------------------------------------------------
// 10. SPECIALTY PROPS
// ---------------------------------------------------------------------------

const specialtyProps: MarketDefinition[] = [
  {
    id: "nba_threes_made",
    category: "Specialty Props",
    subcategory: "Three-Pointers Made",
    marketNames: [
      "3-Pointers Made O/U",
      "Three Pointers Made Over/Under",
      "3PM",
      "Threes Made",
      "Made Threes",
    ],
    platforms: ["DraftKings", "FanDuel", "PrizePicks", "Underdog"],
    sports: ["NBA", "NCAAB"],
    resolutionStats: ["three_pointers_made"],
    relevantData: [
      "3PT makes per game trend",
      "3PT attempts per game (volume is key)",
      "3PT percentage trend (hot/cold streaks)",
      "Matchup: opponent 3PT defense / 3PT% allowed",
      "Matchup: how opponent defends the perimeter",
      "Home vs away 3PT splits",
      "Usage rate and shot distribution (% of shots from 3)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Three-Pointers Made — Last 15 Games",
        description:
          "Game-by-game 3PM with attempts overlaid. Show the prop line.",
      },
      {
        type: "scatter",
        title: "3PT Attempts vs 3PT Makes",
        description: "Volume vs output scatter to show conversion.",
      },
      {
        type: "distribution",
        title: "3PM Distribution This Season",
        description: "Histogram of 3PM counts with hit rate.",
      },
    ],
    irrelevantData: [
      "2-point FG stats (different shot type)",
      "Free throw numbers",
      "Rebounding",
      "Career 3PT% (recent volume/% matters more)",
    ],
    analysisNotes:
      "Three-pointers made is one of the most popular NBA props. The equation is simple: 3PM = 3PA x 3P%. High-volume shooters (8+ attempts per game) have a higher floor. A player shooting 38% on 10 attempts is more likely to hit 3+ threes than one shooting 42% on 5 attempts. Check if opponent gives up open threes.",
  },
  {
    id: "nhl_power_play_points",
    category: "Specialty Props",
    subcategory: "Power Play Points",
    marketNames: [
      "Power Play Points O/U",
      "PP Points",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NHL"],
    resolutionStats: ["power_play_points"],
    relevantData: [
      "Player PP points per game",
      "Team PP opportunities per game",
      "Team PP% (conversion rate)",
      "Player's role on PP unit (QB, trigger, net-front)",
      "Matchup: opponent PK% (poor PK = more PP goals)",
      "Matchup: opponent penalties per game (more PPs = more opportunities)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Power Play Points — Last 15 Games",
        description: "Game log of PP points.",
      },
      {
        type: "table",
        title: "PP Context",
        description:
          "Team PP%, opponent PK%, avg PP opportunities, player's PP role.",
      },
    ],
    irrelevantData: [
      "Even-strength stats (separate context)",
      "Penalty minutes",
      "Team record",
    ],
    analysisNotes:
      "Power play points are driven by opportunity (how many PPs?) and conversion (team PP%). Players on the first PP unit with a team that gets a lot of power plays are the best candidates. Opponent PK quality is the key matchup factor.",
  },
  {
    id: "nhl_faceoff_wins",
    category: "Specialty Props",
    subcategory: "Faceoff Wins",
    marketNames: [
      "Faceoff Wins O/U",
      "Player Faceoffs Won Over/Under",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NHL"],
    resolutionStats: ["faceoff_wins"],
    relevantData: [
      "Faceoff win % this season",
      "Faceoffs taken per game",
      "Matchup: opposing center's faceoff win %",
      "Special teams (PK/PP centers take extra faceoffs)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Faceoff Wins — Last 15 Games",
        description: "Game log with prop line.",
      },
    ],
    irrelevantData: [
      "Goals and assists",
      "Shots on goal",
      "Plus/minus",
    ],
    analysisNotes:
      "Faceoff props are niche but predictable. Elite faceoff men (55-60% win rate) who take 20+ faceoffs per game are very consistent. The key variable is how many faceoffs they take, which increases with special teams usage.",
  },
  {
    id: "soccer_shots_on_target",
    category: "Specialty Props",
    subcategory: "Shots on Target",
    marketNames: [
      "Shots on Target O/U",
      "Player Shots on Target",
      "SOT",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["SOCCER", "MLS"],
    resolutionStats: ["shots_on_target"],
    relevantData: [
      "Shots on target per 90 minutes",
      "Total shots per 90",
      "Shot accuracy (SOT / total shots)",
      "Minutes played (rotation/injury risk)",
      "Matchup: opponent shots on target conceded per game",
      "Playing position (strikers vs midfielders)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Shots on Target — Last 15 Matches",
        description: "Game log with prop line.",
      },
      {
        type: "scatter",
        title: "Total Shots vs Shots on Target",
        description: "Volume and accuracy relationship.",
      },
    ],
    irrelevantData: [
      "Goals scored (separate outcome)",
      "Assists",
      "Possession stats",
    ],
    analysisNotes:
      "Shots on target is one of soccer's most consistent player props. High-volume shooters who are accurate (not just hopeful long-range shots) are the best targets. The line is usually 0.5-1.5 for most players, 2.5+ for elite strikers.",
  },
  {
    id: "soccer_corners",
    category: "Specialty Props",
    subcategory: "Corners",
    marketNames: [
      "Total Corners O/U",
      "Team Corners O/U",
      "Corner Kicks",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["SOCCER", "MLS"],
    resolutionStats: ["corners"],
    relevantData: [
      "Each team's corners per game average",
      "Each team's corners conceded per game",
      "Playing style (attacking teams win more corners)",
      "Matchup: how the opponent defends (deep block = more corners for the attacker)",
      "Home vs away corner splits",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Corners Per Game — Both Teams",
        description: "Average corners won and conceded for each team.",
      },
      {
        type: "distribution",
        title: "Total Corners Distribution",
        description: "Histogram of combined corners in each team's matches.",
      },
    ],
    irrelevantData: [
      "Goals scored (weakly correlated with corners)",
      "Individual player stats",
      "Cards",
    ],
    analysisNotes:
      "Corner props are popular in soccer. Attacking teams that face deep-defending opponents tend to win lots of corners. The line is usually 8.5-11.5 for total corners. Check the specific matchup dynamic — a team expected to dominate possession against a bus-parking team will rack up corners.",
  },
  {
    id: "soccer_cards",
    category: "Specialty Props",
    subcategory: "Cards (Yellow/Red)",
    marketNames: [
      "Total Cards O/U",
      "Player to be Shown a Card",
      "Total Booking Points",
      "Yellow Cards O/U",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["SOCCER", "MLS"],
    resolutionStats: ["cards"],
    relevantData: [
      "Referee card average (most important factor)",
      "Each team's fouls per game and cards per game",
      "Rivalry factor (derbies = more cards)",
      "Individual player card rate (for player card props)",
      "Match importance / stakes",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Cards Per Game — Referee & Teams",
        description: "Referee's card average vs both teams' card averages.",
      },
      {
        type: "table",
        title: "Card Context",
        description:
          "Referee name and card stats, team foul rates, rivalry factor.",
      },
    ],
    irrelevantData: [
      "Scoring stats",
      "Possession stats",
      "Individual player performance stats",
    ],
    analysisNotes:
      "The referee is the #1 factor for card props. Some refs average 6+ cards per game, others average 3. Always check the referee assignment first. Rivalries and high-stakes matches produce more cards. For individual player cards, check their yellow card rate per 90.",
  },
  {
    id: "soccer_assists",
    category: "Specialty Props",
    subcategory: "Soccer Assists",
    marketNames: [
      "Assists O/U",
      "Player Assists",
      "To Record an Assist",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["SOCCER", "MLS"],
    resolutionStats: ["assists"],
    relevantData: [
      "Assists per 90 minutes",
      "Key passes per 90 (pre-assist passes)",
      "Crosses per 90 (for wingers/fullbacks)",
      "Teammates' finishing quality",
      "Set piece taker (corners, free kicks generate assists)",
      "Minutes played expectation",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Assists — Last 15 Matches",
        description: "Game log with assists.",
      },
      {
        type: "table",
        title: "Assist Context",
        description:
          "Key passes/90, set piece duties, teammates' goal conversion.",
      },
    ],
    irrelevantData: [
      "Goals scored",
      "Defensive stats",
      "Possession %",
    ],
    analysisNotes:
      "Soccer assists are rare — even elite playmakers average 0.3-0.5 per 90. Set piece takers (corner kick, free kick) have an edge because those deliveries lead to goals. Key passes per 90 is a better predictor than past assists because it measures chance creation regardless of teammate finishing.",
  },
  {
    id: "nfl_kicking",
    category: "Specialty Props",
    subcategory: "NFL Kicking",
    marketNames: [
      "Total Field Goals O/U",
      "Longest Field Goal O/U",
      "Total PATs O/U",
      "FG Made 50+ Yards",
      "Kicking Points O/U",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["field_goals", "extra_points"],
    relevantData: [
      "Kicker's FG attempts per game",
      "Team's red zone efficiency (low TD rate = more FG attempts)",
      "Matchup: opponent red zone defense (forcing FGs)",
      "Weather (wind affects FG distance and accuracy)",
      "Venue (indoor/outdoor, altitude)",
      "Game total and spread (more scoring = more kicker points)",
    ],
    idealCharts: [
      {
        type: "bar",
        title: "Field Goals & PATs — Last 8 Games",
        description: "FGs and PATs per game with total kicking points.",
      },
      {
        type: "table",
        title: "Kicking Context",
        description:
          "Team RZ efficiency, opponent RZ D, weather, venue, FG attempt rate.",
      },
    ],
    irrelevantData: [
      "Kicker's career FG%",
      "Team defensive stats (unless related to game total)",
      "Individual offensive player stats",
    ],
    analysisNotes:
      "Kicker props depend on the team's offense stalling in FG range and the weather. Teams that move the ball but struggle to score TDs (low RZ TD rate) create more FG opportunities. Wind is the biggest factor for distance props.",
  },
  {
    id: "nfl_longest_completion",
    category: "Specialty Props",
    subcategory: "NFL Longest Play",
    marketNames: [
      "Longest Completion O/U",
      "Longest Rush O/U",
      "Longest Reception O/U",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NFL"],
    resolutionStats: ["longest_play"],
    relevantData: [
      "Player's big play rate (plays of 20+, 40+ yards)",
      "Air yards per attempt (deep ball tendency)",
      "Matchup: opponent explosive play rate allowed",
      "Receiver speed / ability to create separation deep",
      "Game script (trailing = more deep shots)",
    ],
    idealCharts: [
      {
        type: "distribution",
        title: "Longest Play Distribution",
        description: "Histogram of longest completion/rush/reception per game.",
      },
    ],
    irrelevantData: [
      "Total yards (doesn't predict longest play well)",
      "Short-passing stats",
    ],
    analysisNotes:
      "Longest play props are high variance. One play determines it. Deep ball tendency and matchup against a bad secondary are the main factors. Trailing teams take more deep shots, which benefits the over.",
  },
];

// ---------------------------------------------------------------------------
// 11. SPREAD & MONEYLINE (Core Game Markets)
// ---------------------------------------------------------------------------

const coreGameMarkets: MarketDefinition[] = [
  {
    id: "point_spread",
    category: "Core Game Markets",
    subcategory: "Point Spread",
    marketNames: [
      "Spread",
      "Point Spread",
      "Against the Spread",
      "ATS",
      "Handicap",
      "Run Line",
      "Puck Line",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF", "SOCCER"],
    resolutionStats: ["final_margin"],
    relevantData: [
      "ATS record this season",
      "Recent ATS trend (last 5-10 games)",
      "Head-to-head ATS history",
      "Home vs away ATS splits",
      "Point differential trend (margin of victory)",
      "Key injuries and their impact on the line",
      "Rest advantages (back-to-back, short week)",
      "Motivation factor (rivalry, revenge, elimination)",
      "Closing line value (has the line moved?)",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Margin of Victory — Last 10 Games",
        description:
          "Actual margin of victory each game with the current spread drawn.",
      },
      {
        type: "bar",
        title: "ATS Performance",
        description:
          "Cover rate overall, home/away, as favorite/underdog.",
      },
      {
        type: "table",
        title: "Key Context",
        description:
          "H2H record, injuries, rest, point differential, SOS.",
      },
    ],
    irrelevantData: [
      "Individual player props (unless key injury)",
      "Win/loss record without margin context",
      "Opponent's scoring per game alone (need defensive comparison)",
    ],
    analysisNotes:
      "The spread is the market's estimated margin. ATS records are the most relevant historical data. Point differential is a better predictor of future performance than raw W/L record. Line movement tells you where the money is going. For MLB (run line 1.5) and NHL (puck line 1.5), the fixed spread creates different dynamics.",
  },
  {
    id: "moneyline",
    category: "Core Game Markets",
    subcategory: "Moneyline",
    marketNames: [
      "Moneyline",
      "ML",
      "To Win",
      "Match Result",
      "1X2",
    ],
    platforms: ["DraftKings", "FanDuel"],
    sports: ["NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF", "SOCCER", "MLS"],
    resolutionStats: ["win_loss"],
    relevantData: [
      "Win percentage this season (home/away split)",
      "Recent form (last 5-10 games)",
      "Head-to-head record",
      "Power ratings / Elo ratings",
      "Key injuries",
      "Rest / scheduling advantages",
      "Pythagorean win % (expected wins based on run/point differential)",
      "Home/away performance",
    ],
    idealCharts: [
      {
        type: "line",
        title: "Recent Results — Last 10 Games",
        description: "W/L streak with margin annotated.",
      },
      {
        type: "bar",
        title: "Win Rate Comparison",
        description:
          "Home team win% at home vs away team win% on the road.",
      },
      {
        type: "table",
        title: "Key Context",
        description:
          "Record, point diff, H2H, injuries, Pythagorean win%, implied probability from odds.",
      },
    ],
    irrelevantData: [
      "ATS record (different market)",
      "Individual player props",
      "Season totals (too high-level)",
    ],
    analysisNotes:
      "Moneyline bets are about who wins. The implied probability from the odds tells you what the market thinks. Compare to your own estimate. Pythagorean wins and point differential are better predictors than record alone. Upsets in MLB are common (~43% underdog win rate) — it's a high-variance sport.",
  },
];

// ---------------------------------------------------------------------------
// MASTER TAXONOMY — All markets combined
// ---------------------------------------------------------------------------

export const MARKET_TAXONOMY: MarketDefinition[] = [
  ...standardStatProps,
  ...firstScorerProps,
  ...anytimeScorerProps,
  ...multiStatProps,
  ...gameProps,
  ...periodProps,
  ...futuresProps,
  ...defensiveProps,
  ...pitcherProps,
  ...specialtyProps,
  ...coreGameMarkets,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a market definition by fuzzy matching against market names */
export function findMarket(
  query: string,
  sport?: Sport,
): MarketDefinition | undefined {
  const q = query.toLowerCase().trim();
  return MARKET_TAXONOMY.find((m) => {
    const nameMatch = m.marketNames.some(
      (n) =>
        n.toLowerCase().includes(q) || q.includes(n.toLowerCase()),
    );
    const sportMatch = sport ? m.sports.includes(sport) : true;
    return nameMatch && sportMatch;
  });
}

/** Get all markets for a given sport */
export function getMarketsForSport(sport: Sport): MarketDefinition[] {
  return MARKET_TAXONOMY.filter((m) => m.sports.includes(sport));
}

/** Get all markets in a given category */
export function getMarketsByCategory(category: string): MarketDefinition[] {
  return MARKET_TAXONOMY.filter(
    (m) => m.category.toLowerCase() === category.toLowerCase(),
  );
}

/** Get all unique categories */
export function getCategories(): string[] {
  return Array.from(new Set(MARKET_TAXONOMY.map((m) => m.category)));
}

/**
 * Given extracted bet details, find the best matching market definition.
 * This is the primary function used by the analysis pipeline.
 */
export function matchMarket(
  betType: string,
  sport: string,
  marketName?: string,
  playerStats?: string[],
): MarketDefinition | undefined {
  const sportUpper = sport.toUpperCase() as Sport;

  // 1. Try exact market name match first
  if (marketName) {
    const exact = findMarket(marketName, sportUpper);
    if (exact) return exact;
  }

  // 2. Try matching by resolution stats
  if (playerStats && playerStats.length > 0) {
    const statMatch = MARKET_TAXONOMY.find(
      (m) =>
        m.sports.includes(sportUpper) &&
        playerStats.some((s) =>
          m.resolutionStats.some(
            (rs) =>
              rs.toLowerCase().includes(s.toLowerCase()) ||
              s.toLowerCase().includes(rs.toLowerCase()),
          ),
        ),
    );
    if (statMatch) return statMatch;
  }

  // 3. Try matching by bet type
  const betTypeMap: Record<string, string> = {
    moneyline: "moneyline",
    spread: "point_spread",
    over_under: "game_total",
    player_prop: "", // need more context
    game_prop: "", // need more context
  };

  const mappedId = betTypeMap[betType.toLowerCase()];
  if (mappedId) {
    const found = MARKET_TAXONOMY.find(
      (m) => m.id === mappedId && m.sports.includes(sportUpper),
    );
    if (found) return found;
  }

  return undefined;
}
