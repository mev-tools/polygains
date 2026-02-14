import {
	getCurrentBlock,
	getGlobalStats,
	getInsiderAlerts,
	getInsiderStats,
	getInsidersList,
	getInsiderTrades,
	getMarketByCondition,
	getMarkets,
} from "@/lib/db/queries";

const DEFAULT_PORT = 4000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_IDLE_TIMEOUT_SEC = 60;
const MARKETS_CACHE_TTL_MS = 30_000;

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...CORS_HEADERS },
	});

const parsePositiveInt = (
	value: string | null,
	fallback: number,
	max = Number.MAX_SAFE_INTEGER,
): number => {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
};

const parseOptionalBoolean = (value: string | null): boolean | undefined => {
	if (value === null) return undefined;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true" || normalized === "1" || normalized === "yes") {
		return true;
	}
	if (normalized === "false" || normalized === "0" || normalized === "no") {
		return false;
	}
	return undefined;
};

const makePagination = (page: number, limit: number, total: number) => {
	const totalPages = Math.max(1, Math.ceil(total / limit));
	const safePage = Math.min(Math.max(page, 1), totalPages);

	return {
		page: safePage,
		limit,
		total,
		totalPages,
		hasPrev: safePage > 1,
		hasNext: safePage < totalPages,
	};
};

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*", // You can restrict this to "http://localhost:3000" in production
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function createServer() {
	const port = process.env.PORT
		? Number.parseInt(process.env.PORT, 10)
		: DEFAULT_PORT;
	const idleTimeout = process.env.IDLE_TIMEOUT_SEC
		? Number.parseInt(process.env.IDLE_TIMEOUT_SEC, 10)
		: DEFAULT_IDLE_TIMEOUT_SEC;
	const marketsCache = new Map<
		string,
		{
			expiresAt: number;
			payload: {
				data: Awaited<ReturnType<typeof getMarkets>>["markets"];
				pagination: ReturnType<typeof makePagination>;
			};
		}
	>();

	const server = Bun.serve({
		port: Number.isFinite(port) ? port : DEFAULT_PORT,
		idleTimeout:
			Number.isFinite(idleTimeout) && idleTimeout > 0
				? idleTimeout
				: DEFAULT_IDLE_TIMEOUT_SEC,
		async fetch(req) {
			try {
				const url = new URL(req.url);
				if (req.method === "OPTIONS") {
					return new Response(null, { headers: CORS_HEADERS });
				}

				if (url.pathname === "/" || url.pathname === "/dashboard") {
					return new Response(Bun.file("public/index.html"), {
						headers: { "Content-Type": "text/html; charset=utf-8" },
					});
				}

				if (url.pathname === "/health") {
					const currentBlock = await getCurrentBlock();
					return json({ status: "ok", current_block: currentBlock });
				}

				if (url.pathname === "/stats") {
					return json(await getInsiderStats());
				}

				if (url.pathname === "/global-stats") {
					return json(await getGlobalStats());
				}

				if (url.pathname === "/alerts") {
					const page = parsePositiveInt(
						url.searchParams.get("page"),
						DEFAULT_PAGE,
					);
					const limit = parsePositiveInt(
						url.searchParams.get("limit"),
						DEFAULT_LIMIT,
						MAX_LIMIT,
					);
					const offset = (page - 1) * limit;

					const result = await getInsiderAlerts(limit, offset);
					const pagination = makePagination(page, limit, result.total);
					return json({ data: result.alerts, pagination });
				}

				const insiderTradesMatch = url.pathname.match(
					/^\/insider-trades\/(.+)$/,
				);
				if (insiderTradesMatch) {
					const address = decodeURIComponent(insiderTradesMatch[1]);
					return json(await getInsiderTrades(address));
				}

				if (url.pathname === "/insiders") {
					return json(await getInsidersList());
				}

				if (url.pathname === "/api/markets") {
					const page = parsePositiveInt(
						url.searchParams.get("page"),
						DEFAULT_PAGE,
					);
					const limit = parsePositiveInt(
						url.searchParams.get("limit"),
						DEFAULT_LIMIT,
						MAX_LIMIT,
					);
					const closed = parseOptionalBoolean(
						url.searchParams.get("closed") ??
							url.searchParams.get("close"),
					);

					const cacheKey = `${page}:${limit}:${String(closed)}`;
					const now = Date.now();
					const cached = marketsCache.get(cacheKey);
					if (cached && cached.expiresAt > now) {
						return json(cached.payload);
					}
					const offset = (page - 1) * limit;

					const result = await getMarkets(limit, offset, closed);
					const pagination = makePagination(page, limit, result.total);
					const payload = { data: result.markets, pagination };
					marketsCache.set(cacheKey, {
						expiresAt: now + MARKETS_CACHE_TTL_MS,
						payload,
					});

					// Periodically prune expired entries so the map stays bounded.
					if (marketsCache.size > 100) {
						for (const [key, value] of marketsCache.entries()) {
							if (value.expiresAt <= now) marketsCache.delete(key);
						}
					}

					return json(payload);
				}

				const marketMatch = url.pathname.match(/^\/api\/market\/(.+)$/);
				if (marketMatch) {
					const conditionId = decodeURIComponent(marketMatch[1]);
					const market = await getMarketByCondition(conditionId);
					if (!market) {
						return json({ error: "Market not found" }, 404);
					}
					return json(market);
				}

				const decodedPath = decodeURIComponent(url.pathname);
				if (!decodedPath.includes("..")) {
					const relativePath = decodedPath.replace(/^\/+/, "");
					if (relativePath.length > 0) {
						const file = Bun.file(`public/${relativePath}`);
						if (await file.exists()) {
							return new Response(file, {
								headers: {
									"Content-Type": file.type || "application/octet-stream",
								},
							});
						}
					}
				}

				return new Response("Not Found", { status: 404 });
			} catch (error) {
				console.error("[HTTP] Request failed:", error);
				return new Response("Internal Server Error", { status: 500 });
			}
		},
	});

	console.log(`[HTTP] Server listening on http://localhost:${server.port}`);
	return server;
}

// Run server if executed directly
if (import.meta.main) {
	createServer();
}
