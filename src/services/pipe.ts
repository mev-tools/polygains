import { parseOrder } from "@/lib/parser";
import type { BlockCursor } from "@subsquid/pipes";
import { InsiderDetector, NotInsiderDetector, XXHash32Set } from "./detector-v2";
import { BloomFilterPersistor } from "./persistor";
import { loadDetector } from "@/lib/db/bloomfilter";
import { FIFTEEN_MINUTES, VOLUME_THRESHOLD, MIN_PRICE, BPS_SCALE, MIN_PRICE_BPS } from "@/lib/const";
import { SIDE } from "@/lib/models";
export { WindowBuffer, InsiderEvaluator, type TraderData } from "./buffer";
import { WindowBuffer, InsiderEvaluator, type TraderData } from "./buffer";

export class PolymarketPipe {
    private cursor?: BlockCursor;
    private stateFile = Bun.file("state.json");
    private insiderDetector!: InsiderDetector;
    private notInsiderDetector!: NotInsiderDetector;
    private windowBuffer = new WindowBuffer<TraderData>(
        FIFTEEN_MINUTES,
        (item) => item.userStats.firstSeen,
        (item) => item.id
    );
    private evaluator!: InsiderEvaluator;
    private persistor!: BloomFilterPersistor;
    private insiderCount = 0;
    private notInsiderCount = 0;
    private initialized = false;

    constructor() {
    }

