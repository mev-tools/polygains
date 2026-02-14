import { existsSync } from "node:fs";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "@/lib/db/schema";

const DATABASE_URL =
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@localhost:5432/postgres";

// Create PostgreSQL client with support for Unix sockets
const createClient = () => {
	try {
		const socketPath = process.env.DB_SOCKET_PATH;
		const url = new URL(DATABASE_URL);

		if (socketPath) {
			const socketFile = `${socketPath}/.s.PGSQL.5432`;
			if (!existsSync(socketFile)) {
				console.warn(
					`[DB] Unix socket not found at ${socketFile}, falling back to TCP`,
				);
			} else {
				console.log(`[DB] Connecting via Unix socket: ${socketFile}`);
				return new SQL({
					path: socketFile,
					database: url.pathname.slice(1),
					username: url.username,
					password: url.password,
				});
			}
		}

		console.log(`[DB] Connecting via TCP: ${url.hostname}:${url.port || 5432}`);
		return new SQL(DATABASE_URL);
	} catch (_error) {
		console.error(
			"[DB] Error parsing DATABASE_URL, falling back to raw connection string",
		);
		return new SQL(DATABASE_URL);
	}
};

const client = createClient();

// Initialize Drizzle with schema
export const db = drizzle({ client, schema, casing: "snake_case" });

// Legacy exports for backward compatibility
export const writer = client;
export const reader = client;

// Factory function to create a fresh db connection (for respawn)
export const createDb = () => {
	const newClient = createClient();
	return drizzle({ client: newClient, schema, casing: "snake_case" });
};

export const initDb = async (retries = 5, delay = 2000) => {
	console.log("[DB] Initializing PostgreSQL connection...");

	for (let i = 0; i < retries; i++) {
		try {
			// Test connection by running a simple query
			await client`SELECT 1`;
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
