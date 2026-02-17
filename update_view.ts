import { sql } from "drizzle-orm";
import { db } from "./src/lib/db/init";

async function updateView() {
	console.log("Updating v_insiders_enriched view...");

	// We need to drop the view and recreate it with the new column
	// The view name in Postgres is snake_case: v_insiders_enriched

	try {
		await db.execute(sql`DROP VIEW IF EXISTS v_insiders_enriched CASCADE`);

		await db.execute(sql`
            CREATE VIEW v_insiders_enriched AS
            SELECT 
                insider_positions.account_hash,
                insider_positions.detected_at,
                insider_positions.total_volume,
                insider_positions.token_id,
                insider_positions.avg_price,
                market_tokens.outcome,
                1 AS market_count,
                token_market_lookup.condition_id,
                markets.question,
                markets.slug,
                markets."outcomeTags",
                token_stats.last_price,
                token_stats.total_vol AS market_total_volume,
                market_tokens.winner,
                markets.closed
            FROM insider_positions
            LEFT JOIN token_market_lookup ON insider_positions.token_id = token_market_lookup.token_id
            LEFT JOIN markets ON token_market_lookup.condition_id = markets."conditionId"
            LEFT JOIN market_tokens ON insider_positions.token_id = market_tokens.token_id
            LEFT JOIN token_stats ON insider_positions.token_id = token_stats.token
        `);

		console.log("View updated successfully!");
	} catch (e) {
		console.error("Failed to update view:", e);
	}
}

updateView()
	.catch(console.error)
	.finally(() => process.exit(0));
