import { db } from "./src/lib/db/init";
import { sql } from "drizzle-orm";

async function runExplain() {
	try {
		const now = Date.now();
		console.log("--- EXPLAIN MARKETS HN SCORE WITH ACTIVE FILTER ---");
		const marketQuery = sql`EXPLAIN ANALYZE 
            SELECT 
                token_market_lookup.condition_id, 
                sum(coalesce(total_vol, 0)) as total_market_vol,
                sum(coalesce(total_trades, 0)) as total_market_trades,
                (sum(coalesce(total_vol, 0)) - 1.0) / power(((${now} - MIN(token_market_lookup.created_at)) / 3600000.0) + 2.0, 1.8) as hn_score
            FROM token_market_lookup
            LEFT JOIN markets ON token_market_lookup.condition_id = markets."conditionId"
            LEFT JOIN token_stats ON token_market_lookup.token_id = token_stats.token
            WHERE markets.active = true
            GROUP BY token_market_lookup.condition_id
            ORDER BY hn_score DESC
            LIMIT 4`;

		const marketExplain = await db.execute(marketQuery);
		console.log(marketExplain.map(r => r["QUERY PLAN"]).join("\n"));
	} catch (e) {
		console.error("Error during EXPLAIN:", e);
	}
}

runExplain().catch(console.error).finally(() => process.exit(0));
