import { Fragment, useEffect, useState } from "react";
import type { GroupedMarket, Pagination } from "../../types/terminal";

export interface AlertRowView {
  rowId: string;
  user: string;
  addrShort: string;
  volumeFormatted: string;
  outcomeClass: string;
  outcomeLabel: string;
  statusBadgeHtml: string;
  dateText: string;
  timeText: string;
  detailHtml: string;
  expanded: boolean;
}

interface HeaderProps {
  currentBlock: string;
  syncLabel: string;
  syncHealthy: boolean;
}

interface TerminalIntroProps {
  text: string;
}

interface LiveTrackerControlsProps {
  minPrice: number;
  maxPrice: number;
  onlyBetOnce: boolean;
  selectedStrategies: Array<"reverse_insider" | "follow_insider">;
  onMinPriceChange: (value: number) => void;
  onMaxPriceChange: (value: number) => void;
  onOnlyBetOnceChange: (value: boolean) => void;
  onStrategyChange: (mode: "reverse_insider" | "follow_insider", enabled: boolean) => void;
}

interface LiveTrackerCardsProps {
  totalBet: number;
  openInterest: number;
  realizedPnL: number;
  liveTrades: number;
  liveWins: number;
  liveLosses: number;
  alertsPage: number;
  alertsTotalPages: number;
  alertsFilledThroughPage: number;
  backtestCanContinue: boolean;
  backtestRunning: boolean;
  onRunBacktest: () => void;
}

interface AlertsSectionProps {
  rows: AlertRowView[];
  pagination: Pagination;
  isLoading?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleDetails: (rowId: string, address: string) => void;
}

interface DetectionSectionProps {
  totalInsiders: number;
  yesInsiders: number;
  noInsiders: number;
  insiderVolume: string;
}

interface MarketsSectionProps {
  markets: GroupedMarket[];
  pagination: Pagination;
  isLoading?: boolean;
  marketStatsLoadingByCondition?: Record<string, boolean>;
  onPrev: () => void;
  onNext: () => void;
}

interface GlobalStatsSectionProps {
  accounts: string;
  markets: string;
  trades: string;
  activePositions: string;
}

interface BannerProps {
  currentBlock: string;
}

const TOP_LOGO_ASCII = ` 
██████╗  ██████╗ ██╗     ██╗   ██╗
██╔══██╗██╔═══██╗██║     ╚██╗ ██╔╝
██████╔╝██║   ██║██║      ╚████╔╝
██╔═══╝ ██║   ██║██║       ╚██╔╝
██║     ╚██████╔╝███████╗   ██║
╚═╝      ╚═════╝ ╚══════╝   ╚═╝
 ██████╗  █████╗  ██╗███╗   ██╗███████╗
██╔════╝ ██╔══██╗ ██║████╗  ██║██╔════╝
██║  ███╗███████║ ██║██╔██╗ ██║███████╗
██║   ██║██╔══██║ ██║██║╚██╗██║╚════██║
╚██████╔╝██║  ██║ ██║██║ ╚████║███████║
 ╚═════╝ ╚═╝  ╚═╝ ╚═╝╚═╝  ╚═══╝╚══════╝`;

const BANNER_ASCII = `
██████╗  ██████╗ ██╗  ██╗   ██╗ ██████╗  █████╗  ██╗███╗   ██╗███████╗
██╔══██╗██╔═══██╗██║  ╚██╗ ██╔╝██╔════╝ ██╔══██╗ ██║████╗  ██║██╔════╝
██████╔╝██║   ██║██║   ╚████╔╝ ██║  ███╗███████║ ██║██╔██╗ ██║███████╗
██╔═══╝ ██║   ██║██║    ╚██╔╝  ██║   ██║██╔══██║ ██║██║╚██╗██║╚════██║
██║     ╚██████╔╝███████╗██║   ╚██████╔╝██║  ██║ ██║██║ ╚████║███████║
╚═╝      ╚═════╝ ╚══════╝╚═╝    ╚═════╝ ╚═╝  ╚═╝ ╚═╝╚═╝  ╚═══╝╚══════╝`;

function formatCurrency(value: number): string {
  return `${value >= 0 ? "+" : ""}$${value.toFixed(2)} `;
}

