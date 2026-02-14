import { BloomFilter } from 'bloomfilter';

const BITS = 32 * 25600;
const HASHES = 4;

export class InsiderDetector {
    private filter: BloomFilter;

    constructor(existingFilter?: BloomFilter) {
        this.filter = existingFilter || new BloomFilter(BITS, HASHES);
    }

    add(address: string) {
        this.filter.add(address);
    }

    has(address: string): boolean {
        return this.filter.test(address);
    }

    getFilter(): BloomFilter {
        return this.filter;
    }
}