import { db } from "./src/lib/db/init";
import { sql } from "drizzle-orm";

async function runTest() {
    const res = await db.execute(sql`SELECT extname FROM pg_extension`);
    console.log(res);
}

runTest().catch(console.error).finally(() => process.exit(0));
