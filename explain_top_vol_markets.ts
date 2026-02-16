import { db } from "./src/lib/db/init";
import { sql } from "drizzle-orm";

async function runExplain() {
	try {
		const now = Date.now();
		console.log("--- EXPLAIN TOP VOL -> HN SCORE ---");
		const marketQuery = sql`EXPLAIN ANALYZE 
            WITH top_vol_markets AS (
                SELECT 
                    condition_id, 
                    sum(total_vol) as total_market_vol,
                    sum(total_trades) as total_market_trades,
                    min(created_at) as created_at
                FROM token_market_lookup
                LEFT JOIN token_stats ON token_market_lookup.token_id = token_stats.token
                GROUP BY condition_id
                ORDER BY total_market_vol DESC
                LIMIT 1000
            )
            SELECT 
                condition_id, 
                total_market_vol,
                total_market_trades,
                (total_market_vol - 1.0) / power(((${now} - created_at) / 3600000.0) + 2.0, 1.8) as hn_score
            FROM top_vol_markets
            ORDER BY hn_score DESC
            LIMIT 4`;

		const marketExplain = await db.execute(marketQuery);
		console.log(marketExplain.map(r => r["QUERY PLAN"]).join("\n"));
	} catch (e) {
		console.error("Error during EXPLAIN:", e);
	}
}

runExplain().catch(console.error).finally(() => process.exit(0));
