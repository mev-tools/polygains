import { EVENT, SIDE } from "./models";

export const parseOrder = (order) => {
    const block = order.block.number;
    const isBuy = order.event.takerAssetId === 0n;
    const shares = isBuy
        ? order.event.makerAmountFilled
        : order.event.takerAmountFilled;
    const usdc = isBuy
        ? order.event.takerAmountFilled
        : order.event.makerAmountFilled;
    const assetId = isBuy ? order.event.makerAssetId : order.event.takerAssetId;
    return {
        kind: EVENT.ORDER,
        trader: order.event.takerOrderMaker,
        assetId: assetId,
        side: isBuy ? SIDE.BUY : SIDE.SELL,
        shares: shares,
        usdc: usdc,
        block: block,
        logIndex: order.rawEvent.logIndex,
        transactionIndex: order.rawEvent.transactionIndex,
        timestamp: order.timestamp,
    };
};