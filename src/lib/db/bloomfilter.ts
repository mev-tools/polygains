import { BloomFilter } from "bloomfilter";
import { db } from "@/lib/db/init";
import { bloomfilterSnapshots, detectorSnapshots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { BlockCursor } from "@subsquid/pipes";
import { XXHash32Set } from "@/services/detector-v2";

export type BloomFilterId = "insider" | "notinsider";

export interface BloomFilterSnapshot {
	filter: BloomFilter;
	itemCount: number;
	cursor?: BlockCursor;
}

/**
 * Save a BloomFilter snapshot to the database
 */
export async function saveBloomFilter(
	id: BloomFilterId,
	filter: BloomFilter,
	itemCount = 0,
	cursor?: BlockCursor,
) {
	// Access the internal buckets array - BloomFilter stores data in an Int32Array
	const buckets = (filter as any).buckets as Int32Array;
	const bits = (filter as any).m as number;
	const hashes = (filter as any).k as number;

	// Convert Int32Array to Buffer for efficient binary storage
	const buffer = Buffer.from(buckets.buffer);

	const snapshot = {
		id,
		buckets: buffer,
		bits,
		hashes,
		itemCount,
		updatedAt: Date.now(),
		blockNumber: cursor?.number,
		blockHash: cursor?.hash,
		blockTimestamp: cursor?.timestamp,
	};

	await db
		.insert(bloomfilterSnapshots)
		.values(snapshot)
		.onConflictDoUpdate({
			target: bloomfilterSnapshots.id,
			set: {
				buckets: snapshot.buckets,
				bits: snapshot.bits,
				hashes: snapshot.hashes,
				itemCount: snapshot.itemCount,
				updatedAt: snapshot.updatedAt,
				blockNumber: snapshot.blockNumber,
				blockHash: snapshot.blockHash,
				blockTimestamp: snapshot.blockTimestamp,
			},
		});

	console.log(
		`[BloomFilter] Saved ${id} snapshot: ${itemCount} items, ${bits} bits, ${hashes} hashes (${buffer.length} bytes) at block ${cursor?.number || "N/A"}`,
	);
}

/**
 * Load a BloomFilter snapshot from the database
 */
export async function loadBloomFilter(
	id: BloomFilterId,
): Promise<BloomFilterSnapshot | null> {
	const snapshot = await db.query.bloomfilterSnapshots.findFirst({
		where: eq(bloomfilterSnapshots.id, id),
	});

	if (!snapshot) {
		console.log(`[BloomFilter] No snapshot found for ${id}`);
		return null;
	}

	// Convert Buffer back to Int32Array
	const buckets = new Int32Array(
		snapshot.buckets.buffer,
		snapshot.buckets.byteOffset,
		snapshot.buckets.byteLength / Int32Array.BYTES_PER_ELEMENT,
	);

	// Create a new BloomFilter with the saved parameters
	const filter = new BloomFilter(snapshot.bits, snapshot.hashes);

	// Restore the internal state
	(filter as any).buckets = buckets;

	// Reconstruct cursor if available
	const cursor: BlockCursor | undefined = snapshot.blockNumber
		? {
				number: snapshot.blockNumber,
				hash: snapshot.blockHash,
				timestamp: snapshot.blockTimestamp,
			}
		: undefined;

	console.log(
		`[BloomFilter] Loaded ${id} snapshot: ~${snapshot.itemCount} items, ${snapshot.bits} bits, ${snapshot.hashes} hashes (${snapshot.buckets.length} bytes, block: ${snapshot.blockNumber || "N/A"}, updated: ${new Date(snapshot.updatedAt).toISOString()})`,
	);

	return {
		filter,
		itemCount: snapshot.itemCount || 0,
		cursor,
	};
}

/**
 * Get metadata about a BloomFilter snapshot without loading the full filter
 */
export async function getBloomFilterMetadata(id: BloomFilterId) {
	return await db.query.bloomfilterSnapshots.findFirst({
		where: eq(bloomfilterSnapshots.id, id),
		columns: {
			id: true,
			bits: true,
			hashes: true,
			itemCount: true,
			updatedAt: true,
			blockNumber: true,
			blockHash: true,
			blockTimestamp: true,
		},
	});
}

/**
 * Delete a BloomFilter snapshot
 */
export async function deleteBloomFilter(id: BloomFilterId) {
	await db.delete(bloomfilterSnapshots).where(eq(bloomfilterSnapshots.id, id));
	console.log(`[BloomFilter] Deleted ${id} snapshot`);
}

// =============================================================================
// XXHash32Set Detector Functions (NEW - Incremental Snapshots)
// =============================================================================

export interface DetectorSnapshot {
	dataSet: Set<number>;  // Main set with all hashes
	unsaved: Set<number>;   // Empty after snapshot, contains new additions
	itemCount: number;
	cursor?: BlockCursor;
}

/**
 * Save a XXHash32Set detector snapshot to the database (INCREMENTAL)
 * Only saves hashes that were added since the last snapshot
 */
export async function saveDetector(
	id: BloomFilterId,
	detector: XXHash32Set,
	itemCount = 0,
	cursor?: BlockCursor,
) {
	// INCREMENTAL: Only save unsaved hashes (tiny vs full set)
	const unsavedHashes = Array.from(detector.getUnsavedSet());
	const allHashCount = detector.size;

	await db
		.insert(detectorSnapshots)
		.values({
			id,
			dataSet: unsavedHashes,  // Only unsaved!
			unsavedCount: unsavedHashes.length,
			itemCount: allHashCount,
			updatedAt: Date.now(),
			blockNumber: cursor?.number,
		})
		.onConflictDoUpdate({
			target: detectorSnapshots.id,
			set: {
				dataSet: unsavedHashes,
				unsavedCount: unsavedHashes.length,
				itemCount: allHashCount,
				updatedAt: Date.now(),
				blockNumber: cursor?.number,
			},
		});

	// Only clear AFTER successful DB write
	detector.clearUnsaved();

	console.log(
		`[Detector] Saved ${id} incremental snapshot: +${unsavedHashes.length} new hashes, ${allHashCount} total (${unsavedHashes.length * 8} bytes) at block ${cursor?.number || "N/A"}`,
	);
}

/**
 * Load a XXHash32Set detector snapshot from the database
 * Merges ALL incremental snapshots chronologically to reconstruct full set
 */
export async function loadDetector(
	id: BloomFilterId,
): Promise<DetectorSnapshot | null> {
	const snapshot = await db.query.detectorSnapshots.findFirst({
		where: eq(detectorSnapshots.id, id),
	});

	if (!snapshot) {
		console.log(`[Detector] No snapshot found for ${id}`);
		return null;
	}

	// Build Set by loading incremental snapshots from oldest to newest
	const allSnapshots = await db.query.detectorSnapshots.findMany({
		where: eq(detectorSnapshots.id, id),
		orderBy: { updatedAt: "asc" },
	});

	const combinedSet = new Set<number>();

	for (const snap of allSnapshots) {
		for (const hash of snap.dataSet) {
			combinedSet.add(hash);
		}
	}

	const cursor: BlockCursor | undefined = snapshot.blockNumber
		? { number: snapshot.blockNumber }
		: undefined;

	console.log(
		`[Detector] Loaded ${id} snapshot: ${combinedSet.size} hashes from ${allSnapshots.length} incremental snapshots (block: ${snapshot.blockNumber || "N/A"}, updated: ${new Date(snapshot.updatedAt).toISOString()})`,
	);

	return {
		dataSet: combinedSet,
		unsaved: new Set(),  // Fresh load = no unsaved
		itemCount: snapshot.itemCount || 0,
		cursor,
	};
}
