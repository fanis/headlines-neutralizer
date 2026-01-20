import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  API_TOKENS,
  PRICING,
  initApiTracking,
  updateApiTokens,
  resetApiTokens,
  calculateApiCost,
  updatePricing,
  resetPricingToDefaults,
  apiHeaders,
  xhrPost,
  xhrGet,
  extractOutputText,
  rewriteBatch
} from '../../src/modules/api.js';

describe('API Integration', () => {
  let mockStorage;
  let mockGM_xmlhttpRequest;

  beforeEach(() => {
    mockStorage = {
      get: vi.fn().mockResolvedValue(''),
      set: vi.fn().mockResolvedValue(true)
    };

    // Mock GM_xmlhttpRequest
    mockGM_xmlhttpRequest = vi.fn();
    global.GM_xmlhttpRequest = mockGM_xmlhttpRequest;

    // Clear timers
    vi.clearAllTimers();
  });

  afterEach(() => {
    delete global.GM_xmlhttpRequest;
    delete global.GM;
    vi.restoreAllMocks();
  });

  describe('initApiTracking', () => {
    it('should initialize with default values when storage is empty', async () => {
      mockStorage.get.mockResolvedValue('');

      await initApiTracking(mockStorage);

      expect(mockStorage.get).toHaveBeenCalledWith('neutralizer_api_tokens_v1', '');
      expect(mockStorage.get).toHaveBeenCalledWith('neutralizer_pricing_v1', '');
    });

    it('should load API tokens from storage', async () => {
      const storedTokens = JSON.stringify({
        headlines: { input: 1000, output: 500, calls: 5 }
      });
      mockStorage.get.mockImplementation((key) => {
        if (key === 'neutralizer_api_tokens_v1') return Promise.resolve(storedTokens);
        return Promise.resolve('');
      });

      await initApiTracking(mockStorage);

      expect(API_TOKENS.headlines.input).toBe(1000);
      expect(API_TOKENS.headlines.output).toBe(500);
      expect(API_TOKENS.headlines.calls).toBe(5);
    });

    it('should load pricing from storage', async () => {
      const storedPricing = JSON.stringify({
        model: 'gpt-4o-mini',
        inputPer1M: 0.20,
        outputPer1M: 0.80,
        lastUpdated: '2025-01-01'
      });
      mockStorage.get.mockImplementation((key) => {
        if (key === 'neutralizer_pricing_v1') return Promise.resolve(storedPricing);
        return Promise.resolve('');
      });

      await initApiTracking(mockStorage);

      expect(PRICING.inputPer1M).toBe(0.20);
      expect(PRICING.outputPer1M).toBe(0.80);
    });

    it('should handle corrupted JSON gracefully', async () => {
      mockStorage.get.mockResolvedValue('invalid json');

      await expect(initApiTracking(mockStorage)).resolves.not.toThrow();
    });
  });

  describe('updateApiTokens', () => {
    beforeEach(() => {
      // Reset API_TOKENS to known state
      API_TOKENS.headlines = { input: 0, output: 0, calls: 0 };
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should update token counts with OpenAI format (completion_tokens)', () => {
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50
      };

      updateApiTokens(mockStorage, 'headlines', usage);

      expect(API_TOKENS.headlines.input).toBe(100);
      expect(API_TOKENS.headlines.output).toBe(50);
      expect(API_TOKENS.headlines.calls).toBe(1);
    });

    it('should update token counts with Anthropic format (input_tokens)', () => {
      const usage = {
        input_tokens: 200,
        output_tokens: 100
      };

      updateApiTokens(mockStorage, 'headlines', usage);

      expect(API_TOKENS.headlines.input).toBe(200);
      expect(API_TOKENS.headlines.output).toBe(100);
      expect(API_TOKENS.headlines.calls).toBe(1);
    });

    it('should accumulate token counts across multiple calls', () => {
      updateApiTokens(mockStorage, 'headlines', { input_tokens: 100, output_tokens: 50 });
      updateApiTokens(mockStorage, 'headlines', { input_tokens: 200, output_tokens: 75 });

      expect(API_TOKENS.headlines.input).toBe(300);
      expect(API_TOKENS.headlines.output).toBe(125);
      expect(API_TOKENS.headlines.calls).toBe(2);
    });

    it('should handle missing usage object', () => {
      updateApiTokens(mockStorage, 'headlines', null);

      expect(API_TOKENS.headlines.input).toBe(0);
      expect(API_TOKENS.headlines.output).toBe(0);
      expect(API_TOKENS.headlines.calls).toBe(0);
    });

    it('should handle usage object with zero tokens', () => {
      updateApiTokens(mockStorage, 'headlines', { input_tokens: 0, output_tokens: 0 });

      expect(API_TOKENS.headlines.input).toBe(0);
      expect(API_TOKENS.headlines.output).toBe(0);
      expect(API_TOKENS.headlines.calls).toBe(0);
    });

    it('should debounce storage writes', async () => {
      updateApiTokens(mockStorage, 'headlines', { input_tokens: 100, output_tokens: 50 });
      updateApiTokens(mockStorage, 'headlines', { input_tokens: 200, output_tokens: 75 });

      // Should not save yet
      expect(mockStorage.set).not.toHaveBeenCalled();

      // Advance timer
      vi.advanceTimersByTime(1000);

      // Now it should save once
      expect(mockStorage.set).toHaveBeenCalledTimes(1);
      expect(mockStorage.set).toHaveBeenCalledWith(
        'neutralizer_api_tokens_v1',
        expect.stringContaining('"input":300')
      );
    });
  });

  describe('resetApiTokens', () => {
    it('should reset all token counts to zero', async () => {
      API_TOKENS.headlines = { input: 1000, output: 500, calls: 10 };

      await resetApiTokens(mockStorage);

      expect(API_TOKENS.headlines.input).toBe(0);
      expect(API_TOKENS.headlines.output).toBe(0);
      expect(API_TOKENS.headlines.calls).toBe(0);
    });

    it('should persist reset to storage', async () => {
      await resetApiTokens(mockStorage);

      expect(mockStorage.set).toHaveBeenCalledWith(
        'neutralizer_api_tokens_v1',
        JSON.stringify({ headlines: { input: 0, output: 0, calls: 0 } })
      );
    });
  });

  describe('calculateApiCost', () => {
    it('should calculate cost correctly', () => {
      API_TOKENS.headlines = { input: 1_000_000, output: 500_000, calls: 10 };
      PRICING.inputPer1M = 0.15;
      PRICING.outputPer1M = 0.60;

      const cost = calculateApiCost();

      expect(cost).toBeCloseTo(0.45, 2); // (1M * 0.15 / 1M) + (500k * 0.60 / 1M)
    });

    it('should handle zero tokens', () => {
      API_TOKENS.headlines = { input: 0, output: 0, calls: 0 };

      const cost = calculateApiCost();

      expect(cost).toBe(0);
    });

    it('should handle fractional token counts', () => {
      API_TOKENS.headlines = { input: 12345, output: 6789, calls: 5 };
      PRICING.inputPer1M = 0.15;
      PRICING.outputPer1M = 0.60;

      const cost = calculateApiCost();

      expect(cost).toBeCloseTo(0.005926, 2);
    });
  });

  describe('updatePricing', () => {
    it('should update pricing configuration', async () => {
      PRICING.inputPer1M = 0.15;
      PRICING.outputPer1M = 0.60;

      await updatePricing(mockStorage, { inputPer1M: 0.20, outputPer1M: 0.80 });

      expect(PRICING.inputPer1M).toBe(0.20);
      expect(PRICING.outputPer1M).toBe(0.80);
      expect(PRICING.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should persist pricing to storage', async () => {
      await updatePricing(mockStorage, { inputPer1M: 0.25, outputPer1M: 1.00 });

      expect(mockStorage.set).toHaveBeenCalledWith(
        'neutralizer_pricing_v1',
        expect.stringContaining('"inputPer1M":0.25')
      );
    });
  });

  describe('resetPricingToDefaults', () => {
    it('should reset pricing to default values', async () => {
      PRICING.inputPer1M = 0.99;
      PRICING.outputPer1M = 1.99;

      await resetPricingToDefaults(mockStorage);

      expect(PRICING.inputPer1M).toBe(0.20);
      expect(PRICING.outputPer1M).toBe(0.80);
      expect(PRICING.model).toBe('GPT-4.1 Nano Priority');
    });
  });

  describe('apiHeaders', () => {
    it('should generate correct headers', () => {
      const key = 'sk-test123';
      const headers = apiHeaders(key);

      expect(headers).toEqual({
        Authorization: 'Bearer sk-test123',
        'Content-Type': 'application/json',
        Accept: 'application/json'
      });
    });
  });

  describe('xhrPost', () => {
    it('should make successful POST request', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: '{"success": true}' });
        }, 0);
      });

      const result = await xhrPost(
        'https://api.example.com/test',
        '{"test": "data"}',
        { Authorization: 'Bearer test' }
      );

      expect(result).toBe('{"success": true}');
      expect(mockGM_xmlhttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://api.example.com/test',
          data: '{"test": "data"}',
          headers: { Authorization: 'Bearer test' }
        })
      );
    });

    it('should handle HTTP error responses', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 401, responseText: 'Unauthorized' });
        }, 0);
      });

      await expect(xhrPost('https://api.example.com/test', '{}')).rejects.toThrow('HTTP 401');
    });

    it('should handle network errors', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onerror({ error: 'Connection failed' });
        }, 0);
      });

      await expect(xhrPost('https://api.example.com/test', '{}')).rejects.toThrow('Connection failed');
    });

    it('should handle timeout', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.ontimeout();
        }, 0);
      });

      await expect(xhrPost('https://api.example.com/test', '{}')).rejects.toThrow('Request timeout');
    });

    it('should use GM.xmlHttpRequest when available', async () => {
      const mockGMAsync = vi.fn((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: '{}' });
        }, 0);
      });

      global.GM = { xmlHttpRequest: mockGMAsync };

      await xhrPost('https://api.example.com/test', '{}');

      expect(mockGMAsync).toHaveBeenCalled();
      expect(mockGM_xmlhttpRequest).not.toHaveBeenCalled();
    });
  });

  describe('xhrGet', () => {
    it('should make successful GET request', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: '{"data": "test"}' });
        }, 0);
      });

      const result = await xhrGet('https://api.example.com/data');

      expect(result).toBe('{"data": "test"}');
      expect(mockGM_xmlhttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.example.com/data'
        })
      );
    });

    it('should handle HTTP error responses', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 404, responseText: 'Not found' });
        }, 0);
      });

      await expect(xhrGet('https://api.example.com/data')).rejects.toMatchObject({
        message: 'HTTP 404',
        status: 404,
        body: 'Not found'
      });
    });

    it('should handle network errors', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onerror(null);
        }, 0);
      });

      await expect(xhrGet('https://api.example.com/data')).rejects.toMatchObject({
        message: 'Network error',
        status: 0
      });
    });

    it('should handle timeout', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.ontimeout();
        }, 0);
      });

      await expect(xhrGet('https://api.example.com/data')).rejects.toMatchObject({
        message: 'Request timeout',
        status: 0
      });
    });
  });

  describe('extractOutputText', () => {
    it('should extract output_text field', () => {
      const data = { output_text: 'Test output' };
      expect(extractOutputText(data)).toBe('Test output');
    });

    it('should extract from output array with content', () => {
      const data = {
        output: [
          {
            content: [
              { text: 'Part 1' },
              { text: ' Part 2' }
            ]
          }
        ]
      };
      expect(extractOutputText(data)).toBe('Part 1 Part 2');
    });

    it('should extract from output array with output_text type', () => {
      const data = {
        output: [
          {
            content: [
              { type: 'output_text', text: 'Typed output' }
            ]
          }
        ]
      };
      expect(extractOutputText(data)).toBe('Typed output');
    });

    it('should extract from OpenAI choices format', () => {
      const data = {
        choices: [
          { message: { content: 'Choice 1' } },
          { message: { content: 'Choice 2' } }
        ]
      };
      expect(extractOutputText(data)).toBe('Choice 1\nChoice 2');
    });

    it('should handle choices without message content', () => {
      const data = {
        choices: [
          { message: {} },
          { message: { content: 'Valid' } }
        ]
      };
      expect(extractOutputText(data)).toBe('\nValid');
    });

    it('should return empty string for unknown format', () => {
      const data = { unknown: 'field' };
      expect(extractOutputText(data)).toBe('');
    });

    it('should handle empty arrays', () => {
      expect(extractOutputText({ output: [] })).toBe('');
      expect(extractOutputText({ choices: [] })).toBe('');
    });
  });

  describe('rewriteBatch', () => {
    beforeEach(() => {
      mockStorage.get.mockResolvedValue('sk-test-key-12345');
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should successfully rewrite batch of headlines', async () => {
      const mockResponse = {
        output_text: '["Neutral headline 1", "Neutral headline 2"]',
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: JSON.stringify(mockResponse) });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Original 1', 'Original 2']);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual(['Neutral headline 1', 'Neutral headline 2']);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const mockResponse = {
        output_text: '```json\n["Headline 1", "Headline 2"]\n```',
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: JSON.stringify(mockResponse) });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Original 1', 'Original 2']);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual(['Headline 1', 'Headline 2']);
    });

    it('should sanitize line separator characters', async () => {
      const mockResponse = {
        output_text: '["Clean headline"]',
        usage: { input_tokens: 50, output_tokens: 25 }
      };

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        const body = JSON.parse(opts.data);
        const input = JSON.parse(body.input);

        // Verify line separators were removed
        expect(input[0]).not.toContain('\u2028');
        expect(input[0]).not.toContain('\u2029');

        setTimeout(() => {
          opts.onload({ status: 200, responseText: JSON.stringify(mockResponse) });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test\u2028with\u2029line separators']);
      await vi.runAllTimersAsync();
      await resultPromise;
    });

    it('should track token usage', async () => {
      API_TOKENS.headlines = { input: 0, output: 0, calls: 0 };

      const mockResponse = {
        output_text: '["Result"]',
        usage: { input_tokens: 200, output_tokens: 100 }
      };

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: JSON.stringify(mockResponse) });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test']);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(API_TOKENS.headlines.input).toBe(200);
      expect(API_TOKENS.headlines.output).toBe(100);
      expect(API_TOKENS.headlines.calls).toBe(1);
    });

    it('should throw error when API key is missing', async () => {
      mockStorage.get.mockResolvedValue('');

      await expect(rewriteBatch(mockStorage, ['Test'])).rejects.toMatchObject({
        message: 'API key missing',
        status: 401
      });
    });

    it('should throw error when response has no output', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: '{"usage": {}}' });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test']);
      await vi.runAllTimersAsync();
      await expect(resultPromise).rejects.toMatchObject({
        message: 'No output_text/content from API',
        status: 400
      });
    });

    it('should throw error when response is not a JSON array', async () => {
      const mockResponse = {
        output_text: '"Not an array"',
        usage: { input_tokens: 50, output_tokens: 25 }
      };

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: JSON.stringify(mockResponse) });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test']);
      await vi.runAllTimersAsync();
      await expect(resultPromise).rejects.toMatchObject({
        message: 'API did not return a JSON array',
        status: 400
      });
    });

    it('should handle network errors gracefully', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onerror({ error: 'Network failure' });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test']);
      await vi.runAllTimersAsync();
      await expect(resultPromise).rejects.toThrow('Network failure');
    });

    it('should handle HTTP error responses', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 500, responseText: 'Internal Server Error' });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test']);
      await vi.runAllTimersAsync();
      await expect(resultPromise).rejects.toThrow('HTTP 500');
    });

    it('should handle malformed JSON responses', async () => {
      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        setTimeout(() => {
          opts.onload({ status: 200, responseText: 'invalid json' });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test']);
      await vi.runAllTimersAsync();
      await expect(resultPromise).rejects.toThrow();
    });

    it('should send correct request structure', async () => {
      let capturedRequest = null;

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        capturedRequest = opts;
        setTimeout(() => {
          opts.onload({
            status: 200,
            responseText: JSON.stringify({
              output_text: '["Result"]',
              usage: { input_tokens: 50, output_tokens: 25 }
            })
          });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test headline']);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(capturedRequest.method).toBe('POST');
      expect(capturedRequest.url).toBe('https://api.openai.com/v1/responses');

      const body = JSON.parse(capturedRequest.data);
      expect(body.model).toBe('gpt-4.1-nano');
      expect(body.service_tier).toBe('priority');
      expect(body.temperature).toBe(0.2); // Non-GPT-5 models use temperature
      expect(body.reasoning).toBeUndefined(); // Only GPT-5 models use reasoning
      expect(body.max_output_tokens).toBe(1000);
      expect(body.instructions).toContain('neutrally');
      expect(body.input).toBe('["Test headline"]');
    });
  });

  describe('MODEL_OPTIONS usage', () => {
    beforeEach(() => {
      mockStorage.get.mockResolvedValue('sk-test-key-12345');
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should use apiModel from MODEL_OPTIONS for selected model', async () => {
      const { CFG } = await import('../../src/modules/config.js');
      CFG.model = 'gpt-5-mini-priority';

      let capturedRequest = null;

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        capturedRequest = opts;
        setTimeout(() => {
          opts.onload({
            status: 200,
            responseText: JSON.stringify({
              output_text: '["Result"]',
              usage: { input_tokens: 50, output_tokens: 25 }
            })
          });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test headline']);
      await vi.runAllTimersAsync();
      await resultPromise;

      const body = JSON.parse(capturedRequest.data);
      expect(body.model).toBe('gpt-5-mini');
      expect(body.service_tier).toBe('priority');

      // Reset to default
      CFG.model = 'gpt-5-nano';
    });

    it('should not include service_tier for non-priority models', async () => {
      const { CFG } = await import('../../src/modules/config.js');
      CFG.model = 'gpt-5-nano';

      let capturedRequest = null;

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        capturedRequest = opts;
        setTimeout(() => {
          opts.onload({
            status: 200,
            responseText: JSON.stringify({
              output_text: '["Result"]',
              usage: { input_tokens: 50, output_tokens: 25 }
            })
          });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test headline']);
      await vi.runAllTimersAsync();
      await resultPromise;

      const body = JSON.parse(capturedRequest.data);
      expect(body.model).toBe('gpt-5-nano');
      expect(body.service_tier).toBeUndefined();
    });

    it('should use reasoning for GPT-5 models instead of temperature', async () => {
      const { CFG } = await import('../../src/modules/config.js');
      CFG.model = 'gpt-5-nano';

      let capturedRequest = null;

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        capturedRequest = opts;
        setTimeout(() => {
          opts.onload({
            status: 200,
            responseText: JSON.stringify({
              output_text: '["Result"]',
              usage: { input_tokens: 50, output_tokens: 25 }
            })
          });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test headline']);
      await vi.runAllTimersAsync();
      await resultPromise;

      const body = JSON.parse(capturedRequest.data);
      expect(body.reasoning).toEqual({ effort: 'minimal' });
      expect(body.temperature).toBeUndefined();

      // Reset
      CFG.model = 'gpt-4.1-nano-priority';
    });

    it('should use temperature for non-GPT-5 models', async () => {
      const { CFG } = await import('../../src/modules/config.js');
      CFG.model = 'gpt-4.1-nano-priority';

      let capturedRequest = null;

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        capturedRequest = opts;
        setTimeout(() => {
          opts.onload({
            status: 200,
            responseText: JSON.stringify({
              output_text: '["Result"]',
              usage: { input_tokens: 50, output_tokens: 25 }
            })
          });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test headline']);
      await vi.runAllTimersAsync();
      await resultPromise;

      const body = JSON.parse(capturedRequest.data);
      expect(body.temperature).toBe(0.2);
      expect(body.reasoning).toBeUndefined();
    });

    it('should fallback to gpt-4.1-nano-priority for unknown model', async () => {
      const { CFG } = await import('../../src/modules/config.js');
      const originalModel = CFG.model;
      CFG.model = 'unknown-model';

      let capturedRequest = null;

      mockGM_xmlhttpRequest.mockImplementation((opts) => {
        capturedRequest = opts;
        setTimeout(() => {
          opts.onload({
            status: 200,
            responseText: JSON.stringify({
              output_text: '["Result"]',
              usage: { input_tokens: 50, output_tokens: 25 }
            })
          });
        }, 0);
      });

      const resultPromise = rewriteBatch(mockStorage, ['Test headline']);
      await vi.runAllTimersAsync();
      await resultPromise;

      const body = JSON.parse(capturedRequest.data);
      expect(body.model).toBe('gpt-4.1-nano');
      expect(body.service_tier).toBe('priority');

      // Reset
      CFG.model = originalModel;
    });
  });
});
