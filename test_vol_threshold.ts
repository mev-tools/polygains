import { db } from "./src/lib/db/init";
import { sql } from "drizzle-orm";

async function runTest() {
    const res = await db.execute(sql`
        SELECT count(*) FROM (
            SELECT condition_id, sum(total_vol) as total_market_vol
            FROM token_market_lookup
            LEFT JOIN token_stats ON token_market_lookup.token_id = token_stats.token
            GROUP BY condition_id
            HAVING sum(total_vol) > 1000
        ) t
    `);
    console.log("Markets with vol > 1000:", res[0].count);
}

runTest().catch(console.error).finally(() => process.exit(0));
