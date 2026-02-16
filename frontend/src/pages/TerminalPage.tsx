import { useEffect, useMemo, useRef, useState } from "react";
import {
	fetchAlerts,
	fetchCategories,
	fetchGlobalStats,
	fetchHealth,
	fetchInsiderStats,
	fetchInsiderTrades,
	fetchMarket,
	fetchTopLiquidityMarkets,
} from "../api/terminalApi";
import {
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
import {
	calculateTradeCost,
	calculateWinProfit,
	categoryMatches,
	createAlertKey,
	getEntryPrice,
	inferInsiderWin,
	isPriceInRange,
	normalizeCategory,
	normalizePriceRange,
	parseWinnerValue,
	resolveClosedAlertWinner,
	alertMatchesFilters as sharedAlertMatchesFilters,
	sortStrategies,
	winnerFilterMatches,
} from "../lib/backtest";
import type { AlertRowView } from "../types/api";
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
const ALERTS_PAGE_SIZE = 10;
const MAX_ALERT_FILL_PAGES = 10;
const MARKETS_DISPLAY_LIMIT = 5;
const MARKETS_PAGE_SIZE = 5;
const BACKTEST_PAGE_SIZE = 50;
const BACKTEST_PAUSE_TRADE_COUNT = 500;
const BACKTEST_PAGE_DELAY_MS = 0;
const BACKTEST_RESOLUTION_CHECK_EVERY_PAGES = 5;

const _STRATEGY_ORDER: StrategyMode[] = ["follow_insider", "reverse_insider"];
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

function alertMatchesFilters(
	alert: AlertItem,
	modes: StrategyMode[],
	minPrice: number,
	maxPrice: number,
	selectedCategory = "ALL",
	winnerFilter: WinnerFilter = "BOTH",
	sides: string[] = ["YES", "NO"],
): boolean {
	const outcome = mapOutcome(alert.outcome).label;
	if ((outcome === "YES" || outcome === "NO") && !sides.includes(outcome))
		return false;

	return sharedAlertMatchesFilters(alert, {
		strategies: modes,
		minPrice,
		maxPrice,
		category: selectedCategory,
		winnerFilter,
		onlyBetOnce: false,
		betSizing: "target_payout",
	});
}

function alertMatchesFiltersCount(
	alerts: AlertItem[],
	modes: StrategyMode[],
	minPrice: number,
	maxPrice: number,
	selectedCategory = "ALL",
	winnerFilter: WinnerFilter = "BOTH",
	sides: string[] = ["YES", "NO"],
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
				sides,
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
	const [soundEnabled, setSoundEnabled] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState("ALL");
	const [selectedWinnerFilter, setSelectedWinnerFilter] =
		useState<WinnerFilter>("BOTH");
	const [selectedStrategies, setSelectedStrategies] = useState<StrategyMode[]>([
		"follow_insider",
	]);
	const [selectedSides, setSelectedSides] = useState<string[]>(["YES", "NO"]);

	const [marketStatsLoadingByCondition, setMarketStatsLoadingByCondition] =
		useState<Record<string, boolean>>({});
	const [floatingCash, setFloatingCash] = useState<FloatingCash[]>([]);

	const [tracker, setTracker] = useState<TrackerState>(INITIAL_TRACKER_STATE);

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
	const burstStartTimeRef = useRef<number>(0);
	const lastSoundTimeRef = useRef<number>(0);
	const soundCountRef = useRef<number>(0);
	const soundBurstStartRef = useRef<number>(0);
	const marketStatsRequestedRef = useRef(new Set<string>());
	const marketStatsInFlightRef = useRef(new Set<string>());
	const backtestNextPageRef = useRef(1);
	const backtestHasNextRef = useRef(false);
	const backtestRunLockRef = useRef(false);
	const alertsRequestSeqRef = useRef(0);
	const refreshInFlightRef = useRef(false);
	const pendingResolutionInFlightRef = useRef(false);
	const isMountedRef = useRef(true);
	const liveRecalcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const lastLiveRecalcSignatureRef = useRef("");
	const pnlComputationModeRef = useRef<"live" | "backtest">("live");

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
			.sort((a, b) => {
				const byActivity = b.hnScore - a.hnScore;
				if (byActivity !== 0) return byActivity;

				const byTrades = b.totalMarketTrades - a.totalMarketTrades;
				if (byTrades !== 0) return byTrades;

				return b.totalMarketVol - a.totalMarketVol;
			})
			.slice(0, MARKETS_DISPLAY_LIMIT);
	}, [marketsRaw]);

	const [categoryOptions, setCategoryOptions] = useState<string[]>(
		Array.from(DEFAULT_CATEGORY_OPTIONS),
	);

	useEffect(() => {
		void fetchCategories().then((cats) => {
			// Merge with defaults to ensure basic structure
			const unique = new Set([...DEFAULT_CATEGORY_OPTIONS, ...cats]);
			// Ensure selected category is present
			if (selectedCategory && selectedCategory !== "ALL") {
				unique.add(selectedCategory);
			}

			const sorted = Array.from(unique).sort((a, b) => {
				// ALL always first
				if (a === "ALL") return -1;
				if (b === "ALL") return 1;

				// Then follow default order for core categories
				const idxA = (DEFAULT_CATEGORY_OPTIONS as readonly string[]).indexOf(a);
				const idxB = (DEFAULT_CATEGORY_OPTIONS as readonly string[]).indexOf(b);

				if (idxA !== -1 && idxB !== -1) return idxA - idxB;
				if (idxA !== -1) return -1;
				if (idxB !== -1) return 1;

				// Alphabetical for the rest
				return a.localeCompare(b);
			});

			setCategoryOptions(sorted);
		});
	}, [selectedCategory]);

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
				selectedSides,
			);
		});
	}, [
		alerts,
		maxPriceFilter,
		minPriceFilter,
		selectedCategory,
		selectedStrategies,
		selectedWinnerFilter,
		selectedSides,
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
				question: alert.question ?? "",
				timestamp: Number(alert.alert_time),
				conditionId: alert.conditionId ?? "",
				priceFormatted: Number(alert.price || 0).toFixed(2),
				volume: Number(alert.volume || 0),
				price: Number(alert.price || 0),
			};
		});
	}, [filteredAlerts]);

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

	const resetBacktestProgress = () => {
		backtestHasNextRef.current = false;
		backtestNextPageRef.current = 1;
		setBacktestCanContinue(false);
	};

	const switchToLiveComputation = () => {
		pnlComputationModeRef.current = "live";
		lastLiveRecalcSignatureRef.current = "";
	};

	const processCashQueue = () => {
		if (isAnimatingCashRef.current || cashQueueRef.current.length === 0) {
			if (cashQueueRef.current.length === 0) {
				burstStartTimeRef.current = 0;
			}
			return;
		}

		if (burstStartTimeRef.current === 0) {
			burstStartTimeRef.current = Date.now();
		} else if (Date.now() - burstStartTimeRef.current > 3000) {
			cashQueueRef.current = [];
			isAnimatingCashRef.current = false;
			burstStartTimeRef.current = 0;
			return;
		}

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
		}, 250);
	};

	const _showFloatingCash = (text: string, isLoss = false) => {
		cashQueueRef.current.push({ text, isLoss });
		processCashQueue();
	};

	const _playCashSound = () => {
		if (!soundEnabled) return;
		const now = Date.now();

		// Reset burst/count if idle for more than 5 seconds
		if (now - lastSoundTimeRef.current > 5000) {
			soundBurstStartRef.current = 0;
			soundCountRef.current = 0;
		}

		// Burst limit: max 6 seconds of sound
		if (soundBurstStartRef.current === 0) {
			soundBurstStartRef.current = now;
		} else if (now - soundBurstStartRef.current > 6000) {
			return;
		}

		// Throttle: max 2 times per 3 seconds
		if (now - lastSoundTimeRef.current > 3000) {
			soundCountRef.current = 1;
			lastSoundTimeRef.current = now;
		} else {
			if (soundCountRef.current >= 2) return;
			soundCountRef.current++;
		}

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
		gain1.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
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
			gain2.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
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
	): boolean => {
		if (insiderWon === null || insiderWon === undefined) {
			return false;
		}

		const strategyWon = didStrategyWin(insiderWon, mode);

		if (strategyWon) {
			const profit = calculateWinProfit(cost, entryPrice, betSizing);
			trackerRef.current.realizedPnL += profit;
			trackerRef.current.liveWins += 1;
			// if (!backtestRunning && !silent) {
			// 	playCashSound();
			// 	showFloatingCash(`+$${profit.toFixed(2)}`);
			// }
			return true;
		}

		trackerRef.current.realizedPnL -= cost;
		trackerRef.current.liveLosses += 1;
		// if (!backtestRunning && !silent) {
		// 	showFloatingCash(`-$${cost.toFixed(2)}`, true);
		// }
		return true;
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
			resolveClosedWithMarketDataOnly?: boolean;
			sides?: string[];
		},
	) => {
		const modes = sortStrategies(options?.modes ?? selectedStrategies);
		const normalizedRange = normalizePriceRange(
			options?.minPrice ?? minPriceFilter,
			options?.maxPrice ?? maxPriceFilter,
		);
		const minFilter = normalizedRange.min;
		const maxFilter = normalizedRange.max;
		const oneBetOnly = options?.onlyBetOnce ?? onlyBetOnce;
		const betSizing = options?.betSizing ?? selectedBetSizing;
		const categoryFilter = normalizeCategory(
			options?.category ?? selectedCategory,
		);
		const winnerFilter = options?.winnerFilter ?? selectedWinnerFilter;
		const sides = options?.sides ?? selectedSides;
		const resolveClosedWithMarketDataOnly = Boolean(
			options?.resolveClosedWithMarketDataOnly,
		);

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

			const outcome = mapOutcome(alert.outcome).label;
			if (!sides.includes(outcome)) continue;

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
					// Consistency Check: If market is closed but winner is unknown, we must NOT count this trade.
					// This matches the behavior in backtest.ts (processTrade) to avoid "zombie" open interest.
					if (alert.closed) {
						const preCheckWinner = resolveClosedAlertWinner(
							alert.winner,
							alert.market_price ?? alert.price,
							resolveClosedWithMarketDataOnly,
						);
						if (preCheckWinner === null) {
							continue;
						}
					}

					processedAlertsRef.current.add(tradeId);
					if (conditionKey && oneBetOnly) {
						betConditionsRef.current.add(conditionKey);
					}

					trackerRef.current.liveTrades += 1;
					const cost = calculateTradeCost(entryPrice, betSizing);

					trackerRef.current.liveTotalBet += cost;
					const pendingTrade: PendingAlert = {
						id: tradeId,
						trader: alert.user,
						detectedAt: Number(alert.alert_time),
						volume: Number(alert.volume || 0),
						conditionId: alert.conditionId,
						tokenId: alert.tokenId,
						user: alert.user,
						alert_time: Number(alert.alert_time),
						outcome: String(alert.outcome ?? ""),
						price: entryPrice,
						marketQuestion: alert.question ?? "",
						cost,
						mode,
						betSizing,
					};

					if (!alert.closed) {
						pendingAlertsRef.current.set(tradeId, pendingTrade);
					} else {
						const winner = resolveClosedAlertWinner(
							alert.winner,
							alert.market_price ?? alert.price,
							resolveClosedWithMarketDataOnly,
						);
						const didSettle = settleTrade(
							cost,
							entryPrice,
							winner,
							silent,
							mode,
							betSizing,
						);
						if (!didSettle) {
							pendingAlertsRef.current.set(tradeId, pendingTrade);
						}
					}
				} else if (isPending && alert.closed) {
					const pending = pendingAlertsRef.current.get(tradeId);
					if (!pending) continue;

					const winner = resolveClosedAlertWinner(
						alert.winner,
						alert.market_price ?? alert.price,
						resolveClosedWithMarketDataOnly,
					);
					const didSettle = settleTrade(
						pending.cost,
						pending.price,
						winner,
						silent,
						pending.mode,
						pending.betSizing,
					);
					if (didSettle) {
						pendingAlertsRef.current.delete(tradeId);
					}
				}
			}
		}

		syncTrackerState();
	};

	const resetTrackerState = (options: { clearHistory?: boolean } = {}) => {
		const { clearHistory = true } = options;
		trackerRef.current = { ...INITIAL_TRACKER_STATE };

		if (clearHistory) {
			processedAlertsRef.current.clear();
			allHistoryRef.current = [];
			lastAlertTimeRef.current = 0;
		} else {
			// Reset only trade-specific processing, keep history-tracking keys
			const nextProcessed = new Set<string>();
			for (const key of processedAlertsRef.current) {
				if (key.startsWith("history:")) {
					nextProcessed.add(key);
				}
			}
			processedAlertsRef.current = nextProcessed;
		}

		betConditionsRef.current.clear();
		pendingAlertsRef.current.clear();
		resetBacktestProgress();
		syncTrackerState();
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
			showLoading?: boolean;
			sides?: string[];
		},
	) => {
		const requestId = ++alertsRequestSeqRef.current;
		const showLoading = options?.showLoading ?? true;
		if (showLoading && isMountedRef.current) {
			setAlertsLoading(true);
		}

		try {
			const modes = sortStrategies(options?.modes ?? selectedStrategies);
			const normalizedRange = normalizePriceRange(
				options?.minPrice ?? minPriceFilter,
				options?.maxPrice ?? maxPriceFilter,
			);
			const minFilter = normalizedRange.min;
			const maxFilter = normalizedRange.max;
			const categoryFilter = normalizeCategory(
				options?.category ?? selectedCategory,
			);
			const winnerFilter = options?.winnerFilter ?? selectedWinnerFilter;
			const sides = options?.sides ?? selectedSides;

			const response = await fetchAlerts(
				page,
				ALERTS_PAGE_SIZE,
				categoryFilter === "ALL" ? undefined : categoryFilter,
			);
			if (requestId !== alertsRequestSeqRef.current || !isMountedRef.current) {
				return;
			}
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
					sides,
				) < ALERTS_PAGE_SIZE &&
				hasNext &&
				fillCount < MAX_ALERT_FILL_PAGES
			) {
				if (
					requestId !== alertsRequestSeqRef.current ||
					!isMountedRef.current
				) {
					return;
				}
				const extra = await fetchAlerts(
					nextPage,
					ALERTS_PAGE_SIZE,
					categoryFilter === "ALL" ? undefined : categoryFilter,
				);
				if (
					requestId !== alertsRequestSeqRef.current ||
					!isMountedRef.current
				) {
					return;
				}
				appendUnique(extra.data);
				filledThroughPage = extra.pagination.page || nextPage;
				hasNext = extra.pagination.hasNext;
				nextPage = filledThroughPage + 1;
				fillCount += 1;
			}

			if (requestId !== alertsRequestSeqRef.current || !isMountedRef.current) {
				return;
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

				initialLoadRef.current = false;
			}
		} catch (error) {
			if (requestId !== alertsRequestSeqRef.current || !isMountedRef.current) {
				return;
			}
			console.error("Failed to load insider alerts", error);
			setAlerts([]);
			setAlertsFilledThroughPage(page);
		} finally {
			if (
				showLoading &&
				requestId === alertsRequestSeqRef.current &&
				isMountedRef.current
			) {
				setAlertsLoading(false);
			}
		}
	};

	const loadMarkets = async (page = 1, options?: { showLoading?: boolean }) => {
		const showLoading = options?.showLoading ?? true;
		if (showLoading && isMountedRef.current) {
			setMarketsLoading(true);
		}

		try {
			const response = await fetchTopLiquidityMarkets(
				page,
				MARKETS_PAGE_SIZE,
				false,
			);
			if (!isMountedRef.current) return;
			setMarketsRaw(response.data);
			setMarketsPagination(response.pagination);
			setMarketsCurrentPage(response.pagination.page || page);
		} catch (error) {
			if (!isMountedRef.current) return;
			console.error("Failed to load markets", error);
			setMarketsRaw([]);
		} finally {
			if (showLoading && isMountedRef.current) {
				setMarketsLoading(false);
			}
		}
	};

	const loadLazyMarketStats = async (conditionId: string) => {
		if (!conditionId) return;
		if (marketStatsInFlightRef.current.has(conditionId)) return;

		marketStatsInFlightRef.current.add(conditionId);
		if (isMountedRef.current) {
			setMarketStatsLoadingByCondition((prev) => ({
				...prev,
				[conditionId]: true,
			}));
		}

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

			if (!isMountedRef.current) return;
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
			if (isMountedRef.current) {
				setMarketStatsLoadingByCondition((prev) => ({
					...prev,
					[conditionId]: false,
				}));
			}
		}
	};

	const loadGlobalStats = async () => {
		const nextStats = await fetchGlobalStats();
		if (!isMountedRef.current) return;
		setGlobalStats(nextStats);
	};

	const loadInsiderStats = async () => {
		const nextStats = await fetchInsiderStats();
		if (!isMountedRef.current) return;
		setInsiderStats(nextStats);
	};

	const loadSyncStatus = async () => {
		const payload = await fetchHealth();
		if (!isMountedRef.current) return;
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
		if (refreshInFlightRef.current) return;
		refreshInFlightRef.current = true;
		try {
			await Promise.all([
				loadInsiderAlerts(currentPage, { showLoading: false }),
				loadMarkets(marketsCurrentPage, { showLoading: false }),
			]);
		} finally {
			refreshInFlightRef.current = false;
		}
	};

	const checkPendingResolutions = async () => {
		if (pendingResolutionInFlightRef.current) return;
		if (pendingAlertsRef.current.size === 0) return;
		pendingResolutionInFlightRef.current = true;

		try {
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
					const pendingTokenId = String(pending.tokenId ?? "");
					const pendingOutcome = String(pending.outcome ?? "").toUpperCase();
					const resolvedOutcome = outcomes.find((outcome) => {
						if (typeof outcome !== "object" || outcome === null) return false;
						const row = outcome as {
							tokenId?: unknown;
							outcome?: unknown;
						};
						const tokenId = String(row.tokenId ?? "");
						if (pendingTokenId && tokenId) {
							return tokenId === pendingTokenId;
						}
						if (!pendingOutcome) return false;
						return String(row.outcome ?? "").toUpperCase() === pendingOutcome;
					});

					const winner =
						resolvedOutcome && typeof resolvedOutcome === "object"
							? parseWinnerValue(
									(resolvedOutcome as { winner?: unknown }).winner,
								)
							: null;
					if (winner === null) continue;

					const didSettle = settleTrade(
						pending.cost,
						pending.price,
						winner,
						false,
						pending.mode,
						pending.betSizing,
					);
					if (didSettle) {
						pendingAlertsRef.current.delete(id);
					}
				}
			}

			syncTrackerState();
		} finally {
			pendingResolutionInFlightRef.current = false;
		}
	};

	const setStrategyEnabled = (mode: StrategyMode, enabled: boolean) => {
		if (backtestRunning) return;
		switchToLiveComputation();
		setSelectedStrategies((prev) => {
			const nextRaw = enabled
				? [...prev, mode]
				: prev.filter((item) => item !== mode);
			const next = sortStrategies(nextRaw);
			if (next.length === 0) return prev;

			resetBacktestProgress();
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
		if (backtestRunning) return;
		switchToLiveComputation();
		const { min, max } = normalizePriceRange(nextMinRaw, nextMaxRaw);

		setMinPriceFilter(min);
		setMaxPriceFilter(max);
		setOnlyBetOnce(nextOnlyBetOnce);

		resetBacktestProgress();
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
		if (backtestRunning) return;
		switchToLiveComputation();
		const nextBetSizing: BetSizing = betOneDollarPerTrade
			? "fixed_stake"
			: "target_payout";
		setSelectedBetSizing(nextBetSizing);
		resetBacktestProgress();
	};

	const applyCategoryFilter = (nextCategoryRaw: string) => {
		if (backtestRunning) return;
		switchToLiveComputation();
		const nextCategory = normalizeCategory(nextCategoryRaw);
		setSelectedCategory(nextCategory);

		resetBacktestProgress();
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
		if (backtestRunning) return;
		switchToLiveComputation();
		setSelectedWinnerFilter(nextWinnerFilter);

		resetBacktestProgress();
		void loadInsiderAlerts(currentPage, {
			modes: selectedStrategies,
			minPrice: minPriceFilter,
			maxPrice: maxPriceFilter,
			onlyBetOnce,
			betSizing: selectedBetSizing,
			category: selectedCategory,
			winnerFilter: nextWinnerFilter,
			sides: selectedSides,
		});
	};

	const toggleSide = (side: string, enabled: boolean) => {
		if (backtestRunning) return;
		switchToLiveComputation();

		setSelectedSides((prev) => {
			const next = enabled
				? [...prev, side]
				: prev.filter((item) => item !== side);

			resetBacktestProgress();
			void loadInsiderAlerts(currentPage, {
				modes: selectedStrategies,
				minPrice: minPriceFilter,
				maxPrice: maxPriceFilter,
				onlyBetOnce,
				betSizing: selectedBetSizing,
				category: selectedCategory,
				winnerFilter: selectedWinnerFilter,
				sides: next,
			});

			return next;
		});
	};

	const runBacktest = async () => {
		if (backtestRunning || backtestRunLockRef.current) return;

		backtestRunLockRef.current = true;
		pnlComputationModeRef.current = "backtest";
		if (liveRecalcDebounceRef.current) {
			clearTimeout(liveRecalcDebounceRef.current);
			liveRecalcDebounceRef.current = null;
		}
		setBacktestRunning(true);
		setAutoRefreshEnabled(false);
		const normalizedRange = normalizePriceRange(minPriceFilter, maxPriceFilter);

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
			let pagesSinceResolutionCheck = 0;

			while (hasNext) {
				const response = await fetchAlerts(
					page,
					BACKTEST_PAGE_SIZE,
					selectedCategory === "ALL" ? undefined : selectedCategory,
				);
				processAlertsForPnL(response.data, false, {
					modes: selectedStrategies,
					minPrice: normalizedRange.min,
					maxPrice: normalizedRange.max,
					onlyBetOnce,
					betSizing: selectedBetSizing,
					category: selectedCategory,
					winnerFilter: selectedWinnerFilter,
					resolveClosedWithMarketDataOnly: true,
				});
				hasNext = response.pagination.hasNext;
				page = (response.pagination.page || page) + 1;
				backtestHasNextRef.current = hasNext;
				backtestNextPageRef.current = page;
				pagesSinceResolutionCheck += 1;
				if (
					pagesSinceResolutionCheck >= BACKTEST_RESOLUTION_CHECK_EVERY_PAGES ||
					!hasNext
				) {
					await checkPendingResolutions();
					pagesSinceResolutionCheck = 0;
				}

				const processedTradesThisRun =
					trackerRef.current.liveTrades - runStartTrades;
				if (hasNext && processedTradesThisRun >= BACKTEST_PAUSE_TRADE_COUNT) {
					setBacktestCanContinue(true);
					return;
				}

				if (BACKTEST_PAGE_DELAY_MS > 0) {
					await new Promise((resolve) =>
						setTimeout(resolve, BACKTEST_PAGE_DELAY_MS),
					);
				}
			}

			await checkPendingResolutions();

			resetBacktestProgress();
			pnlComputationModeRef.current = "live";
		} catch (error) {
			console.error("Backtest failed", error);
			pnlComputationModeRef.current = "live";
		} finally {
			backtestRunLockRef.current = false;
			setBacktestRunning(false);
		}
	};

	const changeAlertsPage = (delta: number) => {
		switchToLiveComputation();
		const targetPage = Math.max(1, currentPage + delta);
		setAutoRefreshEnabled(false);
		void loadInsiderAlerts(targetPage);
	};

	const changeMarketsPage = (delta: number) => {
		switchToLiveComputation();
		const targetPage = Math.max(1, marketsCurrentPage + delta);
		setAutoRefreshEnabled(false);
		void loadMarkets(targetPage);
	};

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (backtestRunning) return;
		if (pnlComputationModeRef.current !== "live") return;

		const modes = sortStrategies(selectedStrategies);
		const normalizedRange = normalizePriceRange(minPriceFilter, maxPriceFilter);
		const categoryFilter = normalizeCategory(selectedCategory);
		const settingsSnapshot = {
			modes,
			minPrice: normalizedRange.min,
			maxPrice: normalizedRange.max,
			onlyBetOnce,
			betSizing: selectedBetSizing,
			category: categoryFilter,
			winnerFilter: selectedWinnerFilter,
		};
		const alertsSnapshot = alerts.map((alert) => createAlertKey(alert));
		const nextSignature = JSON.stringify({
			settings: settingsSnapshot,
			alerts: alertsSnapshot,
		});

		if (nextSignature === lastLiveRecalcSignatureRef.current) {
			return;
		}

		if (liveRecalcDebounceRef.current) {
			clearTimeout(liveRecalcDebounceRef.current);
			liveRecalcDebounceRef.current = null;
		}

		liveRecalcDebounceRef.current = setTimeout(() => {
			if (!isMountedRef.current) return;
			if (backtestRunning) return;
			if (pnlComputationModeRef.current !== "live") return;
			if (nextSignature === lastLiveRecalcSignatureRef.current) return;

			lastLiveRecalcSignatureRef.current = nextSignature;

			// Ensure current alerts are tracked in history
			for (const alert of alerts) {
				const historyId = createAlertKey(alert);
				const historyKey = `history:${historyId}`;
				if (!processedAlertsRef.current.has(historyKey)) {
					processedAlertsRef.current.add(historyKey);
					allHistoryRef.current.push(alert);
				}
			}

			resetTrackerState({ clearHistory: false });

			if (allHistoryRef.current.length === 0) return;

			// Sort history by time ascending for consistent recalculation (especially for onlyBetOnce)
			const sortedHistory = [...allHistoryRef.current].sort(
				(a, b) => Number(a.alert_time) - Number(b.alert_time),
			);

			processAlertsForPnL(sortedHistory, true, {
				modes,
				minPrice: normalizedRange.min,
				maxPrice: normalizedRange.max,
				onlyBetOnce,
				betSizing: selectedBetSizing,
				category: categoryFilter,
				winnerFilter: selectedWinnerFilter,
				resolveClosedWithMarketDataOnly: true, // Enforce strict mode to match Backtest Runner
			});
		}, 120);

		return () => {
			if (liveRecalcDebounceRef.current) {
				clearTimeout(liveRecalcDebounceRef.current);
				liveRecalcDebounceRef.current = null;
			}
		};
	}, [
		alerts,
		backtestRunning,
		maxPriceFilter,
		minPriceFilter,
		onlyBetOnce,
		selectedBetSizing,
		selectedCategory,
		selectedStrategies,
		selectedWinnerFilter,
	]);

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
			loadInsiderAlerts(1),
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
		selectedSides,
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
		<div className="terminal-app">
			<div className="container mx-auto max-w-6xl px-4">
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
					disabled={backtestRunning}
					soundEnabled={soundEnabled}
					selectedStrategies={selectedStrategies}
					selectedSides={selectedSides}
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
					onSoundToggle={setSoundEnabled}
					onStrategyChange={setStrategyEnabled}
					onSideToggle={toggleSide}
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
						<span className="floating-cash-value">{entry.text}</span>
					</div>
				))}
			</div>
		</div>
	);
}
