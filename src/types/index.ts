export interface BetExtraction {
  sport: string;
  betType: 'moneyline' | 'spread' | 'over_under' | 'player_prop' | 'game_prop' | 'parlay';
  teams: string[];
  players: string[];
  line?: number;
  odds: string;
  market?: string;
  description: string;
  confidence: number;
  legs?: BetExtraction[];
  /** Away team (the team traveling) — detected from "@" in bet description */
  awayTeam?: string;
  /** Home team (the host) — detected from "@" in bet description */
  homeTeam?: string;
}

export interface BetAnalysis {
  id: string;
  image: string;
  extraction: BetExtraction;
  stats: StatDataPoint[];
  charts: ChartConfig[];
  summary: string;
}

export interface StatDataPoint {
  label: string;
  value: number | string;
  context: string;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'distribution' | 'table' | 'hitrate';
  title: string;
  relevance: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  columns?: TableColumn[];
}

export interface TableColumn {
  key: string;
  label: string;
}

export interface ParlayLegResult {
  description: string;
  sport: string;
  betType: string;
  teams: string[];
  players?: string[];
  market?: string;
  line?: number;
  odds: string;
  summary: string | null;
  stats: StatDataPoint[];
  charts: ChartConfig[];
  error: boolean;
  unsupported: boolean;
  computedData?: Record<string, unknown>;
  gameStatus?: GameStatusData;
  swishScore?: { score: number; label: string; detail: string };
  suggestions?: string[];
}

export interface GameStatusData {
  state: "pre" | "in" | "post" | "unknown";
  gameId?: string;
  clock?: string;
  period?: string;
  detail?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  playerStatLine?: Record<string, string | number>;
  playerName?: string;
  grade?: {
    result: "hit" | "miss" | "push" | "pending";
    actual?: number | string;
    line?: number;
    detail: string;
  };
}

export type AppState = 'upload' | 'analyzing' | 'results' | 'error' | 'unsupported' | 'parlay';

export interface MLBInsights {
  verdict: string;
  projection?: {
    proj: number;
    diff: number;
    edge: number;
    lean: 'strong over' | 'lean over' | 'pass' | 'lean under' | 'strong under';
  };
  bullets: { label: string; value: string; tone: 'pos' | 'neg' | 'neutral' }[];
  flags: string[];
}

export interface NBAInsights {
  verdict: string;
  projection?: {
    proj: number;
    diff: number;
    edge: number;
    lean: 'strong over' | 'lean over' | 'pass' | 'lean under' | 'strong under';
  };
  bullets: { label: string; value: string; tone: 'pos' | 'neg' | 'neutral' }[];
  flags: string[];
}
