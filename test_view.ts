import { db } from "./src/lib/db/init";
import { sql } from "drizzle-orm";

async function runTest() {
    const res = await db.execute(sql`SELECT * FROM v_insiders_enriched LIMIT 1`);
    console.log(res);
}

runTest().catch(console.error).finally(() => process.exit(0));
