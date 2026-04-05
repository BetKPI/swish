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
  type: 'line' | 'bar' | 'distribution' | 'table';
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
}

export type AppState = 'upload' | 'analyzing' | 'results' | 'error' | 'unsupported' | 'parlay';
