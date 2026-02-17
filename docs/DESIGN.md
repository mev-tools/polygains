# Terminal Refactor Design: Context + SWR + Backtest

Status: Draft
Scope: `polygains/frontend/src` terminal feature only
Code changes: Not in this document

## References

This design follows patterns from:
- `polygains/docs/docsswr/getting-started.mdx`
- `polygains/docs/docsswr/global-configuration.mdx`
- `polygains/docs/reducer.mdx`

## Out of Scope

Not part of this design:
- `AuthContext`
- `ThemeContext`
- `useUser`
- `Profile` examples

This is only for terminal data flows: markets, stats, alerts, insiders, pagination, and backtesting.

## Problem Statement

`TerminalPage.tsx` currently owns too much:
- remote fetch logic
- polling intervals
- filters and pagination UI state
- loaded-alert history and dedupe state
- backtest run lifecycle and continuation logic

Because these are mixed together, changing one behavior (for example pagination) can break backtest or refresh logic.

## Design Goals

1. Keep remote state in SWR hooks.
2. Keep user intent state in reducers/context.
3. Keep fetched history and backtest lifecycle in a dedicated data context.
4. Allow backtest to continue by requesting more pages when needed.
5. Keep `TerminalPage` mostly presentational.

## Proposed Structure

```text
frontend/src/
  app/
    providers/
      AppProviders.tsx
      swrConfig.ts
  context/
    TerminalUiContext.tsx
    TerminalDataContext.tsx
  reducers/
    terminalUiReducer.ts
    terminalDataReducer.ts
  hooks/
    queries/
      useHealthQuery.ts
      useStatsQueries.ts
      useAlertsQuery.ts
      useMarketsQuery.ts
      useInsidersQuery.ts
      useCategoriesQuery.ts
    swr/
      keys.ts
      fetcher.ts
      options.ts
  features/
    terminal/
      pages/
        TerminalPage.tsx
      components/
        TerminalSections.tsx
      controller/
        useTerminalController.ts
      selectors/
        alerts.ts
        markets.ts
      services/
        trackerEngine.ts
        backtestEngine.ts
```

## State Ownership

### SWR (server state)

Owned by query hooks only:
- health
- insider stats
- global stats
- categories
- markets pages
- alerts pages
- market details
- insiders / insider trades

### `TerminalUiContext` (user intent state)

Examples:
- current alerts page
- current markets page
- selected category
- selected strategies/sides
- price range
- winner filter
- only-bet-once
- bet sizing
- auto refresh enabled
- sound enabled

### `TerminalDataContext` (fetched data + run lifecycle)

Examples:
- normalized alerts map by id
- pages index (`alertsPages[page] = [ids]`)
- loaded page metadata (`hasNext`, `loadedMaxPage`)
- chronological alert history ids (deduped)
- active backtest run state
- continuation cursor
- pending request for next page when backtest needs more data

## SWR Key Strategy

Use typed array keys from `hooks/swr/keys.ts`:
- `['health']`
- `['stats', 'global']`
- `['stats', 'insider']`
- `['categories']`
- `['alerts', { category, page, limit }]`
- `['markets', { page, limit, close: false }]`
- `['market', conditionId]`
- `['insiders', { page, limit }]`
- `['insiderTrades', { address, page, limit }]`

## Core Runtime Flow

### 1) Ingest fetched pages into context

1. `useAlertsQuery` fetches a page from SWR.
2. On success, dispatch `ALERTS_PAGE_RECEIVED` to `terminalDataReducer`.
3. Reducer:
- upserts alerts by id
- stores page-to-id mapping
- appends unseen ids to chronological history
- updates `loadedMaxPage` and `hasNextByPage`

Same pattern for markets pages.

### 2) Page navigation and fetch-more

For alerts pagination:
1. UI dispatches `SET_ALERTS_PAGE(targetPage)`.
2. If page is already loaded in data context, render immediately.
3. If missing and `targetPage > loadedMaxPage`, dispatch `REQUEST_ALERTS_PAGE(targetPage)`.
4. Controller/hook responds by increasing SWR page size or issuing missing page query.

This removes direct fetch calls from the component.

### 3) Backtest run and continuation

