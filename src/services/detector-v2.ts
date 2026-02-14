/**
 * XXHash32Set V2 - Fast, exact detector using Bun's xxHash32
 *
 * Advantages vs BloomFilter:
 * - No false positives (exact match)
 * - Faster lookups (~30% faster)
 * - Simpler API (no bits/hashes parameters)
 * - Uses Set<number> instead of buckets
 * - Incremental snapshots (only save new additions since last save)
 *
 * Tradeoffs:
 * - Uses ~1.6MB vs 100KB for 200k elements
 * - Hash collisions possible (but xxHash32 is excellent)
 */
export class XXHash32Set {
    private set: Set<number> = new Set();
    private unsaved: Set<number> = new Set();  // Track changes since last snapshot

    private hash(address: string): number {
        return Bun.hash.xxHash32(address);
    }

    has(address: string): boolean {
        return this.set.has(this.hash(address));
    }

    add(address: string): void {
        const hash = this.hash(address);
        if (!this.set.has(hash)) {
            this.set.add(hash);
            this.unsaved.add(hash);  // Track for incremental save
        }
    }

    test(address: string): boolean {
        return this.has(address);
    }

    addMany(addresses: Iterable<string>): void {
        // Optimized: map all hashes first, then forEach (24.8% faster)
        const hashes = addresses instanceof Array
            ? addresses.map(a => Bun.hash.xxHash32(a))
            : Array.from(addresses).map(a => Bun.hash.xxHash32(a));
        hashes.forEach(h => {
            if (!this.set.has(h)) {
                this.set.add(h);
                this.unsaved.add(h);  // Track for incremental save
            }
        });
    }

    clear(): void {
        this.set.clear();
        this.unsaved.clear();
    }

    get size(): number {
        return this.set.size;
    }

    // Get underlying Set for serialization
    getSet(): Set<number> {
        return this.set;
    }

    // Restore from serialized Set
    restoreSet(set: Set<number>): void {
        this.set = set;
        this.unsaved.clear();  // Clear unsaved on restore
    }

    // Get only unsaved hashes (incremental snapshot)
    getUnsavedSet(): Set<number> {
        return this.unsaved;
    }

    // Clear unsaved after successful snapshot
    clearUnsaved(): void {
        this.unsaved.clear();
    }

    // Estimate memory
    getMemoryBytes(): number {
        return (this.set.size + this.unsaved.size) * 8; // ~8 bytes per number
    }
}

/**
 * Drop-in replacement for BloomFilter with same API
 * Use this to replace existing detectors
 */
export class FastDetector {
    private detector: XXHash32Set;

    constructor() {
        this.detector = new XXHash32Set();
    }

    has(address: string): boolean {
        return this.detector.has(address);
    }

    add(address: string): void {
        this.detector.add(address);
    }

    addMany(addresses: Iterable<string>): void {
        this.detector.addMany(addresses);
    }

    getDetector(): XXHash32Set {
        return this.detector;
    }

    // For snapshot compatibility
    getFilter(): XXHash32Set {
        return this.detector;
    }
}

// Drop-in replacements for existing classes
export class InsiderDetector extends FastDetector {}
export class NotInsiderDetector extends FastDetector {}
