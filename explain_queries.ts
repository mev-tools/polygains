import { db } from "./src/lib/db/init";
import { sql } from "drizzle-orm";

async function runExplain() {
	try {
		console.log("--- EXPLAIN COUNT WITH CATEGORY ---");
		const countQuery = sql`EXPLAIN ANALYZE SELECT count(*) FROM v_insiders_enriched 
            LEFT JOIN markets ON v_insiders_enriched.condition_id = markets."conditionId" 
            WHERE (coalesce(avg_price, last_price, 0) <= 0.950001)
            AND (coalesce(markets."outcomeTags", '') ilike '%CRYPTO%')`;

		const countExplain = await db.execute(countQuery);
		console.log(countExplain.map(r => r["QUERY PLAN"]).join("\n"));

		console.log("\n--- EXPLAIN SELECT LIMIT 6 WITH CATEGORY ---");
		const selectQuery = sql`EXPLAIN ANALYZE SELECT * FROM v_insiders_enriched 
            LEFT JOIN markets ON v_insiders_enriched.condition_id = markets."conditionId" 
            WHERE (coalesce(avg_price, last_price, 0) <= 0.950001)
            AND (coalesce(markets."outcomeTags", '') ilike '%CRYPTO%')
            ORDER BY detected_at DESC LIMIT 6`;

		const selectExplain = await db.execute(selectQuery);
		console.log(selectExplain.map(r => r["QUERY PLAN"]).join("\n"));
	} catch (e) {
		console.error("Error during EXPLAIN:", e);
	}
}

runExplain().catch(console.error).finally(() => process.exit(0));
