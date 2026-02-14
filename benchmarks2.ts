import { Heap } from "heap-js";
import { BloomFilter } from "bloomfilter";
import { WindowBuffer, InsiderEvaluator, type TraderData } from "./src/services/buffer";
import { InsiderDetector } from "./src/services/insider";
import { NotInsiderDetector } from "./src/services/notinsider";

// Benchmark configuration
const W_SIZE_MS = 15 * 60 * 1000; // 15 minutes
const NUM_ORDERS_PER_BATCH = 1000;
const NUM_BATCHES = 100;
const BITS = 32 * 25600;
const HASHES = 4;
const SIDE = { BUY: 1, SELL: 0 };
const VOLUME_THRESHOLD = 4_000_000_000n; // 4000 USDC * 1e6

// Timing utilities
const now = () => performance.now();
const measure = async (fn: () => void | Promise<void>, label: string) => {
    const start = now();
    await fn();
    const elapsed = now() - start;
    console.log(`[BENCHMARK] ${label}: ${elapsed.toFixed(2)}ms`);
    return elapsed;
};

// Generate realistic order data
function generateOrders(count: number, baseTimestamp: number) {
    const orders = [];
    for (let i = 0; i < count; i++) {
        orders.push({
            trader: `0x${Math.floor(Math.random() * 50000).toString(16).padStart(40, "0")}`,
            usdc: BigInt(Math.floor(Math.random() * 5000000) + 100000), // 0.1 to 5 USDC
            shares: BigInt(1),
            side: SIDE.BUY,
            timestamp: baseTimestamp + Math.floor(Math.random() * 1000),
            assetId: `asset-${Math.floor(Math.random() * 100)}`,
        });
    }
    return orders;
}

console.log("=== POLYMARKET PIPELINE BENCHMARK ===\n");

const insiderDetector = new InsiderDetector();
const notInsiderDetector = new NotInsiderDetector();
const windowBuffer = new WindowBuffer<TraderData>(
    W_SIZE_MS,
    (item) => item.userStats.firstSeen,
    (item) => item.id
);
const evaluator = new InsiderEvaluator(
    insiderDetector,
    notInsiderDetector,
    () => {},
    () => {}
);

let totalOrders = 0;
let totalFlushed = 0;
let totalTimeMs = 0;

// Benchmark: Full batch processing loop (as in pipe.ts lines 122-262)
console.log("1. Full batch processing simulation");
console.log(`   Processing ${NUM_BATCHES} batches of ${NUM_ORDERS_PER_BATCH} orders each...`);

await measure(async () => {
    for (let batch = 0; batch < NUM_BATCHES; batch++) {
        const currentTimestamp = Date.now() + (batch * 1000);
        const orders = generateOrders(NUM_ORDERS_PER_BATCH, currentTimestamp);

        // Step 1: Flush expired traders BEFORE consuming batch (line 141-142)
        const flushed = windowBuffer.flush(currentTimestamp);
        totalFlushed += Object.keys(flushed).length;
        evaluator.evaluate(flushed);

        // Step 2: Reduce orders (lines 144-203)
        const reducedPositions = orders.reduce((acc, order) => {
            const { trader, usdc, timestamp } = order;

            // Skip if already known
            if (notInsiderDetector.has(trader) || insiderDetector.has(trader)) {
                return acc;
            }

            // Get firstSeen
            const firstSeen = windowBuffer.get(trader)?.userStats.firstSeen
                ?? acc.get(trader)?.firstTimestamp
                ?? timestamp;

            // Only count volume within first 15 minutes
            if (timestamp - firstSeen > W_SIZE_MS) {
                return acc;
            }

            // Initialize aggregator
            if (!acc.has(trader)) {
                acc.set(trader, {
                    totalVol: 0n,
                    tradeCount: 0,
                    firstTimestamp: firstSeen,
                    tokens: {},
                });
            }

            const agg = acc.get(trader)!;
            agg.totalVol += usdc;
            agg.tradeCount += 1;

            // Token stats
            if (!agg.tokens[order.assetId]) {
                agg.tokens[order.assetId] = { vol: 0n, count: 0, firstTimestamp: timestamp };
            }
            agg.tokens[order.assetId].vol += usdc;
            agg.tokens[order.assetId].count += 1;

            return acc;
        }, new Map<string, any>());

        // Step 3: Update windowBuffer (lines 206-254)
        for (const [trader, aggData] of reducedPositions.entries()) {
            let user = windowBuffer.get(trader);
            const isNewUser = !user;

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
                windowBuffer.set(trader, user);
            }

            user.userStats.tradeVol += aggData.totalVol;
            user.userStats.tradeCount += aggData.tradeCount;

            // Token stats
            for (const [assetId, tokenData] of Object.entries(aggData.tokens)) {
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

            // Step 4: Immediate insider detection
            const isFirstSeenRecently = currentTimestamp - user.userStats.firstSeen <= W_SIZE_MS;
            const meetsVolumeThreshold = user.userStats.tradeVol >= VOLUME_THRESHOLD;

            if (isFirstSeenRecently && meetsVolumeThreshold) {
                insiderDetector.add(trader);
                windowBuffer.delete(trader);
            }
        }

        // Step 5: Flush AFTER batch (lines 261-262)
        const flushedAfter = windowBuffer.flush(currentTimestamp);
        totalFlushed += Object.keys(flushedAfter).length;
        evaluator.evaluate(flushedAfter);

        totalOrders += orders.length;
        totalTimeMs += 1000; // Simulate time passing
    }
}, `Process ${NUM_BATCHES * NUM_ORDERS_PER_BATCH} orders in ${NUM_BATCHES} batches`);

