import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { BlockCursor } from "@subsquid/pipes";
import { BloomFilter } from "bloomfilter";
import { deleteBloomFilter, loadBloomFilter } from "@/lib/db/bloomfilter";
import { BloomFilterPersistor } from "@/services/persistor";

describe("BloomFilterPersistor Integration Tests", () => {
	// Clean up test snapshots before each test
	beforeEach(async () => {
		try {
			await deleteBloomFilter("insider");
		} catch (_e) {
			// Ignore if doesn't exist
		}
		try {
			await deleteBloomFilter("notinsider");
		} catch (_e) {
			// Ignore if doesn't exist
		}
	});

	// Clean up test snapshots after all tests
	afterEach(async () => {
		try {
			await deleteBloomFilter("insider");
		} catch (_e) {
			// Ignore
		}
		try {
			await deleteBloomFilter("notinsider");
		} catch (_e) {
			// Ignore
		}
	});

	test("should create persistor with custom batch interval", () => {
		const persistor = new BloomFilterPersistor(50);
		const status = persistor.getStatus();

		expect(status.queueLength).toBe(0);
		expect(status.isProcessing).toBe(false);
		expect(status.batchCount).toBe(0);
		expect(status.lastSaveBatch).toBe(0);
	});

	test("should persist to database after batch threshold", async () => {
		const persistor = new BloomFilterPersistor(2); // Save after 2 batches

		const insiderFilter = new BloomFilter(1024, 3);
		insiderFilter.add("0xinsider1");

		const notInsiderFilter = new BloomFilter(1024, 3);
		notInsiderFilter.add("0xnotinsider1");

		const cursor: BlockCursor = {
			number: 12345,
			hash: "0xabcdef",
			timestamp: Date.now(),
		};

		// First batch - should not save yet
		let saved = persistor.onBatchProcessed({
			insiderFilter,
			notInsiderFilter,
			insiderCount: 1,
			notInsiderCount: 1,
			cursor,
		});

		expect(saved).toBe(false);

		// Second batch - should trigger save
		saved = persistor.onBatchProcessed({
			insiderFilter,
			notInsiderFilter,
			insiderCount: 1,
			notInsiderCount: 1,
			cursor,
		});

		expect(saved).toBe(true);

		// Wait for processing
		await persistor.flush();

		// Verify data was persisted to database
		const loadedInsider = await loadBloomFilter("insider");
		const loadedNotInsider = await loadBloomFilter("notinsider");

		expect(loadedInsider).not.toBeNull();
		expect(loadedNotInsider).not.toBeNull();
		expect(loadedInsider?.filter.test("0xinsider1")).toBe(true);
		expect(loadedNotInsider?.filter.test("0xnotinsider1")).toBe(true);
		expect(loadedInsider?.cursor?.number).toBe(12345);
	});

	test("should respect batch interval - skip saves before threshold", async () => {
		const persistor = new BloomFilterPersistor(10); // Save after 10 batches

		const filter = new BloomFilter(1024, 3);
		const cursor: BlockCursor = { number: 100 };

		// Process 5 batches - should not save
		for (let i = 0; i < 5; i++) {
			const saved = persistor.onBatchProcessed({
				insiderFilter: filter,
				notInsiderFilter: filter,
				insiderCount: i,
				notInsiderCount: i,
				cursor,
			});
			expect(saved).toBe(false);
		}

		await persistor.flush();

		// Verify nothing was saved
		const loaded = await loadBloomFilter("insider");
		expect(loaded).toBeNull();
	});

	test("should force save bypassing batch interval check", async () => {
		const persistor = new BloomFilterPersistor(100); // High threshold

		const filter = new BloomFilter(1024, 3);
		filter.add("0xforced");
		const cursor: BlockCursor = { number: 100 };

		// Force save immediately without reaching threshold
		persistor.forceSave({
			insiderFilter: filter,
			notInsiderFilter: filter,
			insiderCount: 1,
			notInsiderCount: 1,
			cursor,
		});

		await persistor.flush();

		// Verify it was saved despite not reaching batch threshold
		const loaded = await loadBloomFilter("insider");
		expect(loaded).not.toBeNull();
		expect(loaded?.filter.test("0xforced")).toBe(true);
	});

	test("should only persist latest snapshot, discarding queued older ones", async () => {
		const persistor = new BloomFilterPersistor(1); // Save every batch

		const filter1 = new BloomFilter(1024, 3);
		filter1.add("0xaddr1");

		const filter3 = new BloomFilter(1024, 3);
		filter3.add("0xaddr3");

		const cursor1: BlockCursor = { number: 100 };
		const cursor3: BlockCursor = { number: 300 };

		// Force save multiple snapshots rapidly
		persistor.forceSave({
			insiderFilter: filter1,
			notInsiderFilter: filter1,
			insiderCount: 1,
			notInsiderCount: 1,
			cursor: cursor1,
		});

		persistor.forceSave({
			insiderFilter: filter3,
			notInsiderFilter: filter3,
			insiderCount: 3,
			notInsiderCount: 3,
			cursor: cursor3,
		});

		await persistor.flush();

		// Verify only the latest snapshot was persisted
		const loaded = await loadBloomFilter("insider");
		expect(loaded).not.toBeNull();
		expect(loaded?.cursor?.number).toBe(300);
		expect(loaded?.filter.test("0xaddr3")).toBe(true);
	});

	test("should persist cursor with bloomfilter", async () => {
		const persistor = new BloomFilterPersistor(1);

		const filter = new BloomFilter(1024, 3);
		filter.add("0xtest");

		const cursor: BlockCursor = {
			number: 999,
			hash: "0xhash999",
			timestamp: 1234567890,
		};

		persistor.forceSave({
			insiderFilter: filter,
			notInsiderFilter: filter,
			insiderCount: 1,
			notInsiderCount: 1,
			cursor,
		});

		await persistor.flush();

		// Verify cursor was saved with bloomfilter
		const loaded = await loadBloomFilter("insider");
		expect(loaded).not.toBeNull();
		expect(loaded?.cursor).toBeDefined();
		expect(loaded?.cursor?.number).toBe(999);
		expect(loaded?.cursor?.hash).toBe("0xhash999");
		expect(loaded?.cursor?.timestamp).toBe(1234567890);
	});

	test("should save both insider and notinsider filters", async () => {
		const persistor = new BloomFilterPersistor(1);

		const insiderFilter = new BloomFilter(1024, 3);
		insiderFilter.add("0xinsider");

		const notInsiderFilter = new BloomFilter(1024, 3);
		notInsiderFilter.add("0xnotinsider");

		const cursor: BlockCursor = { number: 500 };

		persistor.forceSave({
			insiderFilter,
			notInsiderFilter,
			insiderCount: 1,
			notInsiderCount: 1,
			cursor,
		});

		await persistor.flush();

		// Verify both filters were saved
		const loadedInsider = await loadBloomFilter("insider");
		const loadedNotInsider = await loadBloomFilter("notinsider");

		expect(loadedInsider).not.toBeNull();
		expect(loadedNotInsider).not.toBeNull();

		expect(loadedInsider?.filter.test("0xinsider")).toBe(true);
		expect(loadedNotInsider?.filter.test("0xnotinsider")).toBe(true);

		expect(loadedInsider?.itemCount).toBe(1);
		expect(loadedNotInsider?.itemCount).toBe(1);

		expect(loadedInsider?.cursor?.number).toBe(500);
		expect(loadedNotInsider?.cursor?.number).toBe(500);
	});

	test("should track batch count correctly", async () => {
		const persistor = new BloomFilterPersistor(5);
		const filter = new BloomFilter(1024, 3);
		const cursor: BlockCursor = { number: 100 };

		// Initial status
		let status = persistor.getStatus();
		expect(status.batchCount).toBe(0);
		expect(status.lastSaveBatch).toBe(0);

		// Process 3 batches
		for (let i = 0; i < 3; i++) {
			persistor.onBatchProcessed({
				insiderFilter: filter,
				notInsiderFilter: filter,
				insiderCount: 1,
				notInsiderCount: 1,
				cursor,
			});
		}

		status = persistor.getStatus();
		expect(status.batchCount).toBe(3);
		expect(status.lastSaveBatch).toBe(0); // Haven't saved yet

		// Process 2 more batches (total 5, should trigger save)
		for (let i = 0; i < 2; i++) {
			persistor.onBatchProcessed({
				insiderFilter: filter,
				notInsiderFilter: filter,
				insiderCount: 1,
				notInsiderCount: 1,
				cursor,
			});
		}

		await persistor.flush();

		status = persistor.getStatus();
		expect(status.batchCount).toBe(5);
		expect(status.lastSaveBatch).toBe(5);
	});
});
