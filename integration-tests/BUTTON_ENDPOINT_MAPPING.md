# Button & Data Flow Analysis

Based on screenshot analysis and code review

---

## Button-to-Endpoint Mapping

### Category Filter Buttons (ALL, CRYPTO, SPORTS, POLITICS, ...)

| Button | API Endpoint | Data Used | Frontend Change |
|--------|--------------|-----------|-----------------|
| ALL | `GET /api/alerts` | `category=ALL` (no param) | Shows all alerts |
| CRYPTO | `GET /api/alerts` | `category=CRYPTO` | Filters to crypto alerts |
| SPORTS | `GET /api/alerts` | `category=SPORTS` | Filters to sports alerts |
| POLITICS | `GET /api/alerts` | `category=POLITICS` | Filters to politics alerts |
| $DOGE, $PEPE, etc | `GET /api/alerts` | `category=$DOGE` | Filters to token alerts |

**Dynamic Buttons Source:**
```typescript
// TerminalPage.tsx line 312
fetchCategories().then((cats) => {
  // Returns: ["CRYPTO", "SPORTS", "POLITICS", "$DOGE", "$PEPE", ...]
  setCategoryOptions(["ALL", ...cats]);
});
```

**Screenshot Evidence:**
- Desktop: 20+ category buttons visible
- Mobile: 5 visible (ALL, CRYPTO, SPORTS, POLITICS, "THE ZONE O...")

---

### Winner Filter Buttons (BOTH, WINNERS, LOSERS)

| Button | Frontend Filter | Data Source | Behavior |
|--------|-----------------|-------------|----------|
| BOTH | `winnerFilter="BOTH"` | Client-side | Shows all trades |
| WINNERS | `winnerFilter="WINNERS"` | Client-side | Filters to `winner=true` |
| LOSERS | `winnerFilter="LOSERS"` | Client-side | Filters to `winner=false` |

**No API Call** - Pure client-side filtering of already loaded alerts

---

### Pagination Buttons (PREV, NEXT)

#### Alerts Pagination
| Button | API Endpoint | Query Params |
|--------|--------------|--------------|
| PREV | `GET /api/alerts` | `page=${currentPage - 1}, limit=10, category?` |
| NEXT | `GET /api/alerts` | `page=${currentPage + 1}, limit=10, category?` |

**Screenshot Evidence:**
- "Page 1 of 2853 (17118 total)"
- PREV disabled (on first page)
- NEXT enabled

#### Markets Pagination  
| Button | API Endpoint | Query Params |
|--------|--------------|--------------|
| PREV | `GET /api/top-liquidity-markets` | `page=${currentPage - 1}, limit=5` |
| NEXT | `GET /api/top-liquidity-markets` | `page=${currentPage + 1}, limit=5` |

**Screenshot Evidence:**
- "Page 1 of 7213 (28850 total)"

---

### Lookup Buttons (Search Icon)

| Button | Action | Data Used |
|--------|--------|-----------|
| 🔍 Lookup | External link | `row.profileAddress` |

**Code:**
```tsx
<a href={`https://polymarket.com/profile/${row.profileAddress}`}>
  🔍
</a>
```

**No API Call** - External navigation

---

### Live Tracker Controls

#### Checkboxes
| Checkbox | State | Affects |
|----------|-------|---------|
| 1 BET/MKT | `onlyBetOnce` | Client-side filtering logic |
| FIXED $10 | `selectedBetSizing` | PnL calculation |
| FOLLOW | `selectedStrategies` | Strategy filter |
| REVERSE | `selectedStrategies` | Strategy filter |
| YES | `selectedSides` | Side filter |
| NO | `selectedSides` | Side filter |

**No API Calls** - All client-side state

#### Price Inputs
| Input | State | API Impact |
|-------|-------|------------|
| Min Price | `minPriceFilter` | Re-fetches alerts with filters |
| Max Price | `maxPriceFilter` | Re-fetches alerts with filters |

**API Call:**
```typescript
loadInsiderAlerts(currentPage, {
  minPrice: value,
  maxPrice: value,
  // ... other filters
});
```

---

### Run Backtest Button

| Button | Action | API Calls |
|--------|--------|-----------|
| Run Backtest | Processes historical data | Multiple `GET /api/alerts` with `page` param |

**Process:**
1. Fetches alerts page by page (50 per page)
2. Processes PnL calculations client-side
3. Updates tracker state

---

## Data Flow Summary

### API Endpoints → UI Components

```
GET /api/categories
    ↓
