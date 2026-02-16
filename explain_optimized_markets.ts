import { db } from "./src/lib/db/init";
import { sql } from "drizzle-orm";

async function runExplain() {
	try {
		const now = Date.now();
		console.log("--- EXPLAIN OPTIMIZED MARKETS ---");
		const marketQuery = sql`EXPLAIN ANALYZE 
            SELECT 
                m."conditionId", 
                sum(coalesce(ts.total_vol, 0)) as total_market_vol,
                sum(coalesce(ts.total_trades, 0)) as total_market_trades,
                (sum(coalesce(ts.total_vol, 0)) - 1.0) / power(((${now} - MIN(tml.created_at)) / 3600000.0) + 2.0, 1.8) as hn_score
            FROM (SELECT "conditionId" FROM markets WHERE active = true) m
            JOIN token_market_lookup tml ON m."conditionId" = tml.condition_id
            LEFT JOIN (SELECT token, total_vol, total_trades FROM token_stats WHERE total_vol > 0 OR total_trades > 0) ts ON tml.token_id = ts.token
            GROUP BY m."conditionId"
            ORDER BY hn_score DESC
            LIMIT 4`;

		const marketExplain = await db.execute(marketQuery);
		console.log(marketExplain.map(r => r["QUERY PLAN"]).join("\n"));
	} catch (e) {
		console.error("Error during EXPLAIN:", e);
	}
}

runExplain().catch(console.error).finally(() => process.exit(0));
