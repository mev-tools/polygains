# PolyGains

A high-performance analytics platform for tracking insider trading patterns and market data on Polymarket. Built with Bun, TypeScript, PostgreSQL, and Subsquid.

## Features

- **Real-time Data Ingestion**: Streams Polymarket exchange events via Subsquid portal from Polygon Mainnet
- **Insider Trading Detection**: Identifies suspicious trading patterns using XXHash32Set-based detection
- **REST API**: Full-featured API with pagination, filtering, and CORS support
- **Web Dashboard**: Preact-based frontend with TailwindCSS, DaisyUI, and SWR for real-time insights
- **Database**: PostgreSQL with Drizzle ORM for reliable data persistence

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) v1.1.0+
- **Language**: TypeScript
- **Database**: PostgreSQL 15+ with Drizzle ORM
- **Frontend**: Preact + TailwindCSS + DaisyUI + SWR
- **Process Management**: PM2
- **Testing**: Bun test + Playwright (E2E)
- **Linting**: Biome

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Port 4033)                  │
│  Bun.serve() + Preact + TailwindCSS + DaisyUI + SWR     │
└──────────────────┬──────────────────────────────────────┘
                   │ Proxies API calls
                   ▼
┌─────────────────────────────────────────────────────────┐
│                  API Server (Port 4069)                  │
│              Bun.serve() REST API + CORS                 │
└──────────────────┬──────────────────────────────────────┘
                   │ Reads from
                   ▼
┌─────────────────────────────────────────────────────────┐
│                Postgres (Port 5469)                      │
│              Docker Container                            │
└──────────────────┬──────────────────────────────────────┘
                   │ Written to by
                   ▼
         ┌─────────────────────┬─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Pipeline   │    │   Markets    │    │   Detector   │
│              │    │   Service    │    │              │
│ Processes    │    │              │    │ Detects      │
│ blockchain   │    │ Fetches      │    │ insiders     │
│ events from  │    │ Polymarket   │    │ using        │
│ Subsquid     │    │ CLOB API     │    │ XXHash32Set  │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Project Structure

```
polygains/
├── src/
│   ├── lib/                    # Utilities, types, database schema
│   │   ├── db/                 # Database: schema, migrations, queries
│   │   ├── types/              # TypeScript type definitions
│   │   ├── abi.ts              # Contract ABIs
│   │   ├── const.ts            # Constants (START_BLOCK, contracts, etc.)
│   │   ├── hash.ts             # Wallet hashing utilities
│   │   ├── hashset.ts          # XXHash32Set implementation
│   │   ├── parser.ts           # Blockchain event parsers
│   │   └── utils.ts            # General utilities
│   ├── services/               # Background services
│   │   ├── server.ts           # REST API server (Bun.serve)
│   │   ├── markets.ts          # Polymarket CLOB data fetcher
│   │   ├── pipe.ts             # Subsquid pipeline processor
│   │   ├── detector.ts         # Insider detection algorithms
│   │   ├── buffer.ts           # Window buffer for aggregations
│   │   ├── filter-persistor.ts # BloomFilter persistence
│   │   └── positions-persistor.ts # Position data persistence
│   └── main.ts                 # Pipeline entry point
├── frontend/                   # Preact frontend (separate package)
│   ├── src/
│   │   ├── features/terminal/  # Main terminal feature
│   │   ├── hooks/              # SWR hooks and queries
│   │   ├── context/            # React contexts (UI, Data)
│   │   └── reducers/           # State reducers
│   ├── build.ts                # Production build script
│   └── package.json            # Frontend dependencies
├── drizzle/                    # Database migrations
├── tests/                      # Unit and integration tests
├── integration-tests/          # Playwright E2E tests
├── public/                     # Static assets (favicons, built frontend)
│   ├── dist/                   # Built frontend output
│   ├── favicon*.png            # Favicon files
│   ├── og-image.png            # Social preview images
│   └── ...
├── docs/                       # Architecture documentation
├── Makefile                    # Primary command interface
├── ecosystem.config.cjs        # PM2 process configuration
└── compose.yml                 # PostgreSQL Docker service
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1.0+
- Docker (for PostgreSQL)

### Installation

```bash
# Install dependencies
bun install

# Set up environment
cp .env.local.example .env
# Edit .env with your configuration (or keep defaults for local dev)

