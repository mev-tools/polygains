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
