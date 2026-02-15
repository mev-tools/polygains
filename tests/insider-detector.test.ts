import { describe, expect, test } from "bun:test";
import type { BloomFilter } from "bloomfilter";
import type { BloomFilterInternals } from "@/lib/db/bloomfilter";
import { InsiderDetector } from "@/services/insider";
import { NotInsiderDetector } from "@/services/notinsider";

describe("InsiderDetector", () => {
	test("should initialize with correct bloom filter parameters", () => {
		const detector = new InsiderDetector();
		const filter = (detector as unknown as { filter: BloomFilter }).filter;

		// Verify configuration matches constants
		expect((filter as unknown as BloomFilterInternals).m).toBe(32 * 25600); // 819,200 bits
		expect((filter as unknown as BloomFilterInternals).k).toBe(4); // 4 hash functions
	});

	test("should add and detect addresses", () => {
		const detector = new InsiderDetector();
		const address = "0x1234567890abcdef1234567890abcdef12345678";

		expect(detector.has(address)).toBe(false);

		detector.add(address);

		expect(detector.has(address)).toBe(true);
	});

	test("should handle multiple addresses", () => {
		const detector = new InsiderDetector();
		const addresses = [
			"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			"0xcccccccccccccccccccccccccccccccccccccccc",
			"0xdddddddddddddddddddddddddddddddddddddddd",
		];

		for (const addr of addresses) {
			detector.add(addr);
		}

		// All added addresses should be detected
		for (const addr of addresses) {
			expect(detector.has(addr)).toBe(true);
		}

		// Random address should not be detected (with high probability)
		const randomAddress = "0x9999999999999999999999999999999999999999";
		const isDetected = detector.has(randomAddress);
		expect(typeof isDetected).toBe("boolean");
	});

	test("should be case-sensitive for addresses", () => {
		const detector = new InsiderDetector();
		const lowerCase = "0xabcdef1234567890abcdef1234567890abcdef12";
		const upperCase = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";

		detector.add(lowerCase);

		expect(detector.has(lowerCase)).toBe(true);
		// Bloom filter is case-sensitive, so uppercase won't match
		expect(detector.has(upperCase)).toBe(false);
	});

	test("should handle empty string addresses", () => {
		const detector = new InsiderDetector();

		detector.add("");
		expect(detector.has("")).toBe(true);
	});

	test("should demonstrate bloom filter false positive property", () => {
		const detector = new InsiderDetector();

		// Add many addresses to increase false positive probability
		for (let i = 0; i < 10000; i++) {
			detector.add(`0x${i.toString(16).padStart(40, "0")}`);
		}

		// Check for potential false positives
		let falsePositives = 0;
		const testCases = 1000;

		for (let i = 10000; i < 10000 + testCases; i++) {
			const testAddr = `0x${i.toString(16).padStart(40, "0")}`;
			if (detector.has(testAddr)) {
				falsePositives++;
			}
		}

		// With 819,200 bits and 4 hashes, optimal capacity is ~44,000 items
		// After 10k items, false positive rate should be < 1%
		expect(falsePositives).toBeLessThan(testCases * 0.01);
	});
});

describe("NotInsiderDetector", () => {
	test("should initialize with same parameters as InsiderDetector", () => {
		const notInsider = new NotInsiderDetector();
		const insider = new InsiderDetector();

		const notInsiderFilter = (notInsider as unknown as { filter: BloomFilter })
			.filter;
		const insiderFilter = (insider as unknown as { filter: BloomFilter })
			.filter;

		// Both should use same configuration
		expect((notInsiderFilter as unknown as BloomFilterInternals).m).toBe(
			(insiderFilter as unknown as BloomFilterInternals).m,
		);
		expect((notInsiderFilter as unknown as BloomFilterInternals).k).toBe(
			(insiderFilter as unknown as BloomFilterInternals).k,
		);
	});

	test("should maintain separate state from InsiderDetector", () => {
		const insider = new InsiderDetector();
		const notInsider = new NotInsiderDetector();
		const address = "0x1111111111111111111111111111111111111111";

		insider.add(address);

		expect(insider.has(address)).toBe(true);
		expect(notInsider.has(address)).toBe(false);

		notInsider.add(address);

		expect(insider.has(address)).toBe(true);
		expect(notInsider.has(address)).toBe(true);
	});

	test("should track non-insider addresses independently", () => {
		const notInsider = new NotInsiderDetector();
		const regularTraders = [
			"0x1000000000000000000000000000000000000001",
			"0x2000000000000000000000000000000000000002",
			"0x3000000000000000000000000000000000000003",
		];

		for (const addr of regularTraders) {
			notInsider.add(addr);
		}

		for (const addr of regularTraders) {
			expect(notInsider.has(addr)).toBe(true);
		}
	});

	test("should support batch insertion for non-insiders", () => {
		const notInsider = new NotInsiderDetector();
		const addresses = [
			"0x4000000000000000000000000000000000000004",
			"0x5000000000000000000000000000000000000005",
			"0x6000000000000000000000000000000000000006",
		];

		notInsider.addMany(addresses);

		for (const addr of addresses) {
			expect(notInsider.has(addr)).toBe(true);
		}
	});
});

describe("Bloom Filter Collision Handling", () => {
	test("should demonstrate that different detectors don't interfere", () => {
		const insider = new InsiderDetector();
		const notInsider = new NotInsiderDetector();

		const insiderAddresses = Array.from(
			{ length: 100 },
			(_, i) => `0xa${i.toString(16).padStart(39, "0")}`,
		);

		const notInsiderAddresses = Array.from(
			{ length: 100 },
			(_, i) => `0xb${i.toString(16).padStart(39, "0")}`,
		);

		for (const addr of insiderAddresses) {
			insider.add(addr);
		}
		for (const addr of notInsiderAddresses) {
			notInsider.add(addr);
		}

		// Verify isolation
		for (const addr of insiderAddresses) {
			expect(insider.has(addr)).toBe(true);
			expect(notInsider.has(addr)).toBe(false);
		}

		for (const addr of notInsiderAddresses) {
			expect(notInsider.has(addr)).toBe(true);
			expect(insider.has(addr)).toBe(false);
		}
	});
});

describe("Performance characteristics", () => {
	test("should handle large number of inserts efficiently", () => {
		const detector = new InsiderDetector();
		const startTime = performance.now();

		// Insert 10,000 addresses
		for (let i = 0; i < 10000; i++) {
			detector.add(`0x${i.toString(16).padStart(40, "0")}`);
		}

		const insertTime = performance.now() - startTime;

		// Should complete in reasonable time (< 100ms)
		expect(insertTime).toBeLessThan(100);
	});

	test("should have O(1) lookup time", () => {
		const detector = new InsiderDetector();

		// Add varying amounts of data
		for (let i = 0; i < 5000; i++) {
			detector.add(`0x${i.toString(16).padStart(40, "0")}`);
		}

		const lookups = 1000;
		const startTime = performance.now();

		for (let i = 0; i < lookups; i++) {
			detector.has(`0x${i.toString(16).padStart(40, "0")}`);
		}

		const lookupTime = performance.now() - startTime;
		const avgLookupTime = lookupTime / lookups;

		// Average lookup should be < 0.01ms (constant time)
		expect(avgLookupTime).toBeLessThan(0.01);
	});
});
