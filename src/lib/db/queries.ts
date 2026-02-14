import { and, desc, eq, inArray, isNotNull, not, sql } from "drizzle-orm";
import {
	accountStats,
	checkpoint,
	tokenMarketLookup,
	tokenStats,
	vInsidersEnriched,
	vMarketSummary,
} from "@/lib/db/schema";
import { db } from "./init";

const TEST_ACCOUNT = "0xcomprehensive_test";

const parseCursorNumber = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
		return undefined;
	}

	if (value && typeof value === "object" && "number" in value) {
		return parseCursorNumber((value as { number?: unknown }).number);
	}

	return undefined;
};

const getStateFileBlock = async (): Promise<number> => {
	try {
		const stateFile = Bun.file("state.json");
		if (!(await stateFile.exists())) return 0;

		const content = await stateFile.text();
		if (!content.trim()) return 0;

		try {
			const parsed = JSON.parse(content);
			return parseCursorNumber(parsed) ?? 0;
		} catch {
			return parseCursorNumber(content.trim()) ?? 0;
		}
	} catch {
		return 0;
	}
};

// --- INSIDER QUERIES ---

export async function getCurrentBlock() {
	const row = await db
		.select({ currentNumber: checkpoint.currentNumber })
		.from(checkpoint)
		.orderBy(desc(checkpoint.currentNumber))
		.limit(1);

	const dbBlock = row[0]?.currentNumber;
	if (typeof dbBlock === "number" && Number.isFinite(dbBlock) && dbBlock > 0) {
		return dbBlock;
	}

	return await getStateFileBlock();
}

export async function getInsiderStats() {
	const currentBlock = await getCurrentBlock();

	const statsResult = await db
		.select({
			total_insiders: sql<number>`CAST(count(*) AS INTEGER)`,
			yes_insiders: sql<number>`CAST(count(*) FILTER (WHERE ${vInsidersEnriched.outcome} = 'Yes') AS INTEGER)`,
			no_insiders: sql<number>`CAST(count(*) FILTER (WHERE ${vInsidersEnriched.outcome} = 'No') AS INTEGER)`,
			total_volume: sql<number>`CAST(coalesce(sum(${vInsidersEnriched.volume}), 0) AS DOUBLE PRECISION)`,
		})
		.from(vInsidersEnriched)
		.where(not(eq(vInsidersEnriched.account, TEST_ACCOUNT)));

	const stats = statsResult[0] || {
		total_insiders: 0,
		yes_insiders: 0,
		no_insiders: 0,
		total_volume: 0,
	};

	return {
		total_insiders: Number(stats.total_insiders),
		yes_insiders: Number(stats.yes_insiders),
		no_insiders: Number(stats.no_insiders),
		total_volume: Number(stats.total_volume),
		current_block: currentBlock,
	};
}

export async function getInsiderAlerts(limit: number, offset: number) {
	// Get total count
	const countResult = await db
		.select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
		.from(vInsidersEnriched)
		.where(not(eq(vInsidersEnriched.account, TEST_ACCOUNT)));
	const total = Number(countResult[0]?.count || 0);

	// Get paginated alerts
	const insiders = await db
		.select()
		.from(vInsidersEnriched)
		.where(not(eq(vInsidersEnriched.account, TEST_ACCOUNT)))
		.limit(limit)
		.offset(offset)
		.orderBy(desc(vInsidersEnriched.detectedAt));

	const alerts = insiders.map((insider) => ({
		user: insider.account,
		volume: Number(insider.volume || 0),
		alert_time: insider.detectedAt ? Number(insider.detectedAt) / 1000 : 0,
		market_count: Number(insider.marketCount || 0),
		outcome: insider.outcome,
		winner: insider.winner,
		closed: insider.closed,
		conditionId: insider.conditionId,
		tokenId: insider.tokenId,
		price: Number((insider.alertPrice ?? insider.lastPrice) || 0),
	}));

	return { total, alerts };
}

export async function getInsiderTrades(address: string) {
	const insiders = await db
		.select()
		.from(vInsidersEnriched)
		.where(eq(vInsidersEnriched.account, address));

	return insiders.map((insider) => ({
		position_id: insider.tokenId,
		condition_id: insider.conditionId,
		volume: Number(insider.volume || 0),
		question: insider.question,
		outcome: insider.outcome,
		price: Number((insider.alertPrice ?? insider.lastPrice) || 0),
	}));
}

export async function getInsidersList() {
	const insiders = await db
		.select()
		.from(vInsidersEnriched)
		.where(not(eq(vInsidersEnriched.account, TEST_ACCOUNT)))
		.limit(50)
		.orderBy(desc(vInsidersEnriched.detectedAt));

	return insiders.map((insider) => ({
		account: insider.account,
		insider_volume: Number(insider.volume || 0),
		detected_at: insider.detectedAt
			? new Date(Number(insider.detectedAt))
					.toISOString()
					.replace("T", " ")
					.split(".")[0]
			: null,
		token_id: insider.tokenId,
		condition_id: insider.conditionId,
		market_price: Number(insider.lastPrice || 0),
		market_total_volume: Number(insider.marketTotalVolume || 0),
	}));
}

// --- MARKET QUERIES ---