Category Filter Buttons (dynamic)

GET /api/alerts?page=N&limit=10&category=X
    ↓
Alerts Table Rows + Pagination Info

GET /api/top-liquidity-markets?page=N&limit=5
    ↓
Markets Section + Markets Pagination

GET /api/stats
    ↓
POLYGAINS_DETECTION Stats (TOTAL, YES, NO, VOLUME)

GET /api/global-stats
    ↓
GLOBAL_STATS (ACCOUNTS, MARKETS, TOTAL FILLS, ACTIVE POS)

GET /api/health
    ↓
BLOCK display, SYNC status
```

---

## Screenshot Analysis: Data Flow Evidence

### Mobile Screenshot (375x667)

| UI Element | Data Source | Value Shown |
|------------|-------------|-------------|
| BLOCK | `/api/health` | 83081508 |
| SYNC | `/api/health` | ONLINE |
| TOTAL | `/api/stats` | 2950 |
| YES | `/api/stats` | 1528 |
| NO | `/api/stats` | 1471 |
| VOLUME | `/api/stats` | 104.33M |
| ACCOUNTS | `/api/global-stats` | 2.95K |
| MARKETS | `/api/global-stats` | 424.41K |
| TOTAL FILLS | `/api/global-stats` | 145.39M |
| ACTIVE POS | `/api/global-stats` | 17.12K |
| Alerts Page | `/api/alerts` | Page 1 of 2853 |
| Markets Page | `/api/top-liquidity-markets` | Page 1 of 7213 |
| MONEY BET | Client calc | $20.80 |
| PNL | Client calc | -$2.00 |
| TRADES | Client calc | 4 (W:1 L:2) |

---

## Pagination State Changes

### Alerts Pagination Flow

```
Initial Load:
  GET /api/alerts?page=1&limit=10
  → Shows page 1, PREV disabled, NEXT enabled

Click NEXT:
  GET /api/alerts?page=2&limit=10
  → Shows page 2, PREV enabled, NEXT depends on hasNext

Click Category Button:
  GET /api/alerts?page=1&limit=10&category=CRYPTO
  → Resets to page 1 with new filter
```

### Markets Pagination Flow

```
Initial Load:
  GET /api/top-liquidity-markets?page=1&limit=5
  → Shows page 1

Click NEXT:
  GET /api/top-liquidity-markets?page=2&limit=5
  → Shows page 2
```

---

## Auto-Refresh Intervals

| Data | Endpoint | Interval |
|------|----------|----------|
| Health/Sync | `/api/health` | 2 seconds |
| Insider Stats | `/api/stats` | 2 seconds |
| Global Stats | `/api/global-stats` | 5 seconds |
| Alerts/Markets | `/api/alerts` + `/api/top-liquidity-markets` | 5 seconds (if autoRefreshEnabled) |

---

## Button State Dependencies

| Button | Enabled When | Disabled When |
|--------|--------------|---------------|
| PREV (Alerts) | `pagination.hasPrev` | `page === 1` |
| NEXT (Alerts) | `pagination.hasNext` | Last page |
| PREV (Markets) | `pagination.hasPrev` | `page === 1` |
| NEXT (Markets) | `pagination.hasNext` | Last page |
| Run Backtest | `!backtestRunning` | `backtestRunning === true` |
| Category Buttons | `!backtestRunning` | During backtest |
| Price Inputs | `!backtestRunning` | During backtest |

---

## Test Implications

### What Changes When:

1. **Category Button Click:**
   - API: `GET /api/alerts?category=X`
   - UI: Table refreshes with filtered data
   - Pagination: Resets to page 1

2. **Winner Filter Click:**
   - API: None (client-side)
   - UI: Table filters without re-fetch

3. **Pagination Click:**
   - API: `GET /api/alerts?page=N`
   - UI: New page of data

4. **Price Input Change:**
   - API: `GET /api/alerts` with price filters
   - UI: Re-fetches and re-calculates

5. **Backtest Run:**
   - API: Multiple sequential `GET /api/alerts?page=N` (50 per page)
   - UI: Updates PnL stats progressively
