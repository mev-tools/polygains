import { useEffect, useMemo, useRef, useState } from "react";
import {
	fetchAlerts,
	fetchGlobalStats,
	fetchHealth,
	fetchInsiderStats,
	fetchInsiderTrades,
	fetchMarket,
	fetchMarkets,
} from "../api/terminalApi";
import {
	type AlertRowView,
	AlertsSection,
	DetectionSection,
	GlobalStatsSection,
	LiveTrackerCards,
	LiveTrackerControls,
	MarketsSection,
	TerminalBanner,
	TerminalHeader,
	TerminalIntro,
} from "../components/terminal/TerminalSections";
import type {
	AlertItem,
	BetSizing,
	FloatingCash,
	GlobalStats,
	GroupedMarket,
	InsiderStats,
	MarketOutcome,
	PendingAlert,
	StrategyMode,
	SyncState,
	TrackerState,
	WinnerFilter,
} from "../types/terminal";
import { EMPTY_PAGINATION } from "../types/terminal";

const TYPEWRITER_TEXT =
	"MEV.tools built this Polymarket terminal to flag potential insider-style flow: new wallets placing oversized, high-conviction bets on low-odds outcomes before repricing. Built for X traders tracking suspicious order flow in real time.";
const TARGET_PAYOUT = 10;
const FIXED_STAKE_USD = 1;
const ALERTS_PAGE_SIZE = 10;
const MAX_ALERT_FILL_PAGES = 10;
const MARKETS_DISPLAY_LIMIT = 5;
const MARKETS_PAGE_SIZE = 5;
const BACKTEST_PAGE_SIZE = 50;
const BACKTEST_PAUSE_TRADE_COUNT = 500;
const BACKTEST_PAGE_DELAY_MS = 200;

const STRATEGY_ORDER: StrategyMode[] = ["follow_insider", "reverse_insider"];
const DEFAULT_CATEGORY_OPTIONS = [
	"ALL",
	"CRYPTO",
	"SPORTS",
	"POLITICS",
] as const;

const INITIAL_TRACKER_STATE: TrackerState = {
	realizedPnL: 0,
	liveTotalBet: 0,
	liveTrades: 0,
	liveWins: 0,
	liveLosses: 0,
	openInterest: 0,
	totalBet: 0,
};

function formatNum(value: number | string | undefined | null): string {
	const val = Number(value ?? 0);
	if (!Number.isFinite(val)) return "0.00";
	if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
	if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
	return val.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function normalizePrice(
	rawPrice: number | string | undefined | null,
	fallback = 0.5,
): number {
	const value = Number(rawPrice);
	if (!Number.isFinite(value)) return fallback;
	return Math.max(0, Math.min(1, value));
}

function clampPrice(rawValue: number, fallback: number): number {
	if (!Number.isFinite(rawValue)) return fallback;
	return Math.max(0, Math.min(1, rawValue));
}

function getEntryPrice(
	rawPrice: number | string | undefined | null,
	mode: StrategyMode,
): number {
	const insiderPrice = normalizePrice(rawPrice, 0.5);
	return mode === "reverse_insider" ? 1 - insiderPrice : insiderPrice;
}

function calculateTradeCost(entryPrice: number, betSizing: BetSizing): number {
	if (betSizing === "fixed_stake") {
		return FIXED_STAKE_USD;
	}
	return TARGET_PAYOUT * entryPrice;
}

function calculateWinProfit(
	cost: number,
	entryPrice: number,
	betSizing: BetSizing,
): number {
	if (betSizing === "fixed_stake") {
		const safeEntry = Math.max(entryPrice, 0.0001);
		return cost / safeEntry - cost;
	}
	return TARGET_PAYOUT - cost;
}

function isPriceInRange(
	price: number,
	minPrice: number,
	maxPrice: number,
): boolean {
	return price >= minPrice && price <= maxPrice;
}

function normalizeCategory(category: string | null | undefined): string {
	const normalized = String(category ?? "").trim();
	if (!normalized) return "ALL";
	if (normalized.toUpperCase() === "ALL") return "ALL";
	return normalized.toUpperCase();
}

function categoryMatches(alert: AlertItem, selectedCategory: string): boolean {
	if (selectedCategory === "ALL") return true;
	const alertCategory = normalizeCategory(alert.category);
	return alertCategory.toLowerCase() === selectedCategory.toLowerCase();
}

function sortStrategies(modes: StrategyMode[]): StrategyMode[] {
	const unique = Array.from(new Set(modes));
	return STRATEGY_ORDER.filter((mode) => unique.includes(mode));
}

function alertMatchesFilters(
	alert: AlertItem,
	modes: StrategyMode[],
	minPrice: number,
	maxPrice: number,
	selectedCategory = "ALL",
	winnerFilter: WinnerFilter = "BOTH",
): boolean {
	if (!categoryMatches(alert, selectedCategory)) {
		return false;
	}
	if (!winnerFilterMatches(alert, winnerFilter)) {
		return false;
	}

	return modes.some((mode) => {
		const entryPrice = getEntryPrice(alert.price, mode);
		return isPriceInRange(entryPrice, minPrice, maxPrice);
	});
}

function alertMatchesFiltersCount(
	alerts: AlertItem[],
	modes: StrategyMode[],
	minPrice: number,
	maxPrice: number,
	selectedCategory = "ALL",
	winnerFilter: WinnerFilter = "BOTH",
): number {
	let count = 0;
	for (const alert of alerts) {
		if (
			alertMatchesFilters(
				alert,
				modes,
				minPrice,
				maxPrice,
				selectedCategory,
				winnerFilter,
			)
		) {
			count += 1;
		}
	}
	return count;
}

function mapOutcome(outcome: unknown): { label: string; className: string } {
	if (outcome === null || outcome === undefined || outcome === "") {
		return { label: "N/A", className: "over-under" };
	}
	const text = String(outcome).toUpperCase();
	if (text === "YES" || text === "1") return { label: "YES", className: "yes" };
	if (text === "NO" || text === "0") return { label: "NO", className: "no" };
	return { label: text, className: "over-under" };
}

function isResolvedMarket(market: GroupedMarket): boolean {
	if (market.closed) return true;
	if (market.outcomes.length === 0) return false;
	return market.outcomes.every((outcome) => Boolean(outcome.closed));
}

function createAlertKey(alert: AlertItem): string {
	return `${alert.user}-${alert.alert_time}-${String(alert.outcome)}-${alert.conditionId ?? ""}-${alert.tokenId ?? ""}`;
}

function createRowId(alert: AlertItem): string {
	return `alert-${createAlertKey(alert)}`;
}

function toBoolean(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string")
		return value.toLowerCase() === "true" || value === "1";
	return false;
}

function parseWinnerValue(value: unknown): boolean | null {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true" || normalized === "1" || normalized === "yes")
			return true;
		if (normalized === "false" || normalized === "0" || normalized === "no")
			return false;
	}
	return null;
}

