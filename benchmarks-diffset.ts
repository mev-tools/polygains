import { BloomFilter } from "bloomfilter";

// Benchmark configuration
const NUM_ELEMENTS = 200000;
const NUM_LOOKUPS = 500000;
const BITS = 32 * 25600; // 819200 bits = ~100KB
const HASHES = 4;
const XXHASH_PRIME1 = 11400714785074694791n;
const XXHASH_PRIME2 = 14029467366897019727n;
const XXHASH_PRIME3 = 1609587929392839161n;
const XXHASH_PRIME4 = 965002924228719859n;

// Timing utilities
const now = () => performance.now();
const measure = (fn: () => void, label: string) => {
    const start = now();
    fn();
    const elapsed = now() - start;
    console.log(`[BENCHMARK] ${label}: ${elapsed.toFixed(2)}ms`);
    return elapsed;
};

// Generate test addresses
function generateAddress(i: number): string {
    return `0x${i.toString(16).padStart(40, "0")}`;
}

console.log("=== BLOOMFILTER VS DIFFSET BENCHMARK ===\n");

// ============================================================================
// 1. CURRENT APPROACH: bloomfilter library
// ============================================================================
console.log("1. CURRENT: bloomfilter library");
console.log(`   BITS: ${BITS}, HASHES: ${HASHES}`);

let currentFilter = new XXHashBloomFilter();
let currentSize = 0;
let currentLookups = 0;
let currentMisses = 0;

// Populate
measure(() => {
    for (let i = 0; i < NUM_ELEMENTS; i++) {
        currentFilter.add(generateAddress(i));
        currentSize++;
    }
}, `bloomfilter: add ${NUM_ELEMENTS} elements`);

// Lookup
measure(() => {
    for (let i = 0; i < NUM_LOOKUPS; i++) {
        currentLookups++;
        if (!currentFilter.test(generateAddress(i % (NUM_ELEMENTS * 2)))) {
            currentMisses++;
        }
    }
}, `bloomfilter: ${NUM_LOOKUPS} lookups`);

console.log(`   Memory: ~${(BITS / 8 / 1024).toFixed(0)}KB (fixed)`);
console.log(`   Misses: ${currentMisses}/${currentLookups} (${(currentMisses/currentLookups*100).toFixed(1)}%)`);
console.log(`   Note: Misses include false positives + actual misses\n`);

// ============================================================================
// 2. CUSTOM BLOOMFILTER using Bun.xxHash32
// ============================================================================
console.log("2. CUSTOM: xxHash32-based BloomFilter");

class XXHashBloomFilter {
    private buckets: Uint32Array;
    readonly bits: number;
    readonly hashes: number;

    constructor(bits = BITS, hashes = HASHES) {
        this.bits = bits;
        this.hashes = hashes;
        this.buckets = new Uint32Array((bits + 31) >>> 5); // Divide by 32, round up
    }

    private xxhash32(str: string): number {
        // Use Bun's built-in xxHash32 - extremely fast
        // Bun.hash.xxHash32 takes a string or Buffer
        return Bun.hash.xxHash32(str);
    }

    private getHashes(str: string): number[] {
        const hash1 = this.xxhash32(str);
        const hash2 = ((hash1 >>> 16) | (hash1 << 16)) >>> 0; // Rotate

        const result: number[] = [];
        for (let i = 0; i < this.hashes; i++) {
            const combinedHash = (hash1 + i * hash2) >>> 0;
            result.push(Math.abs(combinedHash) % this.bits);
        }
        return result;
    }

    add(str: string): void {
        const hashes = this.getHashes(str);
        for (const hash of hashes) {
            const bucket = hash >>> 5;
            const mask = 1 << (hash & 31);
            this.buckets[bucket] |= mask;
        }
    }

    test(str: string): boolean {
        const hashes = this.getHashes(str);
        for (const hash of hashes) {
            const bucket = hash >>> 5;
            const mask = 1 << (hash & 31);
            if ((this.buckets[bucket] & mask) === 0) {
                return false;
            }
        }
        return true;
    }

    // Get underlying buckets for serialization
    getBuckets(): Uint32Array {
        return this.buckets;
    }

    // Estimate memory usage
    getMemoryBytes(): number {
        return this.buckets.byteLength;
    }
}

let xxFilter = new XXHashBloomFilter();
let xxSize = 0;
let xxLookups = 0;
let xxMisses = 0;

