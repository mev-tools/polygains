.PHONY: help start stop status logs up down restart ps db-shell db-logs install build-frontend db-generate db-migrate db-prepare

help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

start: ## Start all services (postgres + api + markets + pipeline + frontend)
	@echo "🚀 Starting all services..."
	@echo "📊 Starting postgres..."
	@mkdir -p .pgsocket && chmod 777 .pgsocket || true
	@docker compose up -d postgres
	@echo "⏳ Waiting for postgres to be healthy..."
	@for i in $$(seq 1 60); do \
		if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "❌ Postgres failed to start" && exit 1
	@echo "✅ Postgres ready!"
	@echo "🗄️  Preparing database schema..."
	@$(MAKE) db-prepare
	@echo ""
	@if [ ! -f "public/index.html" ]; then \
		echo "🏗️  Building frontend to ./public ..."; \
		cd frontend && bun install && bun run build --outdir=../public; \
		echo "✅ Frontend built in ./public"; \
	else \
		echo "✅ Frontend already built (skip) - run 'make build-frontend' to rebuild"; \
	fi
	@echo ""
	@echo "🔧 Starting services with PM2..."
	@bunx pm2 start ecosystem.config.cjs
	@echo ""
	@echo "✨ All services started!"
	@echo ""
	@echo "📊 Service URLs:"
	@echo "   API Server:  http://127.0.0.1:4069"
	@echo "   Frontend:    http://127.0.0.1:3001"
	@echo "   Public URL:  https://polygains.com (when cloudflared tunnel is running)"
	@echo ""
	@echo "📝 Useful commands:"
	@echo "   make status  - View service status"
	@echo "   make logs    - View all logs"
	@echo "   make stop    - Stop all services"

stop: ## Stop all services
	@echo "🛑 Stopping all services..."
	@bunx pm2 delete all || true
	@docker compose down
	@echo "✅ All services stopped"

status: ## Show service status
	@echo "📊 Service Status:"
	@echo ""
	@echo "Docker services:"
	@docker compose ps
	@echo ""
	@echo "PM2 services:"
	@bunx pm2 status

logs: ## View logs from all services
	@bunx pm2 logs

up: ## Start all services (postgres + app + markets)
	docker compose up -d

up-build: ## Start all services with rebuild
	docker compose up -d --build

down: ## Stop all services
	docker compose down

down-volumes: ## Stop all services and remove volumes
	docker compose down -v

restart: ## Restart all services
	docker compose restart

logs-api: ## View API server logs
	@bunx pm2 logs api-server

logs-markets: ## View markets service logs
	@bunx pm2 logs markets

logs-pipeline: ## View pipeline logs
	@bunx pm2 logs pipeline

logs-frontend: ## View frontend logs
	@bunx pm2 logs frontend

logs-db: ## Follow postgres logs
	docker compose logs -f postgres

ps: ## Show running containers
	docker compose ps

db-shell: ## Open psql shell to postgres
	docker compose exec postgres psql -U postgres

db-logs: ## Follow postgres logs
	docker compose logs -f postgres

db-generate: ## Generate drizzle migrations from schema changes
	@echo "🧬 Generating Drizzle migration files..."
	@bunx drizzle-kit generate
	@echo "✅ Drizzle migration files ready"

db-migrate: ## Apply drizzle migrations to postgres
	@echo "🗃️  Applying database migrations..."
	@bun src/lib/db/migrate.ts
	@echo "✅ Database migrations applied"

db-prepare: db-generate db-migrate ## Generate and apply database migrations
	@echo "✅ Database schema is up to date"

db-reset: ## Reset postgres database (WARNING: deletes all data)
	docker compose down -v
	docker compose up -d postgres
	sleep 5
	docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE IF NOT EXISTS postgres;"

