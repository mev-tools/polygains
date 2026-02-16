# PolyGains

A high-performance analytics platform for tracking insider trading patterns and market data on Polymarket. Built with Bun, TypeScript, and Subsquid.

## Features

- **Real-time Data Ingestion**: Streams Polymarket exchange events via Subsquid portal
- **Insider Trading Detection**: Identifies suspicious trading patterns and whale movements
- **REST API**: Full-featured API with pagination, filtering, and caching
- **Web Dashboard**: React-based frontend with real-time market insights
- **Database**: PostgreSQL with Drizzle ORM for reliable data persistence

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Bun API   │────▶│  PostgreSQL │
│  (React)    │     │   Server    │     │   (Drizzle) │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Subsquid   │
                    │   Portal    │
                    │ (Polygon    │
                    │  Mainnet)   │
                    └─────────────┘
```

## Project Structure

```
polygains/
├── frontend/          # React frontend (Bun + Vite + Tailwind)
├── public/            # Static assets (favicons, images)
│   ├── dist/          # Built frontend output
│   ├── favicon*.png   # Favicon files (PNG/WebP/AVIF)
│   ├── og-image.png   # Social preview images
│   └── ...
├── src/
│   ├── lib/           # Utilities, types, database schema
│   ├── services/      # API server, data ingestion pipeline
│   └── main.ts        # Application entry point
├── drizzle/           # Database migrations
└── tests/             # Test suites
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1.0+
- PostgreSQL 15+
- (Optional) ClickHouse for analytics

### Installation

```bash
# Install dependencies
bun install

# Set up environment
cp .env.local.example .env
# Edit .env with your database credentials

# Run database migrations
bunx drizzle-kit migrate
```

### Development

```bash
# Start the data ingestion pipeline
bun run src/main.ts

# In another terminal, start the API server
bun run src/services/server.ts

# Start the frontend dev server
cd frontend && bun dev
```

### Production Build

```bash
# Build frontend
cd frontend && bun run build.ts

# Start production server
bun run src/services/server.ts
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/stats` | Insider trading statistics |
| `GET /api/global-stats` | Global market statistics |
| `GET /api/markets` | List markets with pagination |
| `GET /api/market/:id` | Get specific market details |
| `GET /api/insiders` | List insider addresses |
| `GET /api/insider-trades/:address` | Get trades for an address |
| `GET /api/alerts` | Insider alerts with filtering |
| `GET /api/categories` | Market categories |

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/polygains

# API Server
API_HOST=0.0.0.0
API_PORT=4000

# Frontend (dev proxy)
API_UPSTREAM_BASE_URL=http://127.0.0.1:4000
```

## Static Assets

All files in `public/` are served at root path:

- `/favicon.ico` - Multi-resolution ICO favicon
- `/favicon-*.png` - PNG favicons (16/32/48px)
- `/favicon-*.webp` - WebP favicons (compressed)
- `/apple-touch-icon.png` - iOS home screen icon
- `/android-chrome-*.png` - Android icons (192/512px)
- `/og-image.png` - Open Graph social preview (1200×630)
- `/twitter-card.png` - Twitter card image (1200×600)

Built frontend assets are served from `public/dist/`.

## License

MIT

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
