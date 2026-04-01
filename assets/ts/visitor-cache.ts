/**
 * Visitor Count Cache Utility
 * Manages localStorage caching with TTL for visitor counts
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

export class VisitorCountCache {
    // Cache durations
    private static readonly TOTAL_TTL = 20 * 60 * 1000;      // 20 minutes for total count
    private static readonly ARTICLE_TTL = 10 * 60 * 1000;    // 10 minutes for article counts

    // Cache key prefixes
    private static readonly TOTAL_KEY = 'visitor-count-total';
    private static readonly ARTICLE_PREFIX = 'visitor-count-article-';
    private static readonly CLEANUP_KEY = 'visitor-cache-last-cleanup';
    private static readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // Cleanup every hour

    /**
     * Get cached total visitor count
     */
    static getTotal(): number | null {
        return this.get<number>(this.TOTAL_KEY);
    }

    /**
     * Set total visitor count in cache
     */
    static setTotal(count: number): void {
        this.set(this.TOTAL_KEY, count, this.TOTAL_TTL);
    }

    /**
     * Get cached article-specific visitor count
     */
    static getArticle(slug: string): number | null {
        return this.get<number>(this.ARTICLE_PREFIX + slug);
    }

    /**
     * Set article-specific visitor count in cache
     */
    static setArticle(slug: string, count: number): void {
        this.set(this.ARTICLE_PREFIX + slug, count, this.ARTICLE_TTL);
    }

    /**
     * Generic get from cache with TTL check
     */
    private static get<T>(key: string): T | null {
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;

            const entry: CacheEntry<T> = JSON.parse(item);
            const now = Date.now();

            // Check if expired
            if (now - entry.timestamp > entry.ttl) {
                localStorage.removeItem(key);
                return null;
            }

            return entry.data;
        } catch (error) {
            console.warn('[Cache] Failed to get item:', key, error);
            return null;
        }
    }

    /**
     * Generic set to cache with TTL
     */
    private static set<T>(key: string, data: T, ttl: number): void {
        try {
            const entry: CacheEntry<T> = {
                data,
                timestamp: Date.now(),
                ttl
            };
            localStorage.setItem(key, JSON.stringify(entry));

            // Trigger cleanup if needed
            this.maybeCleanup();
        } catch (error) {
            console.warn('[Cache] Failed to set item:', key, error);
        }
    }

    /**
     * Clean up expired cache entries
     */
    static cleanup(): void {
        try {
            const keysToRemove: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith('visitor-count-')) continue;

                const item = localStorage.getItem(key);
                if (!item) continue;

                try {
                    const entry: CacheEntry<any> = JSON.parse(item);
                    const now = Date.now();

                    // Mark expired entries for removal
                    if (now - entry.timestamp > entry.ttl) {
                        keysToRemove.push(key);
                    }
                } catch {
                    // Invalid entry, mark for removal
                    keysToRemove.push(key);
                }
            }

            // Remove expired entries
            keysToRemove.forEach(key => localStorage.removeItem(key));


            // Update last cleanup timestamp
            localStorage.setItem(this.CLEANUP_KEY, Date.now().toString());
        } catch (error) {
            console.warn('[Cache] Cleanup failed:', error);
        }
    }

    /**
     * Maybe trigger cleanup (throttled to once per hour)
     */
    private static maybeCleanup(): void {
        try {
            const lastCleanup = localStorage.getItem(this.CLEANUP_KEY);
            const now = Date.now();

            if (!lastCleanup || now - parseInt(lastCleanup) > this.CLEANUP_INTERVAL) {
                this.cleanup();
            }
        } catch (error) {
            console.warn('[Cache] Failed to check cleanup:', error);
        }
    }

    /**
     * Clear all visitor count cache
     */
    static clear(): void {
        try {
            const keysToRemove: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('visitor-count-')) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
            console.warn('[Cache] Failed to clear cache:', error);
        }
    }
}
