import {
	getCurrentBlock,
	getCategories,
	getGlobalStats,
	getInsiderAlerts,
	getInsiderStats,
	getInsidersList,
	getInsiderTrades,
	getMarketByCondition,
	getMarkets,
	getInsiderAlertsOptimized,
	getMarketsOptimized,
} from "@/lib/db/queries";
import {
	parseOptionalBoolean,
	parseOptionalString,
	parsePositiveInt,
	readEnv,
	readPort,
} from "@/lib/utils";
import { Cache, getCacheGeneration, getCacheStats, invalidateCache } from "@/lib/cache";
import { generateCacheKey, getCache, setCache } from "@/lib/file-cache";
import { existsSync } from "node:fs";
import path from "node:path";

// ZSTD compression cache for static files
interface CachedCompression {
	data: Uint8Array;
	mtime: number;
}
const zstdCache = new Map<string, CachedCompression>();

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_IDLE_TIMEOUT_SEC = 60;
const CACHE_TTL_MS = 30_000;
const STATIC_PUBLIC_DIR = path.resolve(process.cwd(), "public", "dist");
const STATIC_ROOT_PUBLIC_DIR = path.resolve(process.cwd(), "public");

const getCorsHeaders = (req: Request): Record<string, string> => {
	const origin = req.headers.get("origin") ?? "";
	const allowedOrigins = [
		"https://polygains.com",
		"https://www.polygains.com",
		"http://localhost:3001",
		"http://127.0.0.1:3001",
	];
	
	// Allow if origin matches or if no origin (same-origin requests)
	const allowOrigin = (!origin || allowedOrigins.includes(origin)) 
		? (origin || "*") 
		: allowedOrigins[0];
	
	return {
		"Access-Control-Allow-Origin": allowOrigin,
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Allow-Credentials": "true",
	};
};

const json = (body: unknown, status = 200, cacheGeneration?: number, req?: Request): Response => {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...getCorsHeaders(req || new Request("http://localhost")),
	};
	// Add cache headers for cacheable responses
	if (cacheGeneration !== undefined) {
		headers["X-Cache-Generation"] = String(cacheGeneration);
		headers["Cache-Control"] = "public, max-age=5";
	}
	return new Response(JSON.stringify(body), { status, headers });
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

const toOffset = (page: number, limit: number): number =>
	Math.max(0, (page - 1) * limit);

// Helper to get file extension for content-type
const getContentType = (filePath: string): string => {
	const ext = path.extname(filePath).toLowerCase();
	const contentTypes: Record<string, string> = {
		".html": "text/html; charset=utf-8",
		".htm": "text/html; charset=utf-8",
		".js": "application/javascript; charset=utf-8",
		".mjs": "application/javascript; charset=utf-8",
		".css": "text/css; charset=utf-8",
		".json": "application/json",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".svg": "image/svg+xml",
		".ico": "image/x-icon",
		".webp": "image/webp",
		".avif": "image/avif",
		".xml": "application/xml",
		".txt": "text/plain",
		".map": "application/json",
	};
	return contentTypes[ext] || "application/octet-stream";
};

// Serve static file with optional zstd compression
async function serveStaticFile(
	filePath: string,
	acceptEncoding: string | null,
	req?: Request,
): Promise<Response> {
	const contentType = getContentType(filePath);
	const file = Bun.file(filePath);
	const fileStat = await file.stat();
	const mtime = fileStat.mtime?.getTime() || 0;

	// Check if client supports zstd
	const supportsZstd = acceptEncoding?.includes("zstd") ?? false;

	// For binary files (images), skip compression
	const isCompressible =
		contentType.startsWith("text/") ||
		contentType.includes("javascript") ||
		contentType.includes("json") ||
		contentType.includes("xml");

	if (!supportsZstd || !isCompressible) {
		return new Response(file, {
			headers: {
				"Content-Type": contentType,
				...getCorsHeaders(req || new Request("http://localhost")),
			},
		});
	}

	// Check cache
	const cached = zstdCache.get(filePath);
	if (cached && cached.mtime === mtime) {
		return new Response(cached.data, {
			headers: {
				"Content-Type": contentType,
				"Content-Encoding": "zstd",
				"Cache-Control": "public, max-age=31536000, immutable",
				...getCorsHeaders(req || new Request("http://localhost")),
			},
		});
	}

	// Compress and cache
	const originalData = await file.bytes();
	const compressed = await Bun.zstdCompress(originalData);
	zstdCache.set(filePath, { data: compressed, mtime });

	return new Response(compressed, {
		headers: {
			"Content-Type": contentType,
			"Content-Encoding": "zstd",
			"Cache-Control": "public, max-age=31536000, immutable",
			...getCorsHeaders(req || new Request("http://localhost")),
		},
	});
}

