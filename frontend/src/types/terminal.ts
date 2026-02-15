import type {
	AlertItem as SharedAlertItem,
	AlertsResponse as SharedAlertsResponse,
	GlobalStats as SharedGlobalStats,
	HealthResponse as SharedHealthResponse,
	InsiderStats as SharedInsiderStats,
	InsiderTrade as SharedInsiderTrade,
	MarketOutcome as SharedMarketOutcome,
	MarketsResponse as SharedMarketsResponse,
	Pagination as SharedPagination,
} from "@shared/api";

export type Pagination = SharedPagination;
export type AlertsResponse = SharedAlertsResponse;
export type MarketsResponse = SharedMarketsResponse;
export type HealthResponse = SharedHealthResponse;
export type InsiderStats = SharedInsiderStats;
export type GlobalStats = SharedGlobalStats;
export type AlertItem = SharedAlertItem;
export type InsiderTrade = SharedInsiderTrade;
export type MarketOutcome = SharedMarketOutcome;

export interface GroupedMarket {
	conditionId: string;
	question: string;
	closed: boolean;
	outcomes: MarketOutcome[];
	totalMarketVol?: number;
	totalMarketTrades?: number;
	hnScore?: number;
}

export interface TrackerState {
	totalBet: number;
	openInterest: number;
	realizedPnL: number;
	liveTrades: number;
	liveWins: number;
	liveLosses: number;
	alertsPage?: number;
	alertsTotalPages?: number;
	alertsFilledThroughPage?: number;
	liveTotalBet: number;
}

export interface PendingAlert {
	id: string;
	trader: string;
	detectedAt: number;
	volume: number;
	outcome: string;
	price: number;
	marketQuestion: string;
	cost: number;
	mode: StrategyMode;
	betSizing: BetSizing;
	conditionId: string | null;
	tokenId: string | null;
	user: string;
	alert_time: number;
}

export type StrategyMode = "reverse_insider" | "follow_insider";
export type BetSizing = "target_payout" | "fixed_stake";
export type WinnerFilter = "BOTH" | "WINNERS" | "LOSERS";

export interface SyncState {
	label: string;
	healthy: boolean;
	block: string;
}

export interface FloatingCash {
	id: number;
	text: string;
	isLoss: boolean;
	offset: number;
}

export const EMPTY_PAGINATION: Pagination = {
	page: 1,
	limit: 10,
	total: 0,
	totalPages: 0,
	hasPrev: false,
	hasNext: false,
};
