import { BloomFilter } from "bloomfilter";
import { Heap } from "heap-js";

// Benchmark configuration
const W_SIZE_MS = 15 * 60 * 1000; // 15 minutes
const NUM_TRADERS = 10000;
const NUM_ORDERS = 100000;
const BITS = 32 * 25600;
const HASHES = 4;

// Timing utilities
const now = () => performance.now();
const measure = (fn: () => void, label: string) => {
	const start = now();
	fn();
	const elapsed = now() - start;
	console.log(`[BENCHMARK] ${label}: ${elapsed.toFixed(2)}ms`);
	return elapsed;
};

// Simulate TraderData
interface TraderData {
	id: string;
	userStats: {
		tradeVol: bigint;
		tradeCount: number;
		firstSeen: number;
	};
}

interface TraderAgg {
	totalVol: bigint;
	tradeCount: number;
	firstTimestamp: number;
	tokens: Record<string, unknown>;
}

console.log("=== BENCHMARKING POLYMARKET PIPELINE ===\n");

// Benchmark 1: BloomFilter.has() operations
console.log("1. BloomFilter.has() performance");
const filter = new BloomFilter(BITS, HASHES);
// Pre-populate with some addresses
for (let i = 0; i < 100000; i++) {
	filter.add(`0x${i.toString(16).padStart(40, "0")}`);
}

measure(() => {
	for (let i = 0; i < 100000; i++) {
		filter.test(`0x${i.toString(16).padStart(40, "0")}`);
	}
}, "100k BloomFilter.test() calls");

// Benchmark 2: Map.has() + Map.get() combo (like line 166 in pipe.ts)
console.log("\n2. Map.has() + Map.get() performance");
const map = new Map<string, TraderData>();
for (let i = 0; i < 10000; i++) {
	map.set(`0x${i.toString(16).padStart(40, "0")}`, {
		id: `0x${i.toString(16).padStart(40, "0")}`,
		userStats: { tradeVol: 0n, tradeCount: 0, firstSeen: Date.now() },
	});
}

measure(() => {
	for (let i = 0; i < 100000; i++) {
		const trader = `0x${i.toString(16).padStart(40, "0")}`;
		map.has(trader) || map.has(trader); // Simulating double has() like insiderDetector.has() || notInsiderDetector.has()
	}
}, "100k double Map.has() calls");

// Benchmark 3: WindowBuffer.flush() simulation
console.log("\n3. WindowBuffer.flush() performance");
const minHeap = new Heap(
	(a: TraderData, b: TraderData) =>
		a.userStats.firstSeen - b.userStats.firstSeen,
);
const bufferMap = new Map<string, TraderData>();
const deletedKeys = new Set<string>();
const currentTimestamp = Date.now();

// Populate with 10000 traders spread over 15 minutes
for (let i = 0; i < NUM_TRADERS; i++) {
	const trader: TraderData = {
		id: `0x${i.toString(16).padStart(40, "0")}`,
		userStats: {
			tradeVol: BigInt(i),
			tradeCount: 1,
			firstSeen: currentTimestamp - (i * W_SIZE_MS) / NUM_TRADERS,
		},
	};
	minHeap.push(trader);
	bufferMap.set(trader.id, trader);
}

// Simulate flush() - this should expire about half the traders
let flushedCount = 0;
measure(() => {
	while (
		minHeap.length > 0 &&
		currentTimestamp - (minHeap.peek()?.userStats.firstSeen ?? 0) >= W_SIZE_MS
	) {
		const expiredItem = minHeap.pop();
		if (!expiredItem) break;
		const key = expiredItem.id;

		if (deletedKeys.has(key)) {
			deletedKeys.delete(key);
			continue;
		}

		if (bufferMap.get(key) !== expiredItem) {
			continue;
		}

		flushedCount++;
		bufferMap.delete(key);
	}
}, `Flush() ${NUM_TRADERS} traders (${flushedCount} expired)`);

// Benchmark 4: Batch processing reduce loop (pipe.ts lines 144-203)
console.log("\n4. Batch processing reduce loop performance");
const windowBuffer = new Map<string, TraderData>();

// Create test orders - 100k orders
const orders = [];
for (let i = 0; i < NUM_ORDERS; i++) {
	orders.push({
		trader: `0x${(i % 5000).toString(16).padStart(40, "0")}`,
		usdc: BigInt(1000000),
		shares: BigInt(1),
		side: 1, // BUY
		timestamp: currentTimestamp - Math.random() * W_SIZE_MS,
		assetId: `asset-${i % 100}`,
	});
}

measure(() => {
	orders.reduce((acc, order) => {
		const { trader, usdc, timestamp } = order;

		// Simulate the check in line 166
		if (windowBuffer.has(trader)) {
			return acc;
		}

		// Initialize local aggregator
		let agg = acc.get(trader);
		if (!agg) {
			agg = {
				totalVol: 0n,
				tradeCount: 0,
				firstTimestamp: timestamp,
				tokens: {},
			};
			acc.set(trader, agg);
		}

		agg.totalVol += usdc;
		agg.tradeCount += 1;

		return acc;
	}, new Map<string, TraderAgg>());
}, `Reduce ${NUM_ORDERS} orders`);

// Benchmark 5: NotInsiderDetector.addMany() performance
console.log("\n5. NotInsiderDetector.addMany() performance");
const testFilter = new BloomFilter(BITS, HASHES);
const addresses: string[] = [];
for (let i = 0; i < 1000; i++) {
	addresses.push(`0x${i.toString(16).padStart(40, "0")}`);
}

measure(() => {
	for (const addr of addresses) {
		testFilter.add(addr);
	}
}, "Add 1000 addresses to BloomFilter (sequential)");

console.log("\n=== BENCHMARK COMPLETE ===");
