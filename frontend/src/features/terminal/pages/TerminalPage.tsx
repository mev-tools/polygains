import {
	AlertsSection,
	DetectionSection,
	GlobalStatsSection,
	LiveTrackerCards,
	LiveTrackerControls,
	MarketsSection,
	MarketsOverviewStatsPreview,
	TerminalBanner,
	TerminalHeader,
	TerminalIntro,
} from "../components/TerminalSections";
import { NotificationAlert } from "../../../components/NotificationAlert";
import { useTerminalController } from "../controller/useTerminalController";

export function TerminalPage() {
	const vm = useTerminalController();

	return (
		<>


			<div className="terminal-app">
				<main className="container mx-auto max-w-6xl px-4">
					<TerminalHeader
						currentBlock={vm.currentBlockText}
						syncLabel={vm.syncState.label}
						syncHealthy={vm.syncState.healthy}
					/>

					<NotificationAlert />
					<TerminalIntro text={vm.typewriterText} />

					<AlertsSection
						rows={vm.alertsRows}
						pagination={vm.alertsPagination}
						selectedCategory={vm.selectedCategory}
						selectedWinnerFilter={vm.selectedWinnerFilter}
						categoryOptions={vm.categoryOptions}
						isLoading={vm.alertsLoading}
						onPrev={() => vm.changeAlertsPage(-1)}
						onNext={() => vm.changeAlertsPage(1)}
						onCategoryChange={vm.setCategory}
						onWinnerFilterChange={vm.setWinnerFilter}
					/>

					<DetectionSection
						totalInsiders={vm.detection.totalInsiders}
						yesInsiders={vm.detection.yesInsiders}
						noInsiders={vm.detection.noInsiders}
						insiderVolume={vm.detection.insiderVolume}
					/>

					{/* <MarketsSection
						markets={vm.markets}
						pagination={vm.marketsPagination}
						isLoading={vm.marketsLoading}
						marketStatsLoadingByCondition={vm.marketStatsLoadingByCondition}
						onPrev={() => vm.changeMarketsPage(-1)}
						onNext={() => vm.changeMarketsPage(1)}
					/> */}
					<MarketsOverviewStatsPreview
						markets={vm.markets}
						pagination={vm.marketsPagination}
						isLoading={vm.marketsLoading}
						marketStatsLoadingByCondition={vm.marketStatsLoadingByCondition}
						onPrev={() => vm.changeMarketsPage(-1)}
						onNext={() => vm.changeMarketsPage(1)}
					/>

					<GlobalStatsSection
						accounts={vm.globalStats.accounts}
						markets={vm.globalStats.markets}
						trades={vm.globalStats.trades}
						activePositions={vm.globalStats.activePositions}
					/>

					<LiveTrackerControls
						minPrice={vm.liveControls.minPrice}
						maxPrice={vm.liveControls.maxPrice}
						onlyBetOnce={vm.liveControls.onlyBetOnce}
						betOneDollarPerTrade={vm.liveControls.betOneDollarPerTrade}
						disabled={vm.liveControls.disabled}
						soundEnabled={vm.liveControls.soundEnabled}
						selectedStrategies={vm.liveControls.selectedStrategies}
						selectedSides={vm.liveControls.selectedSides}
						onMinPriceChange={vm.liveControls.onMinPriceChange}
						onMaxPriceChange={vm.liveControls.onMaxPriceChange}
						onOnlyBetOnceChange={vm.liveControls.onOnlyBetOnceChange}
						onBetOneDollarPerTradeChange={
							vm.liveControls.onBetOneDollarPerTradeChange
						}
						onSoundToggle={vm.liveControls.onSoundToggle}
						onStrategyChange={vm.liveControls.onStrategyChange}
						onSideToggle={vm.liveControls.onSideToggle}
					/>

					<LiveTrackerCards
						totalBet={vm.tracker.totalBet}
						openInterest={vm.tracker.openInterest}
						realizedPnL={vm.tracker.realizedPnL}
						liveTrades={vm.tracker.liveTrades}
						liveWins={vm.tracker.liveWins}
						liveLosses={vm.tracker.liveLosses}
						alertsPage={vm.tracker.alertsPage}
						alertsTotalPages={vm.tracker.alertsTotalPages}
						alertsFilledThroughPage={vm.tracker.alertsFilledThroughPage}
						backtestCanContinue={vm.tracker.backtestCanContinue}
						backtestRunning={vm.tracker.backtestRunning}
						onRunBacktest={vm.tracker.onRunBacktest}
					/>

					<TerminalBanner currentBlock={vm.currentBlockText} />
				</main>
			</div>
		</>
	);
}