Backtest runs on context data snapshot, not directly on component-local refs.

1. User dispatches `BACKTEST_START`.
2. `backtestEngine` builds snapshot from `TerminalDataContext.historyIds` + `alertsById`.
3. Engine processes from `cursor` and writes incremental results (`BACKTEST_PROGRESS`).
4. If engine reaches end of loaded history and last loaded page has `hasNext=true`, dispatch `BACKTEST_NEEDS_MORE_DATA(nextPage)`.
5. Controller triggers fetch for `nextPage`.
6. When new page arrives (`ALERTS_PAGE_RECEIVED`), active run continues from saved cursor.

### 4) Redo backtest when filters change

Use a `runId`/`generation` model:
- filter-changing actions increment `backtestGeneration`
- active computation checks generation before committing result
- stale run output is ignored

This allows safe "recompute from loaded data" without race conditions.

## Reducer Drafts

### `TerminalUiState`

```ts
interface TerminalUiState {
  alertsPage: number;
  marketsPage: number;
  minPrice: number;
  maxPrice: number;
  category: string;
  winnerFilter: 'BOTH' | 'WINNERS' | 'LOSERS';
  strategies: Array<'follow_insider' | 'reverse_insider'>;
  sides: Array<'YES' | 'NO'>;
  onlyBetOnce: boolean;
  betSizing: 'target_payout' | 'fixed_stake';
  autoRefreshEnabled: boolean;
  soundEnabled: boolean;
}
```

### `TerminalDataState`

```ts
interface TerminalDataState {
  alertsById: Record<string, AlertItem>;
  alertsPages: Record<number, string[]>;
  alertsHasNextByPage: Record<number, boolean>;
  loadedMaxAlertsPage: number;
  historyIds: string[];
  pendingPageRequests: number[];
  backtest: {
    runId: number;
    status: 'idle' | 'running' | 'waiting_more_data' | 'done' | 'error';
    cursor: number;
    canContinue: boolean;
    result: TrackerState;
  };
}
```

## Controller Responsibilities

`useTerminalController.ts` coordinates:
- reading UI + data contexts
- invoking query hooks with current params
- dispatching ingest actions on successful responses
- dispatching fetch-more actions for pagination/backtest continuation
- exposing view-model props to `TerminalPage`

`TerminalPage` should render from controller output and dispatch intent actions only.

## Migration Plan

### Phase 1: Base SWR setup

1. Add `AppProviders` with global `SWRConfig`.
2. Add shared `fetcher`, `keys`, `options`.
3. Keep current behavior.

### Phase 2: Introduce contexts/reducers

1. Add `TerminalUiContext` + `terminalUiReducer`.
2. Add `TerminalDataContext` + `terminalDataReducer`.
3. Keep existing fetch logic temporarily.

### Phase 3: Move fetch to hooks/controller

1. Create query hooks per domain.
2. Add `useTerminalController`.
3. Remove direct `fetch` and `setInterval` logic from page.

### Phase 4: Backtest continuation model

1. Move backtest lifecycle into `backtestEngine` + data reducer actions.
2. Implement `BACKTEST_NEEDS_MORE_DATA` fetch-more loop.
3. Validate parity with current tracker outputs.

### Phase 5: Cleanup

1. Trim dead refs/in-flight flags from page.
2. Keep component tree focused on rendering.
3. Add tests for reducer transitions and continuation behavior.

## Risks

1. Endpoint pagination mismatch (optimized endpoints may return fixed slices).
- Mitigation: explicitly encode backend pagination capabilities in query hooks and stop requesting beyond supported range.

2. Backtest race conditions while new pages stream in.
- Mitigation: generation/runId guards and reducer-driven cursor persistence.

3. Recompute cost grows with long history.
- Mitigation: chunked computation and optional memoized checkpoints.

## Acceptance Criteria

1. `TerminalPage` has no direct `fetch` calls.
2. Pagination and filters are context/reducer driven.
3. Backtest can pause for missing data, request more pages, and continue.
4. Filter changes can trigger deterministic recompute from loaded history.
5. SWR keys and defaults are centralized.
6. Auth/User/Theme are not part of this design scope.
