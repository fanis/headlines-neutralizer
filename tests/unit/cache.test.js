import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeadlineCache } from '../../src/modules/cache.js';

describe('Cache Operations', () => {
  let cache;
  let mockStorage;
  let mockConfig;
  let mockLog;

  beforeEach(() => {
    mockStorage = {
      get: vi.fn().mockResolvedValue('{}'),
      set: vi.fn().mockResolvedValue(true)
    };

    mockConfig = {
      cacheLimit: 3,
      cacheTrimTo: 2
    };

    mockLog = vi.fn();

    cache = new HeadlineCache(mockStorage, mockConfig, mockLog);
  });

  describe('initialization', () => {
    it('should load cache from storage', async () => {
      const storedData = JSON.stringify({
        'example.com|test': { r: 'cached value', t: Date.now() }
      });
      mockStorage.get.mockResolvedValue(storedData);

      await cache.init('example.com');

      expect(mockStorage.get).toHaveBeenCalledWith('neutralizer_cache_v1', '{}');
      expect(cache.size()).toBe(1);
    });

    it('should handle invalid JSON gracefully', async () => {
      mockStorage.get.mockResolvedValue('invalid json');

      await cache.init('example.com');

      expect(cache.size()).toBe(0);
      expect(mockLog).toHaveBeenCalledWith('cache parse error, resetting');
    });
  });

  describe('cacheGet', () => {
    it('should return cached value if exists', async () => {
      await cache.init('example.com');
      cache.cache['example.com|test headline'] = {
        r: 'neutralized headline',
        t: Date.now()
      };

      const result = cache.get('test headline');

      expect(result).toBe('neutralized headline');
    });

    it('should return null if not cached', async () => {
      await cache.init('example.com');

      const result = cache.get('not cached');

      expect(result).toBeNull();
    });

    it('should update timestamp on access (LRU)', async () => {
      await cache.init('example.com');
      const originalTime = Date.now() - 1000;
      cache.cache['example.com|test'] = {
        r: 'value',
        t: originalTime
      };

      cache.get('test');

      expect(cache.cache['example.com|test'].t).toBeGreaterThan(originalTime);
    });
  });

  describe('cacheSet', () => {
    it('should store value with timestamp', async () => {
      await cache.init('example.com');

      cache.set('original', 'neutralized');

      expect(cache.cache['example.com|original']).toBeDefined();
      expect(cache.cache['example.com|original'].r).toBe('neutralized');
      expect(cache.cache['example.com|original'].t).toBeCloseTo(Date.now(), -2);
    });

    it('should trim cache when limit exceeded', async () => {
      await cache.init('example.com');

      // Add items with different timestamps
      cache.cache['example.com|old1'] = { r: 'v1', t: 1000 };
      cache.cache['example.com|old2'] = { r: 'v2', t: 2000 };
      cache.cache['example.com|old3'] = { r: 'v3', t: 3000 };

      // This should trigger trim
      cache.set('new', 'v4');

      // Wait for microtask to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(cache.size()).toBe(mockConfig.cacheTrimTo);
      expect(cache.cache['example.com|old1']).toBeUndefined();
      expect(cache.cache['example.com|old2']).toBeUndefined();
      expect(cache.cache['example.com|old3']).toBeDefined();
      expect(cache.cache['example.com|new']).toBeDefined();
    });

    it('should debounce storage writes', async () => {
      await cache.init('example.com');

      cache.set('test1', 'value1');
      cache.set('test2', 'value2');
      cache.set('test3', 'value3');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 300));

      // Now it should have persisted
      expect(mockStorage.set).toHaveBeenCalledWith(
        'neutralizer_cache_v1',
        expect.any(String)
      );
    });
  });

  describe('cacheClear', () => {
    it('should empty cache and persist', async () => {
      await cache.init('example.com');
      cache.cache['example.com|test1'] = { r: 'v1', t: 1000 };
      cache.cache['example.com|test2'] = { r: 'v2', t: 2000 };

      await cache.clear();

      expect(cache.size()).toBe(0);
      expect(mockStorage.set).toHaveBeenCalledWith('neutralizer_cache_v1', '{}');
    });
  });

  describe('cacheKey generation', () => {
    it('should include hostname in key', async () => {
      await cache.init('example.com');

      const key = cache.cacheKey('test headline');

      expect(key).toBe('example.com|test headline');
    });

    it('should generate different keys for different hostnames', async () => {
      await cache.init('site1.com');
      const key1 = cache.cacheKey('test');

      cache.hostname = 'site2.com';
      const key2 = cache.cacheKey('test');

      expect(key1).not.toBe(key2);
      expect(key1).toBe('site1.com|test');
      expect(key2).toBe('site2.com|test');
    });
  });
});
