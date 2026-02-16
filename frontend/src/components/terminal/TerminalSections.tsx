import { Fragment, memo, useEffect, useState } from "react";
import { formatPnL } from "../../lib/backtest";
import type { AlertRowView } from "../../types/api";
import type { GroupedMarket, Pagination } from "../../types/terminal";

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
	betOneDollarPerTrade: boolean;
	disabled?: boolean;
	soundEnabled: boolean;
	selectedStrategies: Array<"reverse_insider" | "follow_insider">;
	selectedSides: string[];
	onMinPriceChange: (value: number) => void;
	onMaxPriceChange: (value: number) => void;
	onOnlyBetOnceChange: (value: boolean) => void;
	onBetOneDollarPerTradeChange: (value: boolean) => void;
	onSoundToggle: (value: boolean) => void;
	onStrategyChange: (
		mode: "reverse_insider" | "follow_insider",
		enabled: boolean,
	) => void;
	onSideToggle: (side: string, enabled: boolean) => void;
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
	selectedCategory: string;
	selectedWinnerFilter: "BOTH" | "WINNERS" | "LOSERS";
	categoryOptions: string[];
	isLoading?: boolean;
	onPrev: () => void;
	onNext: () => void;
	onCategoryChange: (value: string) => void;
	onWinnerFilterChange: (value: "BOTH" | "WINNERS" | "LOSERS") => void;
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