function toNumberOrNull(value: unknown): number | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveNumberOrNull(value: unknown): number | null {
	const parsed = toNumberOrNull(value);
	if (parsed === null || parsed <= 0) {
		return null;
	}
	return parsed;
}

function inferInsiderWin(
	rawWinner: unknown,
	rawLastPrice: unknown,
): boolean | null {
	const parsedWinner = parseWinnerValue(rawWinner);
	if (parsedWinner !== null) {
		return parsedWinner;
	}

	const lastPrice = Number(rawLastPrice);
	if (Number.isFinite(lastPrice)) {
		if (lastPrice >= 0.98) return true;
		if (lastPrice <= 0.05) return false;
	}

	return null;
}

function winnerFilterMatches(
	alert: AlertItem,
	winnerFilter: WinnerFilter,
): boolean {
	if (winnerFilter === "BOTH") return true;
	const insiderWon = inferInsiderWin(
		alert.winner,
		alert.market_price ?? alert.price,
	);
	if (winnerFilter === "WINNERS") return insiderWon === true;
	if (winnerFilter === "LOSERS") return insiderWon === false;
	return true;
}

export function TerminalPage() {
	const [alerts, setAlerts] = useState<AlertItem[]>([]);
	const [alertsPagination, setAlertsPagination] = useState(EMPTY_PAGINATION);
	const [marketsRaw, setMarketsRaw] = useState<MarketOutcome[]>([]);
	const [marketsPagination, setMarketsPagination] = useState(EMPTY_PAGINATION);
	const [insiderStats, setInsiderStats] = useState<InsiderStats>({});
	const [globalStats, setGlobalStats] = useState<GlobalStats>({});
	const [syncState, setSyncState] = useState<SyncState>({
		label: "SYNC: BOOTSTRAPPING",
		healthy: true,
		block: "--",
	});

	const [typewriterText, setTypewriterText] = useState("");
	const [currentPage, setCurrentPage] = useState(1);
	const [alertsFilledThroughPage, setAlertsFilledThroughPage] = useState(1);
	const [marketsCurrentPage, setMarketsCurrentPage] = useState(1);
	const [alertsLoading, setAlertsLoading] = useState(false);
	const [marketsLoading, setMarketsLoading] = useState(false);
	const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
	const [backtestRunning, setBacktestRunning] = useState(false);
	const [backtestCanContinue, setBacktestCanContinue] = useState(false);

	const [minPriceFilter, setMinPriceFilter] = useState(0.01);
	const [maxPriceFilter, setMaxPriceFilter] = useState(1.0);
	const [onlyBetOnce, setOnlyBetOnce] = useState(false);
	const [selectedBetSizing, setSelectedBetSizing] =
		useState<BetSizing>("target_payout");
	const [selectedCategory, setSelectedCategory] = useState("ALL");
	const [selectedWinnerFilter, setSelectedWinnerFilter] =
		useState<WinnerFilter>("BOTH");
	const [selectedStrategies, setSelectedStrategies] = useState<StrategyMode[]>([
		"follow_insider",
	]);

	const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
	const [detailsByRow, setDetailsByRow] = useState<Record<string, string>>({});
	const [marketStatsLoadingByCondition, setMarketStatsLoadingByCondition] =
		useState<Record<string, boolean>>({});
	const [floatingCash, setFloatingCash] = useState<FloatingCash[]>([]);

	const [tracker, setTracker] = useState<TrackerState>(INITIAL_TRACKER_STATE);

	const detailsRef = useRef<Record<string, string>>({});
	const trackerRef = useRef<TrackerState>({ ...INITIAL_TRACKER_STATE });
	const allHistoryRef = useRef<AlertItem[]>([]);
	const lastAlertTimeRef = useRef(0);
	const processedAlertsRef = useRef(new Set<string>());
	const betConditionsRef = useRef(new Set<string>());
	const pendingAlertsRef = useRef(new Map<string, PendingAlert>());
	const initialLoadRef = useRef(true);
	const audioCtxRef = useRef<AudioContext | null>(null);
	const cashQueueRef = useRef<Array<{ text: string; isLoss: boolean }>>([]);
	const isAnimatingCashRef = useRef(false);
	const marketStatsRequestedRef = useRef(new Set<string>());
	const marketStatsInFlightRef = useRef(new Set<string>());
	const backtestNextPageRef = useRef(1);
	const backtestHasNextRef = useRef(false);

	const groupedMarkets = useMemo<GroupedMarket[]>(() => {
		const grouped = new Map<string, GroupedMarket>();

		for (const market of marketsRaw) {
			const key =
				market.conditionId || `${market.question}-${String(market.outcome)}`;
			const existing = grouped.get(key);

			if (!existing) {
				grouped.set(key, {
					conditionId: market.conditionId || key,
					question: market.question,
					totalMarketVol: Number(market.total_market_vol || 0),
					totalMarketTrades: Number(market.total_market_trades || 0),
					hnScore: Number(market.hn_score || 0),
					closed: Boolean(market.closed),
					outcomes: [market],
				});
				continue;
			}

			existing.closed = existing.closed || Boolean(market.closed);
			existing.outcomes.push(market);
		}

		return Array.from(grouped.values())
			.filter((market) => !isResolvedMarket(market))
			.sort((a, b) => b.totalMarketVol - a.totalMarketVol)
			.slice(0, MARKETS_DISPLAY_LIMIT);
	}, [marketsRaw]);

	const categoryOptions = useMemo<string[]>(() => {
		const values = new Set<string>(DEFAULT_CATEGORY_OPTIONS);
		for (const alert of alerts) {
			const category = normalizeCategory(alert.category);
			if (category !== "ALL") {
				values.add(category);
			}
		}
		const selected = normalizeCategory(selectedCategory);
		if (selected !== "ALL") {
			values.add(selected);
		}

		const preferredOrder = new Map<string, number>();
		for (const [i, category] of DEFAULT_CATEGORY_OPTIONS.entries()) {
			preferredOrder.set(category, i);
		}

		return Array.from(values.values()).sort((a, b) => {
			const aPreferred = preferredOrder.get(a);
			const bPreferred = preferredOrder.get(b);

			if (aPreferred !== undefined && bPreferred !== undefined) {
				return aPreferred - bPreferred;
			}
			if (aPreferred !== undefined) return -1;
			if (bPreferred !== undefined) return 1;
			return a.localeCompare(b);
		});
	}, [alerts, selectedCategory]);

	const filteredAlerts = useMemo<AlertItem[]>(() => {
		if (selectedStrategies.length === 0) return [];

		return alerts.filter((alert) => {
			return alertMatchesFilters(
				alert,
				selectedStrategies,
				minPriceFilter,
				maxPriceFilter,
				selectedCategory,
				selectedWinnerFilter,
			);
		});
	}, [
		alerts,
		maxPriceFilter,
		minPriceFilter,
		selectedCategory,
		selectedStrategies,
		selectedWinnerFilter,
	]);

	const alertRows = useMemo<AlertRowView[]>(() => {
		return filteredAlerts.map((alert) => {
			const rowId = createRowId(alert);
			const dt = new Date(Number(alert.alert_time) * 1000);
			const outcome = mapOutcome(alert.outcome);
			const profileAddress = String(alert.walletAddress || alert.user);
			const addrShort =
				profileAddress.length > 12
					? `${profileAddress.slice(0, 6)}...${profileAddress.slice(-4)}`
					: profileAddress;
			const winnerStatus = inferInsiderWin(
				alert.winner,
				alert.market_price ?? alert.price,
			);
			const statusBadgeHtml = alert.closed
				? winnerStatus === null
					? '<span class="status-badge pending">PENDING</span>'
					: `<span class="status-badge ${winnerStatus ? "won" : "loss"}">${winnerStatus ? "WON" : "LOSS"}</span>`
				: "";

			return {
				rowId,
				user: alert.user,
				profileAddress,
				addrShort,
				volumeFormatted: Number(alert.volume || 0).toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				}),
				outcomeClass: outcome.className,
				outcomeLabel: outcome.label,
				statusBadgeHtml,
				dateText: dt.toLocaleDateString(undefined, {
					month: "2-digit",
					day: "2-digit",
					year: "numeric",
				}),
				timeText: dt.toLocaleTimeString(undefined, {
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
					hour12: false,
				}),
				detailHtml:
					detailsByRow[rowId] ||
					'<div class="loading">Loading trade details...</div>',
				expanded: Boolean(expandedRows[rowId]),
			};
		});
	}, [detailsByRow, expandedRows, filteredAlerts]);

	const alertsByRowId = useMemo(() => {
		const byId = new Map<string, AlertItem>();
		for (const alert of filteredAlerts) {
			byId.set(createRowId(alert), alert);
		}
		return byId;
	}, [filteredAlerts]);

	const currentBlockText = String(
		insiderStats.current_block ?? syncState.block ?? "--",
	);

	const syncTrackerState = () => {
		let openInterest = 0;
		for (const pending of pendingAlertsRef.current.values()) {
			openInterest += pending.cost;
		}
		trackerRef.current.openInterest = openInterest;
		setTracker({ ...trackerRef.current });
	};

	const processCashQueue = () => {
		if (isAnimatingCashRef.current || cashQueueRef.current.length === 0) return;

		isAnimatingCashRef.current = true;
		const nextItem = cashQueueRef.current.shift();
		if (!nextItem) {
			isAnimatingCashRef.current = false;
			return;
		}

		const id = Date.now() + Math.random();
		const randomOffset = Math.floor(Math.random() * 61) - 30;
		setFloatingCash((prev) => [
			...prev,
			{
				id,
				text: nextItem.text,
				isLoss: nextItem.isLoss,
				offset: randomOffset,
			},
		]);

		setTimeout(() => {
			setFloatingCash((prev) => prev.filter((item) => item.id !== id));
		}, 2500);

		setTimeout(() => {
			isAnimatingCashRef.current = false;
			processCashQueue();
		}, 300);
	};

	const showFloatingCash = (text: string, isLoss = false) => {
		cashQueueRef.current.push({ text, isLoss });
		processCashQueue();
	};

	const playCashSound = () => {
		const audioCtor =
			window.AudioContext ||
			(
				window as Window & {
					webkitAudioContext?: typeof AudioContext;
				}
			).webkitAudioContext;

		if (!audioCtor) return;
		if (!audioCtxRef.current) {
			audioCtxRef.current = new audioCtor();
		}

		const ctx = audioCtxRef.current;
		if (!ctx) return;

		const osc1 = ctx.createOscillator();
		const gain1 = ctx.createGain();

		osc1.connect(gain1);
		gain1.connect(ctx.destination);

		osc1.type = "sine";
		osc1.frequency.setValueAtTime(800, ctx.currentTime);
		osc1.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

		gain1.gain.setValueAtTime(0, ctx.currentTime);
		gain1.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
		gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

		osc1.start(ctx.currentTime);
		osc1.stop(ctx.currentTime + 0.5);

		setTimeout(() => {
			const osc2 = ctx.createOscillator();
			const gain2 = ctx.createGain();

			osc2.connect(gain2);
			gain2.connect(ctx.destination);

			osc2.type = "sine";
			osc2.frequency.setValueAtTime(1200, ctx.currentTime);
			osc2.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.1);

			gain2.gain.setValueAtTime(0, ctx.currentTime);
			gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
			gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

			osc2.start(ctx.currentTime);
			osc2.stop(ctx.currentTime + 0.5);
		}, 100);
	};

	const didStrategyWin = (
		insiderWon: boolean | null | undefined,
		mode: StrategyMode,
	): boolean => {
		if (insiderWon === null || insiderWon === undefined) return false;
		return mode === "reverse_insider" ? !insiderWon : insiderWon;
	};

	const settleTrade = (
		cost: number,
		entryPrice: number,
		insiderWon: boolean | null | undefined,
		_silent: boolean,
		mode: StrategyMode,
		betSizing: BetSizing,
	) => {
		const strategyWon = didStrategyWin(insiderWon, mode);

		if (strategyWon) {
			const profit = calculateWinProfit(cost, entryPrice, betSizing);
			trackerRef.current.realizedPnL += profit;
			trackerRef.current.liveWins += 1;
			if (!backtestRunning) {
				playCashSound();
				showFloatingCash(`+$${profit.toFixed(2)}`);
			}
			return;
		}

		trackerRef.current.realizedPnL -= cost;
		trackerRef.current.liveLosses += 1;
		if (!backtestRunning) {
			showFloatingCash(`-$${cost.toFixed(2)}`, true);
		}
	};

	const processAlertsForPnL = (
		incomingAlerts: AlertItem[],
		silent = false,
		options?: {
			modes?: StrategyMode[];
			minPrice?: number;
			maxPrice?: number;
			onlyBetOnce?: boolean;
			betSizing?: BetSizing;
			category?: string;
			winnerFilter?: WinnerFilter;
		},
	) => {
		const modes = sortStrategies(options?.modes ?? selectedStrategies);
		const minFilter = options?.minPrice ?? minPriceFilter;
		const maxFilter = options?.maxPrice ?? maxPriceFilter;
		const oneBetOnly = options?.onlyBetOnce ?? onlyBetOnce;
		const betSizing = options?.betSizing ?? selectedBetSizing;
		const categoryFilter = normalizeCategory(
			options?.category ?? selectedCategory,
		);
		const winnerFilter = options?.winnerFilter ?? selectedWinnerFilter;

		if (!incomingAlerts || incomingAlerts.length === 0 || modes.length === 0) {
			syncTrackerState();
			return;
		}

		for (const alert of incomingAlerts) {
			const historyId = createAlertKey(alert);
			if (!processedAlertsRef.current.has(`history:${historyId}`)) {
				processedAlertsRef.current.add(`history:${historyId}`);
				allHistoryRef.current.push(alert);
			}

			if (!categoryMatches(alert, categoryFilter)) {
				continue;
			}
			if (!winnerFilterMatches(alert, winnerFilter)) {
				continue;
			}

			for (const mode of modes) {
				const entryPrice = getEntryPrice(alert.price, mode);
				if (!isPriceInRange(entryPrice, minFilter, maxFilter)) continue;

				const tradeId = `${mode}:${historyId}`;
				const isNew = !processedAlertsRef.current.has(tradeId);
				const conditionKey = alert.conditionId
					? `${mode}:${alert.conditionId}`
					: undefined;

				if (
					oneBetOnly &&
					conditionKey &&
					betConditionsRef.current.has(conditionKey) &&
					isNew
				)
					continue;

				const isPending = pendingAlertsRef.current.has(tradeId);

				if (isNew) {
					processedAlertsRef.current.add(tradeId);
					if (conditionKey && oneBetOnly) {
						betConditionsRef.current.add(conditionKey);
					}

					trackerRef.current.liveTrades += 1;
					const cost = calculateTradeCost(entryPrice, betSizing);

					trackerRef.current.liveTotalBet += cost;

					if (!alert.closed) {
						pendingAlertsRef.current.set(tradeId, {
							conditionId: alert.conditionId,
							tokenId: alert.tokenId,
							user: alert.user,
							alert_time: Number(alert.alert_time),
							outcome: alert.outcome,
							price: entryPrice,
							cost,
							mode,
							betSizing,
						});
					} else {
						const winner = inferInsiderWin(
							alert.winner,
							alert.market_price ?? alert.price,
						);
						settleTrade(cost, entryPrice, winner, silent, mode, betSizing);
					}
				} else if (isPending && alert.closed) {
					const pending = pendingAlertsRef.current.get(tradeId);
					if (!pending) continue;

					const winner = inferInsiderWin(
						alert.winner,
						alert.market_price ?? alert.price,
					);
					settleTrade(
						pending.cost,
						pending.price,
						winner,
						silent,
						pending.mode,
						pending.betSizing,
					);
					pendingAlertsRef.current.delete(tradeId);
				}
			}
		}

		syncTrackerState();
	};

	const resetTrackerState = () => {
		trackerRef.current = { ...INITIAL_TRACKER_STATE };
		processedAlertsRef.current.clear();
		betConditionsRef.current.clear();
		pendingAlertsRef.current.clear();
		allHistoryRef.current = [];
		lastAlertTimeRef.current = 0;
		syncTrackerState();
	};

	const fetchDetailsForRow = async (rowId: string, alert: AlertItem) => {
		const trades = await fetchInsiderTrades(alert.user);
		const scopedTrades =
			alert.conditionId && alert.conditionId.length > 0
				? trades.filter(
						(trade) =>
							String(trade.condition_id ?? "") === String(alert.conditionId),
					)
				: trades;
		const visibleTrades = scopedTrades.length > 0 ? scopedTrades : trades;

		let html = "";
		const rowAlertPrice = Number(alert.price || 0).toFixed(2);
		const rowOutcome = mapOutcome(alert.outcome).label;
		const followEntryPrice = getEntryPrice(
			alert.price,
			"follow_insider",
		).toFixed(2);
		const reverseEntryPrice = getEntryPrice(
			alert.price,
			"reverse_insider",
		).toFixed(2);

		if (visibleTrades.length === 0) {
			html =
				'<div style="color: var(--text-dim);">No low-odds trades found for this user.</div>';
		} else {
			const rows = visibleTrades
				.map((trade) => {
					const outcome = mapOutcome(trade.outcome);
					const volume = Number(trade.volume || 0).toLocaleString(undefined, {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2,
					});
					const questionText =
						trade.question ||
						`Condition: ${String(trade.condition_id ?? "unknown").slice(0, 10)}...`;

					return `<div class="trade-item-grid"><div class="trade-item-asset"><span class="question">${questionText}</span><span class="pos-id">${String(trade.position_id || "-").slice(0, 10)}...</span></div><div><span class="outcome-tag ${outcome.className}">${outcome.label}</span></div><div class="val">$${volume}</div><div class="val accent">${Number(trade.price || 0).toFixed(2)}</div></div>`;
				})
				.join("");

			const fallbackNotice =
				scopedTrades.length === 0 && alert.conditionId
					? '<div style="color: var(--text-dim); margin: 0 0 8px 0;">No exact market match for this alert condition. Showing recent trades for this wallet.</div>'
					: "";

			html = `<div class="trade-details-box"><div style="color: var(--text-dim); margin: 0 0 8px 0;">Row Outcome: <span class="accent">${rowOutcome}</span> | Alert Price: <span class="accent">${rowAlertPrice}</span> | Follow Entry: <span class="accent">${followEntryPrice}</span> | Reverse Entry: <span class="accent">${reverseEntryPrice}</span></div>${fallbackNotice}<div class="trade-details-header"><div>Asset Traded</div><div>Outcome</div><div>Volume (USDC)</div><div>Alert Price</div></div>${rows}</div>`;
		}

		const nextDetails = { ...detailsRef.current, [rowId]: html };
		detailsRef.current = nextDetails;
		setDetailsByRow(nextDetails);
	};

	const loadInsiderAlerts = async (
		page = 1,
		options?: {
			modes?: StrategyMode[];
			minPrice?: number;
			maxPrice?: number;
			onlyBetOnce?: boolean;
			betSizing?: BetSizing;
			category?: string;
			winnerFilter?: WinnerFilter;
			openFirstRow?: boolean;
			showLoading?: boolean;
		},
	) => {
		const showLoading = options?.showLoading ?? true;
		if (showLoading) {
			setAlertsLoading(true);
		}

		try {
			const modes = sortStrategies(options?.modes ?? selectedStrategies);
			const minFilter = options?.minPrice ?? minPriceFilter;
			const maxFilter = options?.maxPrice ?? maxPriceFilter;
			const oneBetOnly = options?.onlyBetOnce ?? onlyBetOnce;
			const betSizing = options?.betSizing ?? selectedBetSizing;
			const categoryFilter = normalizeCategory(
				options?.category ?? selectedCategory,
			);
			const winnerFilter = options?.winnerFilter ?? selectedWinnerFilter;
			const shouldOpenFirstRow =
				Boolean(options?.openFirstRow) || initialLoadRef.current;

			const response = await fetchAlerts(
				page,
				ALERTS_PAGE_SIZE,
				categoryFilter === "ALL" ? undefined : categoryFilter,
			);
			const basePage = response.pagination.page || page;
			const dedupe = new Set<string>();
			const nextAlerts: AlertItem[] = [];

			const appendUnique = (batch: AlertItem[]) => {
				for (const alert of batch) {
					const key = createAlertKey(alert);
					if (dedupe.has(key)) continue;
					dedupe.add(key);
					nextAlerts.push(alert);
				}
			};

			appendUnique(response.data);

			let filledThroughPage = basePage;
			let hasNext = response.pagination.hasNext;
			let nextPage = filledThroughPage + 1;
			let fillCount = 0;

			while (
				alertMatchesFiltersCount(
					nextAlerts,
					modes,
					minFilter,
					maxFilter,
					categoryFilter,
					winnerFilter,
				) < ALERTS_PAGE_SIZE &&
				hasNext &&
				fillCount < MAX_ALERT_FILL_PAGES
			) {
				const extra = await fetchAlerts(
					nextPage,
					ALERTS_PAGE_SIZE,
					categoryFilter === "ALL" ? undefined : categoryFilter,
				);
				appendUnique(extra.data);
				filledThroughPage = extra.pagination.page || nextPage;
				hasNext = extra.pagination.hasNext;
				nextPage = filledThroughPage + 1;
				fillCount += 1;
			}

			setAlerts(nextAlerts);
			setAlertsPagination(response.pagination);
			setCurrentPage(basePage);
			setAlertsFilledThroughPage(filledThroughPage);

			if (nextAlerts.length > 0) {
				const latestTimestamp = Math.max(
					...nextAlerts.map((alert) => Number(alert.alert_time || 0)),
				);
				if (latestTimestamp > lastAlertTimeRef.current) {
					lastAlertTimeRef.current = latestTimestamp;
				}

				const isSilentLoad = initialLoadRef.current;

				processAlertsForPnL(nextAlerts, isSilentLoad, {
					modes,
					minPrice: minFilter,
					maxPrice: maxFilter,
					onlyBetOnce: oneBetOnly,
					betSizing,
					category: categoryFilter,
					winnerFilter,
				});

				if (shouldOpenFirstRow) {
					const firstAlert = nextAlerts[0];
					if (firstAlert) {
						const firstRowId = createRowId(firstAlert);
						setExpandedRows((prev) => ({ ...prev, [firstRowId]: true }));
						if (!detailsRef.current[firstRowId]) {
							void fetchDetailsForRow(firstRowId, firstAlert);
						}
					}
				}
				initialLoadRef.current = false;

				for (const alert of nextAlerts) {
					const rowId = createRowId(alert);
					if (expandedRows[rowId] && !detailsRef.current[rowId]) {
						void fetchDetailsForRow(rowId, alert);
					}
				}
			}
		} catch (error) {
			console.error("Failed to load insider alerts", error);
			setAlerts([]);
			setAlertsFilledThroughPage(page);
		} finally {
			if (showLoading) {
				setAlertsLoading(false);
			}
		}
	};

	const loadMarkets = async (page = 1, options?: { showLoading?: boolean }) => {
		const showLoading = options?.showLoading ?? true;
		if (showLoading) {
			setMarketsLoading(true);
		}

		try {
			const response = await fetchMarkets(page, MARKETS_PAGE_SIZE, false);
			setMarketsRaw(response.data);
			setMarketsPagination(response.pagination);
			setMarketsCurrentPage(response.pagination.page || page);
		} catch (error) {
			console.error("Failed to load markets", error);
			setMarketsRaw([]);
		} finally {
			if (showLoading) {
				setMarketsLoading(false);
			}
		}
	};

	const loadLazyMarketStats = async (conditionId: string) => {
		if (!conditionId) return;
		if (marketStatsInFlightRef.current.has(conditionId)) return;

		marketStatsInFlightRef.current.add(conditionId);
		setMarketStatsLoadingByCondition((prev) => ({
			...prev,
			[conditionId]: true,
		}));

		try {
			const market = await fetchMarket(conditionId);
			if (!market) return;

			const outcomesRaw = (market as { outcomes?: unknown }).outcomes;
			const outcomes = Array.isArray(outcomesRaw) ? outcomesRaw : [];
			if (outcomes.length === 0) return;

			const statsByOutcome = new Map<
				string,
				{ mean: number | null; stdDev: number | null; p95: number | null }
			>();
			const statsByTokenId = new Map<
				string,
				{ mean: number | null; stdDev: number | null; p95: number | null }
			>();
			for (const outcome of outcomes) {
				if (!outcome || typeof outcome !== "object") continue;
				const row = outcome as {
					tokenId?: unknown;
					outcome?: unknown;
					mean?: unknown;
					stdDev?: unknown;
					p95?: unknown;
				};

				const stats = {
					mean: toNumberOrNull(row.mean),
					stdDev: toNumberOrNull(row.stdDev),
					p95: toPositiveNumberOrNull(row.p95),
				};

				const tokenKey = String(row.tokenId ?? "");
				if (tokenKey) {
					statsByTokenId.set(tokenKey, stats);
				}

				const outcomeKey = String(row.outcome ?? "").toUpperCase();
				if (outcomeKey) {
					statsByOutcome.set(outcomeKey, stats);
				}
			}

			if (statsByTokenId.size === 0 && statsByOutcome.size === 0) return;

			setMarketsRaw((prev) =>
				prev.map((outcome) => {
					if (outcome.conditionId !== conditionId) return outcome;
					const tokenKey = String(outcome.tokenId ?? "");
					const stats =
						(tokenKey ? statsByTokenId.get(tokenKey) : undefined) ??
						statsByOutcome.get(String(outcome.outcome).toUpperCase());
					if (!stats) return outcome;

					return {
						...outcome,
						mean: stats.mean ?? outcome.mean ?? null,
						stdDev: stats.stdDev ?? outcome.stdDev ?? null,
						p95: stats.p95 ?? outcome.p95 ?? null,
					};
				}),
			);
		} catch (error) {
			console.error("Failed to lazy-load market stats", error);
		} finally {
			marketStatsInFlightRef.current.delete(conditionId);
			setMarketStatsLoadingByCondition((prev) => ({
				...prev,
				[conditionId]: false,
			}));
		}
	};

	const loadGlobalStats = async () => {
		const nextStats = await fetchGlobalStats();
		setGlobalStats(nextStats);
	};

	const loadInsiderStats = async () => {
		const nextStats = await fetchInsiderStats();
		setInsiderStats(nextStats);
	};

	const loadSyncStatus = async () => {
		const payload = await fetchHealth();
		if (
			!payload ||
			(Object.keys(payload).length === 0 && payload.constructor === Object)
		) {
			setSyncState({ label: "SYNC: ERROR", healthy: false, block: "--" });
			return;
		}

		const block = String(payload.current_block ?? "--");
		setSyncState({
			label: `SYNC: ONLINE`, //SYNC: ONL
			healthy: true,
			block,
		});
	};

	const refreshMarkets = async () => {
		if (!autoRefreshEnabled || backtestRunning) return;
		await Promise.all([
			loadInsiderAlerts(currentPage, { showLoading: false }),
			loadMarkets(marketsCurrentPage, { showLoading: false }),
		]);
	};

	const checkPendingResolutions = async () => {
		if (pendingAlertsRef.current.size === 0) return;

		const groupedByCondition = new Map<
			string,
			Array<{ id: string; pending: PendingAlert }>
		>();

		for (const [id, pending] of pendingAlertsRef.current.entries()) {
			if (!pending.conditionId) continue;
			const list = groupedByCondition.get(pending.conditionId) ?? [];
			list.push({ id, pending });
			groupedByCondition.set(pending.conditionId, list);
		}

		for (const [conditionId, entries] of groupedByCondition.entries()) {
			const market = await fetchMarket(conditionId);
			if (!market) continue;

			const marketClosed = toBoolean((market as { closed?: unknown }).closed);
			if (!marketClosed) continue;

			const outcomesRaw = (market as { outcomes?: unknown }).outcomes;
			const outcomes = Array.isArray(outcomesRaw) ? outcomesRaw : [];

			for (const { id, pending } of entries) {
				const resolvedOutcome = outcomes.find((outcome) => {
					if (typeof outcome !== "object" || outcome === null) return false;
					const tokenId = (outcome as { tokenId?: unknown }).tokenId;
					return String(tokenId ?? "") === String(pending.tokenId ?? "");
				});

				const winner =
					resolvedOutcome && typeof resolvedOutcome === "object"
						? inferInsiderWin(
								(resolvedOutcome as { winner?: unknown }).winner,
								(
									resolvedOutcome as {
										lastPrice?: unknown;
										last_price?: unknown;
									}
								).lastPrice ??
									(
										resolvedOutcome as {
											lastPrice?: unknown;
											last_price?: unknown;
										}
									).last_price,
							)
						: null;

				settleTrade(
					pending.cost,
					pending.price,
					winner,
					false,
					pending.mode,
					pending.betSizing,
				);
				pendingAlertsRef.current.delete(id);
			}
		}

		syncTrackerState();
	};

	const setStrategyEnabled = (mode: StrategyMode, enabled: boolean) => {
		setSelectedStrategies((prev) => {
			const nextRaw = enabled
				? [...prev, mode]
				: prev.filter((item) => item !== mode);
			const next = sortStrategies(nextRaw);
			if (next.length === 0) return prev;

			const history = [...allHistoryRef.current];
			resetTrackerState();
			if (history.length > 0) {
				processAlertsForPnL(history, true, {
					modes: next,
					minPrice: minPriceFilter,
					maxPrice: maxPriceFilter,
					onlyBetOnce,
					betSizing: selectedBetSizing,
					category: selectedCategory,
					winnerFilter: selectedWinnerFilter,
				});
			}

			void loadInsiderAlerts(currentPage, {
				modes: next,
				minPrice: minPriceFilter,
				maxPrice: maxPriceFilter,
				onlyBetOnce,
				betSizing: selectedBetSizing,
				category: selectedCategory,
				winnerFilter: selectedWinnerFilter,
			});

			return next;
		});
	};

	const applyFilters = (
		nextMinRaw: number,
		nextMaxRaw: number,
		nextOnlyBetOnce: boolean,
	) => {
		let min = clampPrice(nextMinRaw, 0.01);
		let max = clampPrice(nextMaxRaw, 1.0);

		if (min > max) {
			const temp = min;
			min = max;
			max = temp;
		}

		setMinPriceFilter(min);
		setMaxPriceFilter(max);
		setOnlyBetOnce(nextOnlyBetOnce);

		const history = [...allHistoryRef.current];
		resetTrackerState();
		if (history.length > 0) {
			processAlertsForPnL(history, true, {
				modes: selectedStrategies,
				minPrice: min,
				maxPrice: max,
				onlyBetOnce: nextOnlyBetOnce,
				betSizing: selectedBetSizing,
				category: selectedCategory,
				winnerFilter: selectedWinnerFilter,
			});
		}

		void loadInsiderAlerts(currentPage, {
			modes: selectedStrategies,
			minPrice: min,
			maxPrice: max,
			onlyBetOnce: nextOnlyBetOnce,
			betSizing: selectedBetSizing,
			category: selectedCategory,
			winnerFilter: selectedWinnerFilter,
		});
	};

	const applyBetSizingMode = (betOneDollarPerTrade: boolean) => {
		const nextBetSizing: BetSizing = betOneDollarPerTrade
			? "fixed_stake"
			: "target_payout";
		setSelectedBetSizing(nextBetSizing);

		const history = [...allHistoryRef.current];
		resetTrackerState();
		if (history.length > 0) {
			processAlertsForPnL(history, true, {
				modes: selectedStrategies,
				minPrice: minPriceFilter,
				maxPrice: maxPriceFilter,
				onlyBetOnce,
				betSizing: nextBetSizing,
				category: selectedCategory,
				winnerFilter: selectedWinnerFilter,
			});
		}

		void loadInsiderAlerts(currentPage, {
			modes: selectedStrategies,
			minPrice: minPriceFilter,
			maxPrice: maxPriceFilter,
			onlyBetOnce,
			betSizing: nextBetSizing,
			category: selectedCategory,
			winnerFilter: selectedWinnerFilter,
		});
	};

	const applyCategoryFilter = (nextCategoryRaw: string) => {
		const nextCategory = normalizeCategory(nextCategoryRaw);
		setSelectedCategory(nextCategory);

		const history = [...allHistoryRef.current];
		resetTrackerState();
		if (history.length > 0) {
			processAlertsForPnL(history, true, {
				modes: selectedStrategies,
				minPrice: minPriceFilter,
				maxPrice: maxPriceFilter,
				onlyBetOnce,
				betSizing: selectedBetSizing,
				category: nextCategory,
				winnerFilter: selectedWinnerFilter,
			});
		}

		void loadInsiderAlerts(currentPage, {
			modes: selectedStrategies,
			minPrice: minPriceFilter,
			maxPrice: maxPriceFilter,
			onlyBetOnce,
			betSizing: selectedBetSizing,
			category: nextCategory,
			winnerFilter: selectedWinnerFilter,
		});
	};

	const applyWinnerFilter = (nextWinnerFilter: WinnerFilter) => {
		setSelectedWinnerFilter(nextWinnerFilter);

		const history = [...allHistoryRef.current];
		resetTrackerState();
		if (history.length > 0) {
			processAlertsForPnL(history, true, {
				modes: selectedStrategies,
				minPrice: minPriceFilter,
				maxPrice: maxPriceFilter,
				onlyBetOnce,
				betSizing: selectedBetSizing,
				category: selectedCategory,
				winnerFilter: nextWinnerFilter,
			});
		}

		void loadInsiderAlerts(currentPage, {
			modes: selectedStrategies,
			minPrice: minPriceFilter,
			maxPrice: maxPriceFilter,
			onlyBetOnce,
			betSizing: selectedBetSizing,
			category: selectedCategory,
			winnerFilter: nextWinnerFilter,
		});
	};

	const runBacktest = async () => {
		if (backtestRunning) return;

		setBacktestRunning(true);
		setAutoRefreshEnabled(false);

		const continueExistingRun =
			backtestCanContinue && backtestHasNextRef.current;

		try {
			if (!continueExistingRun) {
				resetTrackerState();
				backtestNextPageRef.current = 1;
				backtestHasNextRef.current = true;
				setBacktestCanContinue(false);
			}

			let page = backtestNextPageRef.current;
			let hasNext = backtestHasNextRef.current;
			const runStartTrades = trackerRef.current.liveTrades;

			while (hasNext) {
				const response = await fetchAlerts(
					page,
					BACKTEST_PAGE_SIZE,
					selectedCategory === "ALL" ? undefined : selectedCategory,
				);
				processAlertsForPnL(response.data, false, {
					modes: selectedStrategies,
					minPrice: minPriceFilter,
					maxPrice: maxPriceFilter,
					onlyBetOnce,
					betSizing: selectedBetSizing,
					category: selectedCategory,
					winnerFilter: selectedWinnerFilter,
				});
				await checkPendingResolutions();

				hasNext = response.pagination.hasNext;
				page = (response.pagination.page || page) + 1;
				backtestHasNextRef.current = hasNext;
				backtestNextPageRef.current = page;

				const processedTradesThisRun =
					trackerRef.current.liveTrades - runStartTrades;
				if (hasNext && processedTradesThisRun >= BACKTEST_PAUSE_TRADE_COUNT) {
					setBacktestCanContinue(true);
					return;
				}

				await new Promise((resolve) =>
					setTimeout(resolve, BACKTEST_PAGE_DELAY_MS),
				);
			}

			await checkPendingResolutions();

			backtestHasNextRef.current = false;
			backtestNextPageRef.current = 1;
			setBacktestCanContinue(false);
		} catch (error) {
			console.error("Backtest failed", error);
		} finally {
			setBacktestRunning(false);
		}
	};

	const toggleDetails = (rowId: string) => {
		if (audioCtxRef.current?.state === "suspended") {
			void audioCtxRef.current.resume();
		}

		setExpandedRows((prev) => {
			const next = { ...prev, [rowId]: !prev[rowId] };
			const alert = alertsByRowId.get(rowId);
			if (next[rowId] && !detailsRef.current[rowId] && alert) {
				void fetchDetailsForRow(rowId, alert);
			}
			return next;
		});
	};

	const changeAlertsPage = (delta: number) => {
		const targetPage = Math.max(1, currentPage + delta);
		setAutoRefreshEnabled(false);
		void loadInsiderAlerts(targetPage, { openFirstRow: true });
	};

	const changeMarketsPage = (delta: number) => {
		const targetPage = Math.max(1, marketsCurrentPage + delta);
		setAutoRefreshEnabled(false);
		void loadMarkets(targetPage);
	};

	useEffect(() => {
		for (const market of groupedMarkets) {
			const hasMissingStats = market.outcomes.some(
				(outcome) =>
					outcome.mean === null ||
					outcome.mean === undefined ||
					outcome.stdDev === null ||
					outcome.stdDev === undefined ||
					outcome.p95 === null ||
					outcome.p95 === undefined,
			);
			if (!hasMissingStats) continue;
			if (marketStatsRequestedRef.current.has(market.conditionId)) continue;
			marketStatsRequestedRef.current.add(market.conditionId);
			void loadLazyMarketStats(market.conditionId);
		}
	}, [groupedMarkets]);

	useEffect(() => {
		let index = 0;
		setTypewriterText("");

		const timer = setInterval(() => {
			index += 1;
			setTypewriterText(TYPEWRITER_TEXT.slice(0, index));
			if (index >= TYPEWRITER_TEXT.length) {
				clearInterval(timer);
			}
		}, 30);

		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		void Promise.all([
			loadSyncStatus(),
			loadInsiderStats(),
			loadGlobalStats(),
			loadInsiderAlerts(1, { openFirstRow: true }),
			loadMarkets(1),
		]);
	}, []);

	useEffect(() => {
		const timer = setInterval(() => {
			void loadSyncStatus();
		}, 1_000);

		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		const timer = setInterval(() => {
			void loadInsiderStats();
		}, 1_000);

		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		const timer = setInterval(() => {
			void loadGlobalStats();
		}, 5_000);

		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		const timer = setInterval(() => {
			void refreshMarkets();
		}, 5_000);

		return () => clearInterval(timer);
	}, [
		autoRefreshEnabled,
		backtestRunning,
		currentPage,
		marketsCurrentPage,
		selectedCategory,
		selectedStrategies,
		minPriceFilter,
		maxPriceFilter,
		onlyBetOnce,
		selectedBetSizing,
		selectedWinnerFilter,
	]);

	useEffect(() => {
		const timer = setInterval(() => {
			void checkPendingResolutions();
		}, 10_000);

		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		return () => {
			if (audioCtxRef.current) {
				void audioCtxRef.current.close();
			}
		};
	}, []);

	return (
		<div className="terminal-app" data-theme="night">
			<div className="container">
				<TerminalHeader
					currentBlock={currentBlockText}
					syncLabel={syncState.label}
					syncHealthy={syncState.healthy}
				/>

				<TerminalIntro text={typewriterText} />

				<AlertsSection
					rows={alertRows}
					pagination={alertsPagination}
					selectedCategory={selectedCategory}
					selectedWinnerFilter={selectedWinnerFilter}
					categoryOptions={categoryOptions}
					isLoading={alertsLoading}
					onPrev={() => changeAlertsPage(-1)}
					onNext={() => changeAlertsPage(1)}
					onCategoryChange={applyCategoryFilter}
					onWinnerFilterChange={applyWinnerFilter}
					onToggleDetails={toggleDetails}
				/>

				<DetectionSection
					totalInsiders={Number(insiderStats.total_insiders || 0)}
					yesInsiders={Number(insiderStats.yes_insiders || 0)}
					noInsiders={Number(insiderStats.no_insiders || 0)}
					insiderVolume={formatNum(insiderStats.total_volume || 0)}
				/>

				<MarketsSection
					markets={groupedMarkets}
					pagination={marketsPagination}
					isLoading={marketsLoading}
					marketStatsLoadingByCondition={marketStatsLoadingByCondition}
					onPrev={() => changeMarketsPage(-1)}
					onNext={() => changeMarketsPage(1)}
				/>

				<GlobalStatsSection
					accounts={formatNum(globalStats.total_accounts || 0)}
					markets={formatNum(globalStats.total_markets || 0)}
					trades={formatNum(globalStats.total_trades || 0)}
					activePositions={formatNum(globalStats.active_positions || 0)}
				/>

				<LiveTrackerControls
					minPrice={minPriceFilter}
					maxPrice={maxPriceFilter}
					onlyBetOnce={onlyBetOnce}
					betOneDollarPerTrade={selectedBetSizing === "fixed_stake"}
					selectedStrategies={selectedStrategies}
					onMinPriceChange={(value) =>
						applyFilters(value, maxPriceFilter, onlyBetOnce)
					}
					onMaxPriceChange={(value) =>
						applyFilters(minPriceFilter, value, onlyBetOnce)
					}
					onOnlyBetOnceChange={(value) =>
						applyFilters(minPriceFilter, maxPriceFilter, value)
					}
					onBetOneDollarPerTradeChange={applyBetSizingMode}
					onStrategyChange={setStrategyEnabled}
				/>

				<LiveTrackerCards
					totalBet={tracker.liveTotalBet}
					openInterest={tracker.openInterest}
					realizedPnL={tracker.realizedPnL}
					liveTrades={tracker.liveTrades}
					liveWins={tracker.liveWins}
					liveLosses={tracker.liveLosses}
					alertsPage={alertsPagination.page || currentPage}
					alertsTotalPages={alertsPagination.totalPages || 1}
					alertsFilledThroughPage={alertsFilledThroughPage}
					backtestCanContinue={backtestCanContinue}
					backtestRunning={backtestRunning}
					onRunBacktest={runBacktest}
				/>

				<TerminalBanner currentBlock={currentBlockText} />
			</div>

			<div className="floating-cash-overlay" aria-hidden="true">
				{floatingCash.map((entry) => (
					<div
						key={entry.id}
						className={`floating-cash ${entry.isLoss ? "loss" : "win"}`}
						style={{ left: `calc(50% + ${entry.offset}vw)` }}
					>
						<span className="floating-cash-tag">
							{entry.isLoss ? "LOSS" : "WIN"}
						</span>
						<span className="floating-cash-value">{entry.text}</span>
					</div>
				))}
			</div>
		</div>
	);
}
