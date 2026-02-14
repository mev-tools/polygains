import { existsSync } from "node:fs";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const DATABASE_URL =
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@localhost:5432/postgres";

export async function runMigrations() {
	console.log("[Migration] Starting database migration...");
	const socketPath = process.env.DB_SOCKET_PATH;

	let client: SQL;
	try {
		const url = new URL(DATABASE_URL);

		if (socketPath) {
			const socketFile = `${socketPath}/.s.PGSQL.5432`;
			if (existsSync(socketFile)) {
				console.log(`[Migration] Connecting via Unix socket: ${socketFile}`);
				client = new SQL({
					path: socketFile,
					database: url.pathname.slice(1),
					username: url.username,
					password: url.password,
				});
			} else {
				console.log(
					`[Migration] Unix socket not found at ${socketFile}, falling back to TCP`,
				);
				client = new SQL(DATABASE_URL);
			}
		} else {
			console.log(
				`[Migration] Connecting via TCP: ${url.hostname}:${url.port || 5432}`,
			);
			client = new SQL(DATABASE_URL);
		}
	} catch (_e) {
		console.log("[Migration] Falling back to raw DATABASE_URL");
		client = new SQL(DATABASE_URL);
	}

	const db = drizzle({ client });

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
