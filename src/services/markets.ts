import { sql } from "drizzle-orm";

import { db } from "@/lib/db/init";
import { markets, marketTokens, tokenMarketLookup } from "@/lib/db/schema";

const CLOB_API = "https://clob.polymarket.com/markets";
const UPSERT_CHUNK_SIZE = 1_000;

// Flat market structure with token_0_id, token_0_outcome, token_0_winner, etc.
type FlatMarket = {
    conditionId: string;
    question: string;
    slug: string;
    active: boolean;
    closed: boolean;
    tokenCount: number;
    [key: `token_${number}_id`]: string | undefined;
    [key: `token_${number}_outcome`]: string | undefined;
    [key: `token_${number}_winner`]: boolean | undefined;
};

type ClobToken = {
    token_id?: string;
    outcome?: string;
    winner?: boolean;
};

type ClobMarket = {
    condition_id?: string;
    question?: string;
    description?: string;
    market_slug?: string;
    active?: boolean;
    closed?: boolean;
    tokens?: ClobToken[];
};

type ClobResponse = {
    data?: ClobMarket[];
    next_cursor?: string;
};

const chunk = <T>(items: T[], size = UPSERT_CHUNK_SIZE): T[][] => {
    if (items.length === 0) return [];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const flattenMarket = (m: ClobMarket): FlatMarket | null => {
    if (!m.condition_id || !Array.isArray(m.tokens) || m.tokens.length === 0) {
        return null;
    }

    const flat: FlatMarket = {
        conditionId: m.condition_id,
        question: m.question || "",
        slug: m.market_slug || "",
        active: !!m.active,
        closed: !!m.closed,
        tokenCount: m.tokens.length,
    };

    for (let i = 0; i < m.tokens.length; i++) {
        const token = m.tokens[i];
        if (!token?.token_id) continue;
        flat[`token_${i}_id`] = token.token_id;
        flat[`token_${i}_outcome`] = token.outcome || "";
        flat[`token_${i}_winner`] = !!token.winner;
    }

    return flat;
};

async function upsertMarketsPage(pageMarkets: ClobMarket[]): Promise<void> {
    if (pageMarkets.length === 0) return;

    const now = Date.now();
    const marketRows = new Map<
        string,
        {
            conditionId: string;
            question: string;
            description: string | null;
            outcomeTags: string | null;
            slug: string;
            active: boolean;
            closed: boolean;
            updatedAt: number;
        }
    >();
    const tokenRows = new Map<
        string,
        {
            tokenId: string;
            marketConditionId: string;
            outcome: string | null;
            tokenIndex: number;
            outcomeIndex: number;
            winner: boolean;
        }
    >();
    const lookupRows = new Map<
        string,
        {
            tokenId: string;
            conditionId: string;
            createdAt: number;
        }
    >();

    for (const m of pageMarkets) {
        if (!m.condition_id || !Array.isArray(m.tokens) || m.tokens.length === 0) {
            continue;
        }

        marketRows.set(m.condition_id, {
            conditionId: m.condition_id,
            question: m.question || "",
            description: m.description || null,
            outcomeTags:
                m.tokens
                    .map((token) => token.outcome || "")
                    .filter((value) => value.length > 0)
                    .join(",") || null,
            slug: m.market_slug || "",
            active: !!m.active,
            closed: !!m.closed,
            updatedAt: now,
        });

        for (let index = 0; index < m.tokens.length; index++) {
            const token = m.tokens[index];
            if (!token?.token_id) continue;

            tokenRows.set(token.token_id, {
                tokenId: token.token_id,
                marketConditionId: m.condition_id,
                outcome: token.outcome || null,
                tokenIndex: index,
                outcomeIndex: index,
                winner: !!token.winner,
            });

            lookupRows.set(token.token_id, {
                tokenId: token.token_id,
                conditionId: m.condition_id,
                createdAt: now,
            });
        }
    }

    if (marketRows.size === 0 && tokenRows.size === 0 && lookupRows.size === 0) {
        return;
    }

    await db.transaction(async (tx) => {
        for (const values of chunk(Array.from(marketRows.values()))) {
            await tx
                .insert(markets)
                .values(values)
                .onConflictDoUpdate({
                    target: markets.conditionId,
                    set: {
                        question: sql`excluded.question`,
                        description: sql`excluded.description`,
                        outcomeTags: sql`excluded."outcomeTags"`,
                        slug: sql`excluded.slug`,
                        active: sql`excluded.active`,
                        closed: sql`excluded.closed`,
                        updatedAt: sql`excluded."updatedAt"`,
                    },
                });
        }

        for (const values of chunk(Array.from(tokenRows.values()))) {
            await tx
                .insert(marketTokens)
                .values(values)
                .onConflictDoUpdate({
                    target: marketTokens.tokenId,
                    set: {
                        marketConditionId: sql`excluded.market_condition_id`,
                        outcome: sql`excluded.outcome`,
                        tokenIndex: sql`excluded.token_index`,
                        outcomeIndex: sql`excluded.outcome_index`,
                        winner: sql`excluded.winner`,
                    },
                });
        }

        for (const values of chunk(Array.from(lookupRows.values()))) {
            await tx
                .insert(tokenMarketLookup)
                .values(values)
                .onConflictDoUpdate({
                    target: tokenMarketLookup.tokenId,
                    set: {
                        conditionId: sql`excluded.condition_id`,
                        createdAt: sql`excluded.created_at`,
                    },
                });
        }
    });
}

export async function fetchMarketsJson(): Promise<FlatMarket[]> {
    const results: FlatMarket[] = [];
    let cursor: string | undefined;
    let page = 0;

    console.log("[Market Fetcher] Starting to fetch all markets...");

    while (cursor !== "LTE=" && page < 2000) {
        const params = new URLSearchParams({ limit: "1000" });
        if (cursor) params.set("next_cursor", cursor);

        const res = await fetch(`${CLOB_API}?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ClobResponse;
        const pageMarkets = Array.isArray(json.data) ? json.data : [];
        if (pageMarkets.length === 0) break;

        await upsertMarketsPage(pageMarkets);

        for (const market of pageMarkets) {
            const flat = flattenMarket(market);
            if (flat) results.push(flat);
        }

        cursor = json.next_cursor;
        page++;
        if (page % 250 === 0 || page === 1) {
            console.log(
                `[Market Fetcher] Fetched ${results.length} markets so far... next cursor ${cursor}`,
            );
        }

        if (!cursor || cursor === "LTE=") break;
        await sleep(50);
    }

    console.log(`[Market Fetcher] Upserted ${results.length} markets.`);
    return results;
}

if (import.meta.main) {
    const { runMigrations } = await import("@/lib/db/migrate");
    await runMigrations();

    const FETCH_INTERVAL = Number(process.env.FETCH_INTERVAL_MS) || 3600000;

    while (true) {
        try {
            const data = await fetchMarketsJson();
            await Bun.write("tmp/markets.json", JSON.stringify(data));
            console.log(`[Market Worker] Next fetch in ${FETCH_INTERVAL / 1000}s`);
        } catch (e) {
            console.error("[Market Worker] Error in fetch loop:", e);
        }
        await sleep(FETCH_INTERVAL);
    }
}