    /**
     * Initialize or recover from database snapshots
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Try to load detector snapshots from database
            const [insiderSnapshot, notInsiderSnapshot] = await Promise.all([
                loadDetector("insider"),
                loadDetector("notinsider"),
            ]);

            if (insiderSnapshot && notInsiderSnapshot) {
                // Recovery path: restore from snapshots using XXHash32Set
                console.log("[PolymarketPipe] 🔄 Recovering from detector snapshots...");

                const insiderSet = new XXHash32Set();
                insiderSet.restoreSet(insiderSnapshot.dataSet);

                const notInsiderSet = new XXHash32Set();
                notInsiderSet.restoreSet(notInsiderSnapshot.dataSet);

                this.insiderDetector = new InsiderDetector();
                this.insiderDetector.getDetector().restoreSet(insiderSnapshot.dataSet);

                this.notInsiderDetector = new NotInsiderDetector();
                this.notInsiderDetector.getDetector().restoreSet(notInsiderSnapshot.dataSet);

                this.insiderCount = insiderSnapshot.itemCount;
                this.notInsiderCount = notInsiderSnapshot.itemCount;

                // Restore cursor from snapshot if we don't have one already
                // Check both snapshots (they should have the same cursor, but be defensive)
                if (!this.cursor) {
                    const snapshotCursor = insiderSnapshot.cursor || notInsiderSnapshot.cursor;
                    if (snapshotCursor) {
                        this.cursor = snapshotCursor;
                        console.log(`[PolymarketPipe] 📍 Restored cursor from snapshot: block ${this.cursor.number}`);
                    } else {
                        // Fallback to state.json if snapshot doesn't have cursor
                        await this.loadCursorFromState();
                    }
                }

                console.log(
                    `[PolymarketPipe] ✅ Recovered state: ${this.insiderCount} insiders, ${this.notInsiderCount} non-insiders`
                );
            } else {
                // Fresh start: create new detectors
                console.log("[PolymarketPipe] 🆕 Starting fresh (no snapshots found)");
                this.insiderDetector = new InsiderDetector();
                this.notInsiderDetector = new NotInsiderDetector();

                // Try to load cursor from state.json for fresh start
                if (!this.cursor) {
                    await this.loadCursorFromState();
                }
            }
        } catch (error) {
            console.error("[PolymarketPipe] ⚠️  Recovery failed, starting fresh:", error);
            this.insiderDetector = new InsiderDetector();
            this.notInsiderDetector = new NotInsiderDetector();
        }

        // Initialize evaluator with detectors
        this.evaluator = new InsiderEvaluator(
            this.insiderDetector,
            this.notInsiderDetector,
            () => this.insiderCount++,
            () => this.notInsiderCount++
        );

        // Initialize persistor with callback to save cursor after bloom filters
        this.persistor = new BloomFilterPersistor(30, async (cursor) => {
            await this.saveCursor(cursor);
        });

        this.initialized = true;
    }

    /**
     * @param input.logger - Standard Subsquid logger
     * @param input.read - Async generator providing batches of data
     */
    async write({
        logger,
        read,
    }: {
        logger: { error: (error: unknown, message?: string) => void };
        read: (cursor?: BlockCursor) => AsyncIterable<any>;
    }) {
        // Initialize/recover state before processing
        await this.initialize();

        const currentCursor = await this.getCursor();
        const stream = read(currentCursor);
        let latestTimestamp: number = 0;
        try {
            let reducedPositions
            for await (const batch of stream) {
                try {
                    // Get current timestamp for immediate insider detection
                    // Fallback to header or data if ctx.state.current is missing it
                    latestTimestamp = (batch as any).ctx?.state?.current?.timestamp ?? (batch as any).header?.timestamp;

                    if ((latestTimestamp === undefined || latestTimestamp === 0) && batch.data.length > 0) {
                        latestTimestamp = batch.data[0].timestamp;
                    }

                    if (latestTimestamp === undefined || latestTimestamp === 0) {
                        // If we still don't have a timestamp, we can't flush or evaluate correctly
                        // but we should still process the batch data if it has timestamps.
                        console.warn("[PolymarketPipe] ⚠️ No timestamp found in batch ctx or header");
                    }

                    // Flush expired traders BEFORE consuming this batch so post-window trades
                    // cannot inflate the "first 15 minutes" volume used for classification.
                    const expiredBeforeBatch = this.windowBuffer.flush(latestTimestamp);
                    this.evaluator.evaluate(expiredBeforeBatch);

                    reducedPositions = batch.data.reduce((acc, order) => {
                        const { trader, assetId, usdc, shares, side, timestamp } = order;

                        // Update latestTimestamp from data as we go
                        if (timestamp > latestTimestamp) {
                            latestTimestamp = timestamp;
                        }

                        // 2. ONLY BUY SIDE
                        if (side !== SIDE.BUY) {
                            return acc;
                        }

                        // 3. PRICE > MIN_PRICE
                        // Convert to Number safely for division to capture the exact float price (e.g., 0.15)
                        // Note: If usdc and shares have different decimal scaling, adjust the math accordingly.
                        if ((usdc * BPS_SCALE) <= (shares * MIN_PRICE_BPS)) {
                            return acc;
                        }


                        // Skip immediately if we already know their status
                        if (this.notInsiderDetector.has(trader) || this.insiderDetector.has(trader)) {
                            return acc;
                        }

                        // Only count volume that happened inside the trader's first 15-minute window.
                        const firstSeen =
                            this.windowBuffer.get(trader)?.userStats.firstSeen ??
                            acc.get(trader)?.firstTimestamp ??
                            timestamp;
                        if (timestamp - firstSeen > FIFTEEN_MINUTES) {
                            return acc;
                        }

                        const usdcBig = typeof usdc === 'bigint' ? usdc : BigInt(usdc);

                        // Initialize local aggregator for this trader if missing
                        if (!acc.has(trader)) {
                            acc.set(trader, {
                                totalVol: 0n,
                                tradeCount: 0,
                                firstTimestamp: firstSeen,
                                tokens: {}
                            });
                        }

                        const agg = acc.get(trader)!;
                        agg.totalVol += usdcBig;
                        agg.tradeCount += 1;

                        // Aggregate token-specific stats
                        if (!agg.tokens[assetId]) {
                            agg.tokens[assetId] = { vol: 0n, count: 0, firstTimestamp: timestamp };
                        }
                        agg.tokens[assetId].vol += usdcBig;
                        agg.tokens[assetId].count += 1;

                        return acc;
                    }, new Map<string, any>());

                    // --- 2. APPLY TO CACHE: Update the windowBuffer ---
                    for (const [trader, aggData] of reducedPositions.entries()) {
                        let user = this.windowBuffer.get(trader);
                        const isNewUser = !user;

                        // Create new user in the buffer if they don't exist
                        if (isNewUser) {
                            user = {
                                id: trader,
                                tokenstats: {},
                                userStats: {
                                    tradeVol: 0n,
                                    tradeCount: 0,
                                    firstSeen: aggData.firstTimestamp
                                }
                            };
                            // This triggers the overridden set() and pushes to the Min-Heap
                            this.windowBuffer.set(trader, user);
                        }

                        // Apply the reduced volume and counts
                        user.userStats.tradeVol += aggData.totalVol;
                        user.userStats.tradeCount += aggData.tradeCount;

                        // Apply the reduced token stats
                        for (const [assetId, tokenData] of Object.entries(aggData.tokens) as any) {
                            if (!user.tokenstats[assetId]) {
                                user.tokenstats[assetId] = {
                                    tradeVol: 0n,
                                    tradeCount: 0,
                                    firstSeen: tokenData.firstTimestamp
                                };
                            }
                            user.tokenstats[assetId].tradeVol += tokenData.vol as bigint;
                            user.tokenstats[assetId].tradeCount += tokenData.count as number;
                        }

                        // --- 3. IMMEDIATE INSIDER DETECTION ---
                        const isFirstSeenRecently = latestTimestamp - user.userStats.firstSeen <= FIFTEEN_MINUTES;
                        const meetsVolumeThreshold = user.userStats.tradeVol >= VOLUME_THRESHOLD;

                        if (isFirstSeenRecently && meetsVolumeThreshold) {
                            this.insiderDetector.add(trader);
                            this.insiderCount++;
                            console.log(`[ALERT] Insider detected: ${trader} | Vol: ${user.userStats.tradeVol}`);

                            // 🔥 Remove them from the buffer so they aren't flushed later
                            this.windowBuffer.delete(trader);
                        }
                    }


                } catch (batchErr) {
                    console.error("[Target] Batch processing error:", batchErr);
                    logger.error(batchErr, "Batch processing error, continuing...");
                }
                const flushedData = this.windowBuffer.flush(latestTimestamp);
                this.evaluator.evaluate(flushedData);

                // Track batch processing and save detector snapshot if threshold reached
                // Cursor will be saved via callback only after detectors are written
                this.persistor.onBatchProcessed({
                    insiderDetector: this.insiderDetector.getDetector(),
                    notInsiderDetector: this.notInsiderDetector.getDetector(),
                    insiderCount: this.insiderCount,
                    notInsiderCount: this.notInsiderCount,
                    cursor: batch.ctx.state.current,
                });



            }
        } catch (err) {
            logger.error(err, "Pipeline write failed");
            console.error("[Target] Pipeline error (non-fatal):", err);
        }
    }

