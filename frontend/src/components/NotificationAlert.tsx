import { useState } from "react";

export function NotificationAlert() {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="mb-6" data-theme="alert">
			<div role="alert" className="alert alert-vertical sm:alert-horizontal rounded-lg">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 stroke-info">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<h3 className="font-bold">Insider Alert: Venezuela</h3>
					<div className="text-xs">3 wallets bet on Maduro's ouster hours before arrest, netting $630K+</div>
				</div>
				<button
					type="button"
					className="btn btn-sm btn-info rounded-lg"
					onClick={() => setExpanded(!expanded)}
				>
					{expanded ? "Hide" : "See"}
				</button>
			</div>
			{expanded && (
				<div className="bg-base-200 border-x border-b border-base-300 rounded-b-lg p-4 text-sm">
					<p className="mb-4 text-base-content/80">
						Three insider wallets on Polymarket bet on Venezuelan President Maduro being out of office just hours before his arrest, netting a total profit of $630,484!
					</p>
					<p className="mb-4 text-base-content/80">
						The three wallets were created and pre-funded days in advance. Then, just hours before Maduro's arrest, they suddenly placed large bets on Maduro being out of office.
					</p>
					<p className="mb-4 text-base-content/80">
						Notably, all three wallets only bet on events related to Venezuela and Maduro, with no history of other bets — a clear case of insider trading.
					</p>
					<ul className="space-y-2 mt-4">
						<li>
							👉 Wallet <strong>0x31a5</strong> invested $34K and profited $409.9K{" "}
							<a
								href="https://polymarket.com/@0x31a56e9E690c621eD21De08Cb559e9524Cdb8eD9-1766730765984?tab=activity"
								target="_blank"
								rel="noreferrer"
								className="link link-info"
							>
								View on Polymarket
							</a>
						</li>
						<li>
							👉 Wallet <strong>0xa72D</strong> invested $5.8K and profited $75K{" "}
							<a
								href="https://polymarket.com/@0xa72DB1749e9AC2379D49A3c12708325ED17FeBd4-1766534754187?tab=activity"
								target="_blank"
								rel="noreferrer"
								className="link link-info"
							>
								View on Polymarket
							</a>
						</li>
						<li>
							👉 Wallet <strong>SBet365</strong> invested $25K and profited $145.6K{" "}
							<a
								href="https://polymarket.com/@SBet365?tab=activity"
								target="_blank"
								rel="noreferrer"
								className="link link-info"
							>
								View on Polymarket
							</a>
						</li>
					</ul>
					<p className="mt-4 text-xs text-base-content/60">
						Source: <a href="https://x.com/lookonchain" target="_blank" rel="noreferrer" className="link link-info">@lookonchain</a> · Jan 4
					</p>
				</div>
			)}
		</div>
	);
}