console.log(`   Total orders processed: ${totalOrders}`);
console.log(`   Total traders flushed: ${totalFlushed}`);
console.log(`   Avg per batch: ${(totalOrders / NUM_BATCHES).toFixed(0)} orders`);

// Benchmark: Individual component performance
console.log("\n2. Individual component hot paths");

// Test WindowBuffer.set() + get() performance
console.log("   Testing WindowBuffer.set() + get()...");
await measure(() => {
    const testBuffer = new WindowBuffer<TraderData>(W_SIZE_MS);
    for (let i = 0; i < 10000; i++) {
        const trader: TraderData = {
            id: `0x${i.toString(16).padStart(40, "0")}`,
            userStats: {
                tradeVol: 0n,
                tradeCount: 0,
                firstSeen: Date.now()
            }
        };
        testBuffer.set(trader.id, trader);
        testBuffer.get(trader.id);
    }
}, "10000 WindowBuffer.set() + get() calls");

// Test BloomFilter.test() + test() combo (line 166 in pipe.ts)
console.log("   Testing BloomFilter.test() combo...");
const testFilter1 = new BloomFilter(BITS, HASHES);
const testFilter2 = new BloomFilter(BITS, HASHES);
await measure(() => {
    for (let i = 0; i < 50000; i++) {
        const trader = `0x${i.toString(16).padStart(40, "0")}`;
        testFilter1.test(trader) || testFilter2.test(trader);
    }
}, "50000 BloomFilter.test() || test() calls");

// Test Map.has() + Map.get() + set() combo (reduce loop hot path)
console.log("   Testing Map operations (reduce hot path)...");
await measure(() => {
    const testAcc = new Map<string, any>();
    const testBuffer = new Map<string, TraderData>();
    for (let i = 0; i < 50000; i++) {
        const trader = `0x${i.toString(16).padStart(40, "0")}`;

        if (testBuffer.has(trader)) {
            continue;
        }

        if (!testAcc.has(trader)) {
            testAcc.set(trader, {
                totalVol: 0n,
                tradeCount: 0,
                firstTimestamp: Date.now(),
            });
        }

        const agg = testAcc.get(trader)!;
        agg.totalVol += 1000000n;
        agg.tradeCount += 1;
    }
}, "50000 Map.has() + get() + set() operations");

// Test flush() with many expired items
console.log("   Testing WindowBuffer.flush() with expired items...");
await measure(() => {
    const flushTestBuffer = new WindowBuffer<TraderData>(W_SIZE_MS);
    const oldTimestamp = Date.now() - (W_SIZE_MS + 60000); // 16 minutes ago

    // Add 10000 old traders
    for (let i = 0; i < 10000; i++) {
        const trader: TraderData = {
            id: `0x${(10000 + i).toString(16).padStart(40, "0")}`,
            userStats: {
                tradeVol: 0n,
                tradeCount: 0,
                firstSeen: oldTimestamp + (i * 100)
            }
        };
        flushTestBuffer.set(trader.id, trader);
    }

    // Add 1000 recent traders
    const recentTimestamp = Date.now() - 60000; // 1 minute ago
    for (let i = 0; i < 1000; i++) {
        const trader: TraderData = {
            id: `0x${(20000 + i).toString(16).padStart(40, "0")}`,
            userStats: {
                tradeVol: 0n,
                tradeCount: 0,
                firstSeen: recentTimestamp
            }
        };
        flushTestBuffer.set(trader.id, trader);
    }

    // Flush should remove all 10000 old traders
    const flushed = flushTestBuffer.flush(Date.now());
    return Object.keys(flushed).length;
}, "Flush 10000 expired + keep 1000 recent traders");

console.log("\n=== BENCHMARK COMPLETE ===");
