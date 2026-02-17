import {
	calculatePnL,
	normalizeCategory,
	type FilterSettings,
} from "@/lib/backtest";
import type { TerminalUiState } from "@/reducers/terminalUiReducer";
import type { AlertItem, TrackerState } from "@/types/terminal";

const EMPTY_TRACKER: TrackerState = {
	realizedPnL: 0,
	liveTotalBet: 0,
	liveTrades: 0,
	liveWins: 0,
	liveLosses: 0,
	openInterest: 0,
	totalBet: 0,
};

function buildFilterSettings(ui: TerminalUiState): FilterSettings {
	return {
		strategies: ui.strategies,
		minPrice: ui.minPrice,
		maxPrice: ui.maxPrice,
		category: normalizeCategory(ui.category),
		winnerFilter: ui.winnerFilter,
		onlyBetOnce: ui.onlyBetOnce,
		betSizing: ui.betSizing,
	};
}

function applySideFilter(alerts: AlertItem[], ui: TerminalUiState): AlertItem[] {
	const allowed = new Set(ui.sides);
	return alerts.filter((alert) => {
		const outcome = String(alert.outcome ?? "").toUpperCase();
		if (outcome === "YES" || outcome === "NO") {
			return allowed.has(outcome as "YES" | "NO");
		}
		return true;
	});
}

export function computeTrackerFromAlerts(
	alerts: AlertItem[],
	ui: TerminalUiState,
): TrackerState {
	if (ui.strategies.length === 0 || alerts.length === 0) {
		return EMPTY_TRACKER;
	}

	const filtered = applySideFilter(alerts, ui)
		.slice()
		.sort((a, b) => Number(a.alert_time || 0) - Number(b.alert_time || 0));

	const result = calculatePnL(filtered, buildFilterSettings(ui), {
		resolveClosedWithMarketDataOnly: true,
	});

	return {
		realizedPnL: result.realizedPnL,
		liveTotalBet: result.totalBet,
		liveTrades: result.trades,
		liveWins: result.wins,
		liveLosses: result.losses,
		openInterest: result.openInterest,
		totalBet: result.totalBet,
	};
}

export function emptyTracker(): TrackerState {
	return EMPTY_TRACKER;
}