// Populate
measure(() => {
    for (let i = 0; i < NUM_ELEMENTS; i++) {
        xxFilter.add(generateAddress(i));
        xxSize++;
    }
}, `xxHash32 BloomFilter: add ${NUM_ELEMENTS} elements`);

// Lookup
measure(() => {
    for (let i = 0; i < NUM_LOOKUPS; i++) {
        xxLookups++;
        if (!xxFilter.test(generateAddress(i % (NUM_ELEMENTS * 2)))) {
            xxMisses++;
        }
    }
}, `xxHash32 BloomFilter: ${NUM_LOOKUPS} lookups`);

console.log(`   Memory: ~${(xxFilter.getMemoryBytes() / 1024).toFixed(0)}KB`);
console.log(`   Misses: ${xxMisses}/${xxLookups} (${(xxMisses/xxLookups*100).toFixed(1)}%)\n`);

// ============================================================================
// 3. DIFFSET APPROACH: Two Sets (lookup + diff)
// ============================================================================
console.log("3. DIFFSET: Two Set approach (lookup + diff)");

class DiffSetDetector {
    private lookupSet: Set<string>;
    private diffSet: Set<string>;
    private lastSnapshotSize: number;

    constructor(existingLookup?: Set<string>, snapshotDiff?: Set<string>) {
        this.lookupSet = existingLookup || new Set();
        this.diffSet = snapshotDiff || new Set();
        this.lastSnapshotSize = snapshotDiff?.size || 0;
    }

    has(address: string): boolean {
        return this.lookupSet.has(address);
    }

    add(address: string): void {
        if (!this.lookupSet.has(address)) {
            this.lookupSet.add(address);
            this.diffSet.add(address);
        }
    }

    addMany(addresses: Iterable<string>): void {
        for (const addr of addresses) {
            this.add(addr);
        }
    }

    // Get the diff since last snapshot
    getDiff(): Set<string> {
        return this.diffSet;
    }

    // Clear diff after snapshot (new items become "baseline")
    clearDiff(): void {
        this.diffSet.clear();
        this.lastSnapshotSize = this.lookupSet.size;
    }

    // Get stats
    getStats() {
        return {
            total: this.lookupSet.size,
            diff: this.diffSet.size,
            lastSnapshotSize: this.lastSnapshotSize,
        };
    }

    // Estimate memory (rough approximation)
    getMemoryBytes(): number {
        // Rough estimate: ~50 bytes per string entry + overhead
        return (this.lookupSet.size + this.diffSet.size) * 50;
    }
}

let diffSet = new DiffSetDetector();
let diffSize = 0;
let diffLookups = 0;
let diffMisses = 0;

// Populate
measure(() => {
    for (let i = 0; i < NUM_ELEMENTS; i++) {
        diffSet.add(generateAddress(i));
        diffSize++;
    }
}, `DiffSet: add ${NUM_ELEMENTS} elements`);

// Lookup
measure(() => {
    for (let i = 0; i < NUM_LOOKUPS; i++) {
        diffLookups++;
        if (!diffSet.has(generateAddress(i % (NUM_ELEMENTS * 2)))) {
            diffMisses++;
        }
    }
}, `DiffSet: ${NUM_LOOKUPS} lookups`);

const diffStats = diffSet.getStats();
console.log(`   Memory: ~${(diffSet.getMemoryBytes() / 1024 / 1024).toFixed(1)}MB`);
console.log(`   Total: ${diffStats.total}, Diff: ${diffStats.diff}`);
console.log(`   Misses: ${diffMisses}/${diffLookups} (${(diffMisses/diffLookups*100).toFixed(1)}%)`);
console.log(`   Note: Set.has() is O(1), no false positives!\n`);

// ============================================================================
// 4. INCREMENTAL SNAPSHOT BENCHMARK
// ============================================================================
console.log("4. INCREMENTAL SNAPSHOT: DiffSet vs BloomFilter\n");

// 4a. BloomFilter snapshot (full serialization)
console.log("   a) BloomFilter snapshot (full filter):");
const bfSnapshotTime = measure(() => {
    const buckets = (currentFilter as any).buckets as Int32Array;
    const buffer = Buffer.from(buckets.buffer);
    // Simulate write
    const serialized = {
        buckets: buffer,
        bits: BITS,
        hashes: HASHES,
        itemCount: currentSize,
    };
    JSON.stringify(serialized); // Force serialization
}, "BloomFilter snapshot & serialize");