clear: ## Clear database and migration files to start from scratch (WARNING: deletes all data)
	@echo "🧹 Clearing database and migration files..."
	@echo "⚠️  This will delete all data and migrations!"
	@bunx pm2 delete all 2>/dev/null || true
	@docker compose down -v 2>/dev/null || true
	@docker ps -aq -f name=postgres_db | xargs -r docker rm -f 2>/dev/null || true
	@docker volume prune -f 2>/dev/null || true
	@echo "🗑️  Removing migration files..."
	@rm -f drizzle/0001_*.sql drizzle/meta/0001_*.json
	@echo "📝 Resetting journal..."
	@echo '{\n  "version": "7",\n  "dialect": "postgresql",\n  "entries": [\n    {\n      "idx": 0,\n      "version": "7",\n      "when": 1771011053132,\n      "tag": "0000_exotic_fat_cobra",\n      "breakpoints": true\n    }\n  ]\n}' > drizzle/meta/_journal.json
	@echo "🔄 Resetting state.json..."
	@echo '{}' > state.json
	@echo "✅ Cleared! Run 'make start' to begin fresh"

install: ## Install dependencies
	bun install

test: ## Run unit tests
	bun test

test-e2e: ## Run e2e integration tests
	@echo "🧪 Running e2e tests..."
	@echo "⚠️  Make sure services are running (make dev-local)"
	bunx playwright test

test-all: ## Run all tests (unit + e2e)
	@echo "Running unit tests..."
	bun test tests/*.test.ts
	@echo ""
	@echo "Running e2e tests..."
	bunx playwright test

dev: ## Run dev server locally (not in docker)
	bun run dev

dev-local: ## Run all services locally (postgres in docker, rest with bun)
	@echo "🚀 Starting local development environment..."
	@echo "📊 Starting postgres..."
	@mkdir -p .pgsocket && chmod 777 .pgsocket || true
	@docker compose up -d postgres
	@echo "⏳ Waiting for postgres to be healthy..."
	@for i in $$(seq 1 60); do \
		if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "❌ Postgres failed to start" && exit 1
	@echo "✅ Postgres ready!"
	@echo ""
	@echo "🔧 Run these commands in separate terminals:"
	@echo "   Terminal 1: make run-server    (API server on port 4069)"
	@echo "   Terminal 2: make run-markets   (Markets fetcher)"
	@echo "   Terminal 3: make run-pipeline  (Blockchain pipeline)"
	@echo "   Terminal 4: make run-frontend  (Frontend on port 3000)"
	@echo ""

run-server: ## Run API server locally
	@echo "🚀 Starting API server on port 4069..."
	bun --watch src/services/server.ts

run-markets: ## Run markets service locally
	@echo "📊 Starting markets service..."
	bun --watch src/services/markets.ts

run-pipeline: ## Run blockchain pipeline locally
	@echo "⛓️  Starting blockchain pipeline..."
	bun --watch src/main.ts

run-frontend: ## Run frontend dev server locally
	@echo "🎨 Starting frontend dev server..."
	cd frontend && bun run dev

stop-local: ## Stop local postgres
	@echo "🛑 Stopping postgres..."
	docker compose down

build-frontend: ## Build frontend for production
	@echo "🏗️  Building frontend..."
	cd frontend && bun install && bun run build --outdir=../public
	@echo "✅ Frontend built!"

build: ## Build the project
	docker compose build

clean: ## Clean up docker resources
	@echo "🧹 Cleaning up docker resources..."
	@$(MAKE) stop >/dev/null 2>&1 || true
	@bunx pm2 kill 2>/dev/null || true
	@pkill -f "[b]un --watch src/services/server.ts" 2>/dev/null || true
	@pkill -f "[b]un --watch src/services/markets.ts" 2>/dev/null || true
	@pkill -f "[b]un --watch src/main.ts" 2>/dev/null || true
	@pkill -f "[b]un run dev" 2>/dev/null || true
	@pkill -f "[w]atch-frontend-build.sh" 2>/dev/null || true
	@docker compose down -v 2>/dev/null || true
	@docker ps -aq -f name=postgres_db | xargs -r docker rm -f 2>/dev/null || true
	@docker system prune -f 2>/dev/null || true
	@docker volume prune -f 2>/dev/null || true
	@rm -f state.json
	@echo "✅ Docker resources cleaned and state.json removed"
