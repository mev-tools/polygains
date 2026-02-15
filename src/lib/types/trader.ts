export interface TraderData {
	id: string;
	wallet?: string;
	tokenstats: Record<string, any>;
	userStats: {
		tradeVol: bigint;
		tradeCount: number;
		firstSeen: number;
		lastSeen?: number;
	};
}