# Start all services (postgres + api + markets + pipeline + frontend)
make start
```

### Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:4033 |
| API Server | http://localhost:4069 |
| PostgreSQL | localhost:5469 |

## Makefile Commands

All commands are managed through the Makefile:

```bash
# Start/stop services
make start             # Start everything
make stop              # Stop all services
make status            # View service status
make restart           # Restart all services

# View logs
make logs              # All logs
make logs-api          # API server only
make logs-markets      # Markets service only
make logs-pipeline     # Pipeline only
make logs-frontend     # Frontend only
make logs-db           # Postgres only

# Development (manual control)
make dev-local         # Setup postgres, show manual run commands
make run-server        # Run API server only (port 4069)
make run-markets       # Run markets service only
make run-pipeline      # Run pipeline only
make run-frontend      # Run frontend only (port 4033)

# Database
make db-generate       # Generate Drizzle migrations
make db-migrate        # Apply migrations
make db-prepare        # Generate + migrate
make db-reset          # Reset database (WARNING: deletes data)
make db-shell          # Open psql shell

# Testing
make test              # Run unit tests only
make test-e2e          # Run Playwright E2E tests
make test-all          # Run all tests

# Build & Deploy
make build-frontend    # Build frontend for production
make deploy-frontend   # Deploy to Cloudflare Pages
make clean             # Clean docker resources and processes
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /stats` | Insider trading statistics |
| `GET /global-stats` | Global market statistics |
| `GET /markets` | List markets with pagination |
| `GET /market/:conditionId` | Get specific market details |
| `GET /insiders` | List detected insider addresses (hashed) |
| `GET /insider-trades/:hash` | Get trades for a hashed address |
| `GET /alerts` | Insider alerts with filtering |
| `GET /categories` | Market categories |

## Database Schema

Key tables:
- `markets` - Polymarket market data
- `market_tokens` - Token outcomes per market
- `token_market_lookup` - Token ID to market mapping
- `token_stats` - Aggregated token statistics
- `insider_positions` - Persisted insider positions (hashed)
- `detected_insiders` - Detected insider addresses
- `account_stats` - Account trading statistics
- `checkpoint` - Stream processing cursor
- `detector_snapshots` - Insider detector state

## Environment Variables

Copy `.env.local.example` to `.env` and configure:

```bash
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
POSTGRES_PORT=5469
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5469/postgres

# API Server
API_HOST=127.0.0.1
API_PORT=4069

# Frontend
FRONTEND_HOST=127.0.0.1
FRONTEND_PORT=4033
API_UPSTREAM_BASE_URL=http://127.0.0.1:4069
BUN_PUBLIC_API_BASE_URL=http://127.0.0.1:4069

# Services
FETCH_INTERVAL_MS=3600000  # 1 hour
NODE_ENV=development

# CORS (comma-separated origins)
CORS_ORIGINS=http://localhost:4033,http://127.0.0.1:4033
```

## Process Management

All services run under PM2 (defined in `ecosystem.config.cjs`):

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
# Run all unit tests
make test

# Run specific test file
bun test tests/parser.test.ts
```

### E2E Integration Tests
```bash
# Make sure services are running first
make start

# Run E2E tests
make test-e2e

# Or directly
bunx playwright test
```

### Manual API Testing
```bash
# Health check
curl http://localhost:4069/health

# Global stats
curl http://localhost:4069/global-stats

# Markets (paginated)
curl "http://localhost:4069/markets?page=1&limit=10"
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

## Code Style

Linting is handled by Biome:

```bash
# Check linting
bun run lint

# Fix linting issues
bun run lint:fix
```

Key conventions:
- Use double quotes for strings
- Path alias `@/*` maps to `src/*`
- Prefer Bun APIs over Node.js equivalents
- Bun automatically loads `.env` files (no `dotenv` needed)

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
# Find process using ports
lsof -i :4069  # API port
lsof -i :4033  # Frontend port
lsof -i :5469  # Postgres port

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

## References

- `CLAUDE.md` - Bun-specific coding guidelines
- `AGENTS.md` - AI agent guide for the codebase
- `docs/DESIGN.md` - Frontend architecture design
- `BACKTEST.md` - Backtest implementation notes

## License

MIT
