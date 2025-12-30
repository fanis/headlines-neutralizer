/**
 * Cache module for headline neutralization
 * Handles LRU caching with automatic trimming and persistence
 */

export class HeadlineCache {
  constructor(storage, config, log) {
    this.storage = storage;
    this.config = config;
    this.log = log;
    this.cache = {};
    this.dirty = false;
    this.storageKey = 'neutralizer_cache_v1';
    this.hostname = '';
  }

  /**
   * Initialize cache with hostname and load from storage
   */
  async init(hostname) {
    this.hostname = hostname;
    const stored = await this.storage.get(this.storageKey, '{}');
    try {
      this.cache = JSON.parse(stored);
      this.log('cache loaded:', Object.keys(this.cache).length, 'entries');
    } catch (e) {
      this.log('cache parse error, resetting');
      this.cache = {};
    }
  }

  /**
   * Generate cache key from hostname and text
   */
  cacheKey(text) {
    return this.hostname + '|' + text;
  }

  /**
   * Get cached neutralized text
   */
  get(text) {
    const entry = this.cache[this.cacheKey(text)];
    if (!entry) return null;

    // Update timestamp for LRU
    entry.t = Date.now();
    this.dirty = true;

    return entry.r;
  }

  /**
   * Set cached neutralized text with LRU trimming
   */
  set(text, neutralized) {
    this.cache[this.cacheKey(text)] = {
      r: neutralized,
      t: Date.now()
    };
    this.dirty = true;

    const size = Object.keys(this.cache).length;
    if (size > this.config.cacheLimit) {
      // Lazy trim in microtask
      queueMicrotask(() => {
        const keys = Object.keys(this.cache);
        if (keys.length <= this.config.cacheLimit) return;

        // Sort by timestamp (oldest first)
        keys.sort((a, b) => this.cache[a].t - this.cache[b].t);

        // Drop oldest entries
        const toDrop = Math.max(0, keys.length - this.config.cacheTrimTo);
        for (let i = 0; i < toDrop; i++) {
          delete this.cache[keys[i]];
        }

        this.persistCache();
        this.log('cache trimmed:', keys.length, '→', Object.keys(this.cache).length);
      });
    } else if (this.dirty) {
      // Debounced write
      clearTimeout(this._persistTimer);
      this._persistTimer = setTimeout(() => this.persistCache(), 250);
    }
  }

  /**
   * Persist cache to storage
   */
  async persistCache() {
    await this.storage.set(this.storageKey, JSON.stringify(this.cache));
    this.dirty = false;
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    this.cache = {};
    await this.storage.set(this.storageKey, JSON.stringify(this.cache));
  }

  /**
   * Get cache size
   */
  size() {
    return Object.keys(this.cache).length;
  }
}