    async fork(previousBlocks: BlockCursor[]): Promise<BlockCursor | null> {
        console.warn(`Chain reorg: Removing data for ${previousBlocks.length} blocks`);
        // If needed, you can handle rollback logic here, but returning null 
        // usually signals the indexer to handle it.
        return null;
    }

    private async loadCursorFromState(): Promise<void> {
        if (await this.stateFile.exists()) {
            try {
                const content = await this.stateFile.text();
                try {
                    const cursor = JSON.parse(content);
                    if (typeof cursor === "number") {
                        this.cursor = { number: cursor };
                    } else if (
                        cursor &&
                        typeof cursor === "object" &&
                        typeof cursor.number === "number"
                    ) {
                        this.cursor = cursor as BlockCursor;
                    }
                } catch {
                    const num = parseInt(content.trim(), 10);
                    if (!Number.isNaN(num)) {
                        this.cursor = { number: num };
                    }
                }
                if (this.cursor) {
                    console.log(`[PolymarketPipe] 📍 Loaded cursor from state.json: block ${this.cursor.number}`);
                }
            } catch (e) {
                console.warn("Failed to read cursor from state.json:", e);
            }
        }
    }

    private async getCursor(): Promise<BlockCursor | undefined> {
        if (!this.cursor) {
            this.loadCursorFromState()
        }
        return this.cursor;
    }

    private async saveCursor(cursor: BlockCursor) {
        this.cursor = cursor;
        await Bun.write(this.stateFile, JSON.stringify(cursor));
    }
}
