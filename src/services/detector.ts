import { BloomFilter } from "bloomfilter";

const BITS = 32 * 25600;
const HASHES = 4;

/**
 * Optimized detector that uses a hybrid Set + BloomFilter approach
 *
 * - NEW traders (last N batches): tracked in Set for O(1) exact lookups
 * - OLD traders (known from snapshots): tracked in BloomFilter for memory efficiency
 *
 * This gives fast lookups for recent traders without false positives,
 * while keeping memory bounded for long-term storage.
 */
export class OptimizedDetector {
    private filter: BloomFilter;
    private recent: Set<string> = new Set();
    private readonly recentMax: number;
    private recentCount = 0;

    constructor(
        existingFilter?: BloomFilter,
        recentMax = 10000 // Track last 10k new traders in Set
    ) {
        this.filter = existingFilter || new BloomFilter(BITS, HASHES);
        this.recentMax = recentMax;
    }

    has(address: string): boolean {
        // Check Set first (O(1), no false positives)
        if (this.recent.has(address)) {
            return true;
        }
        // Fall back to BloomFilter for older entries
        return this.filter.test(address);
    }

    add(address: string): void {
        // Add to Set for fast subsequent lookups
        if (!this.recent.has(address)) {
            this.recent.add(address);
            this.recentCount++;

            // Prune Set if it gets too big
            if (this.recentCount > this.recentMax) {
                // Move all Set entries to BloomFilter
                for (const addr of this.recent) {
                    this.filter.add(addr);
                }
                this.recent.clear();
                this.recentCount = 0;
            }
        }
    }

    addMany(addresses: Iterable<string>): void {
        for (const addr of addresses) {
            this.add(addr);
        }
    }

    getFilter(): BloomFilter {
        // Flush Set to filter before returning
        for (const addr of this.recent) {
            this.filter.add(addr);
        }
        this.recent.clear();
        this.recentCount = 0;
        return this.filter;
    }

    getStats() {
        return {
            recentSize: this.recent.size,
            recentMax: this.recentMax,
        };
    }
}

/**
 * Simple Set-based detector for exact tracking
 * Use for small sets (<10k elements) where false positives are unacceptable
 */
export class SetDetector {
    private set: Set<string>;

    constructor(existing?: Set<string>) {
        this.set = existing || new Set();
    }

    has(address: string): boolean {
        return this.set.has(address);
    }

    add(address: string): void {
        this.set.add(address);
    }

    addMany(addresses: Iterable<string>): void {
        for (const addr of addresses) {
            this.set.add(addr);
        }
    }

    getSet(): Set<string> {
        return this.set;
    }
}

// Re-exports for compatibility
export class InsiderDetector extends SetDetector {}
export class NotInsiderDetector extends OptimizedDetector {}