function timeAgo(alertTime: number) {
	const then = alertTime * 1000;
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

function formatMoney(n: number) {
	return n.toLocaleString(undefined, {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	});
}

function formatPrice(n: number) {
	return n.toLocaleString(undefined, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
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

function formatLargeNumber(value: number): string {
	return value.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

export function TerminalHeader({
	currentBlock,
	syncLabel,
	syncHealthy,
}: HeaderProps) {
	return (
		<div className="navbar bg-base-100 border-b border-base-content/10 mb-8 p-0 min-h-0 pb-4 items-start header-logo-min-height">
			<div className="flex-1">
				<pre className="text-[0.5rem] leading-[0.6rem] md:text-[0.6rem] md:leading-[0.7rem] font-mono text-primary whitespace-pre overflow-x-hidden">
					{TOP_LOGO_ASCII}
				</pre>
			</div>
			<div className="flex-none flex flex-col items-end gap-1 text-xs font-mono w-40">
				<div className="text-base-content/70">BLOCK: {currentBlock}</div>
				<div
					className={`font-bold ${syncHealthy ? "text-accent" : "text-error"}`}
				>
					{syncLabel}
				</div>
			</div>
		</div>
	);
}

export function TerminalIntro({ text }: TerminalIntroProps) {
	return (
		<div className="card bg-base-300 shadow-xl border-l-4 border-primary mb-8 font-mono text-xs md:text-sm intro-container-min-height">
			<div className="card-body p-6">
				<h3 className="text-primary uppercase text-xs mb-2">
					<span className="text-primary mr-2">$</span> run explain-detection
				</h3>
				<div className="leading-relaxed text-base-content/80">
					{text}
					<span className="inline-block w-1.5 h-3 bg-accent animate-pulse-gpu align-middle ml-1" />
				</div>
			</div>
		</div>
	);
}

export function LiveTrackerControls({
	minPrice,
	maxPrice,
	onlyBetOnce,
	betOneDollarPerTrade,
	disabled = false,
	soundEnabled,
	selectedStrategies,
	selectedSides,
	onMinPriceChange,
	onMaxPriceChange,
	onOnlyBetOnceChange,
	onBetOneDollarPerTradeChange,
	onSoundToggle,
	onStrategyChange,
	onSideToggle,
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
		<div className="mb-4 mt-8">
			<h2 className="text-xs font-bold text-base-content/70 uppercase mb-4 flex flex-wrap justify-between items-center gap-4 section-header-min-height">
				<span>LIVE_TRACKER</span>
				<div className="flex gap-2 items-center flex-wrap">
					<input
						type="text"
						inputMode="decimal"
						disabled={disabled}
						value={minDraft}
						placeholder="Min P"
						className="input input-xs input-bordered w-16 text-center"
						onChange={(event) => setMinDraft(event.currentTarget.value)}
						onFocus={(event) => event.currentTarget.select()}
						onBlur={commitMinPrice}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
						}}
					/>
					<input
						type="text"
						inputMode="decimal"
						disabled={disabled}
						value={maxDraft}
						placeholder="Max P"
						className="input input-xs input-bordered w-16 text-center"
						onChange={(event) => setMaxDraft(event.currentTarget.value)}
						onFocus={(event) => event.currentTarget.select()}
						onBlur={commitMaxPrice}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
						}}
					/>
					<label className="cursor-pointer label p-0 gap-2">
						<input
							className="checkbox checkbox-xs checkbox-primary"
							type="checkbox"
							disabled={disabled}
							checked={onlyBetOnce}
							onChange={(event) =>
								onOnlyBetOnceChange(event.currentTarget.checked)
							}
						/>
						<span className="label-text text-xs text-base-content/80">
							1 BET/MKT
						</span>
					</label>
					<label className="cursor-pointer label p-0 gap-2">
						<input
							className="checkbox checkbox-xs checkbox-accent"
							type="checkbox"
							disabled={disabled}
							checked={betOneDollarPerTrade}
							onChange={(event) =>
								onBetOneDollarPerTradeChange(event.currentTarget.checked)
							}
						/>
						<span className="label-text text-xs text-base-content/80">
							FIXED $10
						</span>
					</label>
					<button
						type="button"
						disabled={disabled}
						className={`btn btn-sm min-w-[44px] min-h-[44px] ${soundEnabled ? "btn-success" : "btn-ghost border-dashed"}`}
						onClick={() => onSoundToggle(!soundEnabled)}
						aria-label={soundEnabled ? "Sound Enabled" : "Sound Muted"}
						title={soundEnabled ? "Sound Enabled" : "Sound Muted"}
					>
						{soundEnabled ? "🔊" : "🔇"}
					</button>
					<div className="divider divider-horizontal mx-0" />
					<label className="cursor-pointer label p-0 gap-2">
						<input
							className="checkbox checkbox-xs checkbox-success"
							type="checkbox"
							disabled={disabled}
							checked={selectedStrategies.includes("follow_insider")}
							onChange={(event) =>
								onStrategyChange("follow_insider", event.currentTarget.checked)
							}
						/>
						<span className="label-text text-xs text-base-content/80">
							FOLLOW
						</span>
					</label>
					<label className="cursor-pointer label p-0 gap-2">
						<input
							className="checkbox checkbox-xs checkbox-error"
							type="checkbox"
							disabled={disabled}
							checked={selectedStrategies.includes("reverse_insider")}
							onChange={(event) =>
								onStrategyChange("reverse_insider", event.currentTarget.checked)
							}
						/>
						<span className="label-text text-xs text-base-content/80">
							REVERSE
						</span>
					</label>
					<div className="divider divider-horizontal mx-0" />
					<label className="cursor-pointer label p-0 gap-2">
						<input
							className="checkbox checkbox-xs checkbox-info"
							type="checkbox"
							disabled={disabled}
							checked={selectedSides.includes("YES")}
							onChange={(event) =>
								onSideToggle("YES", event.currentTarget.checked)
							}
						/>
						<span className="label-text text-xs text-base-content/80">YES</span>
					</label>
					<label className="cursor-pointer label p-0 gap-2">
						<input
							className="checkbox checkbox-xs checkbox-warning"
							type="checkbox"
							disabled={disabled}
							checked={selectedSides.includes("NO")}
							onChange={(event) =>
								onSideToggle("NO", event.currentTarget.checked)
							}
						/>
						<span className="label-text text-xs text-base-content/80">NO</span>
					</label>
				</div>
			</h2>
		</div>
	);
}

