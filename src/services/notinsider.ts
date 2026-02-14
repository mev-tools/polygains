import { BloomFilter } from 'bloomfilter';

// Helper to calculate optimal Bloom filter size
// Size depends on expected elements; here we arbitrarily pick sizes for demonstration.
const BITS = 32 * 25600;
const HASHES = 4;

export class NotInsiderDetector {
    private filter: BloomFilter;

    constructor(existingFilter?: BloomFilter) {
        this.filter = existingFilter || new BloomFilter(BITS, HASHES);
    }

    add(address: string) {
        this.filter.add(address);
    }

    addMany(addresses: Iterable<string>) {
        for (const address of addresses) {
            this.filter.add(address);
        }
    }

    has(address: string): boolean {
        return this.filter.test(address);
    }

    getFilter(): BloomFilter {
        return this.filter;
    }
}
