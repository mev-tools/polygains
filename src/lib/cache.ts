/**
 * Global cache management system
 * 
 * Cache is invalidated only when:
 * 1. Batch updates occur in the pipeline
 * 2. PostgreSQL is updated through database writes
 * 
 * Uses a global generation counter that increments on data mutations.
 * Cache entries store the generation at creation time and are considered
 * stale when their generation differs from current.
 */

interface CacheEntry<T> {
	value: T;
	generation: number;
	createdAt: number;
}

interface CacheStats {
	hits: number;
	misses: number;
	invalidations: number;
}

// Global cache state - shared across all cache instances
const globalCacheState = {
	generation: 0,
	stats: {
		hits: 0,
		misses: 0,
		invalidations: 0,
	},
};

/**
 * Get current cache generation
 */
export function getCacheGeneration(): number {
	return globalCacheState.generation;
}

/**
 * Increment cache generation - invalidates all caches globally
 * Call this after batch updates or database writes
 */
export function invalidateCache(): void {
	globalCacheState.generation++;
	globalCacheState.stats.invalidations++;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
	return { ...globalCacheState.stats };
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
	globalCacheState.stats = { hits: 0, misses: 0, invalidations: 0 };
}

/**
 * Simple in-memory cache with generation-based invalidation
 */
export class Cache<T> {
	private cache = new Map<string, CacheEntry<T>>();
	private defaultTTLMs: number;

	constructor(defaultTTLMs: number = 30_000) {
		this.defaultTTLMs = defaultTTLMs;
	}

	/**
	 * Get value from cache
	 */
	get(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			globalCacheState.stats.misses++;
			return undefined;
		}

		// Check if entry is stale (generation mismatch or TTL expired)
		const currentGen = globalCacheState.generation;
		const isExpired = Date.now() - entry.createdAt > this.defaultTTLMs;
		const isStale = entry.generation !== currentGen;

		if (isExpired || isStale) {
			this.cache.delete(key);
			globalCacheState.stats.misses++;
			return undefined;
		}

		globalCacheState.stats.hits++;
		return entry.value;
	}

	/**
	 * Set value in cache
	 */
	set(key: string, value: T): void {
		this.cache.set(key, {
			value,
			generation: globalCacheState.generation,
			createdAt: Date.now(),
		});
	}

	/**
	 * Delete specific key from cache
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Clear all entries from this cache instance
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get cache size
	 */
	size(): number {
		return this.cache.size;
	}

	/**
	 * Clean up expired entries
	 */
	cleanup(): number {
		const currentGen = globalCacheState.generation;
		const now = Date.now();
		let cleaned = 0;

		for (const [key, entry] of this.cache) {
			const isExpired = now - entry.createdAt > this.defaultTTLMs;
			const isStale = entry.generation !== currentGen;
			if (isExpired || isStale) {
				this.cache.delete(key);
				cleaned++;
			}
		}

		return cleaned;
	}
}

/**
 * Memoize a function with automatic cache invalidation
 */
export function memoize<TArgs extends unknown[], TReturn>(
	fn: (...args: TArgs) => Promise<TReturn>,
	keyFn: (...args: TArgs) => string,
	ttlMs: number = 30_000,
): { (...args: TArgs): Promise<TReturn>; cache: Cache<TReturn> } {
	const cache = new Cache<TReturn>(ttlMs);

	const memoized = async (...args: TArgs): Promise<TReturn> => {
		const key = keyFn(...args);
		const cached = cache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		const result = await fn(...args);
		cache.set(key, result);
		return result;
	};

	return Object.assign(memoized, { cache });
}
