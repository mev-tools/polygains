import type { BlockCursor } from "@subsquid/pipes";
import type { BloomFilter } from "bloomfilter";

export type BloomFilterId = "insider" | "notinsider";

export interface BloomFilterSnapshot {
	filter: BloomFilter;
	itemCount: number;
	cursor?: BlockCursor;
}

export interface DetectorSnapshot {
	dataSet: Set<number>; // Main set with all hashes
	unsaved: Set<number>; // Empty after snapshot, contains new additions
	itemCount: number;
	cursor?: BlockCursor;
}
