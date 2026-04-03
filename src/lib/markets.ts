/**
 * Domain-specific prop market intelligence.
 *
 * Maps common betting markets to:
 * - The specific stats that actually matter for that bet
 * - What charts to build
 * - Context to give the AI for smarter summaries
 *
 * This is the "sports brain" — it knows that first basket = tip-off,
 * that pitcher strikeouts depend on opponent K%, etc.
 */

export interface MarketIntelligence {
  /** Short name for the market */
  name: string;
  /** The primary stat to track in game logs */
  primaryStat: string;
  /** Additional stats that are relevant */
  supportingStats: string[];
  /** What charts to build (templates) */
  chartTypes: ChartTemplate[];
  /** Context for AI summary — what makes this bet smart/dumb */
  analysisContext: string;
  /** Specific data to request that generic code wouldn't know about */
  dataHints: string[];
}

export interface ChartTemplate {
  type: "trend" | "comparison" | "hitRate" | "splits" | "matchup" | "distribution";
  title: string;
  description: string;
}

// ── NBA Markets ────────────────────────────────────────────────────

const NBA_MARKETS: Record<string, MarketIntelligence> = {
  "first_basket": {
    name: "First Basket Scorer",
    primaryStat: "pts",
    supportingStats: ["first_quarter_pts", "usage_rate", "starter_status", "tip_off"],
    chartTypes: [
      { type: "comparison", title: "First Quarter Scoring", description: "Average 1Q points — who gets going early?" },
      { type: "trend", title: "Recent Scoring Starts", description: "Points in the first 5 minutes of recent games" },
      { type: "matchup", title: "Position Matchup", description: "How this player's position scores early against opponent" },
    ],
    analysisContext: `First basket depends on: (1) Does the team win the tip-off? Check center matchup. (2) Who takes the first shot? Look at first-quarter usage rate and shot attempts. (3) Can they finish? First-shot FG% matters more than overall FG%. Players who drive to the basket have higher first-basket rates than jump shooters. Also check if player starts — bench players rarely score first.`,
    dataHints: ["first_quarter_scoring", "starter_status", "usage_rate_early"],
  },
  "points": {
    name: "Points",
    primaryStat: "pts",
    supportingStats: ["min", "fga", "fta", "usage_rate"],
    chartTypes: [
      { type: "trend", title: "Points Trend", description: "Game-by-game scoring with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "splits", title: "Home/Away Scoring", description: "Venue split for scoring" },
      { type: "matchup", title: "vs Opponent Defense", description: "How opponent defends this position" },
    ],
    analysisContext: `Points depend on: minutes played (is player healthy/in foul trouble risk?), shot attempts (usage rate), free throw attempts (are they aggressive?), pace of game (faster pace = more possessions = more points), and opponent defensive rating at this position. A player averaging 25 PPG on a team that plays slow may struggle against an elite defense.`,
    dataHints: ["minutes_played", "shot_attempts", "opponent_defensive_rating"],
  },
  "rebounds": {
    name: "Rebounds",
    primaryStat: "reb",
    supportingStats: ["oreb", "dreb", "min", "opponent_reb_rate"],
    chartTypes: [
      { type: "trend", title: "Rebounding Trend", description: "Game-by-game boards with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "matchup", title: "Opponent Rebounding Allowed", description: "Does opponent give up boards?" },
    ],
    analysisContext: `Rebounds depend on: player's position and role (center/PF get more), minutes played, opponent's rebounding rate (bad rebounding teams give up more boards), pace (more misses = more rebounds in fast games), and whether the player's teammates are also strong rebounders (competition for boards). Blowouts can reduce minutes for starters.`,
    dataHints: ["offensive_rebounds", "defensive_rebounds", "opponent_rebound_rate"],
  },
  "assists": {
    name: "Assists",
    primaryStat: "ast",
    supportingStats: ["min", "turnover", "usage_rate", "teammate_fg_pct"],
    chartTypes: [
      { type: "trend", title: "Assists Trend", description: "Game-by-game dimes with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "comparison", title: "Assist-to-Turnover", description: "Playmaking efficiency trend" },
    ],
    analysisContext: `Assists depend on: player's role (point guard vs off-ball), pace of game, teammate shooting percentage (teammates hitting shots = more assists), opponent's ability to force turnovers, and game script (blowouts reduce assist opportunities for starters). A high-usage scorer often has lower assists than a pure facilitator.`,
    dataHints: ["turnovers", "teammate_shooting", "opponent_turnover_rate"],
  },
  "three_pointers": {
    name: "Three Pointers Made",
    primaryStat: "fg3m",
    supportingStats: ["fg3a", "fg3_pct", "min"],
    chartTypes: [
      { type: "trend", title: "Threes Made Trend", description: "Game-by-game threes with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "distribution", title: "Three-Point Distribution", description: "How many threes per game — clustering around the line?" },
    ],
    analysisContext: `Three-pointers are high-variance. Key factors: attempts matter more than percentage (volume shooters hit lines more consistently), opponent 3PT defense (do they close out well?), home/away split (shooting is often better at home), and game script (trailing teams shoot more threes). A player who attempts 8 threes per game at 35% is more reliable than one attempting 4 at 40%.`,
    dataHints: ["three_point_attempts", "three_point_percentage", "opponent_3pt_defense"],
  },
  "steals": {
    name: "Steals",
    primaryStat: "stl",
    supportingStats: ["min", "opponent_turnover_rate"],
    chartTypes: [
      { type: "trend", title: "Steals Trend", description: "Game-by-game steals" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
    ],
    analysisContext: `Steals are very low-volume and high-variance — even elite defenders average 1-2 per game. Key factors: opponent's turnover rate (sloppy teams give up more steals), minutes played, and the player's defensive role (on-ball defenders get more steals). This is one of the hardest props to predict consistently.`,
    dataHints: ["opponent_turnovers"],
  },
  "blocks": {
    name: "Blocks",
    primaryStat: "blk",
    supportingStats: ["min", "opponent_fg_attempts_paint"],
    chartTypes: [
      { type: "trend", title: "Blocks Trend", description: "Game-by-game blocks" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
    ],
    analysisContext: `Blocks depend on: player's rim protection ability, opponent's tendency to attack the paint (teams that shoot lots of threes give fewer block opportunities), minutes played, and foul trouble risk (aggressive shot-blockers foul more). Like steals, blocks are high-variance.`,
    dataHints: ["opponent_paint_attempts"],
  },
  "pts_reb_ast": {
    name: "Pts+Reb+Ast",
    primaryStat: "pra",
    supportingStats: ["pts", "reb", "ast", "min"],
    chartTypes: [
      { type: "trend", title: "PRA Trend", description: "Combined Pts+Reb+Ast with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "comparison", title: "PRA Breakdown", description: "Which category contributes most?" },
    ],
    analysisContext: `PRA (Points + Rebounds + Assists) is a combined stat that rewards all-around players. Because it combines three stats, it tends to be more consistent than any single stat — the variance smooths out. Key question: is the line set close to the player's average? If average PRA is 35 and line is 34.5, that's tight. Look at minutes risk (blowouts) and matchup difficulty.`,
    dataHints: ["minutes_played", "game_score"],
  },
  "double_double": {
    name: "Double-Double",
    primaryStat: "pts",
    supportingStats: ["reb", "ast", "min"],
    chartTypes: [
      { type: "hitRate", title: "Double-Double Rate", description: "How often they record a DD" },
      { type: "trend", title: "Closest Categories", description: "Which two stats are most likely to hit 10+" },
    ],
    analysisContext: `A double-double requires 10+ in two categories. For most players this means points + rebounds (big men) or points + assists (guards). Check which two categories the player most commonly hits 10+ in, and how close they typically get. A center averaging 14 pts and 11 reb has a high DD rate. A guard averaging 20 pts and 6 ast has a low one unless they also rebound.`,
    dataHints: ["double_double_count"],
  },
  "first_half_points": {
    name: "First Half Points",
    primaryStat: "pts",
    supportingStats: ["first_half_scoring", "pace", "opponent_first_half_defense"],
    chartTypes: [
      { type: "trend", title: "First Half Scoring", description: "Player's 1H points in recent games" },
      { type: "comparison", title: "1H vs 2H Split", description: "Does this player front-load or back-load scoring?" },
      { type: "hitRate", title: "1H Hit Rate", description: "How often they exceed this line in the first half" },
    ],
    analysisContext: `First half player points are about how a player distributes their scoring. Some players come out aggressive in Q1-Q2 and coast in the second half (e.g. LeBron historically front-loads). Others are 4th quarter scorers. Key factors: (1) Does the player score more in the first or second half? Look at quarter-by-quarter splits if available. (2) Game script prediction — if this is expected to be a blowout, starters may rest in the 2nd half, making 1H the only window. (3) Opponent's first-half defensive intensity vs second-half adjustments. (4) Pace of the first half — some teams start fast, others slow.`,
    dataHints: ["first_half_scoring_rate", "quarter_splits"],
  },
  "first_quarter_total": {
    name: "First Quarter Total",
    primaryStat: "first_quarter_score",
    supportingStats: ["pace", "scoring_first_5_min", "opponent_1q_defense"],
    chartTypes: [
      { type: "trend", title: "1Q Team Scoring", description: "First quarter points in recent games" },
      { type: "comparison", title: "Both Teams 1Q Average", description: "Combined first quarter scoring" },
      { type: "hitRate", title: "1Q Over Rate", description: "How often the 1Q total exceeds this line" },
    ],
    analysisContext: `First quarter totals are a specific sub-market. Key factors: (1) Some teams are notorious slow starters — they come out flat in Q1 then adjust. Others sprint out of the gate. (2) Pace in the first quarter is often different from full-game pace — some coaches script the first few possessions. (3) Starters always play Q1 (no bench rotation yet), so star power matters more. (4) Teams coming off rest vs back-to-backs often show different Q1 energy. (5) First-quarter scoring averages are NOT simply full-game average divided by 4 — the distribution is uneven.`,
    dataHints: ["first_quarter_scores", "pace_first_quarter"],
  },
  "first_half_total": {
    name: "First Half Total",
    primaryStat: "first_half_score",
    supportingStats: ["pace", "1h_scoring_avg", "opponent_1h_defense"],
    chartTypes: [
      { type: "trend", title: "1H Combined Scoring", description: "First half totals in recent games" },
      { type: "comparison", title: "1H vs Full Game Ratio", description: "What percentage of scoring happens in the first half?" },
      { type: "hitRate", title: "1H Over Rate", description: "How often the 1H total exceeds this line" },
    ],
    analysisContext: `First half totals differ from full game for several reasons: (1) Starters play most of the first half, so the talent on the court is higher. (2) There's no garbage time scoring that inflates full-game totals in blowouts. (3) Some teams make major halftime defensive adjustments (coaches like Tom Thibodeau are known for this). (4) Track each team's first-half scoring average vs their full-game average to see the ratio — it's usually not exactly 50%. (5) Foul trouble hasn't accumulated yet, so the game flows differently.`,
    dataHints: ["first_half_scoring", "halftime_adjustment_tendency"],
  },
  "alt_spread": {
    name: "Alternate Spread",
    primaryStat: "margin",
    supportingStats: ["margin_distribution", "blowout_rate", "close_game_rate"],
    chartTypes: [
      { type: "distribution", title: "Margin of Victory Distribution", description: "How often games land in each margin bucket" },
      { type: "trend", title: "Recent Margins", description: "Game-by-game margin of victory" },
      { type: "hitRate", title: "Cover Rate at This Line", description: "How often they'd cover this alternate line" },
    ],
    analysisContext: `Alternate spreads offer better odds for wider margins. The key insight is margin DISTRIBUTION — not averages. A team that wins by exactly 7 points every game is very different from one that alternates between 20-point wins and 3-point losses, even if the average margin is the same. For large alt spreads (+200 or higher): (1) How often does this team blow opponents out? Look at blowout rate (wins by 15+). (2) What's the opponent's tendency to get blown out or keep games close? (3) Is there a pace mismatch that could lead to a high-margin outcome? (4) Rest advantage can lead to blowouts. (5) Alt spreads are often +EV when the market underestimates blowout probability in mismatched games.`,
    dataHints: ["margin_distribution", "blowout_rate", "opponent_blowout_rate"],
  },
  "player_combo": {
    name: "Player Combo Prop",
    primaryStat: "pts",
    supportingStats: ["team_win_pct", "player_stats_in_wins", "player_stats_in_losses"],
    chartTypes: [
      { type: "comparison", title: "Stats in Wins vs Losses", description: "Does this player perform better when the team wins?" },
      { type: "hitRate", title: "Both Legs Hit Rate", description: "How often both conditions are met simultaneously" },
    ],
    analysisContext: `Player combo props (e.g. "Brunson 25+ pts AND Knicks win") are CORRELATED bets, which is the key insight most bettors miss. When a star player scores well, the team is more likely to win — so the two legs aren't independent events. Sportsbooks know this and price it in, but not always accurately. Key analysis: (1) What are the player's stats in WINS specifically vs losses? A player averaging 26 PPG might average 30 in wins and 20 in losses. (2) How likely is the team to win? If they're heavy favorites, the combo is almost as likely as the player prop alone. (3) Does the player carry harder in close games or coast in blowouts? (4) The correlation benefit: if you think the team wins, the player prop is more likely to hit too, so the combo odds may offer value.`,
    dataHints: ["stats_in_wins", "stats_in_losses", "team_win_probability"],
  },
  "sgp": {
    name: "Same Game Parlay",
    primaryStat: "correlation",
    supportingStats: ["team_totals", "player_game_stats", "pace"],
    chartTypes: [
      { type: "comparison", title: "Leg Correlation", description: "Are these legs working together or against each other?" },
    ],
    analysisContext: `Same Game Parlays (SGPs) are where sportsbooks make the most money because bettors treat legs as independent when they're often correlated. KEY INSIGHT: (1) "Team wins" + "Over total" + "Star player scores a lot" are all POSITIVELY correlated — if one hits, the others are more likely too. Books should give you BETTER odds for this correlation, but they often give WORSE odds. (2) NEGATIVE correlation example: "Under 210" + "Player Over 30 pts" — if the game is low-scoring, it's harder for any individual to score 30+. (3) The best SGPs exploit POSITIVE correlation that the book underprices. (4) Never build an SGP where legs work against each other. (5) The more legs you add, the more the house edge compounds — 2-3 leg SGPs are more viable than 5+ leg ones.`,
    dataHints: ["leg_correlation_analysis"],
  },
};

// ── NFL Markets ────────────────────────────────────────────────────

const NFL_MARKETS: Record<string, MarketIntelligence> = {
  "anytime_td": {
    name: "Anytime Touchdown Scorer",
    primaryStat: "touchdowns",
    supportingStats: ["red_zone_targets", "goal_line_carries", "snap_pct", "td_rate"],
    chartTypes: [
      { type: "trend", title: "TD Trend", description: "Game-by-game touchdowns" },
      { type: "hitRate", title: "TD Rate", description: "How often they score in a game" },
      { type: "matchup", title: "Red Zone Opportunity", description: "Red zone usage and opponent red zone defense" },
    ],
    analysisContext: `Anytime TD scorer props require understanding RED ZONE usage, not just general stats. Key factors: (1) Red zone targets/carries — this is THE stat. A receiver with 5 red zone targets per game is far more likely to score than one with 1, regardless of total yards. (2) Goal-line carries for RBs — some teams use a specific short-yardage back. (3) Touchdown dependency — some players score on long plays (less predictable) vs goal-line situations (more predictable). (4) Opponent red zone defense — how often do they allow TDs vs field goals in the red zone? (5) Game script — if the team is expected to be trailing, passing TDs are more likely; if leading, rushing TDs. (6) TD rate per game is the baseline — a player scoring in 60% of games at -120 is different value than one scoring in 40% at -120. (7) Touchdowns are relatively rare events, so even the best TD scorers don't score every game.`,
    dataHints: ["red_zone_targets", "red_zone_carries", "goal_line_usage", "td_rate_per_game", "opponent_red_zone_td_rate"],
  },
  "passing_yards": {
    name: "Passing Yards",
    primaryStat: "passingYards",
    supportingStats: ["attempts", "completions", "opponent_pass_defense", "pace"],
    chartTypes: [
      { type: "trend", title: "Passing Yards Trend", description: "Game-by-game yards with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "matchup", title: "vs Opponent Pass Defense", description: "How many yards does this defense give up?" },
    ],
    analysisContext: `Passing yards depend on: (1) Pass attempts — volume is king. A QB throwing 35+ times will hit most yardage lines. (2) Game script — trailing teams throw more, leading teams run more. Vegas spread is a proxy for game script. (3) Opponent pass defense rank and yards allowed per game. (4) Weather — wind and rain crush passing numbers. (5) Pace of play — up-tempo offenses get more plays. (6) Receiver health — missing the WR1 can reduce efficiency. (7) Indoor vs outdoor — dome games are more pass-friendly.`,
    dataHints: ["pass_attempts", "opponent_pass_yards_allowed", "game_script_projection"],
  },
  "rushing_yards": {
    name: "Rushing Yards",
    primaryStat: "rushingYards",
    supportingStats: ["carries", "yards_per_carry", "opponent_rush_defense"],
    chartTypes: [
      { type: "trend", title: "Rushing Yards Trend", description: "Game-by-game yards with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "matchup", title: "vs Opponent Run Defense", description: "How many yards does this defense give up on the ground?" },
    ],
    analysisContext: `Rushing yards depend on: (1) Carries — more carries = more yards, but carries depend on game script (leading teams run more). (2) Opponent run defense rank and yards allowed per game. (3) Offensive line quality — the RB matters less than the line in short-yardage. (4) Game script — if the team is expected to lead (negative spread), they'll run more. (5) Split backfield risk — is this a bell-cow back or a committee? Check snap percentage. (6) Weather — rain/snow HELPS rushing because it hurts passing, so teams run more.`,
    dataHints: ["carries", "opponent_rush_yards_allowed", "snap_percentage", "game_script"],
  },
  "receiving_yards": {
    name: "Receiving Yards",
    primaryStat: "receivingYards",
    supportingStats: ["targets", "receptions", "target_share", "opponent_coverage"],
    chartTypes: [
      { type: "trend", title: "Receiving Yards Trend", description: "Game-by-game yards with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "matchup", title: "Cornerback Matchup", description: "Who's covering this receiver?" },
    ],
    analysisContext: `Receiving yards depend on: (1) Target share — what percentage of team passes go to this player? This is more stable than raw yards. (2) Opponent cornerback matchup — is the CB elite or a weak spot? Slot receivers often avoid the top CB. (3) Game script — trailing teams throw more, benefiting all receivers. (4) QB connection — some WR-QB combos have higher target rates. (5) Air yards — a WR who runs deep routes has higher variance (fewer catches but big plays) vs a slot guy who catches 8 short passes consistently. (6) Weather hurts deep passing more than short passing.`,
    dataHints: ["targets", "target_share", "air_yards", "opponent_cb_ranking"],
  },
};

// ── MLB Markets (continued) ────────────────────────────────────────

const MLB_MARKETS: Record<string, MarketIntelligence> = {
  "strikeouts_pitching": {
    name: "Pitcher Strikeouts",
    primaryStat: "strikeOuts",
    supportingStats: ["inningsPitched", "pitchCount", "opponent_k_rate", "swinging_strike_pct"],
    chartTypes: [
      { type: "trend", title: "Strikeout Trend", description: "Game-by-game Ks with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "matchup", title: "Opponent Strikeout Rate", description: "Does this lineup strike out a lot?" },
      { type: "comparison", title: "Ks per Inning", description: "K rate — does pitcher go deep into games?" },
    ],
    analysisContext: `Pitcher strikeouts depend on: (1) K/9 rate — the pitcher's strikeout ability, (2) opponent team strikeout rate — a team that Ks 25% of the time gives more Ks than one at 18%, (3) innings pitched — a pitcher who only goes 5 innings has fewer K opportunities than one going 7, (4) pitch count limits for early-season or returning pitchers, (5) bullpen availability — managers may pull starters earlier if the pen is fresh.`,
    dataHints: ["k_per_9", "opponent_k_rate", "avg_innings_per_start", "pitch_count"],
  },
  "hits_pitcher": {
    name: "Hits Allowed (Pitcher)",
    primaryStat: "hits",
    supportingStats: ["inningsPitched", "opponent_avg", "whip"],
    chartTypes: [
      { type: "trend", title: "Hits Allowed Trend", description: "Game-by-game hits allowed" },
      { type: "hitRate", title: "Hit Rate", description: "How often they stay under this line" },
      { type: "matchup", title: "Opponent Batting Average", description: "How well does this lineup hit?" },
    ],
    analysisContext: `Hits allowed depends on the pitcher's WHIP and opponent batting average. A pitcher facing a team hitting .280 will give up more hits than against a .230 team. Also consider: ground ball rate (ground ball pitchers give up more singles but fewer extra-base hits), weather (hot/humid = ball carries), and ballpark factors.`,
    dataHints: ["whip", "opponent_batting_avg", "ground_ball_rate"],
  },
  "hits": {
    name: "Hits (Batter)",
    primaryStat: "hits",
    supportingStats: ["atBats", "avg", "opponent_pitcher_whip"],
    chartTypes: [
      { type: "trend", title: "Hits Trend", description: "Game-by-game hits with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "matchup", title: "vs Starting Pitcher", description: "Batting average against this type of pitcher" },
      { type: "splits", title: "Home/Away & L/R Splits", description: "Performance by venue and pitcher handedness" },
    ],
    analysisContext: `Batter hits depend on: batting average (most important), at-bats (batting order position determines plate appearances), opponent pitcher quality (low WHIP pitcher = fewer hits), handedness matchup (L/R splits matter in baseball more than any other sport), ballpark factor, and whether facing the starter or bullpen.`,
    dataHints: ["batting_avg", "at_bats", "handedness_splits", "opponent_pitcher_era"],
  },
  "home_runs": {
    name: "Home Runs",
    primaryStat: "homeRuns",
    supportingStats: ["atBats", "slugging", "iso", "barrel_rate"],
    chartTypes: [
      { type: "trend", title: "HR Trend", description: "Game-by-game HRs" },
      { type: "hitRate", title: "Hit Rate", description: "How often they hit a HR" },
      { type: "matchup", title: "Ballpark Factor", description: "Is this a hitter-friendly park?" },
    ],
    analysisContext: `Home runs are the most volatile prop in baseball. Even elite sluggers only homer in ~10-15% of games. Key factors: ISO (isolated power), barrel rate, opponent pitcher's HR/9 rate, ballpark dimensions and altitude (Coors Field inflates HRs massively), wind direction, and handedness matchup. The over on 0.5 HRs is almost always -EV unless the matchup is extreme.`,
    dataHints: ["iso_power", "barrel_rate", "ballpark_hr_factor", "opponent_hr_per_9"],
  },
  "rbi": {
    name: "RBIs",
    primaryStat: "rbi",
    supportingStats: ["atBats", "avg_risp", "batting_order"],
    chartTypes: [
      { type: "trend", title: "RBI Trend", description: "Game-by-game RBIs with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "comparison", title: "RBI Opportunities", description: "Depends on who bats before them" },
    ],
    analysisContext: `RBIs are heavily dependent on context — a great hitter batting 1st or 9th gets fewer RBI opportunities than a mediocre hitter batting 4th with runners on. Key factors: batting order position (3-5 hitters get most RBI chances), team's on-base percentage (runners on base = RBI opportunities), batting average with runners in scoring position (RISP), and opponent pitcher quality.`,
    dataHints: ["batting_order_position", "avg_with_risp", "team_obp"],
  },
  "total_bases": {
    name: "Total Bases",
    primaryStat: "totalBases",
    supportingStats: ["hits", "doubles", "triples", "homeRuns", "slugging"],
    chartTypes: [
      { type: "trend", title: "Total Bases Trend", description: "Game-by-game total bases with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "distribution", title: "Total Bases Distribution", description: "Clustering around the line" },
    ],
    analysisContext: `Total bases = singles(1) + doubles(2) + triples(3) + HRs(4). It rewards extra-base hits. A player who goes 1-4 with a single gets 1 TB, but 1-4 with a HR gets 4 TB. Key factors: slugging percentage, ISO (power), opponent pitcher quality, and ballpark. Players with high SLG and ISO are more likely to exceed TB lines because one HR can cover the entire line.`,
    dataHints: ["slugging", "extra_base_hit_rate"],
  },
  "stolen_bases": {
    name: "Stolen Bases",
    primaryStat: "stolenBases",
    supportingStats: ["sb_attempts", "sb_success_rate", "on_base_pct"],
    chartTypes: [
      { type: "trend", title: "SB Trend", description: "Game-by-game stolen bases" },
      { type: "hitRate", title: "Hit Rate", description: "How often they steal a base" },
      { type: "matchup", title: "Opponent Catcher", description: "Does the catcher throw out runners?" },
    ],
    analysisContext: `Stolen bases require: (1) getting on base first (OBP matters), (2) speed and steal attempt rate, (3) opponent catcher's pop time and caught-stealing rate, (4) opponent pitcher's ability to hold runners (slide step, pickoff moves), (5) game situation (teams don't steal when up/down big). Even elite base stealers only attempt in ~30% of games.`,
    dataHints: ["steal_attempt_rate", "opponent_catcher_cs_rate"],
  },
  "walks_pitcher": {
    name: "Walks Issued (Pitcher)",
    primaryStat: "baseOnBalls",
    supportingStats: ["bb_per_9", "opponent_walk_rate", "pitch_count"],
    chartTypes: [
      { type: "trend", title: "Walks Trend", description: "Game-by-game walks issued" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
    ],
    analysisContext: `Walks depend on pitcher command (BB/9), opponent's discipline (walk rate), and game situation (pitchers may pitch around dangerous hitters). Early-season pitchers tend to walk more. Also consider: umpire tendencies (tight zone = more walks), and whether pitcher is on a pitch count.`,
    dataHints: ["bb_per_9", "opponent_walk_rate"],
  },
  "earned_runs": {
    name: "Earned Runs Allowed",
    primaryStat: "earnedRuns",
    supportingStats: ["era", "inningsPitched", "opponent_ops"],
    chartTypes: [
      { type: "trend", title: "Earned Runs Trend", description: "Game-by-game ERs allowed" },
      { type: "hitRate", title: "Hit Rate", description: "How often they stay under this line" },
      { type: "matchup", title: "Opponent OPS", description: "How dangerous is this lineup?" },
    ],
    analysisContext: `Earned runs depend on ERA, innings pitched (more innings = more run exposure), opponent lineup quality (OPS), and ballpark factors. A pitcher with a 3.00 ERA averages 3 ER per 9 innings, so in a 6-inning outing you'd expect ~2 ER. But runs are lumpy — one bad inning can blow the line.`,
    dataHints: ["era", "opponent_ops", "ballpark_run_factor"],
  },
};

// ── NHL Markets ────────────────────────────────────────────────────

const NHL_MARKETS: Record<string, MarketIntelligence> = {
  "goals": {
    name: "Goals",
    primaryStat: "goals",
    supportingStats: ["shots", "shooting_pct", "toi", "power_play_goals"],
    chartTypes: [
      { type: "trend", title: "Goals Trend", description: "Game-by-game goals" },
      { type: "hitRate", title: "Hit Rate", description: "How often they score" },
      { type: "matchup", title: "vs Opponent Goalie", description: "Opponent goalie save percentage" },
    ],
    analysisContext: `Goals are extremely volatile — even elite scorers only score in ~40-50% of games. Key factors: shot volume (more shots = more goal chances), shooting percentage (unsustainable if very high), power play time (PP goals are easier), opponent goalie save percentage, and time on ice. A player generating 4+ shots per game is a better bet than one generating 2 even if their goal averages are similar.`,
    dataHints: ["shots_per_game", "shooting_percentage", "power_play_time", "opponent_goalie_sv_pct"],
  },
  "assists": {
    name: "Assists",
    primaryStat: "assists",
    supportingStats: ["points", "toi", "power_play_assists"],
    chartTypes: [
      { type: "trend", title: "Assists Trend", description: "Game-by-game assists" },
      { type: "hitRate", title: "Hit Rate", description: "How often they record an assist" },
    ],
    analysisContext: `Assists in hockey depend on: linemates (playing with a goal scorer = more assists), power play time (PP generates more assists), time on ice, and opponent defensive structure. Playmaking centers and PP quarterbacks (usually defensemen) are the most reliable assist producers.`,
    dataHints: ["power_play_time", "linemate_goals"],
  },
  "points": {
    name: "Points (G+A)",
    primaryStat: "points",
    supportingStats: ["goals", "assists", "shots", "toi"],
    chartTypes: [
      { type: "trend", title: "Points Trend", description: "Game-by-game points with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they record 1+ point" },
      { type: "comparison", title: "Goals vs Assists Split", description: "How they generate points" },
    ],
    analysisContext: `Points (goals + assists) are more stable than goals alone because you get credit for both scoring and setting up. Key factors: same as goals and assists combined — shot volume, linemates, power play time, TOI, and opponent quality. Players on the top power play unit are significantly more likely to record a point.`,
    dataHints: ["shots", "power_play_time", "toi"],
  },
  "shots": {
    name: "Shots on Goal",
    primaryStat: "shots",
    supportingStats: ["toi", "shot_attempts"],
    chartTypes: [
      { type: "trend", title: "Shots Trend", description: "Game-by-game SOG with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
    ],
    analysisContext: `Shots on goal is one of the more predictable NHL props because it's volume-based. Key factors: player's shot volume tendency, time on ice (more ice time = more shots), power play time, and game script (trailing teams shoot more). Shot props are often better value than goal props because they're less random.`,
    dataHints: ["toi", "shot_attempts"],
  },
  "saves": {
    name: "Goalie Saves",
    primaryStat: "saves",
    supportingStats: ["shotsAgainst", "savePctg"],
    chartTypes: [
      { type: "trend", title: "Saves Trend", description: "Game-by-game saves with prop line" },
      { type: "hitRate", title: "Hit Rate", description: "How often they exceed this line" },
      { type: "matchup", title: "Opponent Shot Volume", description: "How many shots does this team generate?" },
    ],
    analysisContext: `Goalie saves = shots against × save percentage. A goalie facing 35 shots with a .920 SV% gets ~32 saves. Key factors: opponent's shots per game (high-volume shooting teams = more saves), game pace, and whether the goalie's team is good (bad teams face more shots). Paradoxically, goalies on bad teams often have higher save totals.`,
    dataHints: ["opponent_shots_per_game", "save_percentage"],
  },
};

// ── Market resolution ──────────────────────────────────────────────

/**
 * Given a market string and sport, return the specific intelligence for that market.
 */
export function getMarketIntelligence(
  market: string,
  sport: string
): MarketIntelligence | null {
  const m = market.toLowerCase();
  const s = sport.toUpperCase();

  // Cross-sport markets (SGP, alt lines, combos)
  if (m.includes("same game parlay") || m.includes("sgp")) return NBA_MARKETS.sgp;
  if (m.includes("alt") && m.includes("spread")) return NBA_MARKETS.alt_spread;
  if (m.includes("combo") || (m.includes("and") && m.includes("win"))) return NBA_MARKETS.player_combo;

  if (s === "NBA" || s === "BASKETBALL") {
    if (m.includes("first basket") || m.includes("first scorer")) return NBA_MARKETS.first_basket;
    if (m.includes("first half") && m.includes("point")) return NBA_MARKETS.first_half_points;
    if (m.includes("first quarter") || m.includes("1q") || m.includes("1st quarter")) return NBA_MARKETS.first_quarter_total;
    if (m.includes("first half") || m.includes("1h") || m.includes("1st half")) return NBA_MARKETS.first_half_total;
    if (m.includes("pts+reb+ast") || m.includes("pra") || m.includes("p+r+a")) return NBA_MARKETS.pts_reb_ast;
    if (m.includes("double") && m.includes("double")) return NBA_MARKETS.double_double;
    if (m.includes("three") || m.includes("3p") || m.includes("3-point") || m.includes("3pt")) return NBA_MARKETS.three_pointers;
    if (m.includes("steal")) return NBA_MARKETS.steals;
    if (m.includes("block") || m.includes("blk")) return NBA_MARKETS.blocks;
    if (m.includes("rebound") || m.includes("reb")) return NBA_MARKETS.rebounds;
    if (m.includes("assist") || m.includes("ast")) return NBA_MARKETS.assists;
    if (m.includes("point") || m.includes("pts") || m.includes("scoring")) return NBA_MARKETS.points;
  }

  if (s === "NFL" || s === "FOOTBALL") {
    if (m.includes("anytime td") || m.includes("anytime touchdown") || m.includes("touchdown scorer")) return NFL_MARKETS.anytime_td;
    if (m.includes("passing yard") || m.includes("pass yard")) return NFL_MARKETS.passing_yards;
    if (m.includes("rushing yard") || m.includes("rush yard")) return NFL_MARKETS.rushing_yards;
    if (m.includes("receiving yard") || m.includes("recv yard") || m.includes("rec yard")) return NFL_MARKETS.receiving_yards;
  }

  if (s === "MLB" || s === "BASEBALL") {
    if (m.includes("strikeout") || m.includes("k's") || m.includes("k ")) {
      if (m.includes("pitch") || m.includes("record")) return MLB_MARKETS.strikeouts_pitching;
      return MLB_MARKETS.strikeouts_pitching;
    }
    if (m.includes("earned run") || m.includes("er ")) return MLB_MARKETS.earned_runs;
    if (m.includes("walks") && (m.includes("issue") || m.includes("pitch") || m.includes("allow"))) return MLB_MARKETS.walks_pitcher;
    if (m.includes("hits") && (m.includes("allow") || m.includes("pitch"))) return MLB_MARKETS.hits_pitcher;
    if (m.includes("stolen") || m.includes("sb")) return MLB_MARKETS.stolen_bases;
    if (m.includes("total base") || m.includes("tb")) return MLB_MARKETS.total_bases;
    if (m.includes("rbi") || m.includes("runs batted")) return MLB_MARKETS.rbi;
    if (m.includes("home run") || m.includes("hr") || m.includes("homer")) return MLB_MARKETS.home_runs;
    if (m.includes("hit")) return MLB_MARKETS.hits;
  }

  if (s === "NHL" || s === "HOCKEY") {
    if (m.includes("save")) return NHL_MARKETS.saves;
    if (m.includes("shot")) return NHL_MARKETS.shots;
    if (m.includes("assist")) return NHL_MARKETS.assists;
    if (m.includes("goal")) return NHL_MARKETS.goals;
    if (m.includes("point")) return NHL_MARKETS.points;
  }

  return null;
}

/**
 * Get the analysis context for the AI summary prompt.
 * Returns domain-specific knowledge about what matters for this bet.
 */
export function getMarketContext(market: string, sport: string): string {
  const intel = getMarketIntelligence(market, sport);
  if (!intel) return "";
  return `\n\nMARKET-SPECIFIC ANALYSIS CONTEXT (${intel.name}):\n${intel.analysisContext}`;
}

/**
 * Get all relevant stats to highlight for a given market.
 */
export function getMarketStats(market: string, sport: string): string[] {
  const intel = getMarketIntelligence(market, sport);
  if (!intel) return [];
  return [intel.primaryStat, ...intel.supportingStats];
}