export function LiveTrackerCards({
	totalBet,
	openInterest,
	realizedPnL,
	liveTrades,
	liveWins,
	liveLosses,
	backtestCanContinue,
	backtestRunning,
	onRunBacktest,
}: LiveTrackerCardsProps) {
	return (
		<div className="stats stats-vertical lg:stats-horizontal shadow w-full bg-base-200 border border-base-content/10 mb-8">
			<div className="stat">
				<div className="stat-title text-base-content/70 uppercase text-xs tracking-wider font-bold">
					Money Bet
				</div>
				<div className="stat-value text-base-content text-xl font-mono">
					${formatLargeNumber(totalBet)}
				</div>
				<div className="stat-desc text-base-content/70 text-xs mt-1">
					Open: <span className="text-base-content">${formatLargeNumber(openInterest)}</span>
				</div>
			</div>

			<div className="stat relative">
				<div className="stat-title text-base-content/70 uppercase text-xs tracking-wider font-bold">
					PnL
				</div>
				<div
					className={`stat-value text-xl font-mono ${realizedPnL > 0 ? "text-accent" : realizedPnL < 0 ? "text-error" : ""}`}
				>
					{formatPnL(realizedPnL)}
				</div>
				<div className="stat-actions absolute top-0 right-0 bottom-0 flex items-center pr-4">
					<button
						type="button"
						className={`btn btn-sm ${backtestRunning ? "btn-disabled" : "btn-outline btn-accent"} h-full rounded-none border-t-0 border-b-0 border-r-0 border-l px-4`}
						disabled={backtestRunning}
						onClick={onRunBacktest}
						aria-label={backtestRunning ? "Processing backtest" : backtestCanContinue ? "Continue backtest" : "Run backtest"}
					>
						{backtestRunning
							? "Processing..."
							: backtestCanContinue
								? "Continue Backtest"
								: "Run Backtest"}
					</button>
				</div>
			</div>

			<div className="stat">
				<div className="stat-title text-base-content/70 uppercase text-xs tracking-wider font-bold">
					Trades
				</div>
				<div className="stat-value text-base-content text-xl font-mono">
					{liveTrades}
					<span className="text-xs text-base-content/70 ml-2 font-normal">
						(W:{liveWins} L:{liveLosses})
					</span>
				</div>
			</div>
		</div>
	);
}

const NO_ALERTS_ASCII = `
    .   .      .
   ... ...    ...
  .......  .......
 .................
...................
 .................
  .......  .......
   ... ...    ...
    .   .      .
`;

function NoAlertsAscii() {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setFrame((f) => f + 1), 200);
		return () => clearInterval(timer);
	}, []);

	const glitch = frame % 2 === 0 ? "opacity-100" : "opacity-50";
	const text = frame % 4 === 0 ? "NO SIGNALS DETECTED" : "SEARCHING...";

	return (
		<div className="flex flex-col items-center justify-center py-12 gap-4 font-mono text-xs text-primary/70">
			<pre className={`leading-[0.6rem] whitespace-pre ${glitch}`}>
				{NO_ALERTS_ASCII}
			</pre>
			<div className="tracking-[0.2em] animate-pulse-gpu">{text}</div>
		</div>
	);
}

