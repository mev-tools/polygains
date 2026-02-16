const path = require("node:path");

const commonApp = {
	env_file: path.join(__dirname, ".env"),
	autorestart: true,
	stop_exit_codes: [0],
	min_uptime: "10s",
	max_restarts: 50,
	restart_delay: 5000,
	exp_backoff_restart_delay: 100,
	watch: false,
};

module.exports = {
	apps: [
		{
			...commonApp,
			name: "api-server",
			script: "bun",
			args: "src/services/server.ts",
			cwd: __dirname,
		},
		{
			...commonApp,
			name: "markets",
			script: "bun",
			args: "src/services/markets.ts",
			cwd: __dirname,
		},
		{
			...commonApp,
			name: "pipeline",
			script: "bun",
			args: "src/main.ts",
			cwd: __dirname,
		},
		/*
		{
			...commonApp,
			name: "frontend",
			script: "bun",
			args: "run dev",
			cwd: path.join(__dirname, "frontend"),
			env: {
				FRONTEND_HOST: "127.0.0.1",
				FRONTEND_PORT: "3001",
				API_UPSTREAM_BASE_URL: "http://127.0.0.1:4069",
			},
		},
		{
			...commonApp,
			name: "frontend-build-watcher",
			script: "./scripts/watch-frontend-build.sh",
			interpreter: "bash",
			cwd: __dirname,
		},
		*/
		{
			...commonApp,
			name: "cloudflared",
			script: path.join(__dirname, "..", "tunnel", "start.sh"),
			interpreter: "bash",
			cwd: __dirname,
		},
	],
};
