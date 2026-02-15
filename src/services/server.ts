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
import {
	parseOptionalBoolean,
	parseOptionalString,
	parsePositiveInt,
	readEnv,
	readPort,
} from "@/lib/utils";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_IDLE_TIMEOUT_SEC = 60;
const MARKETS_CACHE_TTL_MS = 30_000;

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*", // You can restrict this to "http://localhost:3000" in production
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...CORS_HEADERS,
		},
	});

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

export function createServer() {
	const host = readEnv("API_HOST", "HOST");
	const port = readPort("API_PORT", "PORT");
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
		hostname: host,
		port,
		idleTimeout,
		async fetch(req) {
			const url = new URL(req.url);

			// Add OPTIONS handling for CORS
			if (req.method === "OPTIONS") {
				return new Response(null, { headers: CORS_HEADERS });
			}

			if (url.pathname === "/health") {
				return json({ status: "ok" });
			}

			if (url.pathname === "/global-stats") {
				const stats = await getGlobalStats();
				return json(stats);
			}

			if (url.pathname === "/api/markets") {
				const page = parsePositiveInt(
					url.searchParams.get("page"),
					DEFAULT_PAGE,
				);
				const limit = Math.min(
					parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
					MAX_LIMIT,
				);

				const cacheKey = `${page}-${limit}`;
				const cached = marketsCache.get(cacheKey);
				if (cached && cached.expiresAt > Date.now()) {
					return json(cached.payload);
				}

				const { markets, total } = await getMarkets(page, limit);
				const pagination = makePagination(page, limit, total);
				const payload = { data: markets, pagination };

				marketsCache.set(cacheKey, {
					expiresAt: Date.now() + MARKETS_CACHE_TTL_MS,
					payload,
				});

				return json(payload);
			}

			if (url.pathname.startsWith("/api/markets/")) {
				const conditionId = url.pathname.split("/").pop();
				if (!conditionId) return json({ error: "Missing conditionId" }, 400);

				const market = await getMarketByCondition(conditionId);
				if (!market) return json({ error: "Market not found" }, 404);

				return json(market);
			}

			if (url.pathname === "/api/insiders") {
				const page = parsePositiveInt(
					url.searchParams.get("page"),
					DEFAULT_PAGE,
				);
				const limit = Math.min(
					parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
					MAX_LIMIT,
				);

				const { insiders, total } = await getInsidersList(page, limit);
				const pagination = makePagination(page, limit, total);
				return json({ data: insiders, pagination });
			}

			if (url.pathname.startsWith("/api/insiders/")) {
				const parts = url.pathname.split("/");
				const address = parts[3];

				if (!address) return json({ error: "Missing address" }, 400);

				if (url.pathname.endsWith("/stats")) {
					const stats = await getInsiderStats(address);
					return json(stats);
				}

				if (url.pathname.endsWith("/trades")) {
					const page = parsePositiveInt(
						url.searchParams.get("page"),
						DEFAULT_PAGE,
					);
					const limit = Math.min(
						parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
						MAX_LIMIT,
					);

					const { trades, total } = await getInsiderTrades(
						address,
						page,
						limit,
					);
					const pagination = makePagination(page, limit, total);
					return json({ data: trades, pagination });
				}
			}

			if (url.pathname === "/api/alerts") {
				const page = parsePositiveInt(
					url.searchParams.get("page"),
					DEFAULT_PAGE,
				);
				const limit = Math.min(
					parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
					MAX_LIMIT,
				);
				const category = parseOptionalString(url.searchParams.get("category"));
				const winner = parseOptionalBoolean(url.searchParams.get("winner"));

				const { alerts, total } = await getInsiderAlerts(
					page,
					limit,
					category,
					winner,
				);
				const pagination = makePagination(page, limit, total);
				return json({ data: alerts, pagination });
			}

			if (url.pathname === "/api/block") {
				const block = await getCurrentBlock();
				return json({ block });
			}

			return json({ error: "Not Found" }, 404);
		},
	});

	console.log(
		`[API] Server running at http://${server.hostname}:${server.port}`,
	);
	return server;
}
