import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "@/lib/db/schema";

const DATABASE_URL =
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:5469/postgres";

// Initialize Drizzle with bun-sql driver
export const db = drizzle(DATABASE_URL, { schema, casing: "snake_case" });

// Factory function to create a fresh db connection (for respawn)
export const createDb = () => {
	return drizzle(DATABASE_URL, { schema, casing: "snake_case" });
};

export const initDb = async (retries = 5, delay = 2000) => {
	console.log("[DB] Initializing PostgreSQL connection via bun-sql...");

	for (let i = 0; i < retries; i++) {
		try {
			// Test connection by running a simple query
			await db.execute("SELECT 1");
			console.log("[DB] PostgreSQL connection established successfully");
			console.log(
				`[DB] Connected to: ${DATABASE_URL.replace(/:[^:]*@/, ":***@")}`,
			);
			return;
		} catch (error) {
			console.error(
				`[DB] Connection attempt ${i + 1}/${retries} failed:`,
				error instanceof Error ? error.message : String(error),
			);
			if (i < retries - 1) {
				console.log(`[DB] Retrying in ${delay}ms...`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			} else {
				console.error("[DB] All connection attempts failed.");
				throw error;
			}
		}
	}
};