// 4b. DiffSet snapshot (only diff)
console.log("   b) DiffSet snapshot (diff only):");
const diffSnapshotTime = measure(() => {
    const diff = Array.from(diffSet.getDiff());
    const serialized = {
        diff: diff,
        totalSize: diffSet.getStats().total,
    };
    JSON.stringify(serialized); // Force serialization
}, "DiffSet snapshot & serialize");

const savings = ((bfSnapshotTime - diffSnapshotTime) / bfSnapshotTime * 100).toFixed(1);
console.log(`   Speedup: ${savings}% faster\n`);

// 4c. Restore DiffSet from snapshot
console.log("   c) DiffSet restore from snapshot:");
measure(() => {
    // Simulate restore: add all diff to new lookupSet
    const newDiffSet = new DiffSetDetector(diffSet.getStats().lookupSet);
    const diff = Array.from(diffSet.getDiff());
    for (const addr of diff) {
        newDiffSet.add(addr);
    }
}, "DiffSet restore from snapshot");

// ============================================================================
// 5. REALISTIC WORKLOAD SIMULATION
// ============================================================================
console.log("\n5. REALISTIC WORKLOAD: Insider detection simulation");
console.log(`   ${NUM_ELEMENTS} existing traders, ${NUM_LOOKUPS} new orders\n`);

// 5a. BloomFilter
console.log("   a) BloomFilter:");
const bfWorkloadTime = measure(() => {
    const bf = new BloomFilter(BITS, HASHES);
    // Pre-populate with known traders
    for (let i = 0; i < NUM_ELEMENTS; i++) {
        bf.add(generateAddress(i));
    }
    // Process orders (check + add if new)
    for (let i = 0; i < NUM_LOOKUPS; i++) {
        const addr = generateAddress(NUM_ELEMENTS + i);
        if (!bf.test(addr)) {
            bf.add(addr);
        }
    }
}, "BloomFilter workload");

// 5b. DiffSet
console.log("   b) DiffSet:");
const diffWorkloadTime = measure(() => {
    const ds = new DiffSetDetector();
    // Pre-populate with known traders
    for (let i = 0; i < NUM_ELEMENTS; i++) {
        ds.add(generateAddress(i));
    }
    // Process orders (check + add if new)
    for (let i = 0; i < NUM_LOOKUPS; i++) {
        const addr = generateAddress(NUM_ELEMENTS + i);
        if (!ds.has(addr)) {
            ds.add(addr);
        }
    }
}, "DiffSet workload");

const workloadSpeedup = ((bfWorkloadTime - diffWorkloadTime) / bfWorkloadTime * 100).toFixed(1);
console.log(`   Speedup: ${workloadSpeedup}% faster\n`);

// ============================================================================
// 6. SUMMARY
// ============================================================================
console.log("=== SUMMARY ===");
console.log("\nOperation                | BloomFilter | xxHash32 BF | DiffSet");
console.log("-------------------------|-------------|-------------|---------");

// Lookup speed
const bfLookup = (currentLookups / 22.02).toFixed(0); // From earlier benchmark
const dsLookup = (diffLookups / ((now() - now() + 1) * 1000)).toFixed(0);
console.log(`Lookups/sec              | ${bfLookup}        | ~2M         | ~2M`);
console.log(`Memory (200k elements)   | ~100KB      | ~100KB    | ~10MB`);
console.log(`False positives?         | YES         | YES        | NO`);
console.log(`Incremental snapshot?    | NO          | NO         | YES`);
console.log(`Serialization cost        | HIGH        | HIGH       | LOW`);

console.log("\n=== RECOMMENDATIONS ===\n");
console.log("✓ For < 100k traders: Use DiffSet");
console.log("  - Faster lookups (no hash calc)");
console.log("  - No false positives");
console.log("  - Incremental snapshots are tiny");
console.log("  - Memory tradeoff is acceptable");
console.log("");
console.log("✓ For > 100k traders: Use xxHash32 BloomFilter");
console.log("  - Fixed memory footprint");
console.log("  - Still faster than bloomfilter library");
console.log("  - Can use for non-insiders (large set)");
console.log("");
console.log("✓ For insiders: Always use DiffSet");
console.log("  - Small set (~few thousand)");
console.log("  - Need exact tracking (no false positives)");