const AlertsSectionComponent = ({
	rows,
	pagination,
	selectedCategory,
	selectedWinnerFilter,
	categoryOptions,
	isLoading = false,
	onPrev,
	onNext,
	onCategoryChange,
	onWinnerFilterChange,
}: AlertsSectionProps) => {
	return (
		<>
			<div className="flex flex-wrap justify-between items-center mb-4 mt-8 gap-4 filter-bar-min-height">
				<h2 className="text-xs font-bold text-base-content/70 uppercase tracking-wider section-header-min-height flex items-center">
					RECENT_POLYGAINS_ALERTS
				</h2>
				<div className="flex flex-wrap gap-4 items-center">
					<div className="join">
						{categoryOptions.map((category) => (
							<button
								key={category}
								type="button"
								className={`join-item btn btn-sm min-w-[48px] min-h-[48px] ${category === selectedCategory ? "btn-primary" : "btn-ghost"}`}
								onClick={() => onCategoryChange(category)}
								aria-label={`Filter alerts by ${category}`}
								aria-pressed={category === selectedCategory}
								title={`Filter alerts by ${category}`}
							>
								{category}
							</button>
						))}
					</div>
					<div className="join">
						{(["BOTH", "WINNERS", "LOSERS"] as const).map((filter) => (
							<button
								key={filter}
								type="button"
								className={`join-item btn btn-sm min-w-[48px] min-h-[48px] ${filter === selectedWinnerFilter ? "btn-secondary" : "btn-ghost"}`}
								onClick={() => onWinnerFilterChange(filter)}
								aria-label={`Show ${filter.toLowerCase()}`}
								aria-pressed={filter === selectedWinnerFilter}
								title={`Show ${filter.toLowerCase()}`}
							>
								{filter}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className="overflow-x-auto bg-base-200 rounded-box border border-base-content/10 mb-8 alerts-table-container">
				<table className="table table-xs w-full table-fixed">
					<thead>
						<tr className="bg-base-300 text-base-content/70 uppercase tracking-wider">
							<th className="w-[35%]">Market</th>
							<th className="w-[15%]">Side</th>
							<th className="w-[12%] text-right">Price</th>
							<th className="w-[15%] text-right">Volume</th>
							<th className="w-[13%] text-right">Time</th>
							<th className="w-[10%] text-center">Lookup</th>
						</tr>
					</thead>
					<tbody className="alerts-tbody-min-height">
						{isLoading ? (
							[...Array(10)].map((_, i) => (
								<tr key={`skeleton-${i}`} className="border-b border-base-content/5">
									<td><div className="skeleton h-4 w-full max-w-[250px]" /></td>
									<td><div className="skeleton h-4 w-12" /></td>
									<td className="text-right"><div className="skeleton h-4 w-16 ml-auto" /></td>
									<td className="text-right"><div className="skeleton h-4 w-20 ml-auto" /></td>
									<td className="text-right"><div className="skeleton h-4 w-14 ml-auto" /></td>
									<td className="text-center"><div className="skeleton h-8 w-8 mx-auto" /></td>
								</tr>
							))
							) : rows.length === 0 ? (
								<tr>
									<td colSpan={6} className="text-center p-0">
										<NoAlertsAscii />
									</td>
								</tr>
							) : (
							rows.map((row, index) => {
								const isYes = row.outcomeLabel === "YES";
								return (
									<Fragment key={row.rowId}>
										<tr
											className={`table-row-optimized border-b border-base-content/5 ${
												index % 2 === 1 ? "bg-white/5" : "bg-transparent"
											}`}
										>
											<td className="max-w-[300px]">
												<div
													className="font-bold text-base-content truncate"
													title={row.question}
												>
													{row.question || `Condition: ${row.conditionId}`}
												</div>
												<div className="text-[10px] font-mono text-base-content/60 truncate">
													{row.conditionId}
												</div>
											</td>
											<td>
												<div className="flex items-center gap-2">
													<span
														className={`badge badge-sm font-bold border-none rounded-sm px-2 py-0.5 text-[10px] uppercase ${
															isYes
																? "bg-success/20 text-success"
																: row.outcomeLabel === "NO"
																	? "bg-error/20 text-error"
																	: "bg-base-content/20 text-base-content"
														}`}
													>
														{row.outcomeLabel}
													</span>
													{row.statusBadgeHtml && (
														<span
															dangerouslySetInnerHTML={{
																__html: row.statusBadgeHtml,
															}}
														/>
													)}
												</div>
											</td>
											<td className="text-right font-mono text-base-content/80">
												@{row.priceFormatted}
											</td>
											<td className="text-right font-mono font-bold text-base-content">
												{formatMoney(row.volume)}
											</td>
											<td className="text-right text-xs tabular-nums text-base-content/70">
												{timeAgo(row.timestamp)}
											</td>
											<td className="text-center">
												<a
													href={`https://polymarket.com/profile/${row.profileAddress}`}
													target="_blank"
													rel="noreferrer"
													className="btn btn-ghost btn-sm text-base-content/80 hover:text-base-content min-w-[44px] min-h-[44px]"
												aria-label={`Lookup trader ${row.user}`}
													title={`Lookup trader ${row.user}`}
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 20 20"
														fill="currentColor"
														className="w-4 h-4"
													>
														<path
															fillRule="evenodd"
															d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
															clipRule="evenodd"
														/>
													</svg>
												</a>
											</td>
										</tr>
									</Fragment>
								);
							})
						)}
					</tbody>
				</table>

				<div className="flex justify-between items-center p-4 border-t border-base-content/10 bg-base-200">
					<button
						type="button"
						className="btn btn-sm btn-ghost min-w-[48px] min-h-[44px]"
						onClick={onPrev}
						disabled={isLoading || !pagination.hasPrev}
						aria-label="Previous page"
					>
						{isLoading ? (
							<span className="loading loading-spinner loading-xs loading-optimized" aria-hidden="true" />
						) : (
							"← PREV"
						)}
					</button>
					<span className="text-xs font-mono text-base-content/70 flex items-center gap-2">
						{isLoading && <span className="loading loading-dots loading-xs" />}
						Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
					</span>
					<button
						type="button"
						className="btn btn-sm btn-ghost min-w-[48px] min-h-[44px]"
						onClick={onNext}
						disabled={isLoading || !pagination.hasNext}
						aria-label="Next page"
					>
						{isLoading ? (
							<span className="loading loading-spinner loading-xs loading-optimized" aria-hidden="true" />
						) : (
							"NEXT →"
						)}
					</button>
				</div>
			</div>
		</>
	);
};

export const AlertsSection = memo(AlertsSectionComponent, (prev, next) => {
	if (prev.isLoading !== next.isLoading) return false;
	if (prev.selectedCategory !== next.selectedCategory) return false;
	if (prev.selectedWinnerFilter !== next.selectedWinnerFilter) return false;
	if (JSON.stringify(prev.pagination) !== JSON.stringify(next.pagination))
		return false;
	if (JSON.stringify(prev.categoryOptions) !== JSON.stringify(next.categoryOptions))
		return false;
	return JSON.stringify(prev.rows) === JSON.stringify(next.rows);
});

export function DetectionSection({
	totalInsiders,
	yesInsiders,
	noInsiders,
	insiderVolume,
}: DetectionSectionProps) {
	return (
		<>
			<h2 className="text-xs font-bold text-base-content/80 uppercase tracking-wider mb-2 mt-4 section-header-min-height flex items-center">
				POLYGAINS_DETECTION
			</h2>
			<div className="stats stats-vertical lg:stats-horizontal shadow w-full bg-base-200 border border-base-content/10">
				<div className="stat">
					<div className="stat-title text-base-content/70 uppercase text-xs font-bold">Total</div>
					<div className="stat-value text-accent text-xl">{totalInsiders}</div>
				</div>
				<div className="stat">
					<div className="stat-title text-base-content/70 uppercase text-xs font-bold">YES</div>
					<div className="stat-value text-accent text-xl">{yesInsiders}</div>
				</div>
				<div className="stat">
					<div className="stat-title text-base-content/70 uppercase text-xs font-bold">NO</div>
					<div className="stat-value text-error text-xl">{noInsiders}</div>
				</div>
				<div className="stat">
					<div className="stat-title text-base-content/70 uppercase text-xs font-bold">Volume</div>
					<div className="stat-value text-base-content text-xl">{insiderVolume}</div>
				</div>
			</div>
		</>
	);
}

function renderMarketPrice(lastPrice: number, isClosed: boolean): string {
	const clamped = Math.max(
		0,
		Math.min(1, Number.isFinite(lastPrice) ? lastPrice : 0),
	);
	const pct = `${(clamped * 100).toFixed(2)}%`;
	if (isClosed && (clamped >= 0.99 || clamped <= 0.01)) {
		return `RESOLVED ${pct}`;
	}
	return pct;
}

function getOutcomeMeta(outcome: string | number): {
	label: string;
	toneClass: string;
} {
	const text = String(outcome).toUpperCase();
	if (text === "YES" || text === "1") return { label: "YES", toneClass: "bg-success/20 text-success border-success/20" };
	if (text === "NO" || text === "0") return { label: "NO", toneClass: "bg-error/20 text-error border-error/20" };
	return { label: text, toneClass: "bg-base-content/20 text-base-content border-base-content/20" };
}

function hasAllStats(outcome: {
	mean?: number | null;
	stdDev?: number | null;
	p95?: number | null;
}): boolean {
	return (
		outcome.mean !== null &&
		outcome.mean !== undefined &&
		outcome.stdDev !== null &&
		outcome.stdDev !== undefined &&
		outcome.p95 !== null &&
		outcome.p95 !== undefined
	);
}

function formatMarketStat(value: number | null | undefined): string {
	const num = Number(value);
	return Number.isFinite(num) ? `$${num.toFixed(2)}` : "--";
}

export function MarketsSection({
	markets,
	pagination,
	isLoading = false,
	marketStatsLoadingByCondition = {},
	onPrev,
	onNext,
}: MarketsSectionProps) {
	return (
		<>
			<h2 className="text-xs font-bold text-base-content/80 uppercase tracking-wider mb-4 mt-8 section-header-min-height flex items-center">
				TOP_LIQUIDITY_MARKETS
			</h2>
			<div className="rounded-box border border-base-content/10 mb-8 p-2 markets-table-container contain-paint">
				{isLoading ? (
					<div className="flex flex-col gap-4">
						{[...Array(5)].map((_, i) => (
							<div key={`market-skel-${i}`} className="card bg-base-300/30 border border-base-content/5 p-4 rounded-box">
								<div className="skeleton h-5 w-full max-w-[600px] mb-3" />
								<div className="w-full rounded-lg border border-base-content/5 bg-base-100/50 p-2">
									<div className="skeleton h-4 w-full mb-2" />
									<div className="skeleton h-4 w-full" />
								</div>
							</div>
						))}
					</div>
				) : markets.length === 0 ? (
					<div className="p-8 text-center text-base-content/70 min-h-[200px] flex items-center justify-center">No markets found</div>
				) : (
					<div className="flex flex-col gap-4">
						{markets.map((market) => (
							<section
								key={market.conditionId}
								className="card bg-base-300/30 border border-base-content/5 p-4 rounded-box card-optimized"
							>
								<h3
									className="text-sm font-bold text-base-content mb-3 line-clamp-2"
									title={market.question}
								>
									{market.question}
								</h3>
								<div className="w-full rounded-lg border border-base-content/5 bg-base-100/50">
									<table className="table table-xs w-full table-fixed">
										<thead>
											<tr className="bg-base-200 text-base-content/70 uppercase">
												<th>Outcome</th>
												<th>Trades</th>
												<th>Insider Trades</th>
												<th>Volume</th>
												<th>Current Odds</th>
												<th>
													<div className="flex items-center gap-1">
														<span>Market Stats</span>
														<div
															className="tooltip tooltip-left"
															data-tip="ø (mean) / std / P95"
														>
															<span className="badge badge-ghost badge-xs text-[10px] w-4 h-4 p-0">
																?
															</span>
														</div>
													</div>
												</th>
											</tr>
										</thead>
										<tbody>
											{market.outcomes.map((outcome, index) => {
												const outcomeMeta = getOutcomeMeta(outcome.outcome);
												const statsLoading = Boolean(
													marketStatsLoadingByCondition[market.conditionId],
												);
												const totalTrades = Number(outcome.total_trades || 0);
												const insiderTradeCount = Number(
													outcome.insider_trade_count || 0,
												);
												const noTradeData = totalTrades <= 0;
												const missingStats = !hasAllStats(outcome);
												return (
													<tr
														key={`${market.conditionId}-${String(outcome.outcome)}`}
														className={index % 2 === 1 ? "bg-base-200/50" : ""}
													>
														<td>
															<span
																className={`badge badge-sm font-bold border rounded-sm px-2 py-0.5 text-[10px] uppercase ${outcomeMeta.toneClass}`}
															>
																{outcomeMeta.label}
															</span>
														</td>
														<td className="font-mono tabular-nums text-base-content/90">
															{totalTrades.toLocaleString()}
														</td>
														<td className="font-mono tabular-nums text-base-content/90">
															{insiderTradeCount.toLocaleString()}
														</td>
														<td className="font-mono tabular-nums text-base-content/90">
															$
															{Number(outcome.volume || 0).toLocaleString(
																undefined,
																{
																	minimumFractionDigits: 2,
																	maximumFractionDigits: 2,
																},
															)}
														</td>
														<td className="font-mono font-bold text-accent">
															{renderMarketPrice(
																Number(outcome.last_price || 0),
																Boolean(market.closed || outcome.closed),
															)}
														</td>
														<td className="font-mono text-base-content/80 text-[10px]">
															{noTradeData ? (
																<span className="text-base-content/60">no trade data</span>
															) : missingStats && statsLoading ? (
																<span className="flex items-center gap-1 opacity-70">
																	<span className="loading loading-spinner loading-xs loading-optimized" aria-hidden="true" />
																	loading...
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
				<div className="flex justify-between items-center p-2 mt-2 border-t border-base-content/10">
					<button
						type="button"
						className="btn btn-sm btn-ghost min-w-[48px] min-h-[44px]"
						onClick={onPrev}
						disabled={isLoading || !pagination.hasPrev}
						aria-label="Previous page"
					>
						{isLoading ? (
							<span className="loading loading-spinner loading-xs loading-optimized" aria-hidden="true" />
						) : (
							"← PREV"
						)}
					</button>
					<span className="text-xs font-mono text-base-content/70 flex items-center gap-2">
						{isLoading && <span className="loading loading-dots loading-xs" />}
						Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
					</span>
					<button
						type="button"
						className="btn btn-sm btn-ghost min-w-[48px] min-h-[44px]"
						onClick={onNext}
						disabled={isLoading || !pagination.hasNext}
						aria-label="Next page"
					>
						{isLoading ? (
							<span className="loading loading-spinner loading-xs loading-optimized" aria-hidden="true" />
						) : (
							"NEXT →"
						)}
					</button>
				</div>
			</div>
		</>
	);
}

export function GlobalStatsSection({
	accounts,
	markets,
	trades,
	activePositions,
}: GlobalStatsSectionProps) {
	return (
		<>
			<h2 className="text-xs font-bold text-base-content/80 uppercase tracking-wider mb-2 mt-4 section-header-min-height flex items-center">
				GLOBAL_STATS
			</h2>
			<div className="stats stats-vertical lg:stats-horizontal shadow w-full bg-base-200 border border-base-content/10">
				<div className="stat">
					<div className="stat-title text-base-content/80 uppercase text-xs font-bold">Accounts</div>
					<div className="stat-value text-base-content text-xl">{accounts}</div>
				</div>
				<div className="stat">
					<div className="stat-title text-base-content/80 uppercase text-xs font-bold">Markets</div>
					<div className="stat-value text-base-content text-xl">{markets}</div>
				</div>
				<div className="stat">
					<div className="stat-title text-base-content/80 uppercase text-xs font-bold">Total Fills</div>
					<div className="stat-value text-base-content text-xl">{trades}</div>
				</div>
				<div className="stat">
					<div className="stat-title text-base-content/80 uppercase text-xs font-bold">Active Pos</div>
					<div className="stat-value text-accent text-xl">{activePositions}</div>
				</div>
			</div>
		</>
	);
}

export function TerminalBanner({ currentBlock }: BannerProps) {
	return (
		<div className="card bg-base-100 border-y-2 border-accent rounded-none mb-8 relative overflow-hidden">
			<div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/70 to-transparent shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-[scan_4s_ease-in-out_infinite] pointer-events-none z-10" />
			<div className="card-body p-6 font-mono text-xs md:text-sm">
				<pre className="text-accent text-[0.5rem] md:text-xs leading-none mb-4 whitespace-pre overflow-x-hidden">
					{BANNER_ASCII}
				</pre>

				<div className="flex flex-col md:flex-row justify-between border-b border-accent/30 pb-3 mb-4 text-accent gap-2">
					<span>[v1.0.3] | Zero-History Trade Detection System by @mevtools</span>
					<span>
						BLOCK: {currentBlock} | STATUS:{" "}
						<span className="text-base-100 bg-accent px-1 font-bold">INDEXING</span>
					</span>
				</div>

				<div className="flex flex-col gap-1 text-accent relative z-0">
					<div className="opacity-0 animate-[typeIn_0.3s_forwards_0.5s]">
						$ connecting to <span className="font-bold">polymarket</span>...
					</div>
					<div className="opacity-0 animate-[typeIn_0.3s_forwards_1.2s]">
						&gt; using <span className="font-bold">subsquid pipes</span> for
						indexing...
					</div>
					<div className="opacity-0 animate-[typeIn_0.3s_forwards_1.8s]">
						&gt; triggering alerts...
					</div>
					<div className="opacity-0 animate-[typeIn_0.3s_forwards_2.4s]">
						&gt; calibrating detection thresholds...
					</div>
					<div className="opacity-0 animate-[typeIn_0.3s_forwards_3.0s]">
						<span className="font-bold">[OK]</span> polygains detection system{" "}
						<span className="text-base-100 bg-accent px-1 font-bold">ONLINE</span>
						<span className="inline-block w-1.5 h-3 bg-accent animate-pulse-gpu align-middle ml-1" />
					</div>
				</div>
			</div>
		</div>
	);
}
