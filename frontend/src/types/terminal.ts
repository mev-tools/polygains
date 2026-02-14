export interface Pagination {
  page: number;
  totalPages: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface AlertsResponse {
  data: AlertItem[];
  pagination: Pagination;
}

export interface MarketsResponse {
  data: MarketOutcome[];
  pagination: Pagination;
}

export interface HealthResponse {
  status?: string;
  current_block?: number | string;
}

export interface InsiderStats {
  total_insiders?: number;
  yes_insiders?: number;
  no_insiders?: number;
  total_volume?: number | string;
  current_block?: number | string;
}

export interface GlobalStats {
  total_accounts?: number;
  total_markets?: number;
  total_trades?: number;
  active_positions?: number;
}

export interface AlertItem {
  user: string;
  volume: number | string;
  outcome: string | number;
  alert_time: number;
  price: number | string;
  closed?: boolean;
  winner?: boolean | null;
  conditionId?: string;
  tokenId?: string;
}

export interface InsiderTrade {
  position_id: string;
  condition_id?: string;
  question?: string;
  volume: number | string;
  outcome: string | number;
  price: number | string;
}

export interface MarketOutcome {
  conditionId: string;
  question: string;
  total_market_vol: number;
  total_market_trades: number;
  hn_score: number;
  closed?: boolean;
  outcome: string | number;
  total_trades: number;
  volume: number;
  last_price: number;
  mean?: number | null;
  stdDev?: number | null;
  p95?: number | null;
  tokenId?: string;
}

export interface GroupedMarket {
  conditionId: string;
  question: string;
  totalMarketVol: number;
  totalMarketTrades: number;
  hnScore: number;
  closed: boolean;
  outcomes: MarketOutcome[];
}

export const EMPTY_PAGINATION: Pagination = {
  page: 1,
  totalPages: 1,
  total: 0,
  hasPrev: false,
  hasNext: false,
};

export interface TrackerState {
  realizedPnL: number;
  liveTotalBet: number;
  liveTrades: number;
  liveWins: number;
  liveLosses: number;
  openInterest: number;
}

export interface PendingAlert {
  conditionId?: string;
  tokenId?: string;
  user: string;
  alert_time: number;
  outcome: string | number;
  price: number;
  cost: number;
  mode: "reverse_insider" | "follow_insider";
}
