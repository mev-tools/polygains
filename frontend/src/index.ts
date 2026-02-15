import { serve } from "bun";
import index from "./index.html";

function readEnv(...keys: string[]): string {
	for (const key of keys) {
		const value = process.env[key]?.trim();
		if (value) return value;
	}
	throw new Error(`[frontend] Missing required env var: ${keys.join(" or ")}`);
}

function readPort(...keys: string[]): number {
	const raw = readEnv(...keys);
	const port = Number.parseInt(raw, 10);
	if (!Number.isFinite(port) || port <= 0 || port > 65535) {
		throw new Error(
			`[frontend] Invalid port "${raw}" from ${keys.join(" or ")}`,
		);
	}
	return port;
}

function normalizeUpstreamBase(raw: string | undefined): string {
	const value = (raw ?? "").trim();
	if (!value) {
		throw new Error(
			"[frontend] Missing API_UPSTREAM_BASE_URL (or API_BASE_URL / BUN_PUBLIC_API_BASE_URL)",
		);
	}
	if (/^https?:\/\//i.test(value)) return value;
	return `http://${value}`;
}

const upstreamBase = normalizeUpstreamBase(
	process.env.API_UPSTREAM_BASE_URL ??
		process.env.API_BASE_URL ??
		process.env.BUN_PUBLIC_API_BASE_URL,
);

function buildUpstreamUrl(req: Request, upstreamPath: string): string {
	const requestUrl = new URL(req.url);
	const baseUrl = new URL(upstreamBase);
	const normalizedPath = upstreamPath.startsWith("/")
		? upstreamPath
		: `/${upstreamPath}`;
	const basePath =
		baseUrl.pathname === "/" ? "" : baseUrl.pathname.replace(/\/$/, "");

	const target = new URL(baseUrl.origin);
	target.pathname = `${basePath}${normalizedPath}`.replace(/\/{2,}/g, "/");
	target.search = requestUrl.search;

	return target.toString();
}

async function proxyRequest(
	req: Request,
	upstreamPaths: string[],
): Promise<Response> {
	let lastError: Error | null = null;

	for (let index = 0; index < upstreamPaths.length; index += 1) {
		const path = upstreamPaths[index];
		if (path === undefined) continue;
		const isLastCandidate = index === upstreamPaths.length - 1;

		try {
			const targetUrl = buildUpstreamUrl(req, path);
			const upstreamResponse = await fetch(targetUrl, {
				method: req.method,
				headers: {
					accept: "application/json",
				},
			});

			if (upstreamResponse.status === 404 && !isLastCandidate) {
				continue;
			}

			return new Response(upstreamResponse.body, {
				status: upstreamResponse.status,
				headers: upstreamResponse.headers,
			});
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (isLastCandidate) break;
		}
	}

	return Response.json(
		{
			error: "upstream_proxy_failed",
			detail: lastError?.message ?? "Failed to reach upstream API",
			upstream: upstreamBase,
		},
		{ status: 502 },
	);
}

const server = serve({
	hostname: readEnv("FRONTEND_HOST", "HOST"),
	port: readPort("FRONTEND_PORT"),
	routes: {
		"/api/health": (req) => proxyRequest(req, ["/health", "/api/health"]),
		"/api/stats": (req) => proxyRequest(req, ["/stats", "/api/stats"]),
		"/api/global-stats": (req) =>
			proxyRequest(req, ["/global-stats", "/api/global-stats"]),
		"/api/alerts": (req) => proxyRequest(req, ["/alerts", "/api/alerts"]),
		"/api/markets": (req) => proxyRequest(req, ["/api/markets", "/markets"]),
		"/api/market/:conditionId": (req) => {
			const conditionId = encodeURIComponent(req.params.conditionId);
			return proxyRequest(req, [
				`/market/${conditionId}`,
				`/api/market/${conditionId}`,
			]);
		},
		"/api/insider-trades/:address": (req) => {
			const address = encodeURIComponent(req.params.address);
			return proxyRequest(req, [
				`/insider-trades/${address}`,
				`/api/insider-trades/${address}`,
			]);
		},

		// Serve index.html for non-API routes.
		"/*": index,
	},

	development: process.env.NODE_ENV !== "production" && {
		hmr: true,
		console: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);
console.log(`🔌 API upstream: ${upstreamBase}`);
