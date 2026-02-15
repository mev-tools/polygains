import type {
	AlertsResponse,
	GlobalStats,
	HealthResponse,
	InsiderStats,
	InsiderTrade,
	MarketsResponse,
	Pagination,
} from "../types/terminal";

const DEFAULT_PAGINATION: Pagination = {
	page: 1,
	limit: 10,
	totalPages: 1,
	total: 0,
	hasPrev: false,
	hasNext: false,
};

function getConfiguredApiBase(): string {
	const envBase =
		(typeof process !== "undefined"
			? process.env?.BUN_PUBLIC_API_BASE_URL
			: undefined) ?? "";
	const raw = envBase.trim();
	if (!raw && typeof window !== "undefined" && window.location?.origin) {
		return window.location.origin;
	}
	if (!raw) throw new Error("Missing BUN_PUBLIC_API_BASE_URL");

	if (/^https?:\/\//i.test(raw)) {
		return raw;
	}

	return `http://${raw}`;
}

function buildApiUrl(
	pathname: string,
	query?: Record<string, string | number | boolean | undefined>,
): string {
	const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
	const candidateBase = getConfiguredApiBase();

	const finalize = (base: string) => {
		const url = new URL(normalizedPath, base.endsWith("/") ? base : `${base}/`);
		if (query) {
			for (const [key, value] of Object.entries(query)) {
				if (value === undefined) continue;
				url.searchParams.set(key, String(value));
			}
		}
		return url.toString();
	};

	try {
		return finalize(candidateBase);
	} catch {
		if (typeof window === "undefined" || !window.location?.origin) {
			throw new Error(
				"Cannot build API URL without browser origin or BUN_PUBLIC_API_BASE_URL",
			);
		}
		const fallbackBase = window.location.origin;
		return finalize(fallbackBase);
	}
}

async function getJson<T>(
	pathname: string,
	query?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
	const response = await fetch(buildApiUrl(pathname, query));
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText}`);
	}

	const text = await response.text();
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(
			`Expected JSON response but received: ${text.slice(0, 120)}`,
		);
	}
}

function normalizePagination(raw: unknown): Pagination {
	const value = (raw ?? {}) as Partial<Pagination>;
	return {
		page: Number.isFinite(Number(value.page)) ? Number(value.page) : 1,
		limit: Number.isFinite(Number(value.limit)) ? Number(value.limit) : 10,
		totalPages: Number.isFinite(Number(value.totalPages))
			? Number(value.totalPages)
			: 1,
		total: Number.isFinite(Number(value.total)) ? Number(value.total) : 0,
		hasPrev: Boolean(value.hasPrev),
		hasNext: Boolean(value.hasNext),
	};
}

export async function fetchHealth(): Promise<HealthResponse> {
	try {
		return await getJson<HealthResponse>("/api/health");
	} catch {
		return { status: "error", current_block: 0 };
	}
}

export async function fetchInsiderStats(): Promise<InsiderStats> {
	try {
		return await getJson<InsiderStats>("/api/stats");
	} catch {
		return {
			total_insiders: 0,
			yes_insiders: 0,
			no_insiders: 0,
			total_volume: 0,
			current_block: 0,
		};
	}
}

export async function fetchGlobalStats(): Promise<GlobalStats> {
	try {
		return await getJson<GlobalStats>("/api/global-stats");
	} catch {
		return {
			total_accounts: 0,
			total_markets: 0,
			total_trades: 0,
			active_positions: 0,
		};
	}
}

export async function fetchAlerts(
	page = 1,
	limit = 10,
	category?: string,
): Promise<AlertsResponse> {
	const payload = await getJson<unknown>("/api/alerts", {
		page,
		limit,
		category,
	});

	if (Array.isArray(payload)) {
		return {
			data: payload,
			pagination: {
				...DEFAULT_PAGINATION,
				total: payload.length,
			},
		} as AlertsResponse;
	}

	const structured = payload as Partial<AlertsResponse>;
	return {
		data: Array.isArray(structured.data) ? structured.data : [],
		pagination: normalizePagination(structured.pagination),
	};
}

export async function fetchInsiderTrades(
	address: string,
): Promise<InsiderTrade[]> {
	try {
		const payload = await getJson<unknown>(
			`/api/insider-trades/${encodeURIComponent(address)}`,
		);
		return Array.isArray(payload) ? (payload as InsiderTrade[]) : [];
	} catch {
		return [];
	}
}

export async function fetchMarkets(
	page = 1,
	limit = 10,
	close?: boolean,
): Promise<MarketsResponse> {
	const payload = await getJson<unknown>("/api/markets", {
		page,
		limit,
		close,
	});

	if (Array.isArray(payload)) {
		return {
			data: payload,
			pagination: {
				...DEFAULT_PAGINATION,
				total: payload.length,
			},
		} as MarketsResponse;
	}

	const structured = payload as Partial<MarketsResponse>;
	return {
		data: Array.isArray(structured.data) ? structured.data : [],
		pagination: normalizePagination(structured.pagination),
	};
}

export async function fetchMarket(
	conditionId: string,
): Promise<Record<string, unknown> | null> {
	try {
		return await getJson<Record<string, unknown>>(
			`/api/market/${encodeURIComponent(conditionId)}`,
		);
	} catch {
		return null;
	}
}