export function createServer() {
	const host = readEnv("API_HOST", "HOST");
	const port = readPort("API_PORT", "PORT");
	const idleTimeout = process.env.IDLE_TIMEOUT_SEC
		? Number.parseInt(process.env.IDLE_TIMEOUT_SEC, 10)
		: DEFAULT_IDLE_TIMEOUT_SEC;

	// Global generation-based caches - invalidated when data changes
	const statsCache = new Cache<unknown>(CACHE_TTL_MS);
	const categoriesCache = new Cache<unknown>(CACHE_TTL_MS);
	const blockCache = new Cache<unknown>(CACHE_TTL_MS);

	const server = Bun.serve({
		hostname: host,
		port,
		idleTimeout,
		async fetch(req) {
			const url = new URL(req.url);

			// HTTPS redirect (for production behind reverse proxy)
			const proto = req.headers.get("x-forwarded-proto");
			if (proto === "http") {
				return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
			}

			// Add OPTIONS handling for CORS
			if (req.method === "OPTIONS") {
				return new Response(null, { headers: getCorsHeaders(req) });
			}

			if (url.pathname === "/health" || url.pathname === "/api/health") {
				return json({ status: "ok" }, 200, undefined, req);
			}

			if (url.pathname === "/stats" || url.pathname === "/api/stats") {
				const stats = await getInsiderStats();
				return json(stats, 200, undefined, req);
			}

			if (
				url.pathname === "/global-stats" ||
				url.pathname === "/api/global-stats"
			) {
				const stats = await getGlobalStats();
				return json(stats, 200, undefined, req);
			}

			if (url.pathname === "/categories" || url.pathname === "/api/categories") {
				const categories = await getCategories();
				return json(categories, 200, undefined, req);
			}

			if (
				url.pathname === "/api/markets" ||
				url.pathname === "/markets" ||
				url.pathname === "/api/top-liquidity-markets" ||
				url.pathname === "/top-liquidity-markets"
			) {
				const cacheKey = generateCacheKey(url.toString());
				const cached = await getCache<{ data: any; pagination: any }>(cacheKey);
				if (cached) return json(cached, 200, undefined, req);

				// Use optimized version with file caching - always returns 4 top markets
				const closed = parseOptionalBoolean(url.searchParams.get("close"));
				const { markets, total } = await getMarketsOptimized(closed);
				// Return as page 1 with limit 4 for compatibility
				const pagination = makePagination(1, 4, total);
				const responseData = { data: markets, pagination };
				await setCache(cacheKey, responseData, CACHE_TTL_MS);
				return json(responseData, 200, undefined, req);
			}

			if (
				url.pathname.startsWith("/api/market/") ||
				url.pathname.startsWith("/api/markets/") ||
				url.pathname.startsWith("/market/")
			) {
				const conditionId = url.pathname.split("/").pop();
				if (!conditionId) return json({ error: "Missing conditionId" }, 400, undefined, req);

				const market = await getMarketByCondition(conditionId);
				if (!market) return json({ error: "Market not found" }, 404, undefined, req);

				return json(market, 200, undefined, req);
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
				return json({ data: pagedInsiders, pagination }, 200, undefined, req);
			}

			if (
				url.pathname.startsWith("/api/insider-trades/") ||
				url.pathname.startsWith("/insider-trades/")
			) {
				const address = url.pathname.split("/").pop();
				if (!address) return json({ error: "Missing address" }, 400, undefined, req);

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

				return json({ data: pagedTrades, pagination }, 200, undefined, req);
			}

			if (
				url.pathname.startsWith("/api/insiders/") ||
				url.pathname.startsWith("/insiders/")
			) {
				const parts = url.pathname.split("/");
				const isApiRoute = parts[1] === "api";
				const address = isApiRoute ? parts[3] : parts[2];

				if (!address) return json({ error: "Missing address" }, 400, undefined, req);

				if (url.pathname.endsWith("/stats")) {
					const stats = await getInsiderStats();
					return json(stats, 200, undefined, req);
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
					return json({ data: pagedTrades, pagination }, 200, undefined, req);
				}
			}

			if (url.pathname === "/api/alerts" || url.pathname === "/alerts") {
				const cacheKey = generateCacheKey(url.toString());
				const cached = await getCache<{ data: any; pagination: any }>(cacheKey);
				if (cached) return json(cached, 200, undefined, req);

				// Use optimized version with file caching - always returns 6 most recent
				const category = parseOptionalString(url.searchParams.get("category"));
				const { alerts, total } = await getInsiderAlertsOptimized(category);
				// Return as page 1 with limit 6 for compatibility
				const pagination = makePagination(1, 6, total);
				const responseData = { data: alerts, pagination };
				await setCache(cacheKey, responseData, CACHE_TTL_MS);
				return json(responseData, 200, undefined, req);
			}

			if (url.pathname === "/api/block" || url.pathname === "/block") {
				const block = await getCurrentBlock();
				return json({ block }, 200, undefined, req);
			}

			if (req.method === "GET" || req.method === "HEAD") {
				const decodedPath = decodeURIComponent(url.pathname);
				const requestedPath =
					decodedPath === "/" ? "/index.html" : decodedPath;
				const normalizedPath = path.posix.normalize(requestedPath);
				const relativePath = normalizedPath.replace(/^\/+/, "");
				const acceptEncoding = req.headers.get("accept-encoding");

				// First, check public/dist for built frontend assets
				const distPath = path.resolve(STATIC_PUBLIC_DIR, relativePath);
				if (distPath.startsWith(STATIC_PUBLIC_DIR) && existsSync(distPath)) {
					return serveStaticFile(distPath, acceptEncoding, req);
				}

				// Then, check public/ root for static files (favicons, etc.)
				const publicPath = path.resolve(STATIC_ROOT_PUBLIC_DIR, relativePath);
				if (publicPath.startsWith(STATIC_ROOT_PUBLIC_DIR) && existsSync(publicPath)) {
					return serveStaticFile(publicPath, acceptEncoding, req);
				}

				// Handle /mainv2 with noindex canonical
				if (relativePath === "mainv2") {
					const indexPath = path.join(STATIC_PUBLIC_DIR, "index.html");
					if (existsSync(indexPath)) {
						let html = await Bun.file(indexPath).text();
						// Inject noindex meta tag and canonical pointing to /
						html = html.replace(
							'<meta name="robots" content="index,follow,max-image-preview:large" />',
							'<meta name="robots" content="noindex,follow" />\n    <link rel="canonical" href="https://polygains.com/" />'
						);
						// Compress if supported
						if (acceptEncoding?.includes("zstd")) {
							const compressed = await Bun.zstdCompress(
								new TextEncoder().encode(html)
							);
							return new Response(compressed, {
								headers: {
									"Content-Type": "text/html; charset=utf-8",
									"Content-Encoding": "zstd",
									...CORS_HEADERS,
								},
							});
						}
						return new Response(html, {
							headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
						});
					}
				}

				// Fallback to index.html for SPA routes
				if (!path.extname(relativePath)) {
					const indexPath = path.join(STATIC_PUBLIC_DIR, "index.html");
					if (existsSync(indexPath)) {
						return serveStaticFile(indexPath, acceptEncoding, req);
					}
				}
			}

			// Real 404 response with HTML body
			const notFoundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Page Not Found | Polygains</title>
    <meta name="robots" content="noindex,follow" />
    <style>
        body{margin:0;padding:0;background:#000;color:#10b981;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
        .container{padding:2rem}
        h1{font-size:4rem;margin:0 0 1rem}
        p{color:#9ca3af;margin-bottom:2rem}
        a{color:#10b981;text-decoration:none;border-bottom:1px solid #10b981}
        a:hover{color:#34d399}
    </style>
</head>
<body>
    <div class="container">
        <h1>404</h1>
        <p>The page you're looking for doesn't exist.</p>
        <p><a href="/">← Back to Polygains</a></p>
    </div>
</body>
</html>`;
			return new Response(notFoundHtml, {
				status: 404,
				headers: { 
					"Content-Type": "text/html; charset=utf-8", 
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, Authorization",
				},
			});
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
