import { db } from "./src/lib/db/init";
import { sql } from "drizzle-orm";

async function runTest() {
    const res = await db.execute(sql`SELECT count(*) FROM token_stats WHERE total_vol > 0`);
    console.log("Tokens with vol > 0:", res[0].count);
}

runTest().catch(console.error).finally(() => process.exit(0));
