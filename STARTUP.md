# Startup Guide

## Quick Start

Start all services with one command:

```bash
make start
```

This will start:
- **Postgres** (via Docker Compose on `localhost:5432`)
- **API Server** (Bun on `http://localhost:4000`)
- **Markets Service** (Fetches Polymarket data)
- **Pipeline** (Blockchain event processing)
- **Frontend** (Bun on `http://localhost:3001`)

## Service URLs

- **Frontend**: http://localhost:3001
- **API Server**: http://localhost:4000
- **Postgres**: localhost:5432 (TCP, bound to 127.0.0.1 only)

## Useful Commands

```bash
# Start all services
make start

# Stop all services
make stop

# View service status
make status

# View all logs
make logs

# View individual service logs
make logs-api        # API server
make logs-frontend   # Frontend
make logs-markets    # Markets service
make logs-pipeline   # Blockchain pipeline
make logs-db         # Postgres

# Run tests
make test            # Unit tests
make test-e2e        # E2E integration tests
make test-all        # All tests

# Development (manual control)
make dev-local       # Setup postgres, show manual run commands
make run-server      # Run API server only
make run-markets     # Run markets service only
make run-pipeline    # Run pipeline only
make run-frontend    # Run frontend only
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Port 3001)                  │
│  Bun.serve() + React + Preact + TailwindCSS + DaisyUI  │
└──────────────────┬──────────────────────────────────────┘
                   │ Proxies API calls
                   ▼
┌─────────────────────────────────────────────────────────┐
│                  API Server (Port 4000)                  │
│              Bun.serve() REST API + CORS                 │
│                                                          │
│  Endpoints:                                              │
│  • /health - Health check                               │
│  • /stats - Insider statistics                          │
│  • /global-stats - Global statistics                    │
│  • /alerts - Recent insider alerts                      │
│  • /insiders - List of insiders                         │
│  • /insider-trades/:address - Trades for address        │
│  • /api/markets - Market list (paginated, cached)       │
│  • /api/market/:conditionId - Market details            │
└──────────────────┬──────────────────────────────────────┘
                   │ Reads from
                   ▼
┌─────────────────────────────────────────────────────────┐
│                Postgres (Port 5432)                      │
│              Docker Container                            │
│                                                          │
│  Tables:                                                 │
│  • markets - Market data                                │
│  • market_tokens - Token details                        │
│  • token_market_lookup - Token-to-market mapping        │
│  • bloomfilter_snapshots - BloomFilter persistence      │
└──────────────────┬──────────────────────────────────────┘
                   │ Written to by
                   ▼
         ┌─────────────────────┬─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Pipeline   │    │   Markets    │    │ BloomFilters │
│              │    │   Service    │    │              │
│ Processes    │    │              │    │ InsiderDet.  │
│ blockchain   │    │ Fetches      │    │ NotInsider.  │
│ events from  │    │ Polymarket   │    │              │
│ Subsquid     │    │ CLOB API     │    │ Detects      │
│              │    │ every hour   │    │ insiders     │
└──────────────┘    └──────────────┘    └──────────────┘
```

## How It Works

1. **Postgres** stores all data (markets, trades, bloomfilters)
2. **Markets Service** fetches Polymarket data every hour and upserts to DB
3. **Pipeline** processes blockchain events, detects insider trading, stores results
4. **API Server** serves data from database to frontend
5. **Frontend** displays data and proxies API calls

## Process Management

All services (except Postgres) are managed by **PM2**:

```bash
# View PM2 dashboard
bunx pm2 monit

# Restart a specific service
bunx pm2 restart api-server
bunx pm2 restart markets
bunx pm2 restart pipeline
bunx pm2 restart frontend

# View detailed logs
bunx pm2 logs api-server --lines 100

# Stop a specific service
bunx pm2 stop api-server
```

## Testing

### Unit Tests
```bash
bun test tests/*.test.ts
```

### E2E Integration Tests
```bash
# Make sure services are running first
make start

# Run e2e tests
make test-e2e
```

### Manual API Testing
```bash
# Health check
curl http://localhost:4000/health

# Global stats
curl http://localhost:4000/global-stats

# Markets (paginated)
curl "http://localhost:4000/api/markets?page=1&limit=10"
```

## Environment Variables

The project uses `.env.local` for configuration:

```bash
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# API Server
PORT=4000

# Markets Service
FETCH_INTERVAL_MS=3600000  # 1 hour

# Frontend
PORT=3001
API_BASE_URL=http://localhost:4000
```

## Troubleshooting

### Postgres won't start
```bash
# Check if postgres is already running
docker compose ps

# Check logs
make logs-db

# Reset database (WARNING: deletes all data)
make db-reset
```

### Services won't start
```bash
# Check status
make status

# View logs
make logs

# Stop everything and restart
make stop
make start
```

### Port already in use
```bash
# Find process using port 4000
lsof -i :4000

# Find process using port 3001
lsof -i :3001

# Kill the process if needed
kill -9 <PID>
```

### Module resolution errors
```bash
# Reinstall dependencies
bun install

# Clear bun cache
rm -rf node_modules
bun install
```
