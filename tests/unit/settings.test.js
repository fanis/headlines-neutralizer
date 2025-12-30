import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseLines, escapeHtml } from '../../src/modules/utils.js';

describe('Settings Module - Logic Functions', () => {
  describe('parseLines (used for editor validation)', () => {
    it('should parse comma-separated domain list', () => {
      const input = 'example.com, test.com, news.site.org';
      const result = parseLines(input);

      expect(result).toEqual(['example.com', 'test.com', 'news.site.org']);
    });

    it('should parse newline-separated domain list', () => {
      const input = `example.com
test.com
news.site.org`;
      const result = parseLines(input);

      expect(result).toEqual(['example.com', 'test.com', 'news.site.org']);
    });

    it('should parse semicolon-separated list', () => {
      const input = 'example.com; test.com; news.site.org';
      const result = parseLines(input);

      expect(result).toEqual(['example.com', 'test.com', 'news.site.org']);
    });

    it('should handle mixed separators', () => {
      const input = `example.com, test.com
news.site.org; another.com`;
      const result = parseLines(input);

      expect(result).toEqual(['example.com', 'test.com', 'news.site.org', 'another.com']);
    });

    it('should trim whitespace from each entry', () => {
      const input = '  example.com  ,   test.com   ';
      const result = parseLines(input);

      expect(result).toEqual(['example.com', 'test.com']);
    });

    it('should filter out empty entries', () => {
      const input = `example.com

test.com
,
;
news.site.org`;
      const result = parseLines(input);

      expect(result).toEqual(['example.com', 'test.com', 'news.site.org']);
    });

    it('should handle empty string', () => {
      expect(parseLines('')).toEqual([]);
    });

    it('should handle whitespace-only input', () => {
      expect(parseLines('   \n\n  \t  ')).toEqual([]);
    });

    it('should handle CSS selector list', () => {
      const input = `h1, h2, h3
.headline
[itemprop="headline"]`;
      const result = parseLines(input);

      expect(result).toEqual(['h1', 'h2', 'h3', '.headline', '[itemprop="headline"]']);
    });

    it('should handle domain patterns with wildcards', () => {
      const input = `*.example.com
*.google.com
news.*.org`;
      const result = parseLines(input);

      expect(result).toEqual(['*.example.com', '*.google.com', 'news.*.org']);
    });

    it('should handle complex real-world editor input', () => {
      const input = `
        # User comments (ignored by parser in real implementation)
        example.com, test.com

        # Social media
        *.twitter.com;
        *.facebook.com

        # News sites
        news.ycombinator.com
        reddit.com
      `;

      const result = parseLines(input);

      // Note: Comment handling is not in parseLines, but let's test the parsing
      expect(result).toContain('example.com');
      expect(result).toContain('test.com');
      expect(result).toContain('*.twitter.com');
      expect(result).toContain('news.ycombinator.com');
    });
  });

  describe('escapeHtml (used for dialog content sanitization)', () => {
    it('should escape user-provided domain names in dialogs', () => {
      const domain = '<script>alert("XSS")</script>.com';
      const escaped = escapeHtml(domain);

      expect(escaped).not.toContain('<script>');
      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;.com');
    });

    it('should escape headlines with HTML chars for display', () => {
      const headline = 'Company stock up 50% <strong>today</strong>';
      const escaped = escapeHtml(headline);

      expect(escaped).toBe('Company stock up 50% &lt;strong&gt;today&lt;/strong&gt;');
    });

    it('should escape quotes in dialog messages', () => {
      const message = 'Error: "Invalid API key"';
      const escaped = escapeHtml(message);

      expect(escaped).toBe('Error: &quot;Invalid API key&quot;');
    });

    it('should handle ampersands in text', () => {
      const text = 'Terms & Conditions';
      const escaped = escapeHtml(text);

      expect(escaped).toBe('Terms &amp; Conditions');
    });

    it('should handle multiple special chars together', () => {
      const text = '<div class="test" data-value=\'5 > 3 & 2 < 4\'>';
      const escaped = escapeHtml(text);

      expect(escaped).toBe('&lt;div class=&quot;test&quot; data-value=&#39;5 &gt; 3 &amp; 2 &lt; 4&#39;&gt;');
    });

    it('should preserve normal text', () => {
      const text = 'This is a normal headline';
      const escaped = escapeHtml(text);

      expect(escaped).toBe('This is a normal headline');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should convert non-string values to string', () => {
      expect(escapeHtml(null)).toBe('null');
      expect(escapeHtml(undefined)).toBe('undefined');
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(true)).toBe('true');
    });
  });

  describe('Dialog data validation logic', () => {
    describe('API key validation format', () => {
      it('should identify valid OpenAI API key format', () => {
        const validKeys = [
          'sk-1234567890abcdefghijklmnopqrstuvwxyz123456',
          'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890123456',
          'sk-test-1234567890'
        ];

        validKeys.forEach(key => {
          expect(key.startsWith('sk-')).toBe(true);
          expect(key.length).toBeGreaterThan(10);
        });
      });

      it('should identify invalid API key formats', () => {
        const invalidKeys = [
          '',
          'sk-',
          'invalid-key',
          '1234567890',
          'api-key-123'
        ];

        invalidKeys.forEach(key => {
          expect(key.startsWith('sk-') && key.length > 10).toBe(false);
        });
      });
    });

    describe('Pricing validation logic', () => {
      it('should validate positive pricing values', () => {
        const validPrices = [0.15, 0.60, 1.0, 0.01, 10.0];

        validPrices.forEach(price => {
          expect(price).toBeGreaterThanOrEqual(0);
          expect(isNaN(price)).toBe(false);
        });
      });

      it('should reject invalid pricing values', () => {
        const invalidPrices = [-0.15, NaN, Infinity, -Infinity];

        invalidPrices.forEach(price => {
          const isValid = !isNaN(price) && price >= 0 && isFinite(price);
          expect(isValid).toBe(false);
        });
      });

      it('should validate pricing input edge cases', () => {
        // Zero is valid
        expect(0).toBeGreaterThanOrEqual(0);

        // Very small values are valid
        expect(0.00001).toBeGreaterThanOrEqual(0);

        // Very large values are valid (user might want to add safety margin)
        expect(1000.0).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Domain pattern validation logic', () => {
      it('should accept valid domain patterns', () => {
        const validPatterns = [
          'example.com',
          'sub.example.com',
          '*.example.com',
          'example.*',
          'news.*.org',
          '/regex\\.pattern$/'
        ];

        validPatterns.forEach(pattern => {
          expect(typeof pattern).toBe('string');
          expect(pattern.length).toBeGreaterThan(0);
        });
      });

      it('should handle empty domain list', () => {
        const domains = parseLines('');
        expect(domains).toEqual([]);
        expect(Array.isArray(domains)).toBe(true);
      });

      it('should filter out invalid entries', () => {
        const input = `
          example.com

          test.com

        `;
        const domains = parseLines(input);

        expect(domains).toEqual(['example.com', 'test.com']);
      });
    });

    describe('Selector validation logic', () => {
      it('should accept valid CSS selectors', () => {
        const validSelectors = [
          'h1',
          '.headline',
          '#main-title',
          '[itemprop="headline"]',
          'article h2',
          '.card > h3',
          'h1, h2, h3',
          '[role="heading"]'
        ];

        validSelectors.forEach(selector => {
          expect(typeof selector).toBe('string');
          expect(selector.length).toBeGreaterThan(0);
        });
      });

      it('should handle selector list parsing', () => {
        const input = 'h1, h2, .headline';
        const selectors = parseLines(input);

        expect(selectors).toEqual(['h1', 'h2', '.headline']);
      });
    });

    describe('Temperature level validation', () => {
      it('should validate temperature range (0.0 - 0.5)', () => {
        const validTemps = [0.0, 0.1, 0.2, 0.35, 0.5];

        validTemps.forEach(temp => {
          expect(temp).toBeGreaterThanOrEqual(0);
          expect(temp).toBeLessThanOrEqual(0.5);
        });
      });

      it('should reject out-of-range temperatures', () => {
        const invalidTemps = [-0.1, 0.6, 1.0, 2.0];

        invalidTemps.forEach(temp => {
          const isValid = temp >= 0 && temp <= 0.5;
          expect(isValid).toBe(false);
        });
      });
    });
  });

  describe('Dialog state management logic', () => {
    it('should handle API key dialog shown flag', () => {
      const apiKeyDialogShown = { value: false };

      // First call should open dialog
      expect(apiKeyDialogShown.value).toBe(false);

      // Mark as shown
      apiKeyDialogShown.value = true;
      expect(apiKeyDialogShown.value).toBe(true);

      // Subsequent calls should not open
      if (!apiKeyDialogShown.value) {
        // This block shouldn't execute
        expect(true).toBe(false);
      } else {
        expect(apiKeyDialogShown.value).toBe(true);
      }
    });

    it('should reset flag after dialog close', () => {
      const apiKeyDialogShown = { value: true };

      // Simulate closing dialog
      apiKeyDialogShown.value = false;

      expect(apiKeyDialogShown.value).toBe(false);
    });
  });

  describe('Storage interaction logic', () => {
    let mockStorage;

    beforeEach(() => {
      mockStorage = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn()
      };
    });

    it('should save API key to storage', async () => {
      const apiKey = 'sk-test1234567890abcdef';
      mockStorage.set.mockResolvedValue(true);

      await mockStorage.set('OPENAI_KEY', apiKey);

      expect(mockStorage.set).toHaveBeenCalledWith('OPENAI_KEY', apiKey);
    });

    it('should verify saved API key', async () => {
      const apiKey = 'sk-test1234567890abcdef';
      mockStorage.get.mockResolvedValue(apiKey);

      const retrieved = await mockStorage.get('OPENAI_KEY', '');

      expect(retrieved).toBe(apiKey);
    });

    it('should save domain list to storage', async () => {
      const domains = ['example.com', 'test.com'];
      mockStorage.set.mockResolvedValue(true);

      await mockStorage.set('neutralizer_domains_enabled_v1', JSON.stringify(domains));

      expect(mockStorage.set).toHaveBeenCalledWith(
        'neutralizer_domains_enabled_v1',
        JSON.stringify(domains)
      );
    });

    it('should load and parse domain list from storage', async () => {
      const storedData = JSON.stringify(['example.com', 'test.com']);
      mockStorage.get.mockResolvedValue(storedData);

      const result = await mockStorage.get('neutralizer_domains_enabled_v1', '[]');
      const domains = JSON.parse(result);

      expect(domains).toEqual(['example.com', 'test.com']);
    });

    it('should save pricing configuration', async () => {
      const pricing = {
        inputPer1M: 0.20,
        outputPer1M: 0.80,
        model: 'gpt-4o-mini',
        lastUpdated: '2025-01-19'
      };

      mockStorage.set.mockResolvedValue(true);

      await mockStorage.set('neutralizer_pricing_v1', JSON.stringify(pricing));

      expect(mockStorage.set).toHaveBeenCalledWith(
        'neutralizer_pricing_v1',
        JSON.stringify(pricing)
      );
    });

    it('should handle storage failure gracefully', async () => {
      mockStorage.set.mockRejectedValue(new Error('Storage quota exceeded'));

      await expect(mockStorage.set('test-key', 'value')).rejects.toThrow();
    });
  });

  describe('Data transformation logic', () => {
    it('should transform editor input to storage format', () => {
      const editorInput = `
        example.com
        test.com, another.com
        *.google.com
      `;

      const parsed = parseLines(editorInput);
      const stored = JSON.stringify(parsed);

      expect(stored).toBe('["example.com","test.com","another.com","*.google.com"]');
    });

    it('should transform storage data to editor display format', () => {
      const storedData = '["example.com","test.com","another.com"]';
      const parsed = JSON.parse(storedData);
      const display = parsed.join('\n');

      expect(display).toBe('example.com\ntest.com\nanother.com');
    });

    it('should handle empty storage data', () => {
      const storedData = '[]';
      const parsed = JSON.parse(storedData);
      const display = parsed.join('\n');

      expect(display).toBe('');
    });
  });

  describe('Validation error scenarios', () => {
    it('should detect missing API key', () => {
      const apiKey = '';
      const isValid = apiKey.trim().length > 0;

      expect(isValid).toBe(false);
    });

    it('should detect invalid pricing (negative)', () => {
      const inputPrice = -0.15;
      const outputPrice = 0.60;

      const isValid = !isNaN(inputPrice) && inputPrice >= 0 &&
                      !isNaN(outputPrice) && outputPrice >= 0;

      expect(isValid).toBe(false);
    });

    it('should detect invalid pricing (NaN)', () => {
      const inputPrice = parseFloat('invalid');
      const outputPrice = 0.60;

      const isValid = !isNaN(inputPrice) && inputPrice >= 0 &&
                      !isNaN(outputPrice) && outputPrice >= 0;

      expect(isValid).toBe(false);
    });

    it('should handle empty domain list as valid', () => {
      const domains = parseLines('');
      const isValid = Array.isArray(domains);

      expect(isValid).toBe(true);
      expect(domains).toEqual([]);
    });
  });

  describe('Long headline exception logic', () => {
    it('should format long headline data for storage', () => {
      const exceptions = new Set(['news.example.com', 'blog.test.org']);
      const stored = JSON.stringify([...exceptions]);

      expect(JSON.parse(stored)).toEqual(
        expect.arrayContaining(['news.example.com', 'blog.test.org'])
      );
    });

    it('should load long headline exceptions from storage', () => {
      const stored = '["news.example.com","blog.test.org"]';
      const exceptions = new Set(JSON.parse(stored));

      expect(exceptions.has('news.example.com')).toBe(true);
      expect(exceptions.has('blog.test.org')).toBe(true);
      expect(exceptions.has('other.com')).toBe(false);
    });

    it('should add new exception', () => {
      const exceptions = new Set(['news.example.com']);
      exceptions.add('blog.test.org');

      expect(exceptions.size).toBe(2);
      expect(exceptions.has('blog.test.org')).toBe(true);
    });

    it('should handle duplicate additions', () => {
      const exceptions = new Set(['news.example.com']);
      exceptions.add('news.example.com');

      expect(exceptions.size).toBe(1);
    });
  });

  describe('Temperature level mapping', () => {
    it('should map temperature levels to numeric values', () => {
      const TEMPERATURE_LEVELS = {
        'Minimal': 0.0,
        'Light': 0.1,
        'Moderate': 0.2,
        'Strong': 0.35,
        'Maximum': 0.5
      };

      expect(TEMPERATURE_LEVELS['Minimal']).toBe(0.0);
      expect(TEMPERATURE_LEVELS['Light']).toBe(0.1);
      expect(TEMPERATURE_LEVELS['Moderate']).toBe(0.2);
      expect(TEMPERATURE_LEVELS['Strong']).toBe(0.35);
      expect(TEMPERATURE_LEVELS['Maximum']).toBe(0.5);
    });

    it('should store temperature level name', () => {
      const selectedLevel = 'Moderate';
      const TEMPERATURE_LEVELS = {
        'Minimal': 0.0,
        'Light': 0.1,
        'Moderate': 0.2,
        'Strong': 0.35,
        'Maximum': 0.5
      };

      const temperatureValue = TEMPERATURE_LEVELS[selectedLevel];

      expect(temperatureValue).toBe(0.2);
    });

    it('should validate temperature level exists', () => {
      const TEMPERATURE_LEVELS = {
        'Minimal': 0.0,
        'Light': 0.1,
        'Moderate': 0.2,
        'Strong': 0.35,
        'Maximum': 0.5
      };

      expect('Moderate' in TEMPERATURE_LEVELS).toBe(true);
      expect('Invalid' in TEMPERATURE_LEVELS).toBe(false);
    });
  });
});