export async function getMarkets(
	limit: number,
	offset: number,
	closed?: boolean,
) {
	const now = Date.now();
	// Calculate total market volume per conditionId to identify top markets
	// Sort by Hacker News ranking algorithm: Score = (P - 1) / (T + 2)^G
	// P = Volume, T = age in hours, G = 1.8
	const closedFilter =
		closed === undefined ? undefined : eq(vMarketSummary.closed, closed);
	const marketVolumesBase = db.select({
		conditionId: vMarketSummary.conditionId,
		totalMarketVol: sql<number>`CAST(sum(coalesce(${vMarketSummary.totalVol}, 0)::double precision) AS DOUBLE PRECISION)`,
		totalMarketTrades: sql<number>`CAST(sum(coalesce(${vMarketSummary.totalTrades}, 0)) AS INTEGER)`,
		hnScore: sql<number>`
					(sum(coalesce(${vMarketSummary.totalVol}, 0)::double precision) - 1.0) /
					power(
						((CAST(${now} AS DOUBLE PRECISION) - MIN(${vMarketSummary.createdAt})::double precision) / 3600000.0) + 2.0,
						1.8
					)
				`.as("hn_score"),
	})
		.from(vMarketSummary);
	const scopedMarketVolumesBase = closedFilter
		? marketVolumesBase.where(closedFilter)
		: marketVolumesBase;
	const totalCountBase = db
		.select({
			count: sql<number>`CAST(count(distinct ${vMarketSummary.conditionId}) AS INTEGER)`,
		})
		.from(vMarketSummary);
	const scopedTotalCountBase = closedFilter
		? totalCountBase.where(closedFilter)
		: totalCountBase;
	const [marketVolumes, totalResult] = await Promise.all([
		scopedMarketVolumesBase
			.groupBy(vMarketSummary.conditionId)
			.orderBy(desc(sql`hn_score`))
			.limit(limit)
			.offset(offset),
		scopedTotalCountBase,
	]);
	const total = Number(totalResult[0]?.count || 0);

	if (marketVolumes.length === 0) {
		return { total, markets: [] };
	}

	// Fetch all outcomes for the selected conditionIds
	const conditionIds = marketVolumes
		.map((m) => m.conditionId)
		.filter((id): id is string => id !== null);

	const conditionFilter = inArray(vMarketSummary.conditionId, conditionIds);
	const allOutcomesFilter = closedFilter
		? and(conditionFilter, closedFilter)
		: conditionFilter;

	const allOutcomes = await db
		.select()
		.from(vMarketSummary)
		.where(allOutcomesFilter);

	// Flatten and enrich with market-level totals
	const markets = allOutcomes.map((outcome) => {
		const marketTotal = marketVolumes.find(
			(mv) => mv.conditionId === outcome.conditionId,
		);
		return {
			conditionId: outcome.conditionId,
			question: outcome.question || outcome.conditionId,
			outcome: outcome.outcome,
			position_id: outcome.tokenId,
			total_trades: Number(outcome.totalTrades || 0),
			volume: Number(outcome.totalVol || 0),
			last_price: Number(outcome.lastPrice || 0),
			total_market_vol: Number(marketTotal?.totalMarketVol || 0),
			total_market_trades: Number(marketTotal?.totalMarketTrades || 0),
			hn_score: Number(marketTotal?.hnScore || 0),
			mean: outcome.mean !== null ? Number(outcome.mean) : null,
			stdDev: outcome.stdDev !== null ? Number(outcome.stdDev) : null,
			p95: outcome.p95 !== null ? Number(outcome.p95) : null,
			closed: outcome.closed,
		};
	});

	return { total, markets };
}

export async function getMarketByCondition(conditionId: string) {
	const allOutcomes = await db
		.select()
		.from(vMarketSummary)
		.where(eq(vMarketSummary.conditionId, conditionId));

	if (allOutcomes.length === 0) return null;

	const first = allOutcomes[0];
	return {
		conditionId: first.conditionId,
		question: first.question,
		closed: first.closed,
		outcomes: allOutcomes.map((o) => ({
			tokenId: o.tokenId,
			outcome: o.outcome,
			winner: o.winner,
			lastPrice: Number(o.lastPrice || 0),
			totalTrades: Number(o.totalTrades || 0),
			volume: Number(o.totalVol || 0),
			mean: o.mean !== null ? Number(o.mean) : null,
			stdDev: o.stdDev !== null ? Number(o.stdDev) : null,
			p95: o.p95 !== null ? Number(o.p95) : null,
		})),
	};
}

export async function getGlobalStats() {
	// Get account stats count
	const accountsResult = await db
		.select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
		.from(accountStats);
	const total_accounts = Number(accountsResult[0]?.count || 0);

	// Get markets count
	const marketsResult = await db
		.select({
			count: sql<number>`CAST(count(distinct ${tokenMarketLookup.conditionId}) AS INTEGER)`,
		})
		.from(tokenMarketLookup)
		.where(isNotNull(tokenMarketLookup.conditionId));
	const total_markets = Number(marketsResult[0]?.count || 0);

	// Get token stats
	const tokenStatsResult = await db
		.select({
			total_trades: sql<number>`CAST(sum(coalesce(${tokenStats.totalTrades}, 0)) AS INTEGER)`,
			active_positions: sql<number>`CAST(count(*) AS INTEGER)`,
		})
		.from(tokenStats)
		.where(sql`${tokenStats.totalTrades} > 0`);

	const total_trades = Number(tokenStatsResult[0]?.total_trades || 0);
	const active_positions = Number(tokenStatsResult[0]?.active_positions || 0);

	return {
		total_accounts,
		total_markets,
		total_trades,
		active_positions,
	};
}
