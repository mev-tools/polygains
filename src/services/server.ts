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
import { existsSync } from "node:fs";
import path from "node:path";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_IDLE_TIMEOUT_SEC = 60;
const MARKETS_CACHE_TTL_MS = 30_000;
const STATIC_PUBLIC_DIR = path.resolve(process.cwd(), "public");

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

const toOffset = (page: number, limit: number): number =>
	Math.max(0, (page - 1) * limit);

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

			if (url.pathname === "/health" || url.pathname === "/api/health") {
				return json({ status: "ok" });
			}

			if (url.pathname === "/stats" || url.pathname === "/api/stats") {
				const stats = await getInsiderStats();
				return json(stats);
			}

			if (
				url.pathname === "/global-stats" ||
				url.pathname === "/api/global-stats"
			) {
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
				const closed = parseOptionalBoolean(url.searchParams.get("close"));
				const offset = toOffset(page, limit);

				const cacheKey = `${page}-${limit}-${closed ?? "all"}`;
				const cached = marketsCache.get(cacheKey);
				if (cached && cached.expiresAt > Date.now()) {
					return json(cached.payload);
				}

				const { markets, total } = await getMarkets(limit, offset, closed);
				const pagination = makePagination(page, limit, total);
				const payload = { data: markets, pagination };

				marketsCache.set(cacheKey, {
					expiresAt: Date.now() + MARKETS_CACHE_TTL_MS,
					payload,
				});

				return json(payload);
			}

			if (
				url.pathname.startsWith("/api/market/") ||
				url.pathname.startsWith("/api/markets/") ||
				url.pathname.startsWith("/market/")
			) {
				const conditionId = url.pathname.split("/").pop();
				if (!conditionId) return json({ error: "Missing conditionId" }, 400);

				const market = await getMarketByCondition(conditionId);
				if (!market) return json({ error: "Market not found" }, 404);

				return json(market);
			}

			if (url.pathname === "/api/insiders" || url.pathname === "/insiders") {
				const page = parsePositiveInt(
					url.searchParams.get("page"),
					DEFAULT_PAGE,
				);
				const limit = Math.min(
					parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
					MAX_LIMIT,
				);
				const offset = toOffset(page, limit);

				const insiders = await getInsidersList();
				const total = insiders.length;
				const pagedInsiders = insiders.slice(offset, offset + limit);
				const pagination = makePagination(page, limit, total);
				return json({ data: pagedInsiders, pagination });
			}

			if (
				url.pathname.startsWith("/api/insider-trades/") ||
				url.pathname.startsWith("/insider-trades/")
			) {
				const address = url.pathname.split("/").pop();
				if (!address) return json({ error: "Missing address" }, 400);

				const page = parsePositiveInt(
					url.searchParams.get("page"),
					DEFAULT_PAGE,
				);
				const limit = Math.min(
					parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
					MAX_LIMIT,
				);
				const offset = toOffset(page, limit);

				const trades = await getInsiderTrades(address);
				const total = trades.length;
				const pagedTrades = trades.slice(offset, offset + limit);
				const pagination = makePagination(page, limit, total);

				return json({ data: pagedTrades, pagination });
			}

			if (
				url.pathname.startsWith("/api/insiders/") ||
				url.pathname.startsWith("/insiders/")
			) {
				const parts = url.pathname.split("/");
				const isApiRoute = parts[1] === "api";
				const address = isApiRoute ? parts[3] : parts[2];

				if (!address) return json({ error: "Missing address" }, 400);

				if (url.pathname.endsWith("/stats")) {
					const stats = await getInsiderStats();
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
					const offset = toOffset(page, limit);

					const trades = await getInsiderTrades(address);
					const total = trades.length;
					const pagedTrades = trades.slice(offset, offset + limit);
					const pagination = makePagination(page, limit, total);
					return json({ data: pagedTrades, pagination });
				}
			}

			if (url.pathname === "/api/alerts" || url.pathname === "/alerts") {
				const page = parsePositiveInt(
					url.searchParams.get("page"),
					DEFAULT_PAGE,
				);
				const limit = Math.min(
					parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
					MAX_LIMIT,
				);
				const category = parseOptionalString(url.searchParams.get("category"));
				const offset = toOffset(page, limit);

				const { alerts, total } = await getInsiderAlerts(limit, offset, category);
				const pagination = makePagination(page, limit, total);
				return json({ data: alerts, pagination });
			}

			if (url.pathname === "/api/block" || url.pathname === "/block") {
				const block = await getCurrentBlock();
				return json({ block });
			}

			if (req.method === "GET" || req.method === "HEAD") {
				const decodedPath = decodeURIComponent(url.pathname);
				const requestedPath =
					decodedPath === "/" ? "/index.html" : decodedPath;
				const normalizedPath = path.posix.normalize(requestedPath);
				const relativePath = normalizedPath.replace(/^\/+/, "");
				const candidatePath = path.resolve(STATIC_PUBLIC_DIR, relativePath);

				// Prevent path traversal by requiring files to stay under ./public.
				if (candidatePath.startsWith(STATIC_PUBLIC_DIR)) {
					if (existsSync(candidatePath)) {
						return new Response(Bun.file(candidatePath));
					}
					if (!path.extname(relativePath)) {
						const indexPath = path.join(STATIC_PUBLIC_DIR, "index.html");
						if (existsSync(indexPath)) {
							return new Response(Bun.file(indexPath));
						}
					}
				}
			}

			return json({ error: "Not Found" }, 404);
		},
	});

	console.log(
		`[API] Server running at http://${server.hostname}:${server.port}`,
	);
	return server;
}

if (import.meta.main) {
	createServer();
}