function formatLargeNumber(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TerminalHeader({ currentBlock, syncLabel, syncHealthy }: HeaderProps) {
  return (
    <div className="header">
      <pre className="top-logo-ascii">{TOP_LOGO_ASCII}</pre>
      <div className="header-meta">
        <div className="timestamp">BLOCK: {currentBlock}</div>
        <div className={`badge badge - outline badge - sm font - mono ${syncHealthy ? "badge-success" : "badge-error"} `}>{syncLabel}</div>
      </div>
    </div>
  );
}

export function TerminalIntro({ text }: TerminalIntroProps) {
  return (
    <div className="terminal-row">
      <div className="terminal-header">
        <pre className="logo-ascii">{BANNER_ASCII}</pre>
        <span>
          STATUS: <span className="terminal-accent">ONLINE</span>
        </span>
      </div>
      <div className="terminal-content">
        <div className="terminal-section">
          <h3>
            <span className="cli-prompt">$</span> run explain-detection
          </h3>
          <div className="cli-output" id="typewriter-text">
            {text}
            <span className="cursor" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveTrackerControls({
  minPrice,
  maxPrice,
  onlyBetOnce,
  selectedStrategies,
  onMinPriceChange,
  onMaxPriceChange,
  onOnlyBetOnceChange,
  onStrategyChange,
}: LiveTrackerControlsProps) {
  const [minDraft, setMinDraft] = useState(minPrice.toFixed(2));
  const [maxDraft, setMaxDraft] = useState(maxPrice.toFixed(2));

  useEffect(() => {
    setMinDraft(minPrice.toFixed(2));
  }, [minPrice]);

  useEffect(() => {
    setMaxDraft(maxPrice.toFixed(2));
  }, [maxPrice]);

  const commitMinPrice = () => {
    const parsed = Number(minDraft);
    const next = Number.isFinite(parsed) ? parsed : minPrice;
    setMinDraft(next.toFixed(2));
    onMinPriceChange(next);
  };

  const commitMaxPrice = () => {
    const parsed = Number(maxDraft);
    const next = Number.isFinite(parsed) ? parsed : maxPrice;
    setMaxDraft(next.toFixed(2));
    onMaxPriceChange(next);
  };

  return (
    <h2 className="section-title with-controls">
      LIVE_TRACKER
      <div className="controls-row">
        <input
          type="text"
          inputMode="decimal"
          value={minDraft}
          placeholder="Min P"
          className="input input-bordered input-xs filter-input"
          onChange={event => setMinDraft(event.currentTarget.value)}
          onFocus={event => event.currentTarget.select()}
          onBlur={commitMinPrice}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <input
          type="text"
          inputMode="decimal"
          value={maxDraft}
          placeholder="Max P"
          className="input input-bordered input-xs filter-input"
          onChange={event => setMaxDraft(event.currentTarget.value)}
          onFocus={event => event.currentTarget.select()}
          onBlur={commitMaxPrice}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <label className="filter-checkbox">
          <input className="checkbox checkbox-xs checkbox-primary" type="checkbox" checked={onlyBetOnce} onChange={event => onOnlyBetOnceChange(event.currentTarget.checked)} />
          1 Bet/Mkt
        </label>
        <label className="filter-checkbox">
          <input
            className="checkbox checkbox-xs checkbox-success"
            type="checkbox"
            checked={selectedStrategies.includes("follow_insider")}
            onChange={event => onStrategyChange("follow_insider", event.currentTarget.checked)}
          />
          Follow
        </label>
        <label className="filter-checkbox">
          <input
            className="checkbox checkbox-xs checkbox-error"
            type="checkbox"
            checked={selectedStrategies.includes("reverse_insider")}
            onChange={event => onStrategyChange("reverse_insider", event.currentTarget.checked)}
          />
          Reverse
        </label>
      </div>
    </h2>
  );
}

export function LiveTrackerCards({
  totalBet,
  openInterest,
  realizedPnL,
  liveTrades,
  liveWins,
  liveLosses,
  alertsPage,
  alertsTotalPages,
  alertsFilledThroughPage,
  backtestCanContinue,
  backtestRunning,
  onRunBacktest,
}: LiveTrackerCardsProps) {
  return (
    <div className="grid cols-3">
      <div className="card">
        <h2>Money Bet</h2>
        <div className="stat">${formatLargeNumber(totalBet)}</div>
        <div className="small-meta">
          Open: <span>${formatLargeNumber(openInterest)}</span>
        </div>
      </div>
      <div className="card pnl-card">
        <h2>PnL</h2>
        <div className={`stat ${realizedPnL > 0 ? "accent" : realizedPnL < 0 ? "danger" : ""} `}>{formatCurrency(realizedPnL)}</div>

        <button className="btn breath backtest-btn" disabled={backtestRunning} onClick={onRunBacktest}>
          {backtestRunning ? "Processing..." : backtestCanContinue ? "Continue Backtest" : "Run Backtest"}
        </button>
      </div>
      <div className="card">
        <h2>Trades</h2>
        <div className="stat">
          {liveTrades}
          <span className="trade-meta">(W:{liveWins} L:{liveLosses})</span>
        </div>
      </div>
    </div>
  );
}

export function AlertsSection({ rows, pagination, isLoading = false, onPrev, onNext, onToggleDetails }: AlertsSectionProps) {
  return (
    <>
      <h2 className="section-title">RECENT_POLYGAINS_ALERTS</h2>
      <div className="table-container">
        <table id="alerts-table">
          <colgroup>
            <col style={{ width: "25%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Address</th>
              <th>Volume (USDC)</th>
              <th>Outcome</th>
              <th>Date</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  No alerts found
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <Fragment key={row.rowId}>
                  <tr className="table-clickable" onClick={() => onToggleDetails(row.rowId, row.user)}>
                    <td>
                      <span className="pos-id">{row.addrShort}</span>
                      <a
                        href={`https://polymarket.com/profile/${row.user}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={event => event.stopPropagation()}
                        className="profile-link"
                      >
                        ↗
                      </a >
                    </td >
                    <td className="val">{row.volumeFormatted}</td>
                    <td>
                      <span className={`outcome-tag ${row.outcomeClass}`}>{row.outcomeLabel}</span>
                      {row.statusBadgeHtml ? <span dangerouslySetInnerHTML={{ __html: row.statusBadgeHtml }} /> : null}
                    </td>
                    <td className="val">{row.dateText}</td>
                    <td className="timestamp">{row.timeText}</td>
                  </tr >
                  <tr id={row.rowId} className="detail-row" style={{ display: row.expanded ? "table-row" : "none" }}>
                    <td colSpan={5} className="detail-cell" dangerouslySetInnerHTML={{ __html: row.detailHtml }} />
                  </tr>
                </Fragment >
              ))
            )}
          </tbody >
        </table >
        <div className="pagination">
          <button onClick={onPrev} disabled={isLoading || !pagination.hasPrev}>
            {isLoading ? <span className="loading loading-spinner loading-xs" /> : "← PREV"}
          </button>
          <span className="page-info">
            {isLoading ? <span className="loading loading-dots loading-xs" /> : null} Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <button onClick={onNext} disabled={isLoading || !pagination.hasNext}>
            {isLoading ? <span className="loading loading-spinner loading-xs" /> : "NEXT →"}
          </button>
        </div>
      </div >
    </>
  );
}

export function DetectionSection({ totalInsiders, yesInsiders, noInsiders, insiderVolume }: DetectionSectionProps) {
  return (
    <>
      <h2 className="section-title slim">POLYGAINS_DETECTION</h2>
      <div className="grid cols-4">
        <div className="card">
          <h2>Total</h2>
          <div className="stat accent">{totalInsiders}</div>
        </div>
        <div className="card">
          <h2>YES</h2>
          <div className="stat accent">{yesInsiders}</div>
        </div>
        <div className="card">
          <h2>NO</h2>
          <div className="stat danger">{noInsiders}</div>
        </div>
        <div className="card">
          <h2>Volume</h2>
          <div className="stat">{insiderVolume}</div>
        </div>
      </div>
    </>
  );
}

function renderMarketPrice(lastPrice: number, isClosed: boolean): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(lastPrice) ? lastPrice : 0));
  const pct = `${(clamped * 100).toFixed(2)}%`;
  if (isClosed && (clamped >= 0.99 || clamped <= 0.01)) {
    return `RESOLVED ${pct}`;
  }
  return pct;
}

function getOutcomeMeta(outcome: string | number): { label: string; toneClass: "yes" | "no" | "other" } {
  const text = String(outcome).toUpperCase();
  if (text === "YES" || text === "1") return { label: "YES", toneClass: "yes" };
  if (text === "NO" || text === "0") return { label: "NO", toneClass: "no" };
  return { label: text, toneClass: "other" };
}

function hasAllStats(outcome: { mean?: number | null; stdDev?: number | null; p95?: number | null }): boolean {
  return outcome.mean !== null && outcome.mean !== undefined && outcome.stdDev !== null && outcome.stdDev !== undefined && outcome.p95 !== null && outcome.p95 !== undefined;
}

function formatMarketStat(value: number | null | undefined): string {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "--";
}

export function MarketsSection({ markets, pagination, isLoading = false, marketStatsLoadingByCondition = {}, onPrev, onNext }: MarketsSectionProps) {
  return (
    <>
      <h2 className="section-title">TOP_LIQUIDITY_MARKETS</h2>
      <div className="table-container market-table-shell">
        {markets.length === 0 ? (
          <div className="empty-cell market-empty">No markets found</div>
        ) : (
          <div className="markets-stack">
            {markets.map(market => (
              <section key={market.conditionId} className="market-card">
                <h3 className="market-card-title" title={market.question}>
                  {market.question}
                </h3>
                <div className="overflow-x-auto market-outcome-wrap">
                  <table className="table table-xs market-outcome-table">
                    <thead>
                      <tr>
                        <th>Outcome</th>
                        <th>Trades</th>
                        <th>Volume</th>
                        <th>Current Odds</th>
                        <th>
                          <span className="market-stats-head">
                            <span>Market Stats (ø (mean) / std / P95)</span>
                            <span
                              className="tooltip tooltip-left"
                              data-tip="ø (mean) is average fill size, std is standard deviation, and P95 is the 95th percentile fill size."
                            >
                              <span className="badge badge-ghost badge-xs">?</span>
                            </span>
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {market.outcomes.map((outcome, index) => {
                        const outcomeMeta = getOutcomeMeta(outcome.outcome);
                        const statsLoading = Boolean(marketStatsLoadingByCondition[market.conditionId]);
                        const missingStats = !hasAllStats(outcome);
                        return (
                          <tr key={`${market.conditionId}-${String(outcome.outcome)}`} className={index % 2 === 1 ? "market-secondary-row" : ""}>
                            <td className="market-outcome-cell">
                              <span className={`market-outcome-box ${outcomeMeta.toneClass}`}>{outcomeMeta.label}</span>
                            </td>
                            <td className="val">{Number(outcome.total_trades || 0).toLocaleString()}</td>
                            <td className="val">
                              $
                              {Number(outcome.volume || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="val market-odds">{renderMarketPrice(Number(outcome.last_price || 0), Boolean(market.closed || outcome.closed))}</td>
                            <td className="val market-stats-cell">
                              {missingStats && statsLoading ? (
                                <span className="market-stats-loading">
                                  <span className="loading loading-spinner loading-xs" /> loading...
                                </span>
                              ) : (
                                `${formatMarketStat(outcome.mean)} / ${formatMarketStat(outcome.stdDev)} / ${formatMarketStat(outcome.p95)}`
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
        <div className="pagination">
          <button onClick={onPrev} disabled={isLoading || !pagination.hasPrev}>
            {isLoading ? <span className="loading loading-spinner loading-xs" /> : "← PREV"}
          </button>
          <span className="page-info">
            {isLoading ? <span className="loading loading-dots loading-xs" /> : null} Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <button onClick={onNext} disabled={isLoading || !pagination.hasNext}>
            {isLoading ? <span className="loading loading-spinner loading-xs" /> : "NEXT →"}
          </button>
        </div>
      </div>
    </>
  );
}

export function GlobalStatsSection({ accounts, markets, trades, activePositions }: GlobalStatsSectionProps) {
  return (
    <>
      <h2 className="section-title slim">GLOBAL_STATS</h2>
      <div className="grid cols-4">
        <div className="card">
          <h2>Accounts</h2>
          <div className="stat">{accounts}</div>
        </div>
        <div className="card">
          <h2>Markets</h2>
          <div className="stat">{markets}</div>
        </div>
        <div className="card">
          <h2>Total Fills</h2>
          <div className="stat">{trades}</div>
        </div>
        <div className="card">
          <h2>Active Pos</h2>
          <div className="stat accent">{activePositions}</div>
        </div>
      </div>
    </>
  );
}

export function TerminalBanner({ currentBlock }: BannerProps) {
  return (
    <div className="banner-container">
      <div className="scanner" />
      <div className="logo-ascii">{BANNER_ASCII}</div>

      <div className="subtitle-row">
        <span>[v1.0.3] | Zero-History Trade Detection System by @mevtools</span>
        <span>
          BLOCK: {currentBlock} | STATUS: <span className="status-online">INDEXING</span>
        </span>
      </div>

      <div className="cli-section">
        <div className="cli-line" style={{ animationDelay: "0.5s" }}>
          $ connecting to <span className="status-online">polymarket</span>...
        </div>
        <div className="cli-line" style={{ animationDelay: "1.2s" }}>
          &gt; using <span className="status-online">subsquid pipes</span> for indexing...
        </div>
        <div className="cli-line" style={{ animationDelay: "1.8s" }}>
          &gt; triggering alerts...
        </div>
        <div className="cli-line" style={{ animationDelay: "2.4s" }}>
          &gt; calibrating detection thresholds...
        </div>
        <div className="cli-line" style={{ animationDelay: "3.0s" }}>
          <span className="accent">[OK]</span> polygains detection system <span className="status-online">ONLINE</span>
          <span className="cursor" />
        </div>
      </div>
    </div>
  );
}
