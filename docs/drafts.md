import { useState } from "react";

interface InsiderAlert {
  id: number;
  market: string;
  boughtYes: boolean;
  avgPrice: number;
  totalInvested: number;
  profit?: number;
  time: string;
}

const mockAlerts: InsiderAlert[] = [
  { id: 1, market: "Will BTC hit $100K by 2024?", boughtYes: true, avgPrice: 0.67, totalInvested: 2500, profit: 850, time: "2h ago" },
  { id: 2, market: "AI wins Nobel Prize 2025", boughtYes: true, avgPrice: 0.23, totalInvested: 5000, profit: 2174, time: "5h ago" },
  { id: 3, market: "Fed cuts rates in March", boughtYes: false, avgPrice: 0.58, totalInvested: 1500, time: "1d ago" },
  { id: 4, market: "Ethereum ETF approved", boughtYes: true, avgPrice: 0.45, totalInvested: 3500, profit: 1167, time: "3h ago" },
  { id: 5, market: "Trump wins 2024 election", boughtYes: true, avgPrice: 0.52, totalInvested: 4200, profit: 1538, time: "6h ago" },
  { id: 6, market: "SpaceX goes public 2025", boughtYes: false, avgPrice: 0.31, totalInvested: 2000, time: "12h ago" },
  { id: 7, market: "Apple releases AR glasses", boughtYes: true, avgPrice: 0.19, totalInvested: 8000, profit: 4211, time: "1d ago" },
];

