import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage } from '../../src/modules/storage.js';

describe('Storage Class', () => {
  let storage;
  let mockGM;
  let mockGM_legacy;
  let mockLocalStorage;

  beforeEach(() => {
    storage = new Storage();

    // Mock GM (async)
    mockGM = {
      getValue: vi.fn(),
      setValue: vi.fn(),
      deleteValue: vi.fn()
    };

    // Mock GM_* (legacy sync)
    mockGM_legacy = {
      getValue: vi.fn(),
      setValue: vi.fn(),
      deleteValue: vi.fn()
    };

    // Mock localStorage
    mockLocalStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn()
    };

    global.GM = mockGM;
    global.GM_getValue = mockGM_legacy.getValue;
    global.GM_setValue = mockGM_legacy.setValue;
    global.GM_deleteValue = mockGM_legacy.deleteValue;
    global.localStorage = mockLocalStorage;
  });

  afterEach(() => {
    delete global.GM;
    delete global.GM_getValue;
    delete global.GM_setValue;
    delete global.GM_deleteValue;
    delete global.localStorage;
  });

  describe('get', () => {
    it('should retrieve value from GM.getValue (async)', async () => {
      mockGM.getValue.mockResolvedValue('test-value');

      const result = await storage.get('test-key');

      expect(result).toBe('test-value');
      expect(mockGM.getValue).toHaveBeenCalledWith('test-key');
    });

    it('should fallback to GM_getValue when GM.getValue fails', async () => {
      mockGM.getValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.getValue.mockReturnValue('legacy-value');

      const result = await storage.get('test-key');

      expect(result).toBe('legacy-value');
      expect(mockGM_legacy.getValue).toHaveBeenCalledWith('test-key');
    });

    it('should fallback to localStorage when GM functions fail', async () => {
      mockGM.getValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.getValue.mockImplementation(() => {
        throw new Error('GM_getValue not available');
      });

      const storageData = JSON.stringify({ 'test-key': 'local-value' });
      mockLocalStorage.getItem.mockReturnValue(storageData);

      const result = await storage.get('test-key');

      expect(result).toBe('local-value');
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('__neutralizer__');
    });

    it('should fallback to memory when all storage fails', async () => {
      mockGM.getValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.getValue.mockImplementation(() => {
        throw new Error('GM_getValue not available');
      });
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      // Set value in memory first
      storage.memory.set('test-key', 'memory-value');

      const result = await storage.get('test-key');

      expect(result).toBe('memory-value');
    });

    it('should return default value when key not found', async () => {
      mockGM.getValue.mockResolvedValue(null);

      const result = await storage.get('non-existent', 'default-value');

      expect(result).toBe('default-value');
    });

    it('should handle empty string as valid value', async () => {
      mockGM.getValue.mockResolvedValue('');

      const result = await storage.get('test-key', 'default');

      // Empty string is NOT null, so it should be returned
      expect(result).toBe('');
    });

    it('should handle undefined GM object', async () => {
      delete global.GM;
      mockGM_legacy.getValue.mockReturnValue('legacy-value');

      const result = await storage.get('test-key');

      expect(result).toBe('legacy-value');
    });

    it('should handle localStorage with corrupted JSON', async () => {
      mockGM.getValue.mockResolvedValue(null);
      mockGM_legacy.getValue.mockReturnValue(null);
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const result = await storage.get('test-key', 'default');

      expect(result).toBe('default');
    });

    it('should handle localStorage with empty namespace', async () => {
      mockGM.getValue.mockResolvedValue(null);
      mockGM_legacy.getValue.mockReturnValue(null);
      mockLocalStorage.getItem.mockReturnValue('{}');

      const result = await storage.get('test-key', 'default');

      expect(result).toBe('default');
    });

    it('should prefer GM.getValue over other methods', async () => {
      mockGM.getValue.mockResolvedValue('gm-value');
      mockGM_legacy.getValue.mockReturnValue('legacy-value');
      mockLocalStorage.getItem.mockReturnValue('{"test-key": "local-value"}');

      const result = await storage.get('test-key');

      expect(result).toBe('gm-value');
      expect(mockGM_legacy.getValue).not.toHaveBeenCalled();
      expect(mockLocalStorage.getItem).not.toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should set value using GM.setValue (async)', async () => {
      mockGM.setValue.mockResolvedValue(undefined);

      const result = await storage.set('test-key', 'test-value');

      expect(result).toBe(true);
      expect(mockGM.setValue).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should fallback to GM_setValue when GM.setValue fails', async () => {
      mockGM.setValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.setValue.mockReturnValue(undefined);

      const result = await storage.set('test-key', 'test-value');

      expect(result).toBe(true);
      expect(mockGM_legacy.setValue).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should fallback to localStorage when GM functions fail', async () => {
      mockGM.setValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.setValue.mockImplementation(() => {
        throw new Error('GM_setValue not available');
      });
      mockLocalStorage.getItem.mockReturnValue('{}');
      mockLocalStorage.setItem.mockReturnValue(undefined);

      const result = await storage.set('test-key', 'test-value');

      expect(result).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        '__neutralizer__',
        JSON.stringify({ 'test-key': 'test-value' })
      );
    });

    it('should merge with existing localStorage data', async () => {
      mockGM.setValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.setValue.mockImplementation(() => {
        throw new Error('GM_setValue not available');
      });

      const existingData = JSON.stringify({ 'existing-key': 'existing-value' });
      mockLocalStorage.getItem.mockReturnValue(existingData);

      await storage.set('new-key', 'new-value');

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        '__neutralizer__',
        JSON.stringify({
          'existing-key': 'existing-value',
          'new-key': 'new-value'
        })
      );
    });

    it('should fallback to memory when all storage fails', async () => {
      mockGM.setValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.setValue.mockImplementation(() => {
        throw new Error('GM_setValue not available');
      });
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const result = await storage.set('test-key', 'test-value');

      expect(result).toBe(false); // Returns false for memory fallback
      expect(storage.memory.get('test-key')).toBe('test-value');
    });

    it('should handle undefined GM object', async () => {
      delete global.GM;
      mockGM_legacy.setValue.mockReturnValue(undefined);

      const result = await storage.set('test-key', 'test-value');

      expect(result).toBe(true);
      expect(mockGM_legacy.setValue).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should handle complex values', async () => {
      mockGM.setValue.mockResolvedValue(undefined);

      const complexValue = { nested: { data: [1, 2, 3] } };
      await storage.set('complex-key', JSON.stringify(complexValue));

      expect(mockGM.setValue).toHaveBeenCalledWith('complex-key', JSON.stringify(complexValue));
    });

    it('should prefer GM.setValue over other methods', async () => {
      mockGM.setValue.mockResolvedValue(undefined);
      mockGM_legacy.setValue.mockReturnValue(undefined);

      await storage.set('test-key', 'test-value');

      expect(mockGM.setValue).toHaveBeenCalled();
      expect(mockGM_legacy.setValue).not.toHaveBeenCalled();
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete value using GM.deleteValue (async)', async () => {
      mockGM.deleteValue.mockResolvedValue(undefined);

      const result = await storage.delete('test-key');

      expect(result).toBe(true);
      expect(mockGM.deleteValue).toHaveBeenCalledWith('test-key');
    });

    it('should fallback to GM_deleteValue when GM.deleteValue fails', async () => {
      mockGM.deleteValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.deleteValue.mockReturnValue(undefined);

      const result = await storage.delete('test-key');

      expect(result).toBe(true);
      expect(mockGM_legacy.deleteValue).toHaveBeenCalledWith('test-key');
    });

    it('should fallback to localStorage when GM functions fail', async () => {
      mockGM.deleteValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.deleteValue.mockImplementation(() => {
        throw new Error('GM_deleteValue not available');
      });

      const storageData = JSON.stringify({ 'test-key': 'value', 'other-key': 'other' });
      mockLocalStorage.getItem.mockReturnValue(storageData);

      const result = await storage.delete('test-key');

      expect(result).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        '__neutralizer__',
        JSON.stringify({ 'other-key': 'other' })
      );
    });

    it('should handle deleting non-existent key from localStorage', async () => {
      mockGM.deleteValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.deleteValue.mockImplementation(() => {
        throw new Error('GM_deleteValue not available');
      });

      mockLocalStorage.getItem.mockReturnValue('{"other-key": "other"}');

      const result = await storage.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should always delete from memory', async () => {
      mockGM.deleteValue.mockResolvedValue(undefined);
      storage.memory.set('test-key', 'value');

      await storage.delete('test-key');

      expect(storage.memory.has('test-key')).toBe(false);
    });

    it('should delete from memory even when other methods fail', async () => {
      mockGM.deleteValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.deleteValue.mockImplementation(() => {
        throw new Error('GM_deleteValue not available');
      });
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      storage.memory.set('test-key', 'value');

      await storage.delete('test-key');

      expect(storage.memory.has('test-key')).toBe(false);
    });

    it('should handle undefined GM object', async () => {
      delete global.GM;
      mockGM_legacy.deleteValue.mockReturnValue(undefined);

      const result = await storage.delete('test-key');

      expect(result).toBe(true);
      expect(mockGM_legacy.deleteValue).toHaveBeenCalledWith('test-key');
    });

    it('should handle corrupted localStorage during delete', async () => {
      mockGM.deleteValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.deleteValue.mockImplementation(() => {
        throw new Error('GM_deleteValue not available');
      });
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const result = await storage.delete('test-key');

      expect(result).toBe(false);
    });
  });

  describe('storage fallback chain', () => {
    it('should try all storage methods in order (get)', async () => {
      const callOrder = [];

      mockGM.getValue.mockImplementation(() => {
        callOrder.push('GM.getValue');
        return Promise.reject(new Error('Not available'));
      });

      mockGM_legacy.getValue.mockImplementation(() => {
        callOrder.push('GM_getValue');
        throw new Error('Not available');
      });

      mockLocalStorage.getItem.mockImplementation(() => {
        callOrder.push('localStorage');
        throw new Error('Not available');
      });

      storage.memory.set('test-key', 'memory-value');

      await storage.get('test-key');

      expect(callOrder).toEqual(['GM.getValue', 'GM_getValue', 'localStorage']);
    });

    it('should try all storage methods in order (set)', async () => {
      const callOrder = [];

      mockGM.setValue.mockImplementation(() => {
        callOrder.push('GM.setValue');
        return Promise.reject(new Error('Not available'));
      });

      mockGM_legacy.setValue.mockImplementation(() => {
        callOrder.push('GM_setValue');
        throw new Error('Not available');
      });

      mockLocalStorage.setItem.mockImplementation(() => {
        callOrder.push('localStorage');
        throw new Error('Not available');
      });

      await storage.set('test-key', 'test-value');

      expect(callOrder).toEqual(['GM.setValue', 'GM_setValue', 'localStorage']);
      expect(storage.memory.get('test-key')).toBe('test-value');
    });
  });

  describe('namespace isolation', () => {
    it('should use correct namespace for localStorage', async () => {
      mockGM.setValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.setValue.mockImplementation(() => {
        throw new Error('GM_setValue not available');
      });

      mockLocalStorage.getItem.mockReturnValue('{}');

      await storage.set('test-key', 'test-value');

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('__neutralizer__');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        '__neutralizer__',
        expect.any(String)
      );
    });

    it('should allow changing namespace', async () => {
      storage.namespace = '__custom__';

      mockGM.setValue.mockRejectedValue(new Error('GM not available'));
      mockGM_legacy.setValue.mockImplementation(() => {
        throw new Error('GM_setValue not available');
      });
      mockLocalStorage.getItem.mockReturnValue('{}');

      await storage.set('test-key', 'test-value');

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('__custom__');
    });
  });

  describe('edge cases', () => {
    it('should handle null values', async () => {
      mockGM.setValue.mockResolvedValue(undefined);

      await storage.set('test-key', null);

      expect(mockGM.setValue).toHaveBeenCalledWith('test-key', null);
    });

    it('should handle undefined values', async () => {
      mockGM.setValue.mockResolvedValue(undefined);

      await storage.set('test-key', undefined);

      expect(mockGM.setValue).toHaveBeenCalledWith('test-key', undefined);
    });

    it('should handle numeric values', async () => {
      mockGM.setValue.mockResolvedValue(undefined);

      await storage.set('test-key', 42);

      expect(mockGM.setValue).toHaveBeenCalledWith('test-key', 42);
    });

    it('should handle boolean values', async () => {
      mockGM.setValue.mockResolvedValue(undefined);

      await storage.set('test-key', true);

      expect(mockGM.setValue).toHaveBeenCalledWith('test-key', true);
    });

    it('should handle very long strings', async () => {
      mockGM.setValue.mockResolvedValue(undefined);

      const longString = 'a'.repeat(10000);
      await storage.set('test-key', longString);

      expect(mockGM.setValue).toHaveBeenCalledWith('test-key', longString);
    });
  });
});
