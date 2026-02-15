import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const DATABASE_URL =
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:5469/postgres";

export async function runMigrations() {
	console.log("[Migration] Starting database migration via bun-sql...");

	const db = drizzle(DATABASE_URL);

	console.log("[Migration] Running migrations from ./drizzle...");
	await migrate(db, { migrationsFolder: "./drizzle" });

	console.log("[Migration] Migration completed successfully!");
}

if (import.meta.main) {
	runMigrations().catch((error) => {
		console.error("[Migration] Migration failed:", error);
		process.exit(1);
	});
}