export function App() {
  const [filter, setFilter] = useState<"all" | "yes" | "no">("all");

  const filteredAlerts = mockAlerts.filter((alert) => {
    if (filter === "yes") return alert.boughtYes;
    if (filter === "no") return !alert.boughtYes;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500">
              <svg className="h-4 w-4 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 3v18h18" />
                <path d="M7 16l4-4 4 4 6-6" />
              </svg>
            </div>
            <h1 className="text-base font-semibold tracking-tight">Insider Alerts</h1>
          </div>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
            {mockAlerts.length} signals
          </span>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 px-3 pb-2">
          {(["all", "yes", "no"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? f === "yes"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : f === "no"
                    ? "bg-rose-500/20 text-rose-400"
                    : "bg-slate-700 text-white"
                  : "text-slate-500 hover:bg-slate-800"
              }`}
            >
              {f === "all" ? "All" : f === "yes" ? "Bought YES" : "Bought NO"}
            </button>
          ))}
        </div>
      </header>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-1 bg-slate-900/50 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        <div className="col-span-5">Market</div>
        <div className="col-span-2 text-center">Bought</div>
        <div className="col-span-2 text-right">Avg Price</div>
        <div className="col-span-3 text-right">Invested</div>
      </div>

      {/* List */}
      <div className="divide-y divide-slate-800/50">
        {filteredAlerts.map((alert) => (
          <div
            key={alert.id}
            className="grid grid-cols-12 gap-1 px-2 py-2.5 transition-colors hover:bg-slate-900/50"
          >
            {/* Market */}
            <div className="col-span-5 flex flex-col justify-center">
              <span className="truncate text-sm font-medium leading-tight text-slate-200">
                {alert.market}
              </span>
              <span className="text-[10px] text-slate-500">{alert.time}</span>
            </div>

            {/* Bought YES/NO */}
            <div className="col-span-2 flex items-center justify-center">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  alert.boughtYes
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {alert.boughtYes ? "YES" : "NO"}
              </span>
            </div>

            {/* Avg Price */}
            <div className="col-span-2 flex flex-col items-end justify-center">
              <span className="text-sm font-semibold text-slate-200">
                ${alert.avgPrice.toFixed(2)}
              </span>
              {alert.profit !== undefined && (
                <span className="text-[10px] text-emerald-400">
                  +${alert.profit.toLocaleString()}
                </span>
              )}
            </div>

            {/* Total Invested */}
            <div className="col-span-3 flex flex-col items-end justify-center">
              <span className="text-sm font-semibold text-slate-200">
                ${alert.totalInvested.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500">
                @{(alert.avgPrice * 100).toFixed(0)}¢
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Stats Bar */}
      <div className="sticky bottom-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm">
        <div className="flex justify-between px-3 py-2 text-xs">
          <div>
            <span className="text-slate-500">Total Invested</span>
            <span className="ml-2 font-semibold text-white">$26,700</span>
          </div>
          <div>
            <span className="text-slate-500">P/L</span>
            <span className="ml-2 font-semibold text-emerald-400">+$9,940</span>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useMemo, useState } from "react";

type Side = "YES" | "NO";

type Trade = {
  id: string;
  market: string;
  ticker?: string;
  boughtAt: string; // ISO
  side: Side;
  avgPrice: number; // dollars
  invested: number; // dollars
  source: "Form 4" | "13D" | "News";
  tags: ("Cluster" | "Director" | "CEO" | "10b5-1" | "First buy")[];
};

type Insider = {
  id: string;
  name: string;
  role: string;
  company: string;
  avatarBg: string;
  trades: Trade[];
};

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatPrice(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.floor((now - then) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return `${s}s ago`;
}

function clampText(s: string, max = 38) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

const SEED: Insider[] = [
  {
    id: "i1",
    name: "A. Johnson",
    role: "CEO",
    company: "NVIDIA",
    avatarBg: "from-emerald-500 to-teal-500",
    trades: [
      {
        id: "t1",
        market: "NVDA — Will NVDA close above $900 on Fri?",
        ticker: "NVDA",
        boughtAt: new Date(Date.now() - 1000 * 60 * 52).toISOString(),
        side: "YES",
        avgPrice: 0.62,
        invested: 25000,
        source: "News",
        tags: ["Cluster", "CEO"],
      },
      {
        id: "t2",
        market: "NVDA — New ATH before earnings?",
        ticker: "NVDA",
        boughtAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
        side: "NO",
        avgPrice: 0.41,
        invested: 12000,
        source: "Form 4",
        tags: ["10b5-1"],
      },
    ],
  },
  {
    id: "i2",
    name: "M. Chen",
    role: "Director",
    company: "Tesla",
    avatarBg: "from-violet-500 to-indigo-500",
    trades: [
      {
        id: "t3",
        market: "TSLA — Robotaxi launch this quarter?",
        ticker: "TSLA",
        boughtAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        side: "YES",
        avgPrice: 0.28,
        invested: 50000,
        source: "13D",
        tags: ["Director", "First buy"],
      },
    ],
  },
  {
    id: "i3",
    name: "S. Patel",
    role: "CFO",
    company: "Apple",
    avatarBg: "from-amber-500 to-orange-500",
    trades: [
      {
        id: "t4",
        market: "AAPL — EPS beat next report?",
        ticker: "AAPL",
        boughtAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
        side: "NO",
        avgPrice: 0.53,
        invested: 18000,
        source: "Form 4",
        tags: ["Cluster"],
      },
      {
        id: "t5",
        market: "AAPL — Above $200 this month?",
        ticker: "AAPL",
        boughtAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
        side: "YES",
        avgPrice: 0.47,
        invested: 9000,
        source: "News",
        tags: ["10b5-1"],
      },
    ],
  },
  {
    id: "i4",
    name: "L. García",
    role: "COO",
    company: "Microsoft",
    avatarBg: "from-sky-500 to-cyan-500",
    trades: [
      {
        id: "t6",
        market: "MSFT — New Copilot tier announced?",
        ticker: "MSFT",
        boughtAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
        side: "YES",
        avgPrice: 0.35,
        invested: 22000,
        source: "News",
        tags: ["COO" as any],
      },
    ],
  },
];

function Tag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/80">
      {children}
    </span>
  );
}

function Segmented({
  value,
  onChange,
}: {
  value: "All" | "YES" | "NO";
  onChange: (v: "All" | "YES" | "NO") => void;
}) {
  const items: Array<"All" | "YES" | "NO"> = ["All", "YES", "NO"];
  return (
    <div className="flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
      {items.map((it) => {
        const active = value === it;
        return (
          <button
            key={it}
            onClick={() => onChange(it)}
            className={
              "flex-1 rounded-lg px-3 py-2 text-xs font-semibold tracking-wide transition " +
              (active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-white/75 hover:bg-white/5 hover:text-white")
            }
          >
            {it}
          </button>
        );
      })}
    </div>
  );
}

function Arrow({ dir }: { dir: "up" | "down" }) {
  return dir === "up" ? (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" />
      <path d="M19 12l-7 7-7-7" />
    </svg>
  );
}

export function App() {
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<"All" | "YES" | "NO">("All");
  const [sort, setSort] = useState<"Newest" | "Invested" | "Price">("Newest");

  const flattened = useMemo(() => {
    const rows = SEED.flatMap((ins) =>
      ins.trades.map((t) => ({
        insiderId: ins.id,
        insiderName: ins.name,
        role: ins.role,
        company: ins.company,
        avatarBg: ins.avatarBg,
        trade: t,
      }))
    );

    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const matchesQ =
        !q ||
        r.insiderName.toLowerCase().includes(q) ||
        r.company.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.trade.market.toLowerCase().includes(q) ||
        (r.trade.ticker ?? "").toLowerCase().includes(q) ||
        r.trade.tags.some((t) => t.toLowerCase().includes(q));
      const matchesSide = side === "All" ? true : r.trade.side === side;
      return matchesQ && matchesSide;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sort === "Newest") return +new Date(b.trade.boughtAt) - +new Date(a.trade.boughtAt);
      if (sort === "Invested") return b.trade.invested - a.trade.invested;
      return b.trade.avgPrice - a.trade.avgPrice;
    });

    return sorted;
  }, [query, side, sort]);

  const totalInvested = useMemo(
    () => flattened.reduce((acc, r) => acc + r.trade.invested, 0),
    [flattened]
  );

  return (
    <div className="min-h-screen bg-[#06070a] text-white">
      {/* Top gradient */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-[radial-gradient(1000px_400px_at_50%_-50px,rgba(99,102,241,0.35),transparent_60%),radial-gradient(900px_360px_at_10%_0%,rgba(16,185,129,0.22),transparent_55%),radial-gradient(900px_360px_at_90%_0%,rgba(236,72,153,0.18),transparent_55%)]" />

      <div className="relative mx-auto w-full max-w-md px-4 pb-28 pt-5">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <div className="h-9 w-9 rounded-2xl bg-white/10 ring-1 ring-white/10 grid place-items-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l3-3 3 2 6-6" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold tracking-tight">Insider Alerts</h1>
            </div>
            <p className="text-xs text-white/60">Mobile feed • market-style trades</p>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/55">Total invested</div>
            <div className="text-sm font-semibold tabular-nums">{formatMoney(totalInvested)}</div>
          </div>
        </header>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2 ring-1 ring-white/10">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/60" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search insiders, companies, markets, tags…"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/45 outline-none"
              />
              {query.length > 0 ? (
                <button
                  onClick={() => setQuery("")}
                  className="rounded-lg px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <Segmented value={side} onChange={setSide} />

              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-white/55">Sort</div>
                <div className="flex gap-2">
                  {(["Newest", "Invested", "Price"] as const).map((s) => {
                    const active = sort === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setSort(s)}
                        className={
                          "rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition " +
                          (active
                            ? "bg-white text-slate-900 ring-white/20"
                            : "bg-white/5 text-white/75 ring-white/10 hover:bg-white/10 hover:text-white")
                        }
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Column header (mobile-friendly) */}
          <div className="px-1">
            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              <div className="col-span-5">Market</div>
              <div className="col-span-2 text-right">Bought</div>
              <div className="col-span-1 text-center">Y/N</div>
              <div className="col-span-2 text-right">Avg</div>
              <div className="col-span-2 text-right">Invested</div>
            </div>
          </div>

          <div className="space-y-3">
            {flattened.map((row) => {
              const t = row.trade;
              const yes = t.side === "YES";
              return (
                <article
                  key={t.id}
                  className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={
                          "h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br " +
                          row.avatarBg +
                          " ring-1 ring-white/10"
                        }
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {row.insiderName}
                          <span className="ml-2 text-xs font-medium text-white/55">{row.role}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/55">
                          <span className="truncate">{row.company}</span>
                          <span className="text-white/35">•</span>
                          <span className="tabular-nums">{timeAgo(t.boughtAt)}</span>
                          <span className="text-white/35">•</span>
                          <span className="text-white/60">{t.source}</span>
                        </div>
                      </div>
                    </div>
                    <div
                      className={
                        "inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold ring-1 " +
                        (yes
                          ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/20"
                          : "bg-rose-400/15 text-rose-200 ring-rose-400/20")
                      }
                      title={yes ? "YES" : "NO"}
                    >
                      <Arrow dir={yes ? "up" : "down"} />
                      {t.side}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-12 items-center gap-2">
                    <div className="col-span-5 min-w-0">
                      <div className="text-sm font-semibold leading-snug text-white">
                        {clampText(t.market, 44)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {t.ticker ? (
                          <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/85 ring-1 ring-white/10">
                            {t.ticker}
                          </span>
                        ) : null}
                        {t.tags.slice(0, 3).map((tg) => (
                          <Tag key={tg}>{tg}</Tag>
                        ))}
                      </div>
                    </div>

                    <div className="col-span-2 text-right">
                      <div className="text-xs text-white/45">Bought</div>
                      <div className="text-sm font-semibold tabular-nums">{timeAgo(t.boughtAt)}</div>
                    </div>

                    <div className="col-span-1 text-center">
                      <div className="text-xs text-white/45">Y/N</div>
                      <div className="text-sm font-semibold">{t.side}</div>
                    </div>

                    <div className="col-span-2 text-right">
                      <div className="text-xs text-white/45">At avg</div>
                      <div className="text-sm font-semibold tabular-nums">{formatPrice(t.avgPrice)}</div>
                    </div>

                    <div className="col-span-2 text-right">
                      <div className="text-xs text-white/45">Total</div>
                      <div className="text-sm font-semibold tabular-nums">{formatMoney(t.invested)}</div>
                    </div>
                  </div>
                </article>
              );
            })}

            {flattened.length === 0 ? (
              <div className="rounded-2xl bg-white/5 p-8 text-center text-sm text-white/65 ring-1 ring-white/10">
                No alerts match your search.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md px-4 pb-4">
        <div className="rounded-2xl bg-black/60 p-2 ring-1 ring-white/10 backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            <button className="rounded-xl bg-white/10 px-3 py-3 text-xs font-semibold text-white ring-1 ring-white/10">
              Alerts
            </button>
            <button className="rounded-xl px-3 py-3 text-xs font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/5 hover:text-white">
              Insiders
            </button>
            <button className="rounded-xl px-3 py-3 text-xs font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/5 hover:text-white">
              Watchlist
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
import { useState } from "react";
import { cn } from "./utils/cn";

interface InsiderAlert {
  id: string;
  platform: "polymarket" | "robinhood" | "traderepublic";
  market: string;
  bought: string;
  position: "YES" | "NO";
  avgPrice: number;
  totalInvested: number;
  timestamp: Date;
  insider: string;
}

const mockAlerts: InsiderAlert[] = [
  {
    id: "1",
    platform: "polymarket",
    market: "Trump wins 2024",
    bought: "YES shares",
    position: "YES",
    avgPrice: 0.67,
    totalInvested: 125000,
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    insider: "whale_tracker",
  },
  {
    id: "2",
    platform: "robinhood",
    market: "NVDA",
    bought: "Calls $1200",
    position: "YES",
    avgPrice: 8.45,
    totalInvested: 84500,
    timestamp: new Date(Date.now() - 1000 * 60 * 12),
    insider: "flow_traders",
  },
  {
    id: "3",
    platform: "traderepublic",
    market: "TSLA",
    bought: "Puts $180",
    position: "NO",
    avgPrice: 12.3,
    totalInvested: 24500,
    timestamp: new Date(Date.now() - 1000 * 60 * 23),
    insider: "dark_pool",
  },
  {
    id: "4",
    platform: "polymarket",
    market: "Fed cuts rates March",
    bought: "NO shares",
    position: "NO",
    avgPrice: 0.34,
    totalInvested: 89000,
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    insider: "alpha_fund",
  },
  {
    id: "5",
    platform: "robinhood",
    market: "AAPL",
    bought: "Shares",
    position: "YES",
    avgPrice: 178.92,
    totalInvested: 250000,
    timestamp: new Date(Date.now() - 1000 * 60 * 67),
    insider: "institutional",
  },
  {
    id: "6",
    platform: "traderepublic",
    market: "SAP",
    bought: "Calls €200",
    position: "YES",
    avgPrice: 15.6,
    totalInvested: 31200,
    timestamp: new Date(Date.now() - 1000 * 60 * 89),
    insider: "europe_flow",
  },
  {
    id: "7",
    platform: "polymarket",
    market: "Bitcoin $100k EOY",
    bought: "YES shares",
    position: "YES",
    avgPrice: 0.45,
    totalInvested: 175000,
    timestamp: new Date(Date.now() - 1000 * 60 * 120),
    insider: "crypto_whale",
  },
  {
    id: "8",
    platform: "robinhood",
    market: "META",
    bought: "Puts $500",
    position: "NO",
    avgPrice: 22.15,
    totalInvested: 44300,
    timestamp: new Date(Date.now() - 1000 * 60 * 156),
    insider: "hedge_fund_x",
  },
];

const platformConfig = {
  polymarket: {
    name: "Polymarket",
    color: "bg-gradient-to-r from-purple-600 to-pink-500",
    textColor: "text-purple-400",
    icon: "🎯",
  },
  robinhood: {
    name: "Robinhood",
    color: "bg-gradient-to-r from-green-500 to-emerald-400",
    textColor: "text-green-400",
    icon: "📈",
  },
  traderepublic: {
    name: "Trade Republic",
    color: "bg-gradient-to-r from-blue-600 to-cyan-500",
    textColor: "text-blue-400",
    icon: "🇪🇺",
  },
};

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount.toFixed(2)}`;
}

export function App() {
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [alerts] = useState<InsiderAlert[]>(mockAlerts);

  const filteredAlerts =
    selectedPlatform === "all"
      ? alerts
      : alerts.filter((alert) => alert.platform === selectedPlatform);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔔</span>
              <h1 className="text-xl font-bold">Insider Alerts</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              Live
            </div>
          </div>

          {/* Platform Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <button
              onClick={() => setSelectedPlatform("all")}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                selectedPlatform === "all"
                  ? "bg-white text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              All
            </button>
            {Object.entries(platformConfig).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setSelectedPlatform(key)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2",
                  selectedPlatform === key
                    ? "bg-white text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                )}
              >
                <span>{config.icon}</span>
                {config.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="px-4 py-3 bg-gray-900/50 border-b border-gray-800">
        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <div className="col-span-4">Market</div>
          <div className="col-span-2 text-center">Pos</div>
          <div className="col-span-3 text-right">Avg Price</div>
          <div className="col-span-3 text-right">Total</div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="divide-y divide-gray-800/50">
        {filteredAlerts.map((alert) => {
          const platform = platformConfig[alert.platform];
          return (
            <div
              key={alert.id}
              className="px-4 py-4 hover:bg-gray-900/50 transition-colors active:bg-gray-800/50"
            >
              <div className="grid grid-cols-12 gap-2 items-center">
                {/* Market */}
                <div className="col-span-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{platform.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate text-sm">
                        {alert.market}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {alert.insider}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Position (YES/NO) */}
                <div className="col-span-2 flex justify-center">
                  <span
                    className={cn(
                      "px-2 py-1 rounded-md text-xs font-bold",
                      alert.position === "YES"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    )}
                  >
                    {alert.position}
                  </span>
                </div>

                {/* Avg Price */}
                <div className="col-span-3 text-right">
                  <p className="font-mono text-sm font-medium text-white">
                    {alert.platform === "polymarket"
                      ? `${(alert.avgPrice * 100).toFixed(0)}¢`
                      : `$${alert.avgPrice.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-500">{alert.bought}</p>
                </div>

                {/* Total Invested */}
                <div className="col-span-3 text-right">
                  <p className="font-mono text-sm font-bold text-white">
                    {formatCurrency(alert.totalInvested)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatTimeAgo(alert.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAlerts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <span className="text-4xl mb-4">📭</span>
          <p>No alerts for this platform</p>
        </div>
      )}

      {/* Footer Stats */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 px-4 py-3">
        <div className="flex justify-between text-xs text-gray-400">
          <div>
            <span className="text-white font-bold">{filteredAlerts.length}</span>{" "}
            alerts
          </div>
          <div className="flex gap-4">
            <div>
              Total Volume:{" "}
              <span className="text-white font-bold">
                {formatCurrency(
                  filteredAlerts.reduce((sum, a) => sum + a.totalInvested, 0)
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom padding for footer */}
      <div className="h-16"></div>
    </div>
  );
}
